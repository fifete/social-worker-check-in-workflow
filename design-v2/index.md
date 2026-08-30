# design-v2 — Master Index

## Audience
This file is the entry point for an AI agent tasked with **generating the specification documents only (Steps 1–5)**. Read this file first and in full before producing any output.

---

## Execution Mandate
Your task is to produce the files listed in the File Map below — no more, no less. You are writing specifications, not implementation. When you are done, output a completion manifest (see end of this file).

### Output boundary — strictly enforced
- **Allowed outputs:** `.md` files inside `design-v2/` and `design-v2/state-machine.json`
- **Forbidden outputs:** any `.jsx`, `.js`, `.ts`, `.css`, `.html`, or any file inside `src/`. If you find yourself writing component code, JSX, or CSS rules, stop — you are out of scope.
- Step 5 produces story *specs* (markdown descriptions of visual states), not Storybook component code.

### Uncertainty flag protocol
When you cannot assert something with confidence — an API detail not in Verified Knowns, a behavior gap in this index, a design decision with no stated preference — **do not invent to fill the gap**. Instead, insert this marker inline and continue:
```
<!-- NEEDS-REVIEW: [one sentence describing what is unknown and why it matters] -->
```
At the end of your output, collect all `NEEDS-REVIEW` markers into a summary list so the owner can resolve them in one pass.

### Anti-hallucination rules
1. Google API endpoints, parameters, and behaviors not listed in **Verified Knowns** must be marked `NEEDS-REVIEW`, not asserted.
2. Do not read `_archive/` to fill in behavior gaps. The archive reflects the old implementation. If a behavior is not described in this index, it does not exist yet.
3. State names must match the locked vocabulary table exactly. Do not introduce synonyms.
4. Steps 1 & 2 must be produced in the same pass. Do not submit `state-machine.json` without also submitting all four sequence diagram files.

---

## Intent
Rebuild the social-worker check-in PWA from scratch using **documentation-driven development (DDD)**: every behavioral contract, state transition, API surface, and UI rule is fully specified in plain text before any implementation code is written. Code is generated to satisfy the specs, not the other way around.

---

## Main Premise
The existing implementation in `_archive/src/` is a working but hard-to-modify monolith. Behavioral rules are implicit, scattered across components and services, and not independently testable. The refactor extracts every rule into a dedicated, narrow-concern document. Those documents become the authoritative source of truth. Implementation files are downstream artifacts.

**Rule:** if a behavior is not described in `design-v2/`, it does not exist.

---

## Application Lifecycle (Three Phases)

An AI agent reading this for the first time must understand the three distinct operational phases before touching any spec file. The entire application exists to serve Phase 2 — everything else is setup and teardown.

### Phase 1 — Setup (requires internet, runs once per event)
1. App boots → `visitorStore` is empty → auth screen shown
2. Worker authenticates with Google
3. Worker selects the master spreadsheet from Google Drive via Picker
4. App duplicates the master file → `{name}_ASISTENCIA` (the working copy)
5. App reads all rows from the working copy → hydrates `visitorStore` in IndexedDB
6. App transitions to Phase 2

### Phase 2 — Attendance (offline-first, runs for the duration of the event)
**The internet is not required or expected during this phase. All reads and writes go directly to IndexedDB.**

The worker repeats this loop for every visitor arriving at the event:

```
[Scan DNI barcode]  OR  [Type name/ID into search field]
         ↓
   Results list rendered (up to 15 matches)
         ↓
   Worker taps the correct person from the list
         ↓
   Full visitor card shown: name, DNI, relationship, age, who they're visiting
         ↓
   ┌─ Already attended? → Show locked gray badge "Asistencia Ya Registrada [HH:MM]"
   │                       + low-profile "Anular Registro" button beneath it
   │
   └─ Not attended? → Show green "REGISTRAR ASISTENCIA" button
                        ↓ (tap)
                      Write to IndexedDB:
                        attendanceStatus = true
                        attendanceTimestamp = ISO-8601 now
                        syncedWithCloud = false   ← stays false until Phase 3
                        ↓
                      Instant UI reset: clear search, clear selection
                      Async: toast notification + audio chirp (non-blocking)
```

