# Phase 6: Google Drive Synchronization & Batch Persistence

## Context & Prerequisites

* **Mandatory Reference:** Before executing these tasks, read `design/index.md` to understand the global architectural constraints, Google Drive isolation guardrails, and cloud synchronization rules.
* **Objective:** Implement the Google Picker API to select master spreadsheets, enforce the mandatory file cloning guardrail (creating an isolated working copy with the `_ASISTENCIA` suffix), ingest spreadsheet rows into the local `IndexedDB` (`visitorStore`), and program the asynchronous batch synchronization engine to push offline attendance timestamps back to Google Sheets without data loss or UI freezing.
* **Execution Boundary:** Do **NOT** modify the primary master spreadsheet selected by the user under any circumstances. All cloud writes must strictly target the cloned working file (`workingFileId`). Do **NOT** alter the 3-zone visual layout architecture established in Phase 2 or the local IndexedDB schema from Phase 3.

---

## Task 1: Google Picker API & Spreadsheet Selection (`src/services/pickerService.js`)

You must configure the Google Picker API to provide a secure, visual file browser restricted strictly to spreadsheet formats.

1. Create `src/services/pickerService.js` (or `.ts`).
2. Implement an asynchronous script loader `loadGooglePickerScript()`:
* Programmatically inject the Google API script (`<script src="[https://apis.google.com/js/api.js](https://apis.google.com/js/api.js)" async defer></script>`) into `document.head` if `window.gapi` is undefined.
* Initialize the Picker library by calling `window.gapi.load('picker', callback)`.


3. Implement `openSpreadsheetPicker(authToken, onFileSelected, onError)`:
* Verify that a valid OAuth token (`authToken`) is provided from Phase 5 (`getValidToken()`).
* Instantiate a `google.picker.DocsView` configured to display only spreadsheets:
```javascript
const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS);
view.setMimeTypes('application/vnd.google-apps.spreadsheet,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

```


* Build and render the Picker modal using `google.picker.PickerBuilder`:
* Set the developer API key (`import.meta.env.VITE_GOOGLE_API_KEY`).
* Set the OAuth token (`setOAuthToken(authToken)`).
* Add the spreadsheet view (`addView(view)`).
* Bind a callback handler (`setCallback(pickerCallback)`).


* In the callback handler, intercept `google.picker.Action.PICK` events, extract the selected document metadata (`doc[google.picker.Document.ID]` and `doc[google.picker.Document.NAME]`), and pass them to `onFileSelected({ id, name })`.



---

## Task 2: File Cloning Guardrail & Data Ingestion (`src/services/driveService.js`)

To prevent accidental data corruption of master rosters, you must enforce a strict cloning guardrail before reading spreadsheet rows into local memory.

1. Create `src/services/driveService.js` (or `.ts`).
2. Implement `cloneMasterSpreadsheet(authToken, masterFileId, masterFileName)`:
* **The Isolation Guardrail:** Never execute write operations against `masterFileId`.
* Construct the target clone name by stripping existing extensions and appending `_ASISTENCIA` (e.g., `"Lista_Invitados"` becomes `"Lista_Invitados_ASISTENCIA"`).
* Execute an HTTP POST request to the Google Drive v3 API:
```http
POST https://www.googleapis.com/drive/v3/files/{masterFileId}/copy
Authorization: Bearer {authToken}
Content-Type: application/json

{
  "name": "{masterFileName}_ASISTENCIA"
}

```


* Extract and return the newly generated `id` from the API response. This ID becomes the permanent `workingFileId` for the current session.


3. Implement `fetchSpreadsheetData(authToken, workingFileId, range = 'Sheet1!A:Z')`:
* Execute an HTTP GET request to the Google Sheets v4 API:
```http
GET https://sheets.googleapis.com/v4/spreadsheets/{workingFileId}/values/{range}
Authorization: Bearer {authToken}

```


* Extract the 2D array of rows from `response.values`.


4. Implement `ingestRowsToIndexedDB(rowsArray)`:
* Assume Row 0 contains column headers. Map subsequent rows to the schema established in Phase 3 (`src/services/visitorService.js`).
* For each valid row, construct an object enforcing the required baseline fields:
```javascript
{
  visitorId: String(row[0]).trim(), // DNI/ID (Primary Key)
  visitorName: String(row[1]).trim().toUpperCase(),
  hostName: row[2] ? String(row[2]).trim().toUpperCase() : 'NO ASIGNADO',
  relationship: row[3] ? String(row[3]).trim().toUpperCase() : 'GENERAL',
  attendanceStatus: false,
  attendanceTimestamp: null,
  syncedWithCloud: false
}

```


