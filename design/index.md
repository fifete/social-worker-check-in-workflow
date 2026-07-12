# Master Architectural Blueprint & Core Specifications (MVP)

## 1. Project Overview & Offline-First Philosophy
This application is an offline-first Progressive Web App (PWA) designed to run inside Google Chrome on Android[cite: 1, 2]. Its core purpose is to digitize and streamline high-friction manual check-in workflows for social workers during field visitor events[cite: 2].

The architecture relies on an **Offline Boot Loop**: 
* When the application launches, it checks native browser storage (`IndexedDB`)[cite: 1].
* **Data Present:** If an event list is already populated locally, the app completely bypasses all network requirements and Google identity gates, routing the user directly to the active lookup interface[cite: 1].
* **Data Empty:** If the local database is empty, the app locks onto an initialization screen prompting Google authentication (which requires an active Wi-Fi connection)[cite: 1].

---

## 2. Technology Stack & Security Guardrails

### 2.1 Core Stack
* **Frontend Engine:** React 18+ bundled via Vite[cite: 1].
* **Visual Styling:** Tailwind CSS (utility-first compilation for accelerated mobile UI rendering)[cite: 1].
* **Local Persistence:** Native browser IndexedDB managed via the lightweight `idb` wrapper package[cite: 1].
* **PWA Infrastructure:** `vite-plugin-pwa` for automated `manifest.json` generation and Service Worker asset caching[cite: 1].
* **Cloud & Identity APIs:** Google Identity Services SDK (client-side authentication), Google Picker API (visual file selection), and Chrome's native Fetch API communicating with Google Sheets API v4 and Google Drive API v3[cite: 1].
* **Scanning Engine:** Native Web BarcodeDetector API (hardware-accelerated via Android Chrome camera stream) with `@zxing/library` compiled into local build assets (`dist/assets`) as an offline legacy fallback[cite: 1].

### 2.2 Strict Security & Environment Guardrails
* **Script Execution Freeze:** The local development and build environment must enforce `ignore-scripts=true` inside `.npmrc` or the `package.json` execution matrix[cite: 1].
* **Deterministic Dependency Pinning:** All package versions in `package.json` must be pinned to exact releases (no carets `^` or tildes `~`) to prevent upstream supply-chain modification across nested trees like Workbox[cite: 1].

---

## 3. UI/UX Global Design Constraints
To support high-stress field pacing and volatile lighting conditions, the interface must strictly adhere to the following accessible, high-contrast visual rules[cite: 2]:

* **Color Palette:**
  * **Primary Action / Success:** Emerald Green (`#059669`)[cite: 2].
  * **Google Authentication:** Corporate Blue (`#2563EB`)[cite: 2].
  * **Backgrounds / Surfaces:** Pure White (`#FFFFFF`) and Light Gray (`#F3F4F6`) to minimize glare[cite: 2].
  * **Typography / Text:** Slate Black (`#0F172A`) for maximum contrast and readability[cite: 2].
  * **System Warnings / Offline Status:** Amber Orange (`#D97706`)[cite: 2].
* **Typography:** System sans-serif bold fonts scaling between `16px` (body metadata) and `24px` (critical names and actions)[cite: 2].
* **Touch Targets:** Interactive buttons must maintain a minimum physical dimension of `56px x 56px` with `12px` of structural safety padding to prevent accidental mis-clicks[cite: 2].

---

## 4. Single-Screen Layout & Reactive State Machine
The application is constrained to a single, non-scrolling mobile viewport template partitioned into three fixed semantic zones[cite: 2]:

```text
+-------------------------------------------------------+
|  [Header] App Title & Status Indicator (WiFi/Offline) |
+-------------------------------------------------------+
|  [Zone 1: Scanner Viewport] (Top 30% Fixed Height)    |
|  - Live Camera Stream Box / Google Auth Initial State |
+-------------------------------------------------------+
|  [Zone 2: Search Input Field] (Center Sticky Row)     |
|  - [Icon] [ Text Input Field ] [Clear Button (X)]     |
+-------------------------------------------------------+
|  [Zone 3: Contextual Action Area] (Bottom 55% Height) |
|  - Dynamic UI rendering based on active State Machine |
+-------------------------------------------------------+
```

### 4.1 The Reactive State Machine

The UI is driven by five core configurations that govern what renders inside the layout zones:

1. **`AUTH_PENDING` (UI State 0):** App detects no valid OAuth token. Displays a centered block in Zone 3 with the `#2563EB` button labeled **"CONECTAR CON GOOGLE"**.


2. **`FILE_PICKER_PENDING` (UI State 0 - Step 2):** Activated after authentication. Displays the button labeled **"SELECCIONAR EXCEL DE DRIVE"** to open Google Picker.


3. **`READY_EMPTY` (UI State A):** Active check-in default state. Zones 1 and 2 are active. Zone 3 displays helper text: *"Escanee un código de barras DNI o escriba en el buscador para comenzar."* alongside a sticky bottom button: **"Sincronizar Datos con Drive"**.


4. **`MULTI_MATCH` (UI State B):** Triggered when text or scan search returns multiple valid records. Zone 3 renders a vertical scrollable list of mini-cards displaying `visitorName` over `visitorId`.


5. **`CONFIRMED_MATCH` (UI State C):** Definitive single match selection. Zone 3 expands to show full visitor hierarchy (Name, DNI, Relationship, Age, and highlighted Host Name).


* *Unattended State:* Displays a solid Emerald Green button labeled **"REGISTRAR ASISTENCIA"**.


