# Phase 3: Local Database & Search Engine Optimization

## Context & Prerequisites

* **Mandatory Reference:** Before executing these tasks, read `design/index.md` to understand the global architectural constraints, schema definitions, and search engine guardrails.


* **Objective:** Initialize the client-side serverless database (`IndexedDB`) using the pinned `idb` wrapper package. Implement the two core object stores (`visitorStore` and `sessionStateStore`), build the asynchronous data mutation service, and program the search engine to strictly enforce the character threshold and DOM rendering ceiling guardrails.


* **Execution Boundary:** Do **NOT** implement live hardware camera scanning (Phase 4), Google Identity OAuth scripts (Phase 5), or Google Drive spreadsheet downloads (Phase 6). Use a local mock seeding utility to populate `IndexedDB` for testing and verification.

---

## Task 1: Initialize IndexedDB Schema & Object Stores (`src/db/db.js`)

You must configure the native browser database engine inside a dedicated database layer using the lightweight `idb` library.

1. Create a `src/db/` directory.
2. Create `src/db/db.js`. Import `openDB` from `'idb'` and initialize a database named `'AsistenciaDB'` at version `2`.
3. Inside the `upgrade(db, oldVersion)` callback, create two distinct object stores strictly matching the architecture specification:


* **Store 1: `visitorStore`**

* Define the primary key path: `{ keyPath: 'recordId' }` — a composite string `"${visitorId}_${sheetRowIndex}"` that is unique per spreadsheet row. This allows the same visitor DNI (`visitorId`) to appear multiple times if they are registered to visit more than one adolescent.
* Create secondary indexes for fast lookups:
  * `db.createIndex('by_visitor', 'visitorId', { unique: false })` — non-unique; used to fetch all records for a given DNI.
  * `db.createIndex('by_name', 'visitorName', { unique: false })`
  * `db.createIndex('by_status', 'attendanceStatus', { unique: false })`
* **Migration note:** If upgrading from v1 (which used `visitorId` as `keyPath`), the old `visitorStore` must be deleted and recreated. Data loss is acceptable — the user re-imports from Drive.

* **Store 2: `sessionStateStore**`
* Define the primary key path: `{ keyPath: 'sessionId' }`.

4. Export a singleton database promise or initializer function `getDB()` that ensures clean connection pooling across components.

---

## Task 2: Build Database Access & Mutation Services (`src/services/visitorService.js`)

Create a modular service layer to handle asynchronous database transactions without exposing raw IndexedDB queries to React UI components.

1. Create a `src/services/` directory.
2. Create `src/services/visitorService.js` (or `.ts`) and implement the following asynchronous transaction functions:
* **`seedMockVisitors(mockArray)`:** Clears `visitorStore` and performs a bulk read-write transaction to insert an array of visitor objects using `store.put()` (upsert). Using `put` instead of `add` is required because the same visitor DNI can appear on multiple rows — `put` silently overwrites if `recordId` collides, while `add` would throw a `ConstraintError` and abort the entire transaction. Ensure each inserted record enforces the default system properties:


```javascript
{
  attendanceStatus: false,
  attendanceTimestamp: null,
  syncedWithCloud: false
}

```

* **`getAllVisitors()`:** Returns all records currently stored in `visitorStore`.
* **`getVisitorsByDni(visitorId)`:** Uses the `by_visitor` index to return an **array** of all records whose `visitorId` matches the given DNI. Returns multiple records when the same person is registered to visit more than one adolescent.


* **`registerAttendance(recordId)`:** Opens a read-write transaction, fetches the record by `recordId` (the primary key), mutates `attendanceStatus = true`, records the current ISO-8601 timestamp in `attendanceTimestamp`, sets `syncedWithCloud = false`, and writes the record back to `visitorStore`.


* **`undoAttendance(recordId)`:** Reverses the check-in event by fetching the record by `recordId` and setting `attendanceStatus = false` and `attendanceTimestamp = null`.


* **`clearAllStores()`:** Executes a complete `.clear()` transaction across both `visitorStore` and `sessionStateStore`.

---

## Task 3: Implement Search Engine Logic & Guardrails (`src/services/searchService.js`)

You must build a search utility that enforces strict memory and UI rendering limits to prevent mobile browser freezing.

1. Create `src/services/searchService.js` (or `.ts`).
2. Implement a string normalization helper `normalizeText(str)` that strips diacritics (accents) and converts strings to uppercase for consistent comparison:
```javascript
const normalizeText = (str) => 
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

```


3. Implement `executeSearch(query, visitorList)`. This function must evaluate the input against the baseline guardrails and return a structured result object:


* **Rule 1 (The 3-Character Threshold):** If `query.trim().length === 0`, return `{ status: 'IDLE', data: [] }`. If `query.trim().length > 0` and `query.trim().length < 3`, abort the lookup immediately and return:


```javascript
{ 
  status: 'THRESHOLD_WARNING', 
  message: 'Escriba al menos 3 caracteres...',[cite: 1]
  data: [] 
}

```

* **Rule 2 (Matching Algorithm):** Once length $\ge 3$, filter `visitorList` using case-insensitive, diacritic-insensitive substring matching (`String.prototype.includes`) against both normalized `visitorName` and `visitorId`.

* **Rule 3 (DOM Rendering Ceiling):** Evaluate the filtered matches array length.

* If `matches.length > 15`, abort UI rendering payload and return:

```javascript
{ 
  status: 'OVERFLOW_WARNING', 
  message: '⚠️ Demasiados resultados encontrados. Por favor, siga escribiendo para filtrar con mayor precisión.',[cite: 1]
  data: [] 
}

```

* If `matches.length <= 15`, return `{ status: 'SUCCESS', data: matches }`.

