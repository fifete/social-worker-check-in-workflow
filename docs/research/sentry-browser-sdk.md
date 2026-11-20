# Sentry Browser SDK: facts relevant to the offline-first check-in PWA

Scope: what `@sentry/browser` does with data, offline use, rate limits and the free plan. Claims cite the source that owns them. Docs pages describe SDK v11 (CDN examples pin `11.16.0`); source links point at the `develop` branch, so confirm against the installed version before relying on exact constants.

Sources:

- [S1] Options: https://docs.sentry.io/platforms/javascript/configuration/options/
- [S2] Data collected: https://docs.sentry.io/platforms/javascript/data-management/data-collected/
- [S3] Scrubbing sensitive data: https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/
- [S4] Filtering: https://docs.sentry.io/platforms/javascript/configuration/filtering/
- [S5] Offline caching: https://docs.sentry.io/platforms/javascript/best-practices/offline-caching/
- [S6] Transports: https://docs.sentry.io/platforms/javascript/configuration/transports/
- [S7] APIs (`flush`, `close`, `captureEvent`): https://docs.sentry.io/platforms/javascript/configuration/apis/
- [S8] DSN explainer: https://docs.sentry.io/concepts/key-terms/dsn-explainer/
- [S9] Inbound filters: https://docs.sentry.io/concepts/data-management/filtering/
- [S10] Error quota guide: https://docs.sentry.io/pricing/quotas/manage-event-stream-guide/
- [S11] Pricing: https://sentry.io/pricing/
- [S12] Tree shaking: https://docs.sentry.io/platforms/javascript/configuration/tree-shaking/
- [S13] Loader/CDN: https://docs.sentry.io/platforms/javascript/install/loader/
- [S14] SDK spec, rate limiting: https://develop.sentry.dev/sdk/foundations/transport/rate-limiting/
- [S15] SDK spec, offline caching: https://develop.sentry.dev/sdk/foundations/transport/offline-caching/
- [S16] SDK spec, transport: https://develop.sentry.dev/sdk/foundations/transport/
- [S17] SDK spec, envelopes: https://develop.sentry.dev/sdk/foundations/data-model/envelopes/
- [S18] SDK spec, event payloads: https://develop.sentry.dev/sdk/foundations/transport/event-payloads/
- [S19] Source `core/src/transports/offline.ts`: https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/transports/offline.ts
- [S20] Source `core/src/transports/base.ts`: https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/transports/base.ts
- [S21] Source `browser/src/transports/offline.ts`: https://github.com/getsentry/sentry-javascript/blob/develop/packages/browser/src/transports/offline.ts
- [S22] Source `core/src/client.ts`: https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/client.ts
- [S23] Source `core/src/utils/prepareEvent.ts`: https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/utils/prepareEvent.ts
- [S24] Source `core/src/utils/ratelimit.ts`: https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/utils/ratelimit.ts
- [S25] Source `core/src/utils/promisebuffer.ts`: https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/utils/promisebuffer.ts

## 1. Free plan (Developer) and quota behaviour

- Developer plan: $0, 1 user, 5k errors, 5M spans, 50 replays, 1 GB attachments, 30-day retention [S11].
- Over quota: server answers `429` with `Retry-After`; clients must drop events until it expires, not retry [S10].
- Spike protection drops events when volume exceeds a threshold computed from baseline [S10].
- Per-key rate limits (events per minute/hour/day) are **Business/Enterprise only** [S10]. Not available on Developer.
- Custom inbound filters: Trial/Business/Enterprise only [S9]. Built-in filters (browser extensions, localhost, legacy browsers, crawlers, IP blocking) are not plan-gated in the docs [S9].
- Filtered events do not count toward quota [S9]. Events dropped client-side (`beforeSend` returns `null`, `sampleRate`, `ignoreErrors`) do not count either [S10].
- Implication: on the free plan the only volume controls are client-side (`sampleRate`, `ignoreErrors`, `beforeSend`) plus spike protection and IP filters. A loop of repeated errors in the field can burn 5k quickly.

## 2. DSN exposure

