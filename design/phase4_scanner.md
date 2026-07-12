# Phase 4: Hardware-Accelerated Scanning & Parsing

## Context & Prerequisites

* **Mandatory Reference:** Before executing these tasks, read `design/index.md` to understand the global architectural constraints, alphanumeric parsing matrix, and offline asset isolation guardrails.


* **Objective:** Replace the mock scanner placeholder in Zone 1 with a live camera stream integrated with Chrome's native Web `BarcodeDetector` API. Integrate `@zxing/library` as a locally bundled offline fallback for legacy Android devices, build alphanumeric normalization rules to extract clean identifier strings from scanned barcodes, and wire the decoded output directly into the active search and selection loop.


* **Execution Boundary:** Do **NOT** implement Google Identity OAuth scripts (Phase 5), Google Drive spreadsheet downloads (Phase 6), or cloud batch synchronization logic during this phase. All scanning tests must evaluate against local `IndexedDB` records populated via the mock seed utility.



---

## Task 1: Install Local ZXing Fallback Engine (`package.json`)

To guarantee offline initialization in remote zones without relying on external Content Delivery Networks (CDNs), the fallback barcode reader library must be compiled directly into the application's local production bundle.

1. Execute the following installation command in the terminal:
```bash
npm install @zxing/library

```


2. **Deterministic Pinning Requirement:** Open `package.json` and locate `@zxing/library` under `dependencies`. Strip out any semantic versioning prefixes (remove all carets `^` and tildes `~`) so the package locks to an exact release version.



---

## Task 2: Build the Barcode Parsing & Normalization Service (`src/services/scannerService.js`)

You must implement a dedicated service to handle hardware stream access, feature detection, barcode decoding, and string normalization.

1. Create `src/services/scannerService.js` (or `.ts`).
2. Implement `normalizeBarcodeString(rawValue)`. This function must clean raw scanned string outputs from physical identity documents:


* Strip all leading/trailing whitespace and control characters.
* Extract purely numeric strings (standard 8-digit Peruvian DNI).


* Parse alphanumeric strings (e.g., Carnets de Extranjería, Passports) by stripping special formatting symbols and converting alphanumeric characters to uppercase.




3. Implement `createScannerInstance(videoElement, onDecode, onError)`. This initializer must execute a progressive hardware feature detection check:
* **Primary Engine Check (Native Web API):** Check if `window.BarcodeDetector` is supported by the browser.


* If supported, instantiate `new BarcodeDetector({ formats: ['code_39', 'code_128', 'pdf417'] })` to match linear and matrix formats.


* Attach a requestAnimationFrame loop or timer to repeatedly call `barcodeDetector.detect(videoElement)` on the live camera stream.




* **Secondary Fallback Engine (Local ZXing Bundle):** If `window.BarcodeDetector` is undefined, import and instantiate `BrowserMultiFormatReader` from `'@zxing/library'`.


* Configure the reader to decode linear Code 39, Code 128, and PDF417 matrix formats.


* Bind the reader to `videoElement` using `decodeFromVideoDevice(undefined, videoElement, callback)`.




4. Inside both decoding pathways, pass the raw decoded string through `normalizeBarcodeString(rawValue)` and execute the `onDecode(normalizedId)` callback immediately.



---

## Task 3: Upgrade Zone 1 Component to Live Camera Viewport (`src/components/Zone1Scanner.jsx`)

Replace the static reticle placeholder from Phase 2 with a live hardware camera feed bound to our scanner service.

1. Open `src/components/Zone1Scanner.jsx`.
2. Implement a React `<video>` element with attributes: `autoPlay`, `playsInline`, `muted`, and assign a `ref` (`videoRef`).
3. Maintain the responsive aspect-ratio container (`aspect-4/3 w-full max-h-[30vh] bg-black relative flex items-center justify-center overflow-hidden font-sans`) and overlay the emerald green reticle box (`border-2 border-brand-emerald`) to visually guide document placement.


4. Add component lifecycle management using `useEffect`:
* When `isActive === true`, request camera stream access (`navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`) and bind the stream to `videoRef.current.srcObject`.
* Initialize `createScannerInstance(videoRef.current, onScanSuccess, onScanError)`.
* **Cleanup Guardrail:** On component unmount or when `isActive === false`, explicitly stop all hardware media tracks (`stream.getTracks().forEach(track => track.stop())`) and cancel scanner detection loops to conserve device battery.