**Key offline-first invariants for Phase 2:**
- No network call is made during attendance recording
- `syncedWithCloud: false` is the pending-sync flag; it accumulates all session records
- The app must remain fully functional with no Wi-Fi for the entire event duration
- "Anular Registro" clears `attendanceStatus` and `attendanceTimestamp`, resets `syncedWithCloud: false`

### Phase 3 — Sync & Reset (requires internet, runs once at end of event)
1. Event ends, device reconnects to Wi-Fi
2. Worker taps **"Sincronizar Datos con Drive"**
3. App checks token validity → re-auth if expired
4. App reads all `visitorStore` records where `attendanceStatus === true AND syncedWithCloud === false`
5. Batch-updates the `ASISTENCIA` column in the working copy spreadsheet via Google Sheets `batchUpdate`
6. On HTTP 200: full `clear()` of both `visitorStore` and `sessionStateStore`
7. App returns to Phase 1 (empty DB → auth screen)

---

## Steps (execute in order)

### Step 0 — Archive existing code
- Already Done ✅ archive at: `C:\repos\Personal\social-worker-check-in-workflow\_archive`
- Rename `src/` → `_archive/src/`
- Do not modify files inside `_archive/`. It exists for reference only.
- Delete `_archive/` only after the rewrite passes manual smoke-testing.

### Steps 1 & 2 — State machine + Sequence diagrams (co-authored in one pass)

> **Dependency warning:** These two steps are tightly coupled. The state machine cannot be finalized without knowing the sequences, and the sequences cannot be written without knowing what states exist. An agent must draft both in the same pass, then reconcile them before output. Do not produce `state-machine.json` without also producing all four sequence diagram files, and vice versa.

#### Step 1 — State machine (`state-machine.json`)
- Define all application states, events, and transitions as an XState v5 config.
- This is the single authoritative source for what states exist and what moves between them.
- No UI, no side effects — pure state topology.

#### Locked state vocabulary
All spec files, components, and services must use these exact strings. No synonyms, no renaming.

**App-level states:**
| State name | Trigger |
|---|---|
| `AUTH_PENDING` | `visitorStore` empty + no valid token |
| `FILE_PICKER_PENDING` | Valid token present, `visitorStore` still empty |
| `READY_EMPTY` | `visitorStore` hydrated, no active search or selection |
| `MULTI_MATCH` | Search returns 2–15 results |
| `CONFIRMED_MATCH` | Single record selected from list or direct barcode hit |
2| `RESET_WARNING` | Worker tapped "Cambiar archivo" with pending unsynced records present |
| `RESETTING` | IDB clear in progress; token fields preserved; transitions to `FILE_PICKER_PENDING` on completion |
| `SYNC_SUCCESS` | Sync complete; full-screen success view shows count of synced records; transitions to `AUTH_PENDING` when worker taps "Continuar" |

**FILE_PICKER_PENDING sub-states:**
| State name | Description |
|---|---|
| `AWAITING_SELECTION` | Picker open or idle; auto-opens Picker if entered via `FILE_REJECTED` |
| `CONFIRMING_SELECTION` | File selected; worker reviews the file name before any Drive operation begins |
| `CHECKING_COLLISION` | Drive search for existing `_ASISTENCIA` copy in progress |
| `COLLISION_PROMPT` | Existing `_ASISTENCIA` found; worker chooses to reuse or replace it |
| `DELETING_ORPHAN` | Deleting orphan `_ASISTENCIA` before re-copying |
| `COPYING_FILE` | Drive copy of master → `_ASISTENCIA` in progress |
| `FETCHING_DATA` | Spreadsheet rows being fetched from working copy |

**Scanner sub-states (nested inside Zone 1):**
| State name | Description |
|---|---|
| `IDLE` | Camera active, no candidate in frame |
| `CANDIDATE_DETECTED` | Barcode candidate detected, hold-progress counting |
| `SCAN_SUCCESS` | Lock confirmed, result dispatched to search |
| `SCAN_ERROR` | Lock failed or ambiguous read |
| `CAMERA_DENIED` | Camera permission refused by user or OS |
| `FALLBACK_ACTIVE` | `BarcodeDetector` unavailable, `@zxing` loaded |

#### Step 2 — Sequence diagrams (`sequence-diagrams/`)
- `boot.md` — app launch → IndexedDB check → bypass login OR show auth screen
- `setup.md` — auth → Google Picker → file copy (_ASISTENCIA) → data fetch → IndexedDB hydration; **must include the `_ASISTENCIA` collision path (see below)**
- `attendance.md` — scan/search → result selection → IndexedDB write → instant reset loop; includes already-attended intercept and undo path
- `sync.md` — sync button → token expiry check → batchUpdate → HTTP 200 → full IndexedDB purge → loop reset
- Each file specifies cross-system ordering and failure recovery at each step.

#### `_ASISTENCIA` collision handling (required failure path in `setup.md`)
If setup is interrupted after the Drive copy succeeds but before IndexedDB hydration completes (power loss, network drop, app killed), the next run will attempt to create a second `_ASISTENCIA` copy from the same master. The app must detect and handle this:
- Before calling the Drive copy endpoint, search Drive for an existing file named `{masterFileName}_ASISTENCIA` owned by the authenticated user.
- **If found:** prompt the worker with two options: **"Usar archivo existente"** (resume with it as `workingFileId`) or **"Crear copia nueva"** (delete the orphan and re-copy).
- **If not found:** proceed with the copy as normal.
- This check must be documented as a named step in `setup.md` and as a guarded transition in `state-machine.json`.

### Step 3 — UI behavior (`ui-behavior/`)

#### Design authority
The implementing agent owns the design system. Apply established mobile UX best practices as the baseline. The owner does not have a predetermined color palette, type scale, or component library — the agent must propose and document a coherent, accessible system in `global.md` before implementing any component.

**Fixed design constraints (non-negotiable, do not derive or alter):**
- **Color mode:** Light mode only. No dark mode, no system-preference switching.
- **Styling implementation:** Tailwind CSS utility classes for layout and spacing. CSS custom properties (`--var`) for all color tokens, so a single variable change propagates everywhere. Tailwind config must reference the CSS variables, not hardcode hex values.

Criteria the design system must satisfy:
- High contrast for outdoor/high-glare conditions (target WCAG AA minimum, AAA preferred)
- Touch targets minimum 56×56px — this is a non-negotiable hard floor
- Optimized for one-handed phone use in portrait orientation
- Stress-readable: bold hierarchy, minimal cognitive load per screen

#### Files
- `global.md` — proposed color palette (with contrast ratios), typography scale, spacing system, touch targets, toast timing, audio feedback. **Agent must justify each choice.**
- `zone2-search.md` — 3-char threshold rule, 15-result DOM cap, diacritic-insensitive matching algorithm
- `zone3-actions.md` — all 5 state machine renders, attended/unattended intercept, undo confirmation flow

#### `zone1-scanner.md` — Scanner (owner-specified behavior)
This zone has the highest user friction and requires the most explicit feedback spec. The following requirements are fixed and override agent discretion:

- **Framing boundary:** A visible rectangular overlay must frame the expected barcode scan area at all times while the camera is active. The boundary must be visually distinct (corner brackets or animated border — not a faint rectangle).
- **Hold indicator:** When a barcode candidate is detected (partial lock), display a countdown or progress arc visible inside the frame that tells the user exactly how long to hold still. The user must never have to guess whether the scanner is working.
- **Feedback states (all required):**
  - `IDLE` — camera active, no candidate detected, frame visible with instructional label
  - `CANDIDATE_DETECTED` — barcode candidate in frame, hold-progress visible, distinct color shift on frame
  - `SCAN_SUCCESS` — full lock achieved, frame flashes green, haptic pulse (if supported), audio chirp, result passed to search
  - `SCAN_ERROR` — lock failed or ambiguous read, frame flashes amber, label prompts retry
  - `CAMERA_DENIED` — camera permission refused, zone replaced with icon + Spanish error message + retry button
  - `FALLBACK_ACTIVE` — BarcodeDetector unavailable, @zxing loaded, small non-intrusive badge indicates fallback mode
- **Transition timing:** `CANDIDATE_DETECTED` → `SCAN_SUCCESS` hold window is **800ms**. Not configurable without updating this spec.
- **No silent failures:** every error path must surface a visible label inside Zone 1. The scanner must never appear frozen or blank without explanation.

### Step 4 — API contracts (`api-contracts/`)
- `authService.md` — token acquisition, 1-hour expiry detection, re-auth interception before sync
- `driveService.md` — file copy (master → _ASISTENCIA), data fetch from working copy, batchUpdate contract
- `visitorService.md` — IndexedDB read/write contracts, schema, default values
- `syncService.md` — orchestration across driveService + visitorService, error mapping, purge trigger

### Step 5 — Story specs (`stories/`)
- One markdown file per distinct visual state group.
- Each story spec defines: state name, rendered zones, visible copy (in Spanish), interactive elements, and pass/fail criteria.
- Storybook code is generated from these specs, not from the running app.

### Step 6 — Implementation
- Scaffold new `src/` from the state machine and sequence diagrams.
- Implement each service to satisfy its API contract doc.
- Implement each component to satisfy its story spec and UI behavior doc.
- Reference `_archive/src/` only for implementation details not covered by the specs.

> **This step is out of scope for the current agent task. Stop at Step 5.**

---

## Expected structure per file type
Every file must open with `> What this file answers:` (one line). Beyond that:

| File type | Required sections |
|---|---|
| Sequence diagram | Named steps in order; failure path per step that can fail; recovery action |
| UI behavior | States list; per-state: visible elements, copy text (Spanish), user interactions, transitions out |
| API contract | Function signature; inputs; outputs; error codes and their meaning; calls nothing not listed |
| Story spec | State name; zone layout; visible copy (Spanish); interactive elements; pass criteria |
| `state-machine.json` | XState v5 `createMachine()` config; all states from locked vocabulary; guards named not inlined |

---

## Completion signal
When all files for Steps 1–5 are produced, output this block and nothing else after it:

```
## AGENT COMPLETION MANIFEST
- [ ] state-machine.json
- [ ] sequence-diagrams/boot.md
- [ ] sequence-diagrams/setup.md
- [ ] sequence-diagrams/attendance.md
- [ ] sequence-diagrams/sync.md
- [ ] ui-behavior/global.md
- [ ] ui-behavior/zone1-scanner.md
- [ ] ui-behavior/zone2-search.md
- [ ] ui-behavior/zone3-actions.md
- [ ] api-contracts/authService.md
- [ ] api-contracts/driveService.md
- [ ] api-contracts/visitorService.md
- [ ] api-contracts/syncService.md
- [ ] stories/auth-states.md
- [ ] stories/search-states.md
- [ ] stories/confirmed-match-states.md

NEEDS-REVIEW items: [list or "none"]
```

---

## File Map

```
design-v2/
├── index.md                        ← you are here
├── state-machine.json
├── sequence-diagrams/
│   ├── boot.md
│   ├── setup.md
│   ├── attendance.md
│   └── sync.md
├── ui-behavior/
│   ├── global.md
│   ├── zone1-scanner.md
│   ├── zone2-search.md
│   └── zone3-actions.md
├── api-contracts/
│   ├── authService.md
│   ├── driveService.md
│   ├── visitorService.md
│   └── syncService.md
└── stories/
    ├── auth-states.md
    ├── search-states.md
    └── confirmed-match-states.md
```

---

## Verified Knowns from Prior Implementation

These facts were validated in `_archive/` and must be carried forward verbatim. Do not re-derive, guess, or alter them. The api-contract spec files must be built on top of these, not around them.

### Google Identity Services (Auth)
- **Required OAuth 2.0 scopes** (exact strings, no additions or removals):
  ```
  https://www.googleapis.com/auth/drive.file
  https://www.googleapis.com/auth/spreadsheets
  ```
