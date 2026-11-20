# Failure log and Sentry flush

Cross-box page: it holds the log decisions shared by Browser DB and Drive Sync. It is not a box page. Decided in #13; implemented in #14. Connection failures are out of scope: they are shown in the UI and not logged.

## Critical decisions

### Log entry shape

`{ id, name, timestamp, rowIndex, code, state, dni? }`

- `id`: local autoincrement key.
- `timestamp`: when the failure happened, kept when the entry is sent.
- `state`: the phase the app was in: `setup`, `attendance` or `sync`.
- `code`: an existing error code (`SYNC_API_ERROR`, `PURGE_FAILED`, ...), so one string means one thing.
- `dni`: only on events about a failed record (see [ADR 0001](../adr/0001-no-personal-data-in-failure-logs.md)).

Event names are dotted, `<phase>.<what>.<outcome>`: `attendance.register.failed`, `attendance.undo.failed`, `db.open.failed`, `sync.batch.failed`, `sync.batch.partial`, `sync.purge.failed`, `setup.load.failed`, `log.flush.rejected`.

Setup events go straight to Sentry. Attendance events are buffered in the log store ([ADR 0002](../adr/0002-log-store-survives-the-purge.md)).

### Flush trigger and order

The flush starts only when the worker taps "Sincronizar datos con Drive". Order: Drive write, log its result (failed or partial included), flush with a 5-second timeout, purge. The flush runs on every tap, including `NO_PENDING_RECORDS` and failed syncs. The purge never waits on the flush outcome; a failed flush leaves the entries in the log store.

### Confirmation before deletion

An entry is deleted only when `afterSendEvent` reports a 2xx for its event. Network error, 429 or 5xx: keep. Other 4xx (for example 413, which never succeeds): keep, and add one `log.flush.rejected` entry. `flush()` returning `true` is never confirmation. Entries are sent oldest first with their original `timestamp`, using the plain fetch transport.

### DNI rule

A DNI is logged only for a failed record, in `dni`, never with a name. See [ADR 0001](../adr/0001-no-personal-data-in-failure-logs.md).

## Implementation notes (#14)

Code: `src/services/logService.js` (`initLog`, `logEvent`, `sendDirect`, `flushLog`), tests beside it; run with `npm test`. The DSN comes from `VITE_SENTRY_DSN`; without it entries are buffered and never sent.

- Which events: `attendance.*` entries come from `Zone3Actions`, `sync.*` entries from the PUSHING_DATA and PURGING_STORES steps in `App.jsx`, `setup.load.failed` and `db.open.failed` are sent directly (the log store is unavailable when the database fails to open, so `db.open.failed` carries state `setup`).
- `sync.batch.failed` is logged once per failed Drive write, with no DNI and no `rowIndex`, except network errors (connection failures are not logged). It is also logged, with code `NO_WORKING_FILE` or `NO_ASISTENCIA_COLUMN`, when Sync cannot start the write because the session lacks them. `sync.purge.failed` is logged after the purge, so it is sent at the next Sync's flush. `sync.batch.partial` is logged once per row that Sheets' 200 response did not confirm (`updatedCells` is 0), with `rowIndex` and `dni`, code `SYNC_PARTIAL_WRITE`. The purge still runs after a partial write.
- `attendance.register.failed` carries `rowIndex` and `dni`; `attendance.undo.failed` carries only `rowIndex`.
- `log.flush.rejected` uses code `LOG_FLUSH_REJECTED_<status>` and is added once per rejected entry: the rejected entry is flagged `rejected: true` and is still retried at later flushes, but never spawns another rejected entry.
- The flush also runs when re-authentication fails, so every tap on "Sincronizar datos con Drive" flushes.
- The SDK runs with no default integrations (no breadcrumbs, global handlers or sessions) and `sendDefaultPii: false`. A late 2xx that arrives after the 5-second wait still deletes its entry.

## Mapped, not decided

| Item | Why it can wait | Safe default |
|---|---|---|
| Entries that never flush because the worker never reaches Sync | Listed on the map as not yet specified | Entries stay in the log store |
| Repeated entries filling the 5k free-tier quota | Needs field data | Client-side `ignoreErrors` for known noise; one entry per failed record per sync |
| Public DSN abuse, consent, retention, Sentry access | Listed on the map | Sentry IP filters; project limited to the owner |
