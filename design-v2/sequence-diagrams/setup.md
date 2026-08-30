> What this file answers: How does the app go from a freshly authenticated worker (or a reset session with a valid token) to a fully hydrated visitorStore ready for attendance, including the file confirmation step and the _ASISTENCIA collision path?

---

## Named Steps

> **Entry points:** Steps 1–2 are skipped when entering from the `RESETTING` path (the worker already has a valid token). In that case, execution begins at Step 3 with `FILE_PICKER_PENDING / AWAITING_SELECTION` already active.

### Step 1 — Trigger Google sign-in
The worker taps "Iniciar sesión con Google" on the `AUTH_PENDING` screen.

The app calls `google.accounts.oauth2.initTokenClient()` with:
- `client_id`: `VITE_GOOGLE_CLIENT_ID`
- `scope`: `https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets`
- `callback`: token handler (see Step 2)
- `prompt`: `''` — required for interactive popup on Android Chrome; silent iframe refresh must not be used

The GIS popup opens in the browser.

**Failure path:** If the browser blocks the popup (common on first tap if the browser has not yet allowed the origin), the app renders an inline message inside the auth zone:

> "El navegador bloqueó la ventana emergente. Permita ventanas emergentes e intente de nuevo."

A "Reintentar" button re-calls `requestAccessToken()`. No state transition occurs.

### Step 2 — Receive and store token
The GIS token callback fires with a `TokenResponse` object.

The app:
1. Sets `accessToken = response.access_token`
2. Sets `tokenIssuedAt = Date.now()`
3. If `response.refresh_token` is present, sets `refreshToken = response.refresh_token`; if absent, **preserves any existing `refreshToken` — never overwrite with `undefined`**
4. Writes the full record to `sessionStateStore` with primary key `'CURRENT_SESSION'`

**Failure path:** If the IDB write fails, the auth zone renders:

> "Error al guardar la sesión. Intente de nuevo."

Do not dispatch `AUTH_SUCCESS`. The worker must retry sign-in.

**On success:** Dispatch `AUTH_SUCCESS`. State machine transitions to `FILE_PICKER_PENDING / AWAITING_SELECTION`.

### Step 3 — Load and open Google Picker
The app loads the Picker GAPI script (`https://apis.google.com/js/api.js`) if not yet loaded, then calls `gapi.load('picker', onPickerApiLoaded)`.

On load, constructs a `PickerBuilder` with:
- OAuth token: current `accessToken`
- Developer Key: `VITE_GOOGLE_API_KEY`
- App ID: `VITE_GOOGLE_APP_ID`
- View filtered to MIME types:
  - `application/vnd.google-apps.spreadsheet`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Failure path:** If `gapi` fails to load or `PickerBuilder` throws, the file picker zone renders:

> "No se pudo abrir el selector de archivos. Compruebe su conexión e intente de nuevo."

A "Reintentar" button retries `gapi.load`. State remains `FILE_PICKER_PENDING / AWAITING_SELECTION`.

### Step 4 — Worker selects master spreadsheet
The worker browses and selects a file in the Picker UI. The Picker fires its callback with `Action.PICKED`.

The app extracts from `response[google.picker.Response.DOCUMENTS][0]`:
- `masterFileId = document[google.picker.Document.ID]`
- `masterFileName = document[google.picker.Document.NAME]`

Dispatch `FILE_PICKED` → state transitions to `FILE_PICKER_PENDING / CONFIRMING_SELECTION`.

### Step 5 — Confirm selected file
State is now `FILE_PICKER_PENDING / CONFIRMING_SELECTION`. The app displays the selected file name prominently before any Drive operation begins.

**Rendered copy:**

> **"¿Es este el archivo correcto?"**
> "{masterFileName}"
>
> [**"Continuar"**] [**"Cambiar archivo"**]

- Worker taps **"Continuar":** Dispatch `FILE_CONFIRMED` → state transitions to `FILE_PICKER_PENDING / CHECKING_COLLISION`.
- Worker taps **"Cambiar archivo":** Dispatch `FILE_REJECTED` → state transitions back to `FILE_PICKER_PENDING / AWAITING_SELECTION` with `retriggerPicker = true`. The Picker re-opens immediately without requiring an additional tap.

**No failure path.** This step involves no network calls and cannot fail.

### Step 6 — Collision check: search for existing _ASISTENCIA file
**This step must execute before any Drive copy call.**

The app queries Drive for an existing file named exactly `{masterFileName}_ASISTENCIA` owned by the authenticated user:

```
GET https://www.googleapis.com/drive/v3/files
  ?q=name='{masterFileName}_ASISTENCIA' and trashed=false
  &fields=files(id,name)
  &corpora=user
Authorization: Bearer {accessToken}
```

`corpora=user` is the Drive v3 default and scopes results to files the authenticated user owns or can access. The `owners` query term requires an explicit email address per the Drive v3 API docs — a `'me'` shorthand is not supported. The `trashed=false` filter excludes deleted files.

**Outcome A — `files` array is empty:** Dispatch `COLLISION_NOT_FOUND` → proceed to Step 7.

