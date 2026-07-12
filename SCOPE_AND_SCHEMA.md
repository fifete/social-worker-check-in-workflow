# Scope Freeze & Schema Mapping (MVP)

## 1. Project Overview
The objective of this project is to digitize a high-friction manual check-in workflow for social workers during visitor events. The solution is an offline-first Progressive Web App (PWA) running in Google Chrome on Android. The app will utilize barcode scanning via the device's camera or a responsive text-search fallback to verify identities against a live master spreadsheet hosted on Google Drive. 

---

## 2. MVP Scope Boundaries

### In-Scope (First Release)
* **Google Drive Picker Integration:** User can securely browse and select the event spreadsheet from Google Drive.
* **Automated Isolated Duplication:** The system automatically creates a hidden working copy (with the sufix `_ASISTENCIA`) of the selected file on Drive to prevent data locking and row-shifting anomalies.
* **Offline-First Synchronization:** Downloads the working copy dataset to the local browser sandbox (`IndexedDB`), allowing full functionality without an active network connection during the event.
* **Hardware-Accelerated Scanning:** Uses the mobile browser's camera capabilities to instantly read DNI barcodes.
* **Optimized Search Fallback:** A unified real-time text input filtering by Visitor Name or Visitor DNI to handle damaged or unreadable physical documents.
* **End-of-Shift Batch Export:** Compresses all local check-in updates and pushes them back to the Drive working copy in a single API call upon network restoration.

### Out-of-Scope (Future Phases)
* Multi-device concurrent synchronization (Single-device workflow only).
* Live automated creation of non-registered walk-in rows.
* Historical cross-event metrics dashboard (To be handled downstream via centralized analytics).
* The Hardcoded Google Sheet Tab Vulnerability: The implementation should first fetch the spreadsheet metadata, extract the title of the first sheet index (sheets[0].properties.title), and dynamically use that string for read/write queries instead of hardcoding 'Respuestas de formulario 1'
* **The "Anular Registro" (Undo) vs. Cache Purge Collision**: The Gap: The spec does not restrict when synchronization can happen. If a social worker gets nervous mid-event, connects to Wi-Fi, and taps "Sincronizar Datos con Drive" halfway through their shift, the local database will completely wipe all records. They will be dumped back to Phase 1 (Google Login / File Picker) and lose the ability to view or undo any attendees processed prior to that mid-shift sync.
* **Modern Browser Cookie Blocking on GIS Token Expiration**: Remove the expectation of a "silent background refresh" from the UX requirements. Ensure the UI explicitly prepares the social worker for an interactive modal pop-up: "Su sesión ha expirado.
* **Unstable Network Payload Chunking**: If an event processes hundreds of attendees, sending a single massive payload over a weak or fluctuating cellular connection at the end of the day carries a high risk of packet drop or API timeout.

---

## 3. Spreadsheet Schema & Local Mapping

The system relies on an immutable master spreadsheet template. The application will map data fields using the strict column headers detailed below.

### Attendance Modification Column
The application will look for or append an additional column at the absolute end of the dataset to store the attendance verification state:
* **Column Header:** `ASISTENCIA`
* **Data Type:** Boolean (`TRUE` / `FALSE`)
* **Default State:** `FALSE`

### Master Data Schema Table

