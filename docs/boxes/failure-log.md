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

## Mapped, not decided

| Item | Why it can wait | Safe default |
|---|---|---|
| Entries that never flush because the worker never reaches Sync | Listed on the map as not yet specified | Entries stay in the log store |
| Repeated entries filling the 5k free-tier quota | Needs field data | Client-side `ignoreErrors` for known noise; one entry per failed record per sync |
| Public DSN abuse, consent, retention, Sentry access | Listed on the map | Sentry IP filters; project limited to the owner |