5. Add an on-screen error state overlay inside the reticle container if camera permission is denied by the OS or browser: *"⚠️ Acceso a cámara denegado. Use el buscador de texto."*


---

## Task 4: Connect Scanner Stream to Active Search & Check-In Loop

Decoded barcode strings must instantly bridge into the IndexedDB search engine and trigger user verification states.

1. Open `src/App.jsx`.
2. Define a handler function `handleBarcodeScanned(scannedIdentifier)`:
* Execute an immediate primary key lookup using `getVisitorById(scannedIdentifier)` from `src/services/visitorService.js`.


* **Match Found (Exact ID):** Immediately transition the UI State Machine to `'CONFIRMED_MATCH'` and load the retrieved visitor object into active focus in Zone 3.


* **No Exact Match Found:** Populate the Zone 2 search input field (`Zone2Search`) with `scannedIdentifier` and trigger `executeSearch(scannedIdentifier, visitorList)` to check for partial substring matches or display appropriate helper text.




3. Pass `handleBarcodeScanned` as a prop (`onScanSuccess`) into `<Zone1Scanner isActive="{!isAuthPhase}" onScanSuccess="{handleBarcodeScanned}"/>`.
4. Open `src/components/DevStateControls.jsx` and add a manual simulation button:
* **"📷 Simular Escaneo DNI"**: Prompts the developer for a string (or inputs a default ID from `mockData.js`) and invokes `handleBarcodeScanned(simulatedId)` to allow desktop testing without physical barcodes.





---

### 4.1 Expected Workspace State (End of Phase 4)

```text
root/
├── package.json           <-- MODIFIED: @zxing/library strictly pinned
├── src/
│   ├── components/
│   │   ├── DevStateControls.jsx   <-- MODIFIED: Added Barcode Simulation trigger
│   │   ├── Header.jsx
│   │   ├── Zone1Scanner.jsx       <-- MODIFIED: Integrated live HTML5 video stream & reticle
│   │   ├── Zone2Search.jsx
│   │   └── Zone3Actions.jsx
│   ├── db/
│   ├── services/
│   │   ├── scannerService.js      <-- NEW: Native BarcodeDetector + ZXing fallback & normalization
│   │   ├── searchService.js
│   │   └── visitorService.js
│   ├── App.jsx                    <-- MODIFIED: Wired scanner decode events to DB lookup & State Machine
│   ├── index.css
│   └── main.jsx

```

---

## Verification & Gatecheck

Before reporting completion of Phase 4, execute the following terminal commands and hardware/browser checks to verify strict compliance with the scanning architecture:

1. `npm run dev` — Launch the application. Ensure mock data is loaded into IndexedDB (`AsistenciaDB`) via the developer bar trigger.


2. **Simulation Check (Desktop/No Camera):** Click **"📷 Simular Escaneo DNI"** in `DevStateControls`. Input a valid primary key `visitorId` from your seeded mock dataset. Verify the app transitions instantly to `'CONFIRMED_MATCH'` and renders the correct visitor card in Zone 3.


3. **Hardware Stream Check (Android Chrome / Webcam):**
* Access the local development server from a mobile device or laptop webcam.
* Verify the browser prompts for camera permission and displays the live video stream inside the Zone 1 container with the emerald green reticle.




4. **Physical & Screen Scanning Verification:**
* Generate a test Code 39 or Code 128 barcode representing one of your seeded mock DNI strings using an online barcode generator.


* Point the camera at the generated barcode. Verify the scanner reads the string, strips formatting, performs the IndexedDB lookup, and instantly loads the attendee into `'CONFIRMED_MATCH'` without manual typing.




5. **Offline Asset Verification:**
* In Chrome DevTools, open the **Network** tab and check **"Offline"**.
* Reload the page or re-initialize the scanner. Confirm `@zxing/library` executes cleanly without attempting to fetch external resources over the network.




6. `npm run build` — Confirm the build bundler compiles the ZXing fallback scripts into static local assets (`dist/assets`) without dependency tree errors.