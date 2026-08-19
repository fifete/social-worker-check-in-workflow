> What this file answers: In what order does the app initialize on launch, and what determines whether the worker lands on the auth screen or skips directly into attendance mode?

---

## Named Steps

### Step 1 — Load HTML shell
The browser parses `index.html` and executes the Vite bundle. No network calls are made at this point. The app renders a full-screen loading indicator while initialization continues.

### Step 2 — Open IndexedDB
The app opens the IndexedDB database (`checkInDB`, schema version defined in `visitorService`). If the database does not exist, it is created with two empty object stores: `visitorStore` and `sessionStateStore`.

**Failure path:** If the `indexedDB.open()` request is blocked — typically because another browser tab has an open connection with a lower schema version — the app renders a full-screen error:

> "Error al abrir la base de datos. Cierre otras pestañas e intente de nuevo."

No further initialization proceeds until the user resolves the block.

### Step 3 — Read sessionStateStore
The app reads the record with primary key `'CURRENT_SESSION'` from `sessionStateStore`.

**Outcome A — Record absent:** proceed to Step 4 with `session = null`.

**Outcome B — Record present:** proceed to Step 4 with `session = { accessToken, refreshToken, tokenIssuedAt, masterFileId, workingFileId }`.

**Failure path:** If the IDB read request throws an error, treat as `session = null`, log a console warning, and continue.

### Step 4 — Evaluate token validity
Using `tokenIssuedAt` from the session record:

```
tokenAge    = Date.now() - session.tokenIssuedAt
tokenValid  = tokenAge < 3_000_000   // 50-minute safety threshold in milliseconds
```

If `session === null`, `tokenValid = false`.

### Step 5 — Count visitorStore records
Issue a count query against `visitorStore`. Used alongside token validity in Step 6.

**Failure path:** If the count request throws, treat count as `0`. Log the error. Do not surface to the user at this step.

### Step 6 — Route to initial state

| Token valid | visitorStore count | Event dispatched | Target state |
|---|---|---|---|
| `false` | any | `AUTH_PENDING` | `AUTH_PENDING` |
| `true` | `0` | `AUTH_SUCCESS` + guard `visitorStoreEmpty` | `FILE_PICKER_PENDING` |
| `true` | `> 0` | `AUTH_SUCCESS` + guard `visitorStoreHydrated` | `ATTENDANCE_PHASE / READY_EMPTY` |

The loading indicator is dismissed after routing.

---

## Recovery Summary

| Step | Failure | Recovery action |
|---|---|---|
| Step 2 | IDB blocked | Full-screen error; halt initialization |
| Step 3 | IDB read throws | Treat as null session; continue to Step 4 |
| Step 5 | IDB count throws | Treat as 0; fall through to auth screen |
