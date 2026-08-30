> What this file answers: How does end-of-event sync proceed from button tap to full store purge, including token re-auth, batchUpdate, and failure recovery at each step?

---

## Precondition
State machine is in `ATTENDANCE_PHASE`. Device has been reconnected to Wi-Fi. The worker has decided the event is over.

---

## Named Steps

### Step 1 — Worker taps "Sincronizar Datos con Drive"
The sync button is rendered in the app header during `ATTENDANCE_PHASE`. Tapping it dispatches `SYNC_INITIATED`.

State machine transitions from `ATTENDANCE_PHASE` to `SYNCING / CHECKING_TOKEN`.

A full-screen sync overlay renders immediately. All Zone 1, Zone 2, and Zone 3 interactions are disabled for the duration of the sync. The overlay shows a progress spinner and the label:

> "Sincronizando datos..."

### Step 2 — Check token validity
Read `tokenIssuedAt` from `sessionStateStore['CURRENT_SESSION']`.

```
tokenAge   = Date.now() - session.tokenIssuedAt
tokenValid = tokenAge < 3_000_000   // 50-minute safety threshold
```

**Token valid:** Dispatch `TOKEN_VALID` → `SYNCING / PUSHING_DATA` (skip to Step 4).

**Token expired:** Dispatch `TOKEN_EXPIRED` → `SYNCING / REAUTHING` (proceed to Step 3).

**Failure path:** If the IDB read fails, treat token as expired and proceed to Step 3.

### Step 3 — Re-authenticate (conditional)
Executed only when the token is expired.

Call `google.accounts.oauth2.initTokenClient()` with `prompt: ''` to trigger an interactive GIS popup.

**Success:** New token received.
- Update `accessToken` and `tokenIssuedAt` in `sessionStateStore`
- Preserve `refreshToken` if absent from the new response (never overwrite with `undefined`)
- Dispatch `AUTH_SUCCESS` → `SYNCING / PUSHING_DATA`

**Failure path:** Worker cancels the popup, or the auth request fails. Dispatch `AUTH_FAILED`. Dismiss sync overlay. Return to `ATTENDANCE_PHASE`. Show persistent error banner:

> "La sesión no pudo renovarse. Reconecte e intente sincronizar de nuevo."

The sync button remains available. No data is lost.

### Step 4 — Collect pending records
Read all records from `visitorStore` where:
```
attendanceStatus === true AND syncedWithCloud === false
```

**If 0 records match:** Dismiss sync overlay. Return to `ATTENDANCE_PHASE`. Show informational toast:

> "No hay registros pendientes de sincronización."

No network call is made.

**If records exist:** Proceed to Step 5.

### Step 5 — Build and send batchUpdate
For each pending record, construct a range update targeting the `ASISTENCIA` column cell at the record's `rowIndex` in the working spreadsheet.

`asistenciaColumn` (e.g. `"K"`) is read from `sessionStateStore['CURRENT_SESSION']`. It was stored there during hydration (Step 8 of `setup.md`) when the header row was parsed. No extra API call is needed at sync time.

```
POST https://sheets.googleapis.com/v4/spreadsheets/{workingFileId}/values:batchUpdate
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "valueInputOption": "RAW",
  "data": [
    {
      "range": "Respuestas de formulario 1!{ASISTENCIA_COLUMN}{rowIndex}",
      "values": [["TRUE"]]
    },
    ...one entry per pending record...
  ]
}
```

Tab name is the hardcoded literal `'Respuestas de formulario 1'`.

The master file is never written. All writes target `workingFileId` only.

### Step 6 — Handle HTTP 200 response
Dispatch `PUSH_SUCCESS` → `SYNCING / PURGING_STORES`.

Overlay label updates to:

> "Limpiando datos locales..."

### Step 7 — Purge all stores
Issue `visitorStore.clear()` and `sessionStateStore.clear()` within a single IndexedDB `readwrite` transaction spanning both stores.

**On success:** Dispatch `PURGE_COMPLETE` → state machine transitions to `SYNC_SUCCESS` (Step 8).

Sync overlay dismissed. Success screen renders.

**Failure path:** If the purge transaction fails, log the error. Do NOT re-push data. Show persistent warning toast. Still dispatch `PURGE_COMPLETE` to transition to `SYNC_SUCCESS` — Drive data is correct and the inconsistency is local only.

### Step 8 — Confirm sync result (SYNC_SUCCESS)
A full-screen success view replaces the sync overlay. All sync and attendance interactions remain disabled. The screen shows:

> ¡Sincronización completa!
> [N] registro(s) actualizado(s) en Google Drive.

Where N is the `syncedCount` value stored in machine context during Step 5. A single prominent button:

> **Continuar**

Tapping it dispatches `SYNC_ACKNOWLEDGED` → state machine transitions to `AUTH_PENDING`.

App renders the auth screen (Phase 1 reset). The worker must re-authenticate to start the next event.

### Step 9 — Handle non-200 HTTP from batchUpdate
Dispatch `PUSH_FAILED`. Dismiss sync overlay. Return to `ATTENDANCE_PHASE`. Show persistent error banner with a message specific to the HTTP status:

| HTTP status | User-facing message |
|---|---|
| 401 | "Sesión expirada. Intente sincronizar de nuevo." |
| 403 | "Sin permiso para escribir en el archivo. Verifique el acceso." |
| 429 | "Demasiadas solicitudes. Espere un momento e intente de nuevo." |
| 5xx | "Error del servidor. Intente de nuevo más tarde." |
| Network error | "Sin conexión. Verifique su red e intente de nuevo." |

The sync button remains available. All `syncedWithCloud: false` records remain intact in `visitorStore`. No data is lost.

---

## Recovery Summary

| Step | Failure | Recovery action |
|---|---|---|
| Step 2 | IDB read fails | Treat as expired; proceed to re-auth |
| Step 3 | Auth popup cancelled or fails | AUTH_FAILED; return to ATTENDANCE_PHASE with error banner |
| Step 5 | Network error | PUSH_FAILED; return to ATTENDANCE_PHASE with specific error |
| Step 6 | HTTP 4xx/5xx | PUSH_FAILED; return to ATTENDANCE_PHASE with status-specific error |
| Step 7 | Purge transaction fails | Log error; show warning toast; still transition to SYNC_SUCCESS — Drive data is already correct |
| Step 8 | (no failure path) | Success screen is terminal; no errors possible |