* *Attended State:* Displays an unclickable gray badge labeled **"Asistencia Ya Registrada [Hora: HH:MM]"** with a low-profile textual button below labeled **"Anular Registro"**.

---

## 5. Local Database & Spreadsheet Schema Mapping

### 5.1 IndexedDB Object Stores

* **`sessionStateStore`:** Maintains operational continuity across browser restarts.


* *Primary Key:* `sessionId` (Static token string: `CURRENT_SESSION`).


* *Properties:* `workingFileId`, `masterFileId`, `authToken`, `tokenAcquisitionTime`.




* **`visitorStore`:** The local transactional replica of the spreadsheet.


* *Primary Key:* `visitorId` — Alphanumeric string; case-insensitive.


* *System Properties:* `attendanceStatus` (Boolean, default `false`), `attendanceTimestamp` (ISO-8601 string, default `null`), `syncedWithCloud` (Boolean, default `false`).



### 5.2 Master Spreadsheet Mapping Schema

The application maps spreadsheet columns to internal store properties using exact string header matches:

| Excel Column Header (Exact Match) | System Mapping Key | Data Type | Functional Role |
| --- | --- | --- | --- |
| `NOAPELLIDOS Y NOMBRES COMPLETOS DEL ADOLESCENTE (MAYÚSCULA)` | `hostName` | String | Contextual Display: Verifies who the visitor is seeing. |
| `DOCUMENTO DE IDENTIDAD DEL ADOLESCENTE` | `hostId` | String / Int | Future Metrics Key. |
| `APELLIDOS Y NOMBRES COMPLETOS DEL VISITANTE (MAYÚSCULA)` | `visitorName` | String | Core Search Fallback: Filtered via text search. |
| `DOCUMENTO DE IDENTIDAD DEL VISITANTE` | `visitorId` | String | Primary Scanner Key: Exact barcode encoded value. |
| `EDAD DEL VISITANTE` | `visitorAge` | Integer | Read-only metadata. |
| `PARENTESCO CON EL ADOLESCENTE` | `relationship` | String | Read-only metadata. |
| `TIPO DE VISITA` | `visitType` | String | Read-only metadata. |
| `DEPARTAMENTO DE RESIDENCIA DEL VISITANTE` | `visitorDept` / `location.dept` | String | Read-only metadata. |
| `PROVINCIA DE RESIDENCIA DEL VISITANTE` | `visitorProv` / `location.prov` | String | Read-only metadata. |
| `DISTRITO DE RESIDENCIA DEL VISITANTE` | `visitorDist` / `location.dist` | String | Read-only metadata. |
* **Attendance Modification Column:** The app targets or appends a column at the end of the sheet with the header `ASISTENCIA` (Boolean `TRUE`/`FALSE`, default `FALSE`).



---

## 6. Critical System Guardrails & Execution Rules

1. **Search Input Character Threshold:** The local search engine must remain completely idle until the text input field contains more than 3 characters. While character count is between 1 and 2, display helper text: *"Escriba al menos 3 caracteres..."*.


2. **DOM Rendering Ceiling:** If a search query returns more than **15 matching records**, the UI must abort rendering the list to prevent DOM lag. Instead, hide the list and render an alert notice: **"⚠️ Demasiados resultados encontrados. Por favor, siga escribiendo para filtrar con mayor precisión."**.


3. **Drive Working Copy Isolation:** Upon selecting a master file via Google Picker, the application must automatically duplicate it into a hidden working copy with the suffix `_ASISTENCIA` to prevent multi-user data locking.


4. **Hardcoded Tab Target:** Internal spreadsheet queries must target the statically locked tab name string: **`'Respuestas de formulario 1'`**.


5. **GIS Token Expiration Handling:** Google client-side access tokens expire strictly after 1 hour. If the user initiates **"Sincronizar Datos con Drive"** with an expired token, the app must intercept the call, display an alert (*"Sesión expirada. Volviendo a conectar..."*), and launch the OAuth prompt before pushing data.


6. **Post-Sync Absolute Cache Purge:** The exact millisecond the cloud endpoint responds with an HTTP `200 OK` validation payload following a `spreadsheets.values.batchUpdate` call, the application must execute an absolute `clear()` command across both `visitorStore` and `sessionStateStore` in IndexedDB to safeguard participant privacy and reset the loop.

---

## 7. Worktree
``` txt
root
│   ├── .npmrc                           # Script execution freeze configuration
│   ├── package.json                     # Deterministic dependency pinning
│   └── README.md                        # High-level project entry point
│
├── design
│   ├── index.md                         # Master plan layout, state machine overview, and architectural rules
│   ├── phase1_env_setup.md              # Instructions for environment baseline, pinning, and Tailwind config
│   ├── phase2_ui_layout.md              # Blueprint for the single-screen sticky layout and visual states
│   ├── phase3_local_db.md               # Guide for IndexedDB initialization and search engine guardrails
│   ├── phase4_scanner.md                # Directions for Web BarcodeDetector API and legacy fallback setup
│   ├── phase5_google_auth.md            # Plan for Google Identity Services SDK and credential loading
│   └── phase6_drive_sync.md             # Data lifecycle mapping, batch upload, and post-sync cache purge
│
└── src                                  # Application source code (to be populated phase by phase)
    ├── assets/                          # Local directory for stored assets like the offline scanning bundle
    ├── components/                      # Modular UI components matching the layout zones
    ├── db/                              # Database layer logic for IndexedDB
    └── services/                        # Service wrappers for Google API interactions
```