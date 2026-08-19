> What this file answers: How does syncService orchestrate driveService and visitorService during Phase 3, what is the error mapping from API codes to UI messages, and what triggers the store purge?

---

## Responsibilities
`syncService` orchestrates the Phase 3 sync sequence. It calls `authService`, `driveService`, and `visitorService` in order. It does not interact with IndexedDB or Google APIs directly — all such calls are delegated to those services.

---

## Dependencies
- `authService` — token validity check and re-auth
- `driveService` — `batchUpdateAttendance()`
- `visitorService` — `getPendingSyncRecords()`, `clearVisitorStore()`, `clearSessionStore()`, `readSession()`

---

## Functions

### `runSync()`
Executes the full Phase 3 sync sequence. Called when the worker taps "Sincronizar Datos con Drive".

**Inputs:** None.

**Outputs:** `Promise<SyncResult>`

```typescript
type SyncResult =
  | { status: 'SUCCESS' }
  | { status: 'NO_PENDING_RECORDS' }
  | { status: 'ERROR'; code: SyncErrorCode; message: string }
```

**Sequence (matches `sync.md`):**

#### 1. Check token validity
```javascript
const tokenValid = await authService.isTokenValid()
```
If `false`, proceed to re-authentication (step 2). If `true`, skip to step 3.

#### 2. Re-authenticate
```javascript
await authService.reAuthenticate()
```

On rejection:
- `AUTH_CANCELLED` → return `{ status: 'ERROR', code: 'REAUTH_CANCELLED', message: '...' }`
- `AUTH_FAILED` → return `{ status: 'ERROR', code: 'REAUTH_FAILED', message: '...' }`
- `SESSION_WRITE_FAILED` → return `{ status: 'ERROR', code: 'SESSION_WRITE_FAILED', message: '...' }`

#### 3. Collect pending records
```javascript
const pending = await visitorService.getPendingSyncRecords()
```

If `pending.length === 0`, return `{ status: 'NO_PENDING_RECORDS' }`.

On rejection: return `{ status: 'ERROR', code: 'PENDING_QUERY_FAILED', message: '...' }`.

#### 4. Read working file ID and column letter
```javascript
const session = await visitorService.readSession()
const { workingFileId, asistenciaColumn } = session
```

If `workingFileId` is null or absent, return `{ status: 'ERROR', code: 'NO_WORKING_FILE', message: '...' }`.

If `asistenciaColumn` is null or absent, return `{ status: 'ERROR', code: 'NO_ASISTENCIA_COLUMN', message: '...' }`.

#### 5. Build update payload
Map each pending record to a `{ rowIndex, columnLetter }` update entry using `record.rowIndex` and the session-level `asistenciaColumn`.

#### 6. Push to Drive
```javascript
await driveService.batchUpdateAttendance(workingFileId, updates)
```

On rejection, map the error code to a user message (see Error Mapping table below). Return `{ status: 'ERROR', code: driveErrorCode, message: mappedMessage }`.

#### 7. Purge stores
```javascript
await Promise.all([
  visitorService.clearVisitorStore(),
  visitorService.clearSessionStore()
])
```

If the purge fails, **do not re-push data**. Log the error. Return `{ status: 'ERROR', code: 'PURGE_FAILED', message: 'Sync successful but local data could not be cleared.' }`.

**Note:** The caller must check `code: 'PURGE_FAILED'` and surface the appropriate warning banner (data was synced; the error is local-only).

#### 8. Return success
Return `{ status: 'SUCCESS' }`.

---

## Error Mapping

| `driveService` error code | `SyncErrorCode` | User-facing message (Spanish) |
|---|---|---|
| `BATCH_UNAUTHORIZED` | `SYNC_UNAUTHORIZED` | "Sesión expirada. Intente sincronizar de nuevo." |
| `BATCH_FORBIDDEN` | `SYNC_FORBIDDEN` | "Sin permiso para escribir en el archivo. Verifique el acceso." |
| `BATCH_RATE_LIMITED` | `SYNC_RATE_LIMITED` | "Demasiadas solicitudes. Espere un momento e intente de nuevo." |
| `BATCH_SERVER_ERROR` | `SYNC_SERVER_ERROR` | "Error del servidor. Intente de nuevo más tarde." |
| `BATCH_NETWORK_ERROR` | `SYNC_NETWORK_ERROR` | "Sin conexión. Verifique su red e intente de nuevo." |
| `BATCH_API_ERROR` | `SYNC_API_ERROR` | "Error al sincronizar. Intente de nuevo más tarde." |
| `NO_TOKEN` | `SYNC_NO_TOKEN` | "No hay sesión activa. Inicie sesión e intente de nuevo." |

---

## SyncErrorCode Enum

```typescript
type SyncErrorCode =
  | 'REAUTH_CANCELLED'
  | 'REAUTH_FAILED'
  | 'SESSION_WRITE_FAILED'
  | 'PENDING_QUERY_FAILED'
  | 'NO_WORKING_FILE'
  | 'NO_ASISTENCIA_COLUMN'
  | 'SYNC_UNAUTHORIZED'
  | 'SYNC_FORBIDDEN'
  | 'SYNC_RATE_LIMITED'
  | 'SYNC_SERVER_ERROR'
  | 'SYNC_NETWORK_ERROR'
  | 'SYNC_API_ERROR'
  | 'SYNC_NO_TOKEN'
  | 'PURGE_FAILED'
```

---

## Invariants
1. `runSync()` never writes to `masterFileId`. It only reads `workingFileId` from `sessionStateStore` and passes it to `driveService.batchUpdateAttendance()`.
2. The purge (step 7) executes **only after** a confirmed HTTP 200 from `batchUpdateAttendance`. It must never execute on any error path.
3. If `PURGE_FAILED` is returned, the Drive data is correct. The inconsistency is local only. The caller surfaces a warning, not a destructive error.