- **GIS script URL:** `https://accounts.google.com/gsi/client`
- **Environment variables** (Vite-prefixed, loaded from `.env`):
  - `VITE_GOOGLE_CLIENT_ID`
  - `VITE_GOOGLE_API_KEY`
  - `VITE_GOOGLE_APP_ID`
- **Token expiry:** Google access tokens expire at exactly 3600s. The safety check threshold is **50 minutes (3,000,000ms)** — not 58 minutes — to leave a safe retry window.
- **Silent refresh is unreliable on Android Chrome** due to third-party cookie blocking. Interactive popup (`prompt: ''`) is the required fallback; silent iframe refresh must not be used.
- **`refreshToken` preservation rule:** Google only returns `refresh_token` on the first authorization grant. If subsequent token responses omit it, the stored value must be retained — never overwritten with `undefined`.
- **Token refresh endpoint:** `POST https://oauth2.googleapis.com/token`  
  Content-Type must be `application/x-www-form-urlencoded` (not JSON) — Google OAuth requirement.

### SessionStateStore Schema (IndexedDB)
Primary key is the static string `'CURRENT_SESSION'`. These fields are fixed:
```javascript
{
  sessionId: 'CURRENT_SESSION',
  accessToken: String,
  refreshToken: String,
  tokenIssuedAt: Number,       // Date.now() at acquisition
  masterFileId: String | null,
  workingFileId: String | null
}
```

### Google Drive & Sheets API Contracts
- **File copy endpoint:**
  ```
  POST https://www.googleapis.com/drive/v3/files/{masterFileId}/copy
  Body: { "name": "{originalName}_ASISTENCIA" }
  ```
- **Spreadsheet data fetch endpoint:**
  ```
  GET https://sheets.googleapis.com/v4/spreadsheets/{workingFileId}/values/{range}
  ```
- **Hardcoded tab name** (never changes regardless of file name):  
  `'Respuestas de formulario 1'`
- **Attendance sync uses `batchUpdate`** — not `append` — targeting the `ASISTENCIA` column in the existing tab. Rows are updated in-place by matching `visitorId`, not appended as new rows.
- **Master file is read-only.** The app never writes to `masterFileId`. All writes target `workingFileId` only.
- **Google Picker script URL:** `https://apis.google.com/js/api.js`
- **Picker MIME type filter** (exact strings):
  ```
  application/vnd.google-apps.spreadsheet
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  ```

### Spreadsheet Column → Schema Mapping
Row 0 is always the header row. Columns map to schema keys by exact header string match:

| Spreadsheet Header | Schema Key |
|---|---|
| `NOAPELLIDOS Y NOMBRES COMPLETOS DEL ADOLESCENTE (MAYÚSCULA)` | `hostName` |
| `DOCUMENTO DE IDENTIDAD DEL ADOLESCENTE` | `hostId` |
| `APELLIDOS Y NOMBRES COMPLETOS DEL VISITANTE (MAYÚSCULA)` | `visitorName` |
| `DOCUMENTO DE IDENTIDAD DEL VISITANTE` | `visitorId` (primary key) |
| `EDAD DEL VISITANTE` | `visitorAge` |
| `PARENTESCO CON EL ADOLESCENTE` | `relationship` |
| `TIPO DE VISITA` | `visitType` |
| `DEPARTAMENTO DE RESIDENCIA DEL VISITANTE` | `location.dept` |
| `PROVINCIA DE RESIDENCIA DEL VISITANTE` | `location.prov` |
| `DISTRITO DE RESIDENCIA DEL VISITANTE` | `location.dist` |
| `ASISTENCIA` (last column, appended if absent) | `attendanceStatus` |

---

## Constraints the agent must never violate
1. Do not write implementation code until the relevant spec file exists and is complete.
2. Do not infer behavior from `_archive/src/`. If it contradicts a spec file, the spec file wins.
3. Every spec file must open with a one-line "What this file answers" statement.
4. Spanish copy is the only accepted language for all user-facing strings.
