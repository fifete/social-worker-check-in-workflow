# Phase 5: Google Identity Services & Client-Side OAuth Setup

## Context & Prerequisites

* **Mandatory Reference:** Before executing these tasks, read `design/index.md` to understand the global architectural constraints, identity federation requirements, and the offline boot loop.


* **Objective:** Configure the Google Identity Services (GIS) SDK for client-side OAuth 2.0 authentication, establish secure access token capturing and persistence inside IndexedDB (`sessionStateStore`), wire the **"CONECTAR CON GOOGLE"** UI button, and implement an interactive modal re-authentication fallback to handle Google's strict 1-hour token expiration limit.


* **Execution Boundary:** Do **NOT** implement the Google Picker API visual file browser, Google Drive file cloning (`_ASISTENCIA`), spreadsheet array downloads, or end-of-shift batch synchronization in this phase (Phase 6). Focus strictly on authentication, session persistence, and token lifecycle management.



---

## Task 1: Environment Variables & GIS Script Loader (`src/services/authService.js`)

To securely communicate with Google APIs without hardcoding sensitive credentials into client bundles, you must configure environment variables and dynamically load the official GIS client library.

1. Create a `.env.example` file in the root directory (and your local `.env` file) containing the required client configuration keys:
```ini
VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
VITE_GOOGLE_API_KEY="your-api-key"
VITE_GOOGLE_APP_ID="your-project-number"

```


2. Create `src/services/authService.js` (or `.ts`).
3. Implement an asynchronous script loader `loadGoogleIdentityScript()`:
* Check if `window.google?.accounts?.oauth2` is already defined. If so, resolve immediately.
* If undefined, programmatically inject the GIS script tag (`<script src="[https://accounts.google.com/gsi/client](https://accounts.google.com/gsi/client)" async defer></script>`) into `document.head`.
* Bind `onload` and `onerror` event listeners to resolve or reject the promise cleanly.



---

## Task 2: Configure OAuth Token Client & IndexedDB Session Persistence

You must instantiate Google's Token Client with the exact OAuth scopes required for file cloning and spreadsheet manipulation, and persist the returned credentials inside IndexedDB.

1. Inside `src/services/authService.js`, define the required OAuth 2.0 scopes:
```javascript
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets'
].join(' ');

```

2. Implement `initTokenClient(onAuthSuccess, onAuthError)`:
* Call `window.google.accounts.oauth2.initTokenClient({ ... })` passing `import.meta.env.VITE_GOOGLE_CLIENT_ID`, the defined `SCOPES`, and a callback handler.
* Ensure the callback extracts `response.access_token` and checks for error flags (`response.error`).

3. Implement `saveSessionToken(tokenResponse)`:
* Open an IndexedDB transaction targeting `sessionStateStore` via our `src/db/db.js` wrapper.
* Write or update the session record matching the primary key specification:


```javascript
{
  sessionId: 'CURRENT_SESSION', // Static primary key[cite: 1]
  authToken: tokenResponse.access_token,[cite: 1]
  tokenAcquisitionTime: Date.now(),[cite: 1]
  workingFileId: null, // Initialized in Phase 6[cite: 1]
  masterFileId: null   // Initialized in Phase 6[cite: 1]
}

```

4. Implement `getValidToken()`:
* Read the `'CURRENT_SESSION'` record from `sessionStateStore`.
* If no record exists, return `null`.
* **1-Hour Expiration Guardrail:** Google client-side access tokens expire strictly after 3600 seconds. Calculate elapsed time: `Date.now() - record.tokenAcquisitionTime`.
* If elapsed time is $< 3500000\text{ ms}$ (~58 minutes safety threshold), return `record.authToken`.
* If elapsed time is $\ge 3500000\text{ ms}$, return `null` (flagging the token as expired).

---

## Task 3: Interactive Re-Authentication UX Guardrail

