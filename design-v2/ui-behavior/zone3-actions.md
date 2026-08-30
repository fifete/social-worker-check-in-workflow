> What this file answers: What does Zone 3 render in each of the five app-level states, how are the attended and unattended intercepts handled, and what is the undo confirmation flow?

---

## Zone Description
Zone 3 occupies the remaining viewport space below Zone 2 and is scrollable. During Phase 1 and `SYNCING`, Zone 3 is not rendered. During Phase 2, Zone 3 renders content that changes with each app-level state.

---

## Render per App-Level State

### 1. AUTH_PENDING
Zone 3 is **not rendered**. The entire viewport is used for the auth screen (full-screen centered layout). See `stories/auth-states.md`.

---

### 2. FILE_PICKER_PENDING
Zone 3 is **not rendered**. The entire viewport is used for the setup flow. See `stories/auth-states.md`.

---

### 3. READY_EMPTY
**Condition:** `visitorStore` hydrated, no active search, no selected visitor.

**Visible elements:**
- Centered placeholder content:
  - Icon: a person silhouette or magnifying glass (non-interactive)
  - Label: **"Escanee o busque un visitante para comenzar."** (`text-base`, `--color-text-secondary`)
- Sync button: **"Sincronizar Datos con Drive"** — full-width, 56px tall, secondary style (outlined, not filled)
- "Cambiar archivo" button: **"Cambiar archivo"** — full-width, 56px tall, ghost style (text-only, `--color-text-secondary`, no background, no border); positioned directly below the sync button

**User interactions:**
- Sync button tap → dispatches `SYNC_INITIATED`
- "Cambiar archivo" tap → dispatches `RESET_INITIATED`; the machine determines whether to show `RESET_WARNING` (pending records exist) or transition directly to `RESETTING`

---

### 4. MULTI_MATCH
**Condition:** Search returned 2–15 results. Worker has not yet selected one.

**Visible elements:**
- Dimmed placeholder:
  - Label: **"Seleccione un visitante de la lista."** (`text-sm`, `--color-text-secondary`)

No visitor card is shown. Zone 3 is minimal to maximize visible space for the Zone 2 results list.

**User interactions:** None in Zone 3. Selection happens in Zone 2's result list.

---

### 5. CONFIRMED_MATCH
**Condition:** A single visitor record is selected.

Zone 3 renders the **full visitor card** followed by the **action area**.

#### Visitor card fields (in display order)
| Label | Field | Style |
|---|---|---|
| Visitante | `visitorName` | `text-xl`, bold, `--color-text-primary` |
| DNI | `visitorId` | `text-lg`, `--color-text-primary` |
| Parentesco | `relationship` | `text-base`, `--color-text-secondary` |
| Edad | `visitorAge` | `text-base`, `--color-text-secondary` |
| Visita a | `hostName` | `text-base`, `--color-text-secondary` |
| Tipo de visita | `visitType` | `text-base`, `--color-text-secondary` |

Card background: `--color-bg-card`, `rounded-xl`, `p-4`, with a 1px border at `--color-border`.

#### Back control
A low-profile back link above the card: **"← Volver a la búsqueda"** (`text-sm`, `--color-primary`).
Tap → dispatches `BACK` → `READY_EMPTY`.
Minimum touch height: 44px inline (this is a link, not a primary button; 44px is acceptable for secondary navigation).

---

## Attended / Unattended Intercept

Zone 3's action area renders one of two mutually exclusive states depending on `selectedRecord.attendanceStatus`.

### Unattended (attendanceStatus === false)

**Visible elements:**
- Green primary button (full-width, 56px tall):
  **"REGISTRAR ASISTENCIA"**
  - Background: `--color-success` (#15803D)
  - Text: `--color-text-inverse` (#FFFFFF)
  - Font: `text-lg`, weight 700

**User interaction:**
- Tap → dispatches `ATTENDANCE_RECORDED`
- On IDB write failure: button stays visible; inline error appears below:
  **"Error al registrar asistencia. Intente de nuevo."** (`text-sm`, `--color-danger-text`)

---

### Attended (attendanceStatus === true)

**Visible elements:**

1. **Locked gray badge** (non-interactive, full-width):
   - Background: `--color-attended-bg` (#F3F4F6)
   - Border: 1px solid `--color-attended-border` (#9CA3AF)
   - Corner radius: `rounded-lg`
   - Content: checkmark icon + **"Asistencia Ya Registrada"** (bold, `text-base`) + timestamp on the line below: **"[HH:MM]"** (`text-xl`, bold)
   - `HH:MM` is formatted from `attendanceTimestamp` in the device's local time (24-hour)
   - `aria-label="Asistencia registrada a las [HH:MM]"`

2. **"Anular Registro" button** (full-width, 56px tall), positioned immediately below the badge:
   - Style: ghost/outlined — no fill, `--color-danger` border and text
   - Label: **"Anular Registro"**
   - `text-sm`, `--color-danger`

**User interaction:**
- "Anular Registro" tap → see Undo Flow below

---

## Undo Confirmation Flow

When the worker taps "Anular Registro":

1. A **bottom sheet confirmation dialog** appears (not a browser `confirm()` — a custom overlay anchored to the bottom of the viewport):

   > **"¿Anular el registro?"**
   > "Esta acción eliminará el registro de asistencia de [visitorName]."
   >
   > [**"Sí, anular"** (danger style)] [**"Cancelar"** (secondary style)]

2. **Worker taps "Cancelar":** Bottom sheet dismisses. `CONFIRMED_MATCH` state is unchanged.

3. **Worker taps "Sí, anular":** Bottom sheet dismisses. Dispatches `UNDO_ATTENDANCE`.
   - IDB write executes: `attendanceStatus = false`, `attendanceTimestamp = null`, `syncedWithCloud = false`
   - Zone 3 re-renders with the unattended action area (green "REGISTRAR ASISTENCIA" button)
   - On IDB write failure: inline error below the badge: **"Error al anular el registro. Intente de nuevo."**

---

## SYNCING Overlay
When `SYNC_INITIATED` is dispatched, a `position: fixed` full-screen overlay renders above all zones:
- Background: `--color-bg-overlay` (rgba(0,0,0,0.55))
- Content: centered spinner + **"Sincronizando datos..."** (`text-xl`, `--color-text-inverse`)
- All Zone 1, 2, and 3 interactions are disabled (pointer-events: none on underlying zones)
- The overlay persists until `PUSH_SUCCESS` → purge, or `PUSH_FAILED` / `AUTH_FAILED` dismisses it

---

## RESET_WARNING Modal

Triggered when `RESET_INITIATED` is dispatched and `hasPendingAttendance` guard is true.

A **bottom-sheet modal** renders above all zones (same anchoring pattern as the undo confirmation flow).

### When hasPendingAttendance is false
The machine transitions directly to `RESETTING`. This modal is not shown. No user confirmation is required.

### When hasPendingAttendance is true

**Modal content:**

> ⚠ **"¿Cambiar archivo?"**
> "Tiene **[N] registro(s) de asistencia** que no han sido sincronizados con Google Drive. Si cambia el archivo ahora, estos registros se perderán de forma permanente."
>
> [**"Cancelar"** (secondary)] [**"Sí, cambiar archivo"** (danger)]

`[N]` is the count of records with `attendanceStatus === true AND syncedWithCloud === false`, rendered bold.

**User interactions:**
- "Cancelar" → dispatches `RESET_CANCELLED` → modal dismisses, `ATTENDANCE_PHASE` resumes
- "Sí, cambiar archivo" → dispatches `RESET_CONFIRMED` → modal dismisses, machine enters `RESETTING`
- Tapping outside the bottom sheet: **does not dismiss** — explicit choice is required

**Visual treatment:**
- Overlay background: `--color-bg-overlay` (rgba(0,0,0,0.55))
- "Sí, cambiar archivo": `--color-danger` background, `--color-text-inverse` text, 56px tall
- "Cancelar": outlined secondary style, 56px tall
- `[N]` count: bold, `--color-danger-text` within body copy
- All zones are non-interactive (pointer-events blocked) while modal is visible