* Execute a bulk write transaction using `seedMockVisitors(mappedArray)` (or a dedicated `bulkInsertVisitors` helper in `visitorService.js`) to clear existing records and populate `visitorStore`.
* Open `sessionStateStore` and update the `'CURRENT_SESSION'` record with `masterFileId` and the newly generated `workingFileId`.



---

## Task 3: Batch Cloud Synchronization Engine (`src/services/syncService.js`)

You must build an asynchronous synchronization engine that pushes locally recorded check-ins back to the cloned spreadsheet without UI blocking.

1. Create `src/services/syncService.js` (or `.ts`).
2. Implement `executeBatchSync(tokenClient)`:
* **Step 1 (Local Query):** Query `visitorStore` using `getAllVisitors()`. Filter the array to extract only records where synchronization is pending:
```javascript
const pendingRecords = allVisitors.filter(
  record => record.attendanceStatus === true && record.syncedWithCloud === false
);

```


* If `pendingRecords.length === 0`, return `{ status: 'UP_TO_DATE', count: 0, message: 'Todos los registros están sincronizados.' }`.
* **Step 2 (Token Health Intercept):** Call `getValidToken()` from `authService.js`.
* If the returned token is `null` (indicating the 1-hour expiration limit has passed), abort the HTTP request immediately.
* Invoke `handleExpiredTokenReAuth(tokenClient)` to launch the interactive Google OAuth pop-up modal. Return `{ status: 'AUTH_REQUIRED', message: 'Sesión expirada. Confirme su cuenta para sincronizar.' }`.


* **Step 3 (Target Resolution):** Retrieve `workingFileId` from `sessionStateStore`. If null, throw an error: *"Error crítico: No se encontró el archivo de trabajo clonaado."*
* **Step 4 (Payload Construction):** Map `pendingRecords` into a Google Sheets v4 `valueInputOption=USER_ENTERED` batch append or update payload. Construct an array of rows containing the identity and check-in timestamp:
```javascript
const valuesToAppend = pendingRecords.map(record => [
  record.visitorId,
  record.visitorName,
  "ASISTIÓ",
  record.attendanceTimestamp // ISO-8601 string
]);

```


* **Step 5 (Cloud Execution):** Execute an HTTP POST request to append the check-in logs to a dedicated tracking tab or columns in the cloned file:
```http
POST https://sheets.googleapis.com/v4/spreadsheets/{workingFileId}/values/Sheet1!A:D:append?valueInputOption=USER_ENTERED
Authorization: Bearer {validToken}
Content-Type: application/json

{
  "values": valuesToAppend
}

```


* **Step 6 (Local State Reconciliation):** Upon receiving a successful HTTP 200 response from Google Sheets:
* Open an IndexedDB read-write transaction on `visitorStore`.
* Iterate through `pendingRecords`, update each record in the store by setting `syncedWithCloud = true`, and save the updates.
* Return `{ status: 'SUCCESS', count: pendingRecords.length, message: `Se sincronizaron ${pendingRecords.length} registros con Google Drive.` }`.





---

## Task 4: Wire Sync UI & Offline Network Guardrails

Connect the Drive synchronization services to the visual UI State Machine and enforce strict network boundaries.

1. Open `src/App.jsx` and wire the file selection flow:
* When `appState === 'FILE_PICKER_PENDING'`, bind the **"SELECCIONAR EXCEL DE DRIVE"** button in `Zone3Actions.jsx` to execute `openSpreadsheetPicker()`.
* On successful file selection, trigger `cloneMasterSpreadsheet()`, pass the resulting `workingFileId` into `fetchSpreadsheetData()`, and execute `ingestRowsToIndexedDB()`.
* While cloning and downloading occur, display a loading state in Zone 3: *"Clonando archivo y procesando registros..."*
* Once ingestion completes cleanly, transition `appState` to `'READY_EMPTY'`.


2. Open `src/components/Zone3Actions.jsx` and locate the sticky bottom button in the `'READY_EMPTY'` state: **"Sincronizar Datos con Drive"**.
* Bind this button's onClick event to `executeBatchSync(tokenClient)`.
* While synchronization is running, disable the button and display: *"Sincronizando con Drive..."*
* On completion, display a toast or status badge summarizing the result (`SUCCESS`, `UP_TO_DATE`, or `AUTH_REQUIRED`).


3. **The Offline Network Guardrail:**
* Inspect the `isOffline` boolean state (or query `navigator.onLine` dynamically).
* If `isOffline === true`, physically disable the **"Sincronizar Datos con Drive"** button (`opacity-50 cursor-not-allowed bg-gray-300`).
* Below the disabled button, render a bold amber warning text: *"⚠️ No se puede sincronizar en Modo Local. Conéctese a internet para enviar los registros."*



---

## Task 5: Developer Controls & End-to-End Sandbox Testing

Expand the developer simulation bar to allow testing the cloning, ingestion, and synchronization loop without requiring a live internet connection or Drive account during local UI debugging.

1. Open `src/components/DevStateControls.jsx` and add two new action buttons:
* **"☁️ Simular Descarga Drive"**: Bypasses the Picker API. Generates a mock `workingFileId` (`"mock_cloned_sheet_id_999"`), writes it to `sessionStateStore`, seeds `visitorStore` with 25 records using `ingestRowsToIndexedDB(mockDataRows)`, and forces `appState` to `'READY_EMPTY'`.
* **"🔄 Simular Sync Batch"**: Queries `visitorStore` for records where `syncedWithCloud === false`, simulates a 1-second network delay, sets their `syncedWithCloud` flags to `true`, and outputs an alert: *"Simulación: 5 registros marcados como sincronizados."*



---

### 5.1 Expected Workspace State (End of Phase 6)

```text
root/
├── .env.example
├── .env
├── src/
│   ├── components/
│   │   ├── DevStateControls.jsx   <-- MODIFIED: Added Drive Download & Batch Sync simulators
│   │   ├── Header.jsx
│   │   ├── Zone1Scanner.jsx
│   │   ├── Zone2Search.jsx
│   │   └── Zone3Actions.jsx       <-- MODIFIED: Wired real Picker execution & Sync trigger with offline guardrail
│   ├── db/
│   ├── services/
│   │   ├── authService.js
│   │   ├── driveService.js        <-- NEW: Drive v3 cloning (_ASISTENCIA) & Sheets v4 row ingestion
│   │   ├── pickerService.js       <-- NEW: Google Picker API DocsView loader & modal builder
│   │   ├── scannerService.js
│   │   ├── searchService.js
│   │   ├── syncService.js         <-- NEW: Batch attendance uploader & local IndexedDB reconciler
│   │   └── visitorService.js
│   ├── App.jsx                    <-- MODIFIED: Integrated Picker -> Clone -> Ingest -> READY_EMPTY routing
│   ├── index.css
│   └── main.jsx

```

---

## Verification & Gatecheck

Before reporting completion of Phase 6 and the end-to-end application build, execute the following terminal commands and browser verification checks:

1. `npm run dev` — Launch the application in Chrome. Clear the database (`clearAllStores()`) to reset the session.
2. **Simulation Check (Local Sandbox):**
* Click **"🔑 Simular Auth Google"** -> Verify state shifts to `'FILE_PICKER_PENDING'`.
* Click **"☁️ Simular Descarga Drive"** -> Verify state shifts to `'READY_EMPTY'`, and DevTools shows `visitorStore` populated with records and `sessionStateStore` containing `"mock_cloned_sheet_id_999"`.
* Check in 3 visitors (either via barcode scan simulation or text search). Inspect DevTools -> IndexedDB -> `visitorStore`: confirm `attendanceStatus: true` and `syncedWithCloud: false`.
* Click **"🔄 Simular Sync Batch"** -> Inspect DevTools again: confirm the checked-in records now display `syncedWithCloud: true`.


3. **Live Drive & Sheets Verification (Requires `.env` Credentials):**
* Authenticate with a real Google Account in State 0.
* In State 1 (`'FILE_PICKER_PENDING'`), click **"SELECCIONAR EXCEL DE DRIVE"**. Confirm the Google Picker modal opens and only displays spreadsheet files.
* Select a test spreadsheet (e.g., `"Event_Guests"`). Confirm the app displays the loading state, clones the file in your Google Drive as `"Event_Guests_ASISTENCIA"`, parses the rows into IndexedDB, and lands on `'READY_EMPTY'`.
* Verify in your actual Google Drive web interface that the original `"Event_Guests"` file remains completely unmodified, and a new `"Event_Guests_ASISTENCIA"` file exists.


4. **Offline Sync Rejection Check:**
* Check in an attendee so at least 1 record has `syncedWithCloud: false`.
* Toggle the network status to offline (click the offline toggle in `DevStateControls` or check **Offline** in Chrome DevTools Network tab).
* Confirm the **"Sincronizar Datos con Drive"** button becomes grayed out and unclickable, and the warning banner *"⚠️ No se puede sincronizar en Modo Local..."* is explicitly visible.


5. **Production Bundle Verification:**
* Execute `npm run build`. Verify that Vite compiles all modular services, components, and dynamic Google script loaders into optimized production static assets without errors or broken dependencies.