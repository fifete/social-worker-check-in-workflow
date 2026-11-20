# Failure logs carry no personal data except the DNI of a failed record

Failure logs (IndexedDB log entries and the Sentry events sent from them) are read by developers outside the event, and Sentry keeps them for 30 days, so they must not hold visitor data. They carry only row index, error code, state and timestamp. A DNI is added only to an event about a specific failed record, in its own `dni` field, so the worker can find that visitor in the working copy; no name is ever logged. The SDK is configured with `userInfo` off (no IP address), and `beforeSend` and `beforeBreadcrumb` drop anything else that looks like a DNI, including error messages, URLs and console output.

## Considered Options

- **Row index only, no DNI.** Safest, but a failed record cannot be matched back to a visitor if the working copy was edited or rows moved.
- **Sentry default PII.** Rejected: it sends the IP address and can carry barcode values and spreadsheet data in breadcrumbs.

## Consequences

Hard to reverse: DNIs that reach Sentry cannot be recalled before its 30-day retention ends. Any new log call site must follow this rule.