Due to strict third-party cookie blocking in modern mobile browsers (including Android Chrome's privacy sandbox), silent background token refreshing (`prompt=none`) frequently fails. You must enforce an interactive pop-up fallback.

1. Inside `src/services/authService.js`, implement `requestGoogleAuth(tokenClient, promptType = '')`:
* Invoke `tokenClient.requestAccessToken({ prompt: promptType })`.
* When calling for an initial login, use `prompt: 'select_account'`.


2. Implement an expiration interception helper `handleExpiredTokenReAuth(tokenClient)`:
* When an expired token is detected during an active shift or pre-sync check, do **NOT** attempt a silent iframe refresh.
* Return a structured state object instructing the UI to display the mandatory alert notice: *"Su sesión ha expirado. Por favor, confirme su cuenta de Google en la ventana emergente para finalizar la sincronización."*
* Trigger `tokenClient.requestAccessToken({ prompt: '' })` to launch the interactive Google confirmation modal cleanly over the active viewport.

---

## Task 4: Wire Authentication Flow into UI State Machine

Connect the GIS authentication service to the boot loop health check and wire the interactive login button inside Zone 3.

1. Open `src/App.jsx` and update the boot sequence logic (`useEffect` on mount):
* **Step 1 (The Offline Boot Loop):** Query `getAllVisitors()` from `visitorStore`. If the array length is $> 0$, completely bypass Google authentication and set `appState` to `'READY_EMPTY'`.

* **Step 2 (Token Health Check):** If `visitorStore` is empty, execute `getValidToken()`.
* If a valid token string is returned, transition directly to `'FILE_PICKER_PENDING'`.
* If `getValidToken()` returns `null`, set `appState` to `'AUTH_PENDING'`.

2. Open `src/components/Zone3Actions.jsx`:
* In the `'AUTH_PENDING'` block, wire the **"CONECTAR CON GOOGLE"** (`bg-brand-blue`) button onClick handler to execute `requestGoogleAuth()`.
* While the GIS popup is active, disable the button and show a loading spinner or text: *"Conectando con Google..."*
* Upon receipt of a successful OAuth callback and persistence to `sessionStateStore`, instantly transition `appState` from `'AUTH_PENDING'` to `'FILE_PICKER_PENDING'`.

3. Open `src/components/DevStateControls.jsx` and add two developer simulation triggers:
* **"🔑 Simular Auth Google"**: Writes a mock token (`"mock_oauth_token_123"`) and current timestamp to `sessionStateStore`, then forces state to `'FILE_PICKER_PENDING'`.

* **"⏳ Simular Token Expirado"**: Mutates the record in `sessionStateStore` by setting `tokenAcquisitionTime: Date.now() - 7200000` (2 hours in the past) to test the expiration interceptor.

---

### 4.1 Expected Workspace State (End of Phase 5)

```text
root/
├── .env.example           <-- NEW: Template for Google OAuth Client IDs
├── .env                   <-- NEW: Local developer credentials (gitignored)
├── src/
│   ├── components/
│   │   ├── DevStateControls.jsx   <-- MODIFIED: Added Auth & Expiration simulation triggers
│   │   ├── Header.jsx
│   │   ├── Zone1Scanner.jsx
│   │   ├── Zone2Search.jsx
│   │   └── Zone3Actions.jsx       <-- MODIFIED: Wired real GIS login execution to State 0 button[cite: 2]
│   ├── db/
│   ├── services/
│   │   ├── authService.js         <-- NEW: GIS script loader, token client, & session store persistence[cite: 1]
│   │   ├── scannerService.js
│   │   ├── searchService.js
│   │   └── visitorService.js
│   ├── App.jsx                    <-- MODIFIED: Integrated boot loop token check & State 0->Step 2 routing[cite: 1, 2]
│   ├── index.css
│   └── main.jsx

```

---

## Verification & Gatecheck

Before reporting completion of Phase 5, execute the following terminal commands and interactive browser checks to verify strict compliance with the authentication architecture:

1. `npm run dev` — Launch the application in Chrome. Ensure `visitorStore` is cleared (`clearAllStores()`) to force the app into `'AUTH_PENDING'`.

2. **Simulation Check (No Credentials Required):**
* Click **"🔑 Simular Auth Google"** in the developer control bar.
* Open Chrome DevTools -> Application -> IndexedDB -> `AsistenciaDB` -> `sessionStateStore`. Verify a record exists with key `'CURRENT_SESSION'`, a populated `authToken`, and a valid timestamp.
* Confirm the UI immediately shifts from the blue login button to the solid slate **"SELECCIONAR EXCEL DE DRIVE"** button (`'FILE_PICKER_PENDING'`).

3. **Live GIS OAuth Verification (Requires `.env` Client ID):**
* Clear the local database and click **"CONECTAR CON GOOGLE"** in Zone 3.
* Confirm the Google account selection pop-up modal launches cleanly over the window.
* Log in with a valid Google account. Confirm the modal closes, the live access token is written to `sessionStateStore`, and the UI transitions to `'FILE_PICKER_PENDING'` without page reloads.

4. **Token Expiration & Intercept Verification:**
* Click **"⏳ Simular Token Expirado"** in the developer bar.
* Execute `getValidToken()` in the browser console or trigger an auth check. Verify it returns `null` despite a token string being present in storage (confirming the 1-hour math calculation enforces token invalidation correctly).

5. **Offline Boot Loop Bypass Verification:**
* Click **"🌱 Cargar Datos Mock (IndexedDB)"** to populate `visitorStore`.
* Refresh the browser tab. Confirm that because event records exist locally, the app **completely ignores** expired or missing tokens in `sessionStateStore` and boots directly into `'READY_EMPTY'`.