| Excel Column Header (Exact String Match) | System Mapping Key | Data Type | UI/Architectural Function |
| :--- | :--- | :--- | :--- |
| `NoAPELLIDOS Y NOMBRES COMPLETOS DEL ADOLESCENTE (MAYÚSCULA)` | `hostName` | String | Contextual Display: Shown on screen to verify who the visitor is coming to see. |
| `DOCUMENTO DE IDENTIDAD DEL ADOLESCENTE` | `hostId` | String / Int | Future Metrics Key: Serves as the unique ID linking family members to a single host. |
| `APELLIDOS Y NOMBRES COMPLETOS DEL VISITANTE (MAYÚSCULA)` | `visitorName` | String | **Core Search Fallback:** Used by the local text filter if the barcode scanner fails. |
| `DOCUMENTO DE IDENTIDAD DEL VISITANTE` | `visitorId` | String | **Primary Scanner Key:** The exact value encoded within the DNI barcode. Used for structural updates. |
| `EDAD DEL VISITANTE` | `visitorAge` | Integer | Metadata: Read-only storage. |
| `PARENTESCO CON EL ADOLESCENTE` | `relationship` | String | Metadata: Read-only storage. |
| `TIPO DE VISITA` | `visitType` | String | Metadata: Read-only storage. |
| `DEPARTAMENTO DE RESIDENCIA DEL VISITANTE` | `visitorDept` | String | Metadata: Read-only storage. |
| `PROVINCIA DE RESIDENCIA DEL VISITANTE` | `visitorProv` | String | Metadata: Read-only storage. |
| `DISTRITO DE RESIDENCIA DEL VISITANTE` | `visitorDist` | String | Metadata: Read-only storage. |

---

Yes, we absolutely must account for token expiration. Google access tokens issued to client-side applications (like our PWA) strictly expire after **1 hour**.

Because your architecture is **offline-first**, this expiration will **not** interrupt her during the event. Once she loads the data into the local cache (IndexedDB), she can scan barcodes for 4 or 5 hours completely uninterrupted, even if the token expires mid-event.

However, the token *will* be expired when she tries to upload the data at the end of the day. The app must handle this gracefully: when she taps "Sincronizar", the app should check the token, and if it’s expired, pop up a quick Google prompt to refresh her session before pushing the batch update.

Here is the revised `UI/UX Mapping Specifications` section, updated to include the Google connection state and the re-login flow.

---

## 4. UI/UX Mapping Specifications

### 4.1 Visual Style & Theme Constraints

To accommodate volatile outdoor/indoor lighting and high-stress pacing, the application enforces an accessible, high-contrast UI optimized for mobile viewport sizes (Android Chrome sandbox).

* **Color Palette:**
* **Primary Action / Success:** Emerald Green (`#059669`) — High visibility for positive actions.
* **Google Authentication:** Corporate Blue (`#2563EB`) — Standardized for trust and recognition.
* **Background / Surfaces:** Pure White (`#FFFFFF`) and Light Gray (`#F3F4F6`) to minimize screen glare.
* **Typography / Text:** Slate Black (`#0F172A`) for absolute readability.
* **System Warnings / Offline State:** Amber Orange (`#D97706`).


* **Typography:** System sans-serif bold fonts. Component text sizes must scale between `16px` (body metadata) and `24px` (critical names/actions) to avoid eye strain.
* **Touch Targets:** Every button must maintain a minimum physical dimension of `56px x 56px` with a `12px` structural safety padding to prevent accidental mis-clicks during rapid physical hand-offs.

---

### 4.2 Layout Structure (Single-Screen Sticky Dashboard)

The interface is constrained to a single, non-scrolling mobile viewport template partitioned into three fixed semantic zones.

```
+-------------------------------------------------------+
|  [Header] App Title & Status Indicator (WiFi/Offline) |
+-------------------------------------------------------+
|  [Zone 1: Scanner Viewport] (Top 30% Fixed Height)   |
|  - Live Camera Stream Box / Google Auth Initial State |
+-------------------------------------------------------+
|  [Zone 2: Search Input Field] (Center Sticky Row)     |
|  - [Icon] [ Text Input Field ] [Clear Button (X)]     |
+-------------------------------------------------------+
|  [Zone 3: Contextual Action Area] (Bottom 55% Height)  |
|  - State 0: Google Authentication & File Selection    |
|  - State A: Empty / Prompt Screen                     |
|  - State B: Multi-Match Card List                     |
|  - State C: Confirmed Attendee Card + Massive Button  |
+-------------------------------------------------------+

```

---

### 4.3 Element & Component Technical Specifications

