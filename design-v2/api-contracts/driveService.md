> What this file answers: What functions does driveService expose for file copy, data fetch, and batchUpdate, including exact API endpoints, request shapes, response shapes, and error codes?

---

## Responsibilities
`driveService` is the sole owner of all Google Drive and Google Sheets API calls. No other service calls these APIs directly. The master file is **read-only** — `driveService` never writes to `masterFileId`.

---

## Dependencies
- `authService.getAccessToken()` — called internally before every network request
- Environment variables: `VITE_GOOGLE_API_KEY` (used by Picker, not by driveService directly)

---

## Functions

### `searchForAsistenciaFile(masterFileName)`
Searches Drive for an existing file named `{masterFileName}_ASISTENCIA` owned by the authenticated user. Used for collision detection in setup.

**Inputs:**
- `masterFileName: string` — the name of the master file as returned by Google Picker

**Outputs:** `Promise<{ id: string, name: string } | null>`
- Returns the first matching file object if found
- Returns `null` if no match exists

**Request:**
```
GET https://www.googleapis.com/drive/v3/files
  ?q=name='{masterFileName}_ASISTENCIA' and trashed=false
  &fields=files(id,name)
  &corpora=user
Authorization: Bearer {accessToken}
```

`corpora=user` (Drive v3 default) scopes the search to files owned by or accessible to the authenticated user. The `owners` query term requires an explicit email address — `'me'` is not a valid value per the Drive v3 API docs.

**Success (HTTP 200):**
- `response.files.length === 0` → return `null`
- `response.files.length >= 1` → return `response.files[0]`

**Error codes:**
| Code | Condition |
|---|---|
| `SEARCH_NETWORK_ERROR` | Fetch threw (no response) |
| `SEARCH_UNAUTHORIZED` | HTTP 401 |
| `SEARCH_FORBIDDEN` | HTTP 403 |
| `SEARCH_API_ERROR` | HTTP 4xx (other) or 5xx |

---

### `deleteFile(fileId)`
Deletes an orphaned `_ASISTENCIA` file from Drive. Used only in the collision resolution path.

**Inputs:**
- `fileId: string` — Drive file ID to delete

**Outputs:** `Promise<void>`

**Request:**
```
DELETE https://www.googleapis.com/drive/v3/files/{fileId}
Authorization: Bearer {accessToken}
```

**Success (HTTP 204):** Resolve.

**Error codes:**
| Code | Condition |
|---|---|
| `DELETE_NETWORK_ERROR` | Fetch threw |
| `DELETE_UNAUTHORIZED` | HTTP 401 |
| `DELETE_FORBIDDEN` | HTTP 403 — file not owned by user |
| `DELETE_NOT_FOUND` | HTTP 404 — already deleted |
| `DELETE_API_ERROR` | Other 4xx or 5xx |

---

### `copyMasterFile(masterFileId, masterFileName)`
Copies the master spreadsheet to a new `_ASISTENCIA` working copy.

**Inputs:**
- `masterFileId: string` — Drive file ID of the master
- `masterFileName: string` — Display name of the master (used to set the copy's name)

**Outputs:** `Promise<{ workingFileId: string }>`

**Request:**
```
POST https://www.googleapis.com/drive/v3/files/{masterFileId}/copy
Authorization: Bearer {accessToken}
Content-Type: application/json

{ "name": "{masterFileName}_ASISTENCIA" }
```

**Success (HTTP 200):**
- Response body contains `{ id: string, name: string }`
- Return `{ workingFileId: response.id }`

**Error codes:**
| Code | Condition |
|---|---|
| `COPY_NETWORK_ERROR` | Fetch threw |
| `COPY_UNAUTHORIZED` | HTTP 401 |
| `COPY_FORBIDDEN` | HTTP 403 — no copy permission on master |
| `COPY_NOT_FOUND` | HTTP 404 — masterFileId does not exist |
| `COPY_API_ERROR` | Other 4xx or 5xx |

---

### `fetchSheetData(workingFileId)`
Reads all rows from the working copy spreadsheet.

**Inputs:**
- `workingFileId: string` — Drive file ID of the working copy

**Outputs:** `Promise<string[][]>` — the raw `values` array from the Sheets API response. Row 0 is the header row.

**Request:**
```
GET https://sheets.googleapis.com/v4/spreadsheets/{workingFileId}/values/Respuestas%20de%20formulario%201
Authorization: Bearer {accessToken}
```

Tab name is the hardcoded literal `'Respuestas de formulario 1'`. This string must not be parameterized.

**Success (HTTP 200):**
- Response body: `{ range: string, majorDimension: string, values: string[][] }`
- Return `response.values`
- If `response.values` is absent or empty, return `[]`

**Error codes:**
| Code | Condition |
|---|---|
| `FETCH_NETWORK_ERROR` | Fetch threw |
| `FETCH_UNAUTHORIZED` | HTTP 401 |
| `FETCH_FORBIDDEN` | HTTP 403 |
| `FETCH_NOT_FOUND` | HTTP 404 — workingFileId or tab does not exist |
| `FETCH_API_ERROR` | Other 4xx or 5xx |

---

### `batchUpdateAttendance(workingFileId, updates)`
Writes attendance values to the `ASISTENCIA` column in the working copy spreadsheet.

**Inputs:**
- `workingFileId: string` — Drive file ID of the working copy
- `updates: Array<{ rowIndex: number, columnLetter: string }>` — one entry per attended visitor

**Outputs:** `Promise<void>`

**Request:**
```
POST https://sheets.googleapis.com/v4/spreadsheets/{workingFileId}/values:batchUpdate
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "valueInputOption": "RAW",
  "data": [
    {
      "range": "Respuestas de formulario 1!{columnLetter}{rowIndex}",
      "values": [["TRUE"]]
    },
    ...
  ]
}
```

Tab name is the hardcoded literal `'Respuestas de formulario 1'`.

`rowIndex` is 1-based (row 1 = header; data rows start at 2). It is stored on each visitor record during `visitorService.hydrateFromRows()`.

`columnLetter` is determined during hydration from the header row position of the `ASISTENCIA` column. See `visitorService.md`.

**The master file (`masterFileId`) is never passed to this function. This function only ever writes to `workingFileId`.**

**Success (HTTP 200):** Resolve.

**Error codes:**
| Code | Condition |
|---|---|
| `BATCH_NETWORK_ERROR` | Fetch threw |
| `BATCH_UNAUTHORIZED` | HTTP 401 |
| `BATCH_FORBIDDEN` | HTTP 403 |
| `BATCH_RATE_LIMITED` | HTTP 429 |
| `BATCH_SERVER_ERROR` | HTTP 5xx |
| `BATCH_API_ERROR` | Other 4xx |

---

## Picker Integration
Google Picker is constructed directly in the setup component/service that calls it — it is not wrapped by `driveService`. `driveService` only handles REST API calls. The Picker script URL (`https://apis.google.com/js/api.js`) is loaded separately.

---

## Request Headers
Every function in `driveService` must include:
```
Authorization: Bearer {accessToken}
```

The `accessToken` is retrieved by calling `authService.getAccessToken()` at the start of each function. If `getAccessToken()` returns `null`, throw `{ code: 'NO_TOKEN' }` before making any network request.
