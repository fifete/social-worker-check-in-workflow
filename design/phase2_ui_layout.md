# Phase 2: Visual Sandbox & Single-Screen Reactive Layout

## Context & Prerequisites

* **Mandatory Reference:** Before executing these tasks, read `design/index.md` to understand the global architectural constraints, color palette, touch-target sizing rules, and the 5-state visual State Machine.
* **Objective:** Construct the physical single-screen UI wrapper, partition the viewport into three fixed semantic zones, build modular React components for all layout zones, and implement a mock visual State Machine to test layout transitions without live data.
* **Execution Boundary:** Do **NOT** implement native Web BarcodeDetector APIs, IndexedDB database calls, Google Identity OAuth scripts, or real Drive synchronization logic during this phase. Use mock static data and developer toggle controls to test state transitions.

---

## Task 1: Component Layout Architecture & Header Setup

You must structure the application into a strict, non-scrolling mobile viewport partitioned into three fixed semantic zones, topped by a responsive header.

1. Create a `src/components/` directory to house modular UI elements.
2. Create `src/components/Header.jsx` (or `.tsx`). It must render:
* A left-aligned title: **"Control de Asistencia"** styled with `font-bold text-xl text-brand-slate`.
* An upper-right dynamic badge indicating network status. For this visual sandbox, accept a `isOffline` boolean prop:
* *Connected (`false`):* Green indicator circle with text **"Conectado"**.
* *Disconnected (`true`):* Amber indicator circle (`bg-brand-amber`) with text **"Modo Local (Fuera de línea)"**.




3. Open `src/App.jsx`. Configure the root container to enforce viewport lock and prevent horizontal or uncontrolled vertical scrolling:
```jsx
<main className="flex flex-col h-screen w-screen overflow-hidden bg-brand-light text-brand-slate select-none">
  <Header isOffline={false} />
  {/* Zones 1, 2, and 3 will be injected here */}
</main>

```



---

## Task 2: Build Zone 1 (Scanner Viewport) & Zone 2 (Search Bar)

Zone 1 and Zone 2 serve as the primary lookup interfaces once authentication is complete. They must dynamically hide or disable during State 0 (`AUTH_PENDING` / `FILE_PICKER_PENDING`).

1. Create `src/components/Zone1Scanner.jsx`:
* Set a fixed height container representing the top 30% of the active workspace (`h-[30%] min-h-[180px] w-full bg-black relative flex items-center justify-center`).
* Render a mock camera reticle overlay: an aspect-ratio 4:3 centered bounding box with emerald green border corners (`border-2 border-brand-emerald`).
* Add a visual indicator text inside the box: *"[Camara Activa - Retícula de Escaneo]"* (white text, low opacity).
* Accept an `isActive` boolean prop. If `isActive === false`, render `null` or a hidden state.


2. Create `src/components/Zone2Search.jsx`:
* Set a sticky center row container (`w-full px-4 py-3 bg-white shadow-sm flex items-center gap-2`).
* Render a text input field with `inputmode="text"` and placeholder: **"Buscar por DNI o Apellidos..."**
* Ensure the input element has a minimum height of `48px` for tactile accessibility and bold slate text (`text-lg font-semibold text-brand-slate`).
* Include a clear button (**"X"**) on the right edge that resets the input field.
* Accept an `isDisabled` boolean prop. When true, disable the input and apply a dimmed visual state (`opacity-50 cursor-not-allowed`).



---

## Task 3: Implement Visual State Machine Engine (Zone 3)

Zone 3 (bottom 55% height) dynamically shifts based on the operational state of the application. Create a unified controller to switch between mock representations of all five visual states.

1. Create `src/components/Zone3Actions.jsx`. It must accept an `activeState` prop matching one of the following exact string literals:
* `'AUTH_PENDING'`
* `'FILE_PICKER_PENDING'`
* `'READY_EMPTY'`
* `'MULTI_MATCH'`
* `'CONFIRMED_MATCH'`


2. Implement the visual rendering blocks inside `Zone3Actions.jsx` for each state:
* **`AUTH_PENDING`:** Center vertically and horizontally. Render a block button with blue background (`bg-brand-blue font-bold text-white uppercase tracking-wide`). Label: **"CONECTAR CON GOOGLE"**.
* **`FILE_PICKER_PENDING`:** Center vertically and horizontally. Render a block button with solid slate background (`bg-brand-slate font-bold text-white uppercase tracking-wide`). Label: **"SELECCIONAR EXCEL DE DRIVE"**.
* **`READY_EMPTY`:** Render centered helper text: *"Escanee un código de barras DNI o escriba en el buscador para comenzar."* At the absolute bottom of the zone, render a sticky, low-profile sync button labeled **"Sincronizar Datos con Drive"** (`bg-gray-200 text-brand-slate font-semibold py-3 w-full`).
* **`MULTI_MATCH`:** Render a vertical, scrollable list (`overflow-y-auto max-h-full p-4 space-y-2`) of 3 mock mini-cards. Each card must display a bold `visitorName` on line 1 and `visitorId` on line 2.
* **`CONFIRMED_MATCH`:** Render a detailed visitor card using mock data (`visitorName: "CARLOS MENDOZA"`, `visitorId: "71234568"`, `hostName: "MARIA MENDOZA"`, `relationship: "PADRE"`, `visitorAge: 45`).
* *Hierarchy Layout:* Section title **"DATOS DEL VISITANTE"** -> `visitorName` (22px Extra Bold Slate Black) -> **"DNI: "** + `visitorId` -> Metadata row -> Highlight box: **"Va a visitar a: "** + `hostName`.
* *Master Action Button:* Provide an internal toggle state to switch between **Unattended** and **Attended**.
* *Unattended:* Solid Emerald Green button (`bg-brand-emerald text-white font-extrabold uppercase`). Label: **"REGISTRAR ASISTENCIA"**.
* *Attended:* Unclickable gray badge reading **"✓ ASISTENCIA REGISTRADA [Hora: 11:15]"** with a low-profile text button beneath labeled **"Anular Registro"**.