#### 4.3.1 Header Component

* **Main Title Element:** Text label aligned left: **"Control de Asistencia"** (Font: Bold, 20px, Slate Black).
* **Status Indicator Badge:** A dynamic badge floating on the upper-right corner.
* *State Connected:* Green circle icon + text **"Conectado"**.
* *State Disconnected:* Orange circle icon + text **"Modo Local (Fuera de línea)"**.



#### 4.3.2 Zone 1: Barcode Scanner Viewport

* **Component Type:** Inline hardware-linked canvas stream element.
* **Style:** `Aspect-ratio 4:3` container with a bounding green reticle box overlay.
* **Behavior:** Disabled/hidden until State 0 (Authentication & File Selection) is successfully completed. Once active, it remains on by default.

#### 4.3.3 Zone 2: Unified Search Fallback Field

* **Component Type:** Form Input Element (`type="text"`, `inputmode="text"`).
* **Label/Placeholder String:** **"Buscar por DNI o Apellidos..."**
* **Behavior:** Hidden during State 0. Auto-filters the local database on every typed character once active.

#### 4.3.4 Zone 3: Contextual Action Area (Dynamic States)

* **State 0: Authentication & File Selection (Initial App Launch)**
* *Condition:* App detects no active or valid Google OAuth token.
* *Layout:* Centered vertical block filling Zones 1, 2, and 3.
* *Button 1 (Google Login):* Large block button with a Google icon.
* **Label:** **"CONECTAR CON GOOGLE"**
* **Style:** Brand Blue background (`#2563EB`), white bold text.


* *Button 2 (File Picker - Disabled by default):* Becomes active only *after* Button 1 is pressed and token is stored.
* **Label:** **"SELECCIONAR EXCEL DE DRIVE"**
* **Style:** Light gray background outline until activated, then switches to solid Slate Black.


* *Transition:* Once a spreadsheet is picked, the app clones the file, hydrates `IndexedDB`, hides State 0 permanently, and displays Zone 1 (Scanner) and Zone 2 (Search).


* **State A: Empty Prompt** (Active check-in phase default)
* *Text Display:* Centered gray text: **"Escanee un código de barras DNI o escriba en el buscador para comenzar."**
* *Footer Sync Button:* A persistent, low-profile button stuck to the absolute bottom of the screen reading **"Sincronizar Datos con Drive"**.
* *Token Expiration Behavior:* If the user clicks this after the 1-hour expiration limit, the app intercepts the call, flashes an alert (**"Sesión expirada. Volviendo a conectar..."**), launches a silent background OAuth refresh or pop-up, and immediately proceeds to execute the upload batch once authorized.


* **State B: Multi-Match Card List** (Triggered when text search yields multiple rows)
* *Layout:* Vertical scrollable list of mini-cards. Displays **Visitor Name** over **Visitor DNI**. Tapping an item opens State C.


* **State C: Confirmed Target Card & Master Action** (Definitive match state)
* *Data Hierarchy Layout (Top to Bottom):*
1. **Field Section Title:** **"DATOS DEL VISITANTE"** (12px, Gray).
2. **Primary Value:** `visitorName` value (22px, Extra Bold, Slate Black).
3. **Secondary Value:** **"DNI: "** + `visitorId` value (16px).
4. **Contextual Metadata Row:** **"Parentesco: "** + `relationship` | **"Edad: "** + `visitorAge`.
5. **Host Focus Row:** **"Va a visitar a: "** + `hostName` value (16px, background highlight box).


* *The Master Check-In Button:*
* **Text Label:** **"REGISTRAR ASISTENCIA"**
* **Style:** Solid Emerald Green background, sharp white text, uppercase bold typeface.
* **Success Feedback State:** Turns into a non-clickable light-gray badge reading **"✓ ASISTENCIA REGISTRADA"**, triggers a 400Hz audio beep, clears the viewport state after 1.5 seconds, and resets back to State A.