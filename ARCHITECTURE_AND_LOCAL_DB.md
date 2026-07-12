# Architecture & Local Database Layout (Production Specification)

## 0. Technology Stack
The application is built entirely on a zero-cost, open-source stack optimized for immediate mobile compilation, serverless static deployment, and high-performance offline runtime environments.

### 0.1 Security & Dependency Guardrails
* **Script Execution Freeze:** The local developer environment enforces a strict script blocking baseline (`ignore-scripts=true` configured inside the primary `.npmrc` or `package.json` environment matrix).
* **Deterministic Dependency Pinning:** Because progressive infrastructure layers (like `vite-plugin-pwa` and its Workbox sub-dependencies) introduce nested dependency trees, all package versions are strictly pinned to exact releases in `package.json` to prevent malicious upstream supply-chain modification.

### 0.2 Core Frontend Framework & Build System
* **React 18+ (JavaScript Engine):** Chosen for its predictable declarative state management and highly componentized rendering model, which ensures smooth visual transitions between application execution states.
* **Vite:** The underlying build automation tool and bundler. Chosen over legacy platforms to enable rapid client-side hot reloading, hyper-optimized production minification, and zero-cost environment injection.

### 0.3 User Interface & Visual Styling
* **Tailwind CSS:** A utility-first CSS compilation engine. Enables high-performance, embedded visual styling directly inside React components without creating heavy external design sheets. Ensures accelerated mobile UI element rendering and fluid tactile button transitions.

### 0.4 Local Offline Persistence Layer
* **Native Browser IndexedDB:** The primary browser-bound database engine. Operates as an internal serverless transactional database inside Chrome, entirely eliminating the need for paid cloud databases or backend servers.
* **`idb` (Lightweight Wrapper npm package):** A microscopic utility library that converts standard IndexedDB callback syntax into modern JavaScript Promises/Async-Await structures to keep React code clean and readable.

### 0.5 Local PWA Infrastructure
* **`vite-plugin-pwa`:** A specialized plugin that automatically configures the web application into an installable Progressive Web App (PWA). It manages the automatic generation of the `manifest.json` file and handles the Service Worker configuration required to cache code assets inside the phone's memory.

### 0.6 Identity Federation & Cloud Storage APIs
* **Google Identity Services SDK:** Google's official modern client-side authentication framework. Used to launch the lightweight sign-in popup and manage user access tokens securely on the frontend.
* **Google Picker API:** Google's native secure web file browser engine, executed purely on the client side to let users select files visually.
* **Google REST Client Engine (Fetch API):** Uses Chrome's native Web API to transmit compressed data rows back and forth using the official **Google Sheets API v4** and **Google Drive API v3** endpoints.
* **Target Sheet Metadata Template:** While the container file name mutates every iteration (e.g., `"1ERA VISITA FAMILIAR - JULIO (Respuestas)"`), the internal spreadsheet layout targets a statically locked tab name string: **`'Respuestas de formulario 1'`**.

### 0.7 Barcode Scanning Engine
* **Native Web BarcodeDetector API:** A modern web hardware engine built into Google Chrome on Android. It reads physical barcodes via the camera stream with hardware acceleration, using zero battery power and requiring zero external library dependencies.
* **`@zxing/library` (Local Fallback Bundle):** A completely free, client-side open-source scanning parser compiled directly into the application's local production assets (`dist/assets`) to handle legacy Android versions securely without hitting the internet.

---

## 1. System Topology & Architectural Design
The application is designed using an **Offline-First Client-Server Architecture** running as an isolated serverless Progressive Web App (PWA) inside the client’s mobile Google Chrome engine. 


```

                         [ BOOT SEQUENCE GUARDRAIL ]
                                      │
                    Is there data in local IndexedDB?
                               ├──► YES ──► [BYPASS LOGIN] ──► Direct to Scan/Search Screen
                               └──► NO  ──► Show "Iniciar Sesión con Google" (Requires WiFi)

```