- DSN is safe to ship publicly; it only permits submitting events, not reading [S8].
- Risk: anyone can send arbitrary events to the project. Mitigations: IP filters, key rotation/revocation [S8].
- "Allowed Domains" filter checks `Origin`/`Referer`; requests without those headers are always accepted [S9]. Plan availability of this filter is not stated in [S9].
- DSN is bundled into the JS; fine for a static PWA but it is a public identifier, not a secret.

## 3. What gets sent (privacy)

- `sendDefaultPii` is deprecated when `dataCollection` is set (`dataCollection` available since `10.57.0`). In v10 without `dataCollection`, `sendDefaultPii` governs; from v11 the `dataCollection` defaults always apply [S1].
- `dataCollection` defaults: `userInfo: true` (includes inferred IP address), cookies/headers/query params collected with sensitive-key values replaced by `[Filtered]`, `urlQueryParams: true` [S1].
- Browser specifics [S2]:
  - IP address is sent by default; disable with `dataCollection: { userInfo: false }`. IP can still leak via headers/cookies/query params.
  - Request URL scheme/host/path is **always** sent and cannot be turned off.
  - Query strings are sent by default; sensitive-named keys are filtered; `urlQueryParams: false` removes them.
  - Browser request headers sent: `Referer`, `User-Agent` only (the `httpClient` integration is off by default).
  - Referrer URL is sent.
  - Console logs become breadcrumbs and "may contain PII"; remove the `Console` integration or filter with `beforeBreadcrumb`.
  - Device/browser/OS info is sent.
- Server-side backstop: project setting "Prevent Storing of IP Addresses", or a server-side scrubbing rule on `$user.ip_address` [S7].
- Scrubbing hooks: `beforeSend` (errors/messages), `beforeBreadcrumb`, `beforeSendSpan`, `beforeSendLog`. Docs recommend scrubbing in the SDK so data never leaves the device [S3].
- `beforeSend` runs on the final prepared event, after scope data is applied [S1]. It runs **before** the event reaches the transport and therefore before any offline queueing [S22: `_processEvent` => `processBeforeSend` => `sendEvent`].
- Sentry's guidance for user identity: send an internal id instead of email/name via `setUser({ id })` [S3].
- Sizes: event/span items max 1 MiB; messages 8192 chars; stack traces 50 frames [S17, S18]. Breadcrumb count limit not verified.

## 4. Offline behaviour

Default transport:

- Fetch-based; drops an event when sending fails for lack of connection [S1, S6].
- `Sentry.captureException` returns an event id immediately. The id does not guarantee delivery [S7]. `Client.sendEnvelope` catches and swallows transport errors, returning `{}` [S22].
- To observe the outcome use the client hook `afterSendEvent` (receives the transport response with `statusCode`) [S22]. This hook is on the client API, not on the documented `Sentry.*` surface [S7].

`makeBrowserOfflineTransport(makeFetchTransport)` [S5, S21]:

- Storage: IndexedDB, db `sentry-offline`, store `queue` (configurable via `dbName`, `storeName`).
- `maxQueueSize` default 30. When the queue is full, new pushes are **silently ignored** (`push` returns without writing when `keys.length >= maxQueueSize`) [S21]. IndexedDB errors are swallowed [S21].
- `flushAtStartup` default `false` [S5, S19]. Without it, envelopes queued in a previous page session are not retried until a later trigger (below).
- Triggers that flush the queue [S19, S21]:
  - the window `online` event (browser version) => `transport.flush()`;
  - a retry timer started after a failed send: first delay 5 s, doubling up to 1 h (`START_DELAY`, `MAX_DELAY`);
  - `Sentry.flush()` called **without** a timeout resets the delay and flushes the queue in 100 ms; with a timeout it only drains the in-flight buffer [S19].
- Retry timers live in the page. If the tab/PWA is closed offline, nothing retries until the next load, and then only with `flushAtStartup: true` or after another send attempt/`online` event [S19].
- A queued envelope gets a fresh `sent_at` when retried [S19]. The event `timestamp` is set once at capture (`event.timestamp || dateTimestampInSeconds()`) [S23], so queued events keep their original occurrence time. `sent_at` is used server-side for clock-drift correction [S17].
- What is queued: only when `transport.send` **throws** (network error). HTTP responses with status >= 400 are not queued; a response with `Retry-After` or `X-Sentry-Rate-Limits` only delays the next queue flush (60 s default for rate-limit headers) [S19].
- `shouldStore` / `shouldSend` hooks allow dropping instead of queueing [S5, S19]. Client-report envelopes are never queued [S19].
- Spec alignment [S15]: 2xx = success; 4xx/5xx = discard and record a client report; 413 = discard, never retry; 429 = respect rate limits, discard, never retry; network errors = may retry; SDKs should wait ~100 ms between cached sends and stop consuming the disk cache while rate-limited.

Rate limits in the client [S14, S20, S24]:

- On every response, parse `X-Sentry-Rate-Limits`; on `429` use `Retry-After`; a `429` with neither header means 60 s for all categories. Items inside a limit window are dropped before sending (`ratelimit_backoff`).
- `X-Sentry-Rate-Limits` can also arrive on `200` responses.
- Transport buffer holds 64 in-flight envelopes by default; overflow is dropped (`queue_overflow`) [S20, S25].

`flush` / `close` [S7, S22, S25]:

- `flush(timeout?) => Promise<boolean>`: `true` if the client and transport drained before the timeout, `false` otherwise. It does not report whether the server accepted the data.
- `close(timeout?)` flushes then disables the client; do not call it in a long-lived PWA.

## 5. Bundling and the repo's "no CDN" rule

- Repo rule: all scripts compiled into `dist/assets`, no external HTTP calls to initialise (ARCHITECTURE_AND_LOCAL_DB.md, "Local Asset Isolation").
- Loader script (`js.sentry-cdn.com`) and CDN bundles (`browser.sentry-cdn.com`) load from Sentry's CDN [S13], which conflicts with that rule. The npm package `@sentry/browser` bundles into the build.
- Unused integrations (Replay, BrowserTracing, Profiling) are tree-shaken automatically by modern bundlers [S12].
- Further reductions: replace `__SENTRY_DEBUG__` with `false`, `__SENTRY_TRACING__` with `false` if tracing is unused, or build a `BrowserClient` manually to drop unused default integrations [S12]. Vite is covered via the Sentry bundler plugin `bundleSizeOptimizations` [S12].
- CSP, if one is added: `connect-src` must allow the Sentry ingest origin [S13].
- A `tunnel` client option exists (envelope URL is built from `options.tunnel`) [S22]; it needs your own endpoint, which this serverless app does not have. Docs page for it was not read.

## 6. Not verified (do not rely on)

- Compressed bundle size of `@sentry/browser` for the current version. No figure was obtained from a primary source; measure with the build.
- Server-side acceptance window for old event timestamps. The envelope/event specs say `timestamp` is when the event was created and `sent_at` corrects clock drift [S17, S18], but no maximum age was found. Test with an event queued for days before assuming it is ingested with its original time.
- Whether the "Allowed Domains" filter is available on the Developer plan.
- Exact semantics of `sendDefaultPii` per SDK version; docs only state it is deprecated in favour of `dataCollection` when that option is set [S1].
- Behaviour of the offline transport on the exact SDK version pinned in `package.json`; sources above are `develop`.

## 7. Implications for this repo (derived, not from Sentry)

- Visitor identity is the sensitive data here. Error messages, breadcrumbs (console, UI clicks, fetch URLs to Google APIs) and `extra` can carry barcode values, names or spreadsheet row data. Plan a `beforeSend` + `beforeBreadcrumb` scrub and set `userInfo: false`.
- The offline queue stores scrubbed envelopes in IndexedDB (`sentry-offline`). The documented post-sync "absolute storage purge" (ARCHITECTURE_AND_LOCAL_DB.md) should decide explicitly whether that database is purged or exempt.
- Offline-first usage means long offline periods: with `maxQueueSize` 30 and full-queue drops, errors from an offline event can be lost; the first 30 are kept, later ones are discarded.
- Free-tier 5k errors: add `ignoreErrors`, `sampleRate` or dedupe for known noisy cases (camera permission denied, network failures while offline).
