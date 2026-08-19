> What this file answers: What functions does authService expose, what are their inputs and outputs, how is token expiry detected, and how is re-authentication triggered before sync?

---

## Responsibilities
`authService` is the sole owner of Google Identity Services interactions and token lifecycle. No other service or component calls GIS APIs directly.

---

## Dependencies
- Google Identity Services script: `https://accounts.google.com/gsi/client` (loaded once at app startup)
- `sessionStateStore` (via `visitorService.readSession` / `visitorService.writeSession`)
- Environment variables: `VITE_GOOGLE_CLIENT_ID`

---

## Functions

### `initAuth()`
Initializes the GIS token client. Must be called once after the GIS script is loaded.

**Inputs:** None.

**Outputs:** None (registers internal token client reference).

**Behavior:**
- Calls `google.accounts.oauth2.initTokenClient()` with:
  - `client_id`: `import.meta.env.VITE_GOOGLE_CLIENT_ID`
  - `scope`: `https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets`
  - `callback`: internal handler → calls `handleTokenResponse()`
  - `prompt`: `''`
- Stores the returned token client reference internally (module-level variable)

**Error codes:** None. Throws if called before the GIS script is loaded.

---

### `requestSignIn()`
Opens the GIS authorization popup. Must be called from a user gesture handler.

**Inputs:** None.

**Outputs:** `Promise<void>` — resolves when the token callback fires successfully; rejects on error.

**Behavior:**
- Calls `tokenClient.requestAccessToken({ prompt: '' })`
- Resolves when `handleTokenResponse()` completes successfully
- Rejects with:
  - `{ code: 'POPUP_BLOCKED' }` if the browser blocks the popup
  - `{ code: 'AUTH_CANCELLED' }` if the user dismisses the popup
  - `{ code: 'AUTH_FAILED', detail: string }` for all other GIS errors

**Calls:** `handleTokenResponse()`, `visitorService.writeSession()`

---

### `handleTokenResponse(response)`
Internal handler. Not called by external consumers.

**Inputs:**
- `response: TokenResponse` — GIS token response object

**Behavior:**
1. Reads existing session from `sessionStateStore` (to preserve `refreshToken`)
2. Builds updated session:
   - `accessToken = response.access_token`
   - `tokenIssuedAt = Date.now()`
   - `refreshToken = response.refresh_token ?? existingSession?.refreshToken ?? null`
     (**never overwrite with `undefined`**)
3. Calls `visitorService.writeSession(updatedSession)`
4. Resolves the pending `requestSignIn()` promise

**Error codes:**
- `{ code: 'SESSION_WRITE_FAILED' }` if IDB write fails

---

### `isTokenValid()`
Checks whether the stored access token is within the 50-minute safety window.

**Inputs:** None.

**Outputs:** `Promise<boolean>`

**Behavior:**
1. Reads session from `sessionStateStore`
2. If no session or `tokenIssuedAt` is absent → returns `false`
3. Computes `tokenAge = Date.now() - session.tokenIssuedAt`
4. Returns `tokenAge < 3_000_000`

**Calls:** `visitorService.readSession()`

**Error codes:** If IDB read throws → returns `false` (treat as expired)

---

### `reAuthenticate()`
Re-opens the GIS popup to obtain a fresh token. Used by `syncService` before pushing data.

**Inputs:** None.

**Outputs:** `Promise<void>`

**Behavior:**
- Identical to `requestSignIn()` — calls `tokenClient.requestAccessToken({ prompt: '' })`
- On success: `handleTokenResponse()` updates stored session
- On failure: rejects with the same error codes as `requestSignIn()`

**Calls:** `handleTokenResponse()`, `visitorService.writeSession()`

**Error codes:**
- `{ code: 'AUTH_CANCELLED' }` — user closed popup
- `{ code: 'AUTH_FAILED', detail: string }` — GIS error
- `{ code: 'SESSION_WRITE_FAILED' }` — IDB write failed after successful auth

---

### `getAccessToken()`
Returns the stored access token string. Does not check validity.

**Inputs:** None.

**Outputs:** `Promise<string | null>`

**Behavior:**
1. Reads session from `sessionStateStore`
2. Returns `session.accessToken ?? null`

**Calls:** `visitorService.readSession()`

**Error codes:** If IDB read throws → returns `null`

---

## Token Expiry Constants

```javascript
export const TOKEN_EXPIRY_MS = 3_600_000;   // Google's hard expiry (1 hour)
export const TOKEN_SAFE_WINDOW_MS = 3_000_000; // 50-minute safety threshold
```

`isTokenValid()` uses `TOKEN_SAFE_WINDOW_MS`. The 10-minute buffer accounts for network latency during re-auth and sync.

**Silent iframe refresh must not be used.** Android Chrome blocks third-party cookies, making silent refresh unreliable. `requestAccessToken({ prompt: '' })` (interactive popup) is the required re-auth mechanism.