### Key Core Architectural Patterns:
* **The Offline Boot Loop:** Internet access is strictly restricted to the initial file-load phase. If the database already holds event data, the application bypasses all network and cloud identity gates, allowing immediate local operational entry in remote zones.
* **Data Security Clearance Through Purging:** Once data synchronization with the primary cloud file is verified by a secure API transaction, the local device undergoes an absolute storage purge to safeguard privacy and clear the PWA loop for the next cycle.

---

## 2. Technical Component Specifications

### 2.1 The UI Component Layer (React Engine)
* **Reactive State Architecture:** Driven by a visual State Machine containing five configurations: `AUTH_PENDING`, `FILE_PICKER_PENDING`, `READY_EMPTY`, `MULTI_MATCH`, and `CONFIRMED_MATCH`.
* **Asynchronous Feedback Layer (Toast Mechanism):** Success notifications run completely detached from data inputs. While success indicators execute asynchronously in the background, input states clear instantly to handle the next attendee without UI lockouts.

### 2.2 The Scanning & Parsing Engine
* **Local Asset Isolation (No CDN Dependencies):** To guarantee offline initialization, all underlying scanning scripts, camera capture libraries, and WebAssembly (WASM) barcode engines are strictly compiled into the local build bundle (`dist/assets`) and cached directly via the PWA Service Worker. The app cannot make external HTTP calls to initialize the camera stream.
* **Alphanumeric Parsing Matrix:** Calibrated to parse linear Code 39, Code 128, or PDF417 matrix formats. The scanner normalizes both purely numeric values (standard DNI) and alphanumeric strings (e.g., Carnet de Extranjería, Passports).

### 2.3 The Local Database Engine (IndexedDB)
Implemented via **IndexedDB**—a transactional, key-value browser database running inside Chrome's secure sandbox.

#### Object Store 1: `visitorStore`
Represents the local transactional replica of the event spreadsheet matrix.
* **Primary Key (Key Path):** `visitorId` (Alphanumeric string; handles DNI, Carnet de Extranjería, or Passport strings parsed cleanly via the reader stream).

```json
{
  "visitorId": "String (Alphanumeric Primary Key - Case Insensitive Lookups)",
  "visitorName": "String (Normalized Uppercase)",
  "hostId": "String",
  "hostName": "String",
  "visitorAge": "String / Integer",
  "relationship": "String",
  "visitType": "String",
  "location": {
    "dept": "String",
    "prov": "String",
    "dist": "String"
  },
  "attendanceStatus": "Boolean (Default: false)",
  "attendanceTimestamp": "String ISO-8601 (Null default, mutated on check-in)",
  "syncedWithCloud": "Boolean (Default: false)"
}

```

#### Object Store 2: `sessionStateStore`

Maintains operational continuity if the browser app is accidentally closed or backgrounded.

* **Primary Key:** `sessionId` (Static token string: `CURRENT_SESSION`).
* **Stored Properties:** `workingFileId`, `masterFileId`, `authToken`, `tokenAcquisitionTime`.

---

## 3. Search Engine Logic & Mechanics

To safeguard processing memory on low-end mobile devices and eliminate visual layout lag, the search engine enforces execution limits and string-token checks.

### 3.1 Input Character Threshold Guardrail

* **The Rule:** The local search engine remains completely idle until the text input component contains a **minimum of 3 characters** (e.g., `input.length >= 3`).
* **UI State during Threshold:** While the user has typed 1 or 2 characters, no lookup transaction hits IndexedDB. The interface displays a passive helper caption: *"Escriba al menos 3 caracteres..."*

### 3.2 Matching Algorithm & DOM Render Cap

Once the 3-character boundary is cleared, the engine executes a case-insensitive, diacritic-insensitive substring lookup (`String.prototype.includes`) mapping against both `visitorId` and `visitorName`.

* **DOM Rendering Ceiling:** If the query execution returns a bulk set larger than **15 matching records**, the PWA cuts off HTML rendering to prevent browser tab freezing.
* **Fallback UI Intercept:** Instead of displaying the overflow list, the row area hides the records and displays an alert notice: **"⚠️ Demasiados resultados encontrados. Por favor, siga escribiendo para filtrar con mayor precisión."**

---