---

## Task 4: Enforce Touch Target Sizing & Accessibility Guardrails

You must verify that all interactive components generated in Tasks 1 through 3 strictly obey the mobile ergonomics specifications defined in `design/index.md`.

1. Inspect all `<button>`, clickable mini-cards, and interactive icons across all components.
2. Enforce the **56px x 56px Minimum Touch Target Rule**: Every clickable element must explicitly include `min-h-[56px]` and `min-w-[56px]` (or equivalent `h-14 w-14` Tailwind utility classes) with adequate padding (`p-3` or `p-4`).
3. Ensure no text element drops below `14px` (`text-sm`), with primary labels and names scaling between `16px` (`text-base`) and `24px` (`text-2xl font-black`).

---

## Task 5: Assemble Layout & Build Sandbox State Controls

Wire all zones into `src/App.jsx` and build a temporary developer control bar to allow instant visual testing of all states during local development.

1. Create a developer-only component `src/components/DevStateControls.jsx` that renders a fixed, semi-transparent top or bottom bar with 5 small buttons to toggle the current state string (`AUTH_PENDING`, `FILE_PICKER_PENDING`, `READY_EMPTY`, `MULTI_MATCH`, `CONFIRMED_MATCH`), plus a toggle for `isOffline`.
2. Open `src/App.jsx` and integrate the state management:
```jsx
import { useState } from 'react';
import Header from './components/Header';
import Zone1Scanner from './components/Zone1Scanner';
import Zone2Search from './components/Zone2Search';
import Zone3Actions from './components/Zone3Actions';
import DevStateControls from './components/DevStateControls';

export default function App() {
  const [appState, setAppState] = useState('READY_EMPTY');
  const [isOffline, setIsOffline] = useState(false);

  const isAuthPhase = appState === 'AUTH_PENDING' || appState === 'FILE_PICKER_PENDING';

  return (
    <main className="flex flex-col h-screen w-screen overflow-hidden bg-brand-light text-brand-slate select-none relative">
      <Header isOffline={isOffline} />

      {/* Zone 1: Scanner Viewport (Hidden during Auth Phase) */}
      {!isAuthPhase && <Zone1Scanner isActive={true} />}

      {/* Zone 2: Sticky Search Input (Disabled during Auth Phase) */}
      <Zone2Search isDisabled={isAuthPhase} />

      {/* Zone 3: Dynamic Action Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <Zone3Actions activeState={appState} />
      </div>

      {/* DEV ONLY: Visual State Sandbox Controller */}
      <DevStateControls 
        currentState={appState} 
        onStateChange={setAppState}
        isOffline={isOffline}
        onOfflineToggle={() => setIsOffline(!isOffline)}
      />
    </main>
  );
}

```



### 5.1 Expected Workspace State (End of Phase 2)

```text
root/
├── src/
│   ├── components/
│   │   ├── DevStateControls.jsx   <-- NEW: Sandbox state toggles
│   │   ├── Header.jsx             <-- NEW: Top bar with offline badge
│   │   ├── Zone1Scanner.jsx       <-- NEW: 4:3 camera reticle placeholder
│   │   ├── Zone2Search.jsx        <-- NEW: Sticky 48px+ text input field
│   │   └── Zone3Actions.jsx       <-- NEW: 5-state visual render engine
│   ├── App.jsx                    <-- MODIFIED: Assembled 3-zone sticky layout
│   ├── index.css
│   └── main.jsx

```

---

## Verification & Gatecheck

Before reporting completion of Phase 2, execute the following terminal commands and browser checks to verify strict compliance with the UI architecture:

1. `npm run dev` — Launch the local Vite development server.
2. Open the browser viewport in **Mobile Responsive Mode** (e.g., 360px x 800px viewport).
3. **Visual State Gatecheck:** Use the `DevStateControls` bar to cycle through all 5 states:
* Verify `AUTH_PENDING` and `FILE_PICKER_PENDING` completely hide Zone 1 and disable Zone 2.
* Verify `READY_EMPTY`, `MULTI_MATCH`, and `CONFIRMED_MATCH` display Zone 1 (reticle) and active Zone 2 (search input) cleanly without causing vertical window scrolling.
* In `CONFIRMED_MATCH`, click **"REGISTRAR ASISTENCIA"** and verify it switches smoothly to the gray **"Asistencia Ya Registrada"** badge and displays the **"Anular Registro"** button.


4. `npm run build` — Confirm the modular components compile cleanly into production bundles without React syntax or Tailwind class compilation errors.