---

## Task 4: Connect UI Layout to IndexedDB & Search Engine

Wire the database services and search engine guardrails into the React components built in Phase 2.

1. Create a mock dataset file `src/db/mockData.js` containing an array of 20 realistic visitor objects (ensure at least 16 share a common surname like `"MENDOZA"` or `"GARCIA"` to allow testing the 15-item overflow ceiling).


2. Open `src/components/DevStateControls.jsx` and add two new developer action buttons:
* **"🌱 Cargar Datos Mock (IndexedDB)"**: Triggers `seedMockVisitors(mockData)` and alerts success.
* **"🗑️ Limpiar DB"**: Triggers `clearAllStores()`.

3. Open `src/components/Zone2Search.jsx` and update it to accept an `onSearchChange` callback prop. Wire the text input element to fire this callback on every keystroke.

4. Open `src/App.jsx` and integrate the real-time database search flow:
* Load the initial visitor list from `visitorStore` into state on component mount.
* Pass the active search input string into `executeSearch(query, visitorList)`.
* Map the returned search status (`IDLE`, `THRESHOLD_WARNING`, `OVERFLOW_WARNING`, or `SUCCESS`) directly into `Zone3Actions.jsx`.

5. Open `src/components/Zone3Actions.jsx` and update the rendering logic for `READY_EMPTY`, `MULTI_MATCH`, and `CONFIRMED_MATCH`:


* If search status is `'THRESHOLD_WARNING'`, display the amber text: *"Escriba al menos 3 caracteres..."* inside Zone 3.


* If search status is `'OVERFLOW_WARNING'`, display the amber warning banner: **"⚠️ Demasiados resultados encontrados. Por favor, siga escribiendo para filtrar con mayor precisión."**.


* If search status is `'SUCCESS'` and returns multiple items, render the scrollable mini-card list (`MULTI_MATCH`). Each card must display `visitorName`, `visitorId` (DNI), and `hostName` ("Visita a: ...") so the social worker can distinguish the same visitor appearing for different adolescents. Clicking a card must transition state to `CONFIRMED_MATCH` and load that specific visitor's record.


* In `CONFIRMED_MATCH`, wire the **"REGISTRAR ASISTENCIA"** button to execute `registerAttendance(selectedVisitor.recordId)`. On success, instantly update local state to render the gray badge (**"✓ ASISTENCIA REGISTRADA"**) and play a visual/textual confirmation. Wire **"Anular Registro"** to execute `undoAttendance(selectedVisitor.recordId)`. Both operations key on `recordId`, not `visitorId`.

---

### 4.1 Expected Workspace State (End of Phase 3)

```text
root/
├── src/
│   ├── components/
│   │   ├── DevStateControls.jsx   <-- MODIFIED: Added DB Seed & Clear triggers
│   │   ├── Header.jsx
│   │   ├── Zone1Scanner.jsx
│   │   ├── Zone2Search.jsx        <-- MODIFIED: Wired real-time keystroke handler
│   │   └── Zone3Actions.jsx       <-- MODIFIED: Rendering DB matches & guardrail warnings
│   ├── db/
│   │   ├── db.js                  <-- NEW: idb schema & store initialization[cite: 1]
│   │   └── mockData.js            <-- NEW: 20+ test records for overflow testing[cite: 1]
│   ├── services/
│   │   ├── searchService.js       <-- NEW: Diacritic normalization & threshold/cap guardrails[cite: 1]
│   │   └── visitorService.js      <-- NEW: IndexedDB CRUD & attendance mutations[cite: 1]
│   ├── App.jsx                    <-- MODIFIED: Integrated DB state & search controller
│   ├── index.css
│   └── main.jsx

```

---

## Verification & Gatecheck

Before reporting completion of Phase 3, execute the following terminal commands and interactive browser checks to verify strict compliance with the database architecture:

1. `npm run dev` — Launch the application in Chrome.
2. **Database Verification:** Open Chrome DevTools -> Application tab -> IndexedDB. Click **"🌱 Cargar Datos Mock"** in the developer bar. Confirm `AsistenciaDB` is created with `visitorStore` and `sessionStateStore`, and verify records are populated in `visitorStore` with `recordId` as the primary key (format: `"${visitorId}_${sheetRowIndex}"`). Confirm the `by_visitor` index is present.

3. **Threshold Guardrail Check:** Type `"M"` then `"ME"` into the search bar. Verify no database results render and Zone 3 explicitly displays *"Escriba al menos 3 caracteres..."*.

4. **DOM Rendering Ceiling Check:** Type `"MENDOZA"` (or the common surname seeded in your mock data that exceeds 15 records). Verify the list does not render and the screen explicitly displays the overflow alert: *"⚠️ Demasiados resultados encontrados..."*.

5. **Mutation & Persistence Check:**
* Type a specific full name to narrow results below 15 items. Select a visitor card to enter `CONFIRMED_MATCH`.

* Click **"REGISTRAR ASISTENCIA"**. Verify the button switches to the attended badge.

* Inspect DevTools -> IndexedDB -> `visitorStore`. Confirm the specific record now has `attendanceStatus: true`, a valid ISO-8601 string in `attendanceTimestamp`, and `syncedWithCloud: false`. The record is identified by `recordId`, not `visitorId`.

* Refresh the browser tab. Search for the same visitor again and verify their check-in status persisted across browser reloads.

6. **Multi-record Visitor Check:** Scan or search a DNI that appears on more than one row (same visitor, different adolescents). Verify the app transitions to `MULTI_MATCH` showing both cards, each displaying the respective `hostName`. Selecting one card and registering attendance must only mark that specific `recordId` — the other record for the same DNI must remain unattended.