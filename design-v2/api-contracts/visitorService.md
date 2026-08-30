> What this file answers: What is the IndexedDB schema, what functions does visitorService expose for reading and writing visitor records and session state, and what are the default field values?

---

## Responsibilities
`visitorService` is the sole owner of all IndexedDB interactions. No other service or component reads from or writes to IndexedDB directly.

---

## Database Configuration

| Property | Value |
|---|---|
| Database name | `checkInDB` |
| Schema version | `1` |
| Object stores | `visitorStore`, `sessionStateStore` |

---

## Object Store: `visitorStore`

**Primary key:** `visitorId` (string; the visitor's DNI number)

### Visitor Record Schema

```typescript
{
  visitorId:         string;   // DNI — primary key
  visitorName:       string;
  visitorAge:        string;   // stored as string (raw from spreadsheet)
  relationship:      string;
  hostName:          string;
  hostId:            string;
  visitType:         string;
  location: {
    dept:            string;
    prov:            string;
    dist:            string;
  };
  attendanceStatus:  boolean;  // false on initial load
  attendanceTimestamp: string | null;  // ISO-8601 or null
  syncedWithCloud:   boolean;  // false until Phase 3 completes
  rowIndex:          number;   // 1-based row number in spreadsheet (for batchUpdate)
}
```

### Default values on initial write (during hydration)
```javascript
attendanceStatus:    false
attendanceTimestamp: null
syncedWithCloud:     false
```

`rowIndex` is derived from the spreadsheet during `hydrateFromRows()` and must not be mutated by attendance write operations.

---

## Object Store: `sessionStateStore`

**Primary key:** `sessionId` (static string `'CURRENT_SESSION'`)

### Session Record Schema
```typescript
{
  sessionId:         'CURRENT_SESSION';  // fixed primary key
  accessToken:       string;
  refreshToken:      string | null;
  tokenIssuedAt:     number;    // Date.now() at acquisition
  masterFileId:      string | null;
  workingFileId:     string | null;
  asistenciaColumn:  string | null;  // column letter derived from header row at hydration, e.g. "K"
}
```

---

## Functions

### `openDatabase()`
Opens (or creates) the IndexedDB database. Must be called once before any other function.

**Inputs:** None.

**Outputs:** `Promise<IDBDatabase>`

**Behavior:**
- Opens `checkInDB` at version `1`
- `onupgradeneeded`: creates `visitorStore` with `keyPath: 'visitorId'` and `sessionStateStore` with `keyPath: 'sessionId'`
- Returns the database reference

**Error codes:**
| Code | Condition |
|---|---|
| `DB_OPEN_BLOCKED` | `onblocked` event fires (another tab holds an older version) |
| `DB_OPEN_FAILED` | `onerror` event fires |

---

### `hydrateFromRows(rawRows)`
Parses spreadsheet rows and writes all visitor records to `visitorStore` in a single transaction.

**Inputs:**
- `rawRows: string[][]` — the `values` array from `driveService.fetchSheetData()`. Row 0 must be the header row.

**Outputs:** `Promise<void>`

**Behavior:**
1. Parse header row (index 0) to find column indices by exact string match against the column→key mapping in `index.md`
2. Determine `asistenciaColumn` letter: find the column with header `'ASISTENCIA'`, or if absent derive it as the next column letter after the last header column
3. Write `asistenciaColumn` to `sessionStateStore` via `visitorService.writeSession({ asistenciaColumn: derivedLetter })`
4. For each data row (index 1..N):
   - Map columns to `visitorRecord` fields
   - Set `rowIndex = i + 1` (1-based, accounting for header being row 1 in the sheet)
   - Set defaults: `attendanceStatus = false`, `attendanceTimestamp = null`, `syncedWithCloud = false`
5. Open a single `readwrite` transaction on `visitorStore`
6. Call `store.put(record)` for each mapped record
7. On transaction success: resolve
8. On transaction abort: reject with `{ code: 'HYDRATION_FAILED' }`

**Error codes:**
| Code | Condition |
|---|---|
| `HYDRATION_FAILED` | IDB transaction aborted |
| `HEADER_PARSE_FAILED` | Header row missing required columns |

---

### `searchVisitors(query)`
Searches `visitorStore` with a normalized substring match.

**Inputs:**
- `query: string` — search term (caller must ensure length ≥ 3 before calling)

**Outputs:** `Promise<VisitorRecord[]>` — up to all matching records (caller applies the 15-result cap)

**Behavior:**
1. Open a `readonly` transaction on `visitorStore`
2. Use a cursor to iterate all records
3. For each record, normalize both `visitorName` and `visitorId` (NFD decomposition, strip combining marks, lowercase, trim)
4. Include the record if the normalized query is a substring of either normalized field
5. Collect and return all matches (caller caps display to 15)


**Error codes:**
| Code | Condition |
|---|---|
| `SEARCH_FAILED` | IDB transaction threw |

---

### `getVisitorById(visitorId)`
Fetches a single visitor record by primary key.

**Inputs:**
- `visitorId: string`

**Outputs:** `Promise<VisitorRecord | null>`

**Behavior:** Calls `store.get(visitorId)`. Returns the record or `null` if not found.

**Error codes:**
| Code | Condition |
|---|---|
| `GET_FAILED` | IDB request threw |

---

### `recordAttendance(visitorId)`
Marks a visitor as attended.

**Inputs:**
- `visitorId: string`

**Outputs:** `Promise<void>`

**Behavior:**
1. Read existing record via `store.get(visitorId)`
2. Merge updates: `attendanceStatus = true`, `attendanceTimestamp = new Date().toISOString()`, `syncedWithCloud = false`
3. Call `store.put(updatedRecord)`
4. Resolve on success

**Must not modify:** `rowIndex`, `asistenciaColumn`, or any other field.

**Error codes:**
| Code | Condition |
|---|---|
| `RECORD_NOT_FOUND` | `store.get()` returns `undefined` |
| `ATTENDANCE_WRITE_FAILED` | `store.put()` threw |

---

### `undoAttendance(visitorId)`
Clears attendance for a visitor.

**Inputs:**
- `visitorId: string`

**Outputs:** `Promise<void>`

**Behavior:**
1. Read existing record
2. Merge updates: `attendanceStatus = false`, `attendanceTimestamp = null`, `syncedWithCloud = false`
3. Call `store.put(updatedRecord)`

**Error codes:**
| Code | Condition |
|---|---|
| `RECORD_NOT_FOUND` | Record not in store |
| `UNDO_WRITE_FAILED` | `store.put()` threw |

---

### `getPendingSyncRecords()`
Returns all records pending push to Drive.

**Inputs:** None.

**Outputs:** `Promise<VisitorRecord[]>`

**Behavior:** Cursor scan; include records where `attendanceStatus === true AND syncedWithCloud === false`.

**Error codes:**
| Code | Condition |
|---|---|
| `PENDING_QUERY_FAILED` | IDB transaction threw |

---

### `clearVisitorStore()`
Deletes all records from `visitorStore`.

**Inputs:** None.

**Outputs:** `Promise<void>`

**Behavior:** Opens a `readwrite` transaction and calls `store.clear()`.

**Error codes:**
| Code | Condition |
|---|---|
| `CLEAR_VISITOR_FAILED` | Transaction aborted |

---

### `readSession()`
Reads the current session record.

**Inputs:** None.

**Outputs:** `Promise<SessionRecord | null>`

**Behavior:** `store.get('CURRENT_SESSION')`. Returns `null` if absent.

**Error codes:**
| Code | Condition |
|---|---|
| `READ_SESSION_FAILED` | IDB request threw |

---

### `writeSession(sessionData)`
Writes or overwrites the current session record.

**Inputs:**
- `sessionData: Partial<SessionRecord>` — merged with existing record; `sessionId` is always set to `'CURRENT_SESSION'`

**Outputs:** `Promise<void>`

**Behavior:**
1. Read existing session (to preserve fields not in `sessionData`)
2. Merge: `{ ...existing, ...sessionData, sessionId: 'CURRENT_SESSION' }`
3. `store.put(merged)`

**Error codes:**
| Code | Condition |
|---|---|
| `WRITE_SESSION_FAILED` | `store.put()` threw |

---

### `clearSessionStore()`
Deletes the session record.

**Inputs:** None.

**Outputs:** `Promise<void>`

**Behavior:** `store.clear()` on `sessionStateStore`.

**Error codes:**
| Code | Condition |
|---|---|
| `CLEAR_SESSION_FAILED` | Transaction aborted |

---

### `countPendingAttendance()`
Returns the count of records pending sync. Called by the app layer before dispatching `RESET_INITIATED` to populate `event.pendingCount`.

**Inputs:** None.

**Outputs:** `Promise<number>` — always resolves (returns `0` on IDB error).

**Behavior:** Cursor scan of `visitorStore`; count records where `attendanceStatus === true AND syncedWithCloud === false`. Returns `0` on any error (never rejects).

---

### `resetSession()`
Clears all visitor data and nulls the file identifiers in the session record while preserving the authentication token. Called by the app orchestration layer when entering `RESETTING`.

**Inputs:** None.

**Outputs:** `Promise<void>`

**Behavior:**
1. Open a `readwrite` transaction on `visitorStore`; call `store.clear()`
2. Read existing session from `sessionStateStore`
3. Write back a merged record with `masterFileId: null`, `workingFileId: null`, `asistenciaColumn: null`; preserve `accessToken`, `refreshToken`, `tokenIssuedAt` unchanged
4. Resolve when both operations succeed

The caller dispatches `RESET_COMPLETE` after this function resolves, triggering the machine transition to `FILE_PICKER_PENDING`.

**Error codes:**
| Code | Condition |
|---|---|
| `RESET_VISITOR_FAILED` | `visitorStore.clear()` transaction aborted |
| `RESET_SESSION_FAILED` | `sessionStateStore.put()` threw |
