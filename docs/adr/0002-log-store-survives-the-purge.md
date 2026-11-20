# The failure log is its own IndexedDB store and survives the purge

Attendance failures happen offline and can only be reported at Sync, which then clears the device. The log therefore lives in a separate `logStore` that the purge does not clear, and entries are deleted only after Sentry confirms receipt (see `docs/boxes/failure-log.md`). Adding the store bumps `DB_VERSION` from 1 to 2, which cannot be rolled back on devices that have already upgraded. The Sentry SDK's own offline queue is not used: it holds 30 events, silently drops the rest, and lives in a second database the purge would have to know about.

## Considered Options

- **Use the SDK offline transport.** Rejected for the reasons above.
- **Keep the log in the visitor or session stores.** Rejected: the purge clears them, so a failed flush would lose the entries.