**Outcome B — `files` array has one or more entries:** Store the first entry's `id` as the orphan file ID in transient context. Dispatch `COLLISION_FOUND` → state transitions to `FILE_PICKER_PENDING / COLLISION_PROMPT`.

Show modal prompt to worker:

> **"Se encontró un archivo existente: {masterFileName}_ASISTENCIA"**
>
> "Usar archivo existente" | "Crear copia nueva"

- Worker taps **"Usar archivo existente"**: dispatch `USE_EXISTING_FILE`. Set `workingFileId` = orphan file ID. Write to `sessionStateStore`. Skip to Step 9.
- Worker taps **"Crear copia nueva"**: dispatch `CREATE_NEW_COPY` → proceed to Step 6b.

**Failure path:** If the Drive search request fails (network error, 401, 403), dispatch `COLLISION_CHECK_FAILED`. Show:

> "No se pudo verificar archivos existentes. Compruebe su conexión e intente de nuevo."

State returns to `FILE_PICKER_PENDING / AWAITING_SELECTION`.

### Step 6b — Delete orphan file (conditional)
Executed only when worker chose "Crear copia nueva" in Step 6.

```
DELETE https://www.googleapis.com/drive/v3/files/{orphanFileId}
Authorization: Bearer {accessToken}
```

**Success (HTTP 204):** Dispatch `ORPHAN_DELETED` → proceed to Step 7.

**Failure path:** Dispatch `DELETE_FAILED`. Show inline in the collision prompt:

> "No se pudo eliminar el archivo anterior. Intente de nuevo o use el archivo existente."

State remains `FILE_PICKER_PENDING / COLLISION_PROMPT`. Both options remain available.

### Step 7 — Copy master file → _ASISTENCIA
```
POST https://www.googleapis.com/drive/v3/files/{masterFileId}/copy
Authorization: Bearer {accessToken}
Content-Type: application/json

{ "name": "{masterFileName}_ASISTENCIA" }
```

**Success (HTTP 200):** Response body contains `id` of the new copy.
- Set `workingFileId` = response `id`
- Write to `sessionStateStore['CURRENT_SESSION']`
- Dispatch `COPY_SUCCESS` → `FILE_PICKER_PENDING / FETCHING_DATA`

**Failure path:** Any non-200 response or network error → dispatch `COPY_FAILED`. Show:

> "No se pudo copiar el archivo. Verifique permisos e intente de nuevo."

State returns to `FILE_PICKER_PENDING / AWAITING_SELECTION`.

### Step 8 — Fetch all rows from working copy
```
GET https://sheets.googleapis.com/v4/spreadsheets/{workingFileId}/values/Respuestas%20de%20formulario%201
Authorization: Bearer {accessToken}
```

The tab name is the hardcoded literal `'Respuestas de formulario 1'` (URL-encoded in the path). This never changes regardless of file name.

**Success (HTTP 200):** Response body contains `{ values: [headerRow, ...dataRows] }`. Row index 0 is the header row.

**Failure path:** Any non-200 response or network error → dispatch `FETCH_FAILED`. Show:

> "No se pudo leer el archivo. Verifique permisos e intente de nuevo."

State returns to `FILE_PICKER_PENDING / AWAITING_SELECTION`.

### Step 9 — Parse rows and hydrate visitorStore
Map each data row (index 1..N) to the visitor schema using the column→key mapping defined in `index.md`. Header row is used to determine column positions by exact string match.

For every mapped row, write a record to `visitorStore` with these defaults:
- `attendanceStatus = false`
- `attendanceTimestamp = null`
- `syncedWithCloud = false`
- `rowIndex = i` (1-based row number in the sheet; required for batchUpdate in Phase 3)

All writes are issued within a single IndexedDB `readwrite` transaction.

**Failure path:** If the transaction aborts mid-write, call `transaction.abort()` and then clear any partial writes via a second `clear()` transaction. Show:

> "Error al cargar los datos. La base de datos quedó en un estado parcial. Intente de nuevo."

State returns to `FILE_PICKER_PENDING / AWAITING_SELECTION`. Do not leave `visitorStore` in a partial state.

### Step 10 — Transition to attendance phase
Dispatch `HYDRATION_COMPLETE` → state machine transitions to `ATTENDANCE_PHASE / appFlow / READY_EMPTY`.

The setup overlay is dismissed. Zone 2 search input receives focus.

---

## Recovery Summary

| Step | Failure | Recovery action |
|---|---|---|
| Step 1 | Popup blocked | Inline error + retry button; no state change |
| Step 2 | IDB write fails | Inline error; do not dispatch AUTH_SUCCESS |
| Step 3 | GAPI load fails | Inline error + retry button |
| Step 5 | Worker rejects file | FILE_REJECTED; Picker re-opens immediately; no error shown |
| Step 6 | Drive search fails | COLLISION_CHECK_FAILED; return to AWAITING_SELECTION |
| Step 6b | Delete fails | DELETE_FAILED; return to COLLISION_PROMPT |
| Step 7 | Copy fails | COPY_FAILED; return to AWAITING_SELECTION |
| Step 8 | Fetch fails | FETCH_FAILED; return to AWAITING_SELECTION |
| Step 9 | IDB transaction aborts | Abort + clear + inline error; return to AWAITING_SELECTION |