## 4. Detailed Application Behavior & Lifecycle

### Phase 1: Boot Sequence & Guardrail Optimization

1. The worker launches the application URL inside Google Chrome.
2. **The Local Health Check:** The application automatically inspects `visitorStore`.
* **Scenario A (Data Present):** If an event list is already stored in the browser sandbox, it **completely bypasses all cloud identity gates and internet requirements**. The application transitions instantly to the active lookup interface, showing a persistent offline banner if no connection exists.
* **Scenario B (Database Empty):** If the database is completely unpopulated, it locks onto an initialization screen showing a button labeled: **"Iniciar Sesión con Google"** (requires active Wi-Fi).


3. **Explicit User-Driven Setup Execution:** Once authenticated via single-tap Google federation identity, the user is presented with the file layout dashboard. The worker interacts with the active file browser frame to visually select the target master checklist file. The app copies the file on Drive, downloads the array records, formats them into the schema keys targeting the internal tab named `'Respuestas de formulario 1'`, and hydrates the local `visitorStore`.

### Phase 2: Active Verification & Safety-First Confirmation

1. **The Lookup Action:** The worker reads a barcode via the device camera or types into the text input. The device decodes the string format directly into a clean, standalone alphanumeric string match.
2. **The Results Tabular List Presentation:** If the input meets the 3-character minimum and falls below the 15-row render limit, matching records appear inside a high-density, full-width mobile row list.
* *Row Layout:* Split cleanly into two visual text lines to prevent horizontal clipping.
* Line 1: `visitorName` (Bold, Slate Black).
* Line 2: `visitorId` | *Visita a:* `hostName` (Medium Gray).




3. **The Manual Verification Step:** The social worker compares physical identities with the row list and taps the correct row container. Tapping locks it in as the active selection and expands the row to display its metadata fields.
4. **Conditional Action State (Already Attended Intercept):**
* **State Unattended (`attendanceStatus === false`):** The app displays a massive, emerald-green button labeled **"REGISTRAR ASISTENCIA"**.
* **State Attended (`attendanceStatus === true`):** The button locks down as an unclickable gray/amber element showing **"Asistencia Ya Registrada [Hora: HH:MM]"**. Directly beneath it, a low-profile textual button appears labeled **"Anular Registro" (Undo)**, allowing the worker to clear an accidental check-in event via an explicit tap confirmation.


5. **Instantaneous Execution Input Reset Loop:** The moment the worker taps "REGISTRAR ASISTENCIA":
* *The Write Transaction:* The database updates `attendanceStatus = true` and logs the timestamp.
* *Instant Reset:* The search input field and internal lookup arrays are **wiped instantly**, allowing a subsequent attendee scan or search entry to begin immediately.
* *Asynchronous UI Feedback:* Concurrently, a temporary floating success toast overlay animates into view and plays an audio chirp, auto-fading after `1500ms` without blocking ongoing field work.



### Phase 3: The Reconstruction Synchronization & Cache Purge (Online Exit)

1. The event concludes, and the device connects back to a Wi-Fi terminal. The worker taps the bottom sticky button labeled **"Sincronizar Datos con Drive"**.
2. The application reads `visitorStore` and extracts all records flagged with `attendanceStatus === true` and `syncedWithCloud === false`.
3. The records are structured into a single compressed batch and transmitted to the Google Sheets API via a **`spreadsheets.values.batchUpdate` call** targeting the isolated Working Copy file.
4. **Immediate Post-Sync Cache Purge:** The exact millisecond the cloud endpoint responds with an HTTP `200 OK` validation payload, the application transitions into an automated data destruction sequence:
* The app executes an absolute local `clear()` command across both `visitorStore` and `sessionStateStore` within IndexedDB.
* This immediate cleanup guarantees zero residual local retention of sensitive field participant details.


5. **Automated Loop Reset:** Because the local browser database has been completely wiped, the application's underlying boot guardrail health check will immediately read the state as an empty instance upon the next execution. This automatically forces the PWA to route back cleanly to Phase 1 (Prompting the single-tap Google sign-in and subsequent new monthly file picker selection).
