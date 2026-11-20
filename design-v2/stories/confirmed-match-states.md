> What this file answers: What are the distinct visual states for CONFIRMED_MATCH in Zone 3 — both attended and unattended — what copy renders, and what are the pass/fail criteria for each?

---

## Layout
`CONFIRMED_MATCH` renders within the `ATTENDANCE_PHASE` three-zone stack. Zone 1 and Zone 2 remain visible. Zone 3 contains the full visitor card and action area.

---

## Story 1: CONFIRMED_MATCH — unattended visitor

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH`
**Condition:** `selectedRecord.attendanceStatus === false`

### Zone 3
| Element | Copy / Value | Style |
|---|---|---|
| Back link | "← Volver a la búsqueda" | `text-sm`, `--color-primary`, min-height 44px |
| Visitor card | — | `--color-bg-card`, `rounded-xl`, `p-4`, 1px border |
| — Visitante | `visitorName` | `text-xl`, bold |
| — DNI | `visitorId` | `text-lg`, `--color-text-primary` |
| — Parentesco | `relationship` | `text-base`, `--color-text-secondary` |
| — Edad | `visitorAge` | `text-base`, `--color-text-secondary` |
| — Visita a | `hostName` | `text-base`, `--color-text-secondary` |
| — Tipo de visita | `visitType` | `text-base`, `--color-text-secondary` |
| Register button | "REGISTRAR ASISTENCIA" | Full-width, 56px tall, `--color-success` background, white text, `text-lg`, bold |

### Interactive elements
- Back link: dispatches `BACK`
- "REGISTRAR ASISTENCIA" button: dispatches `ATTENDANCE_RECORDED`

### Pass criteria
- All six visitor fields are populated with real data (no "undefined" or empty values)
- Register button is ≥56px tall and full-width
- Register button color is `--color-success` (#15803D)
- No attendance badge is visible
- Tapping the button writes to IDB and transitions to `READY_EMPTY`
- After transition: Zone 2 input is cleared, Zone 3 shows placeholder

---

## Story 2: CONFIRMED_MATCH — unattended visitor, IDB write failure

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH` (error sub-state)
**Condition:** `ATTENDANCE_RECORDED` dispatched but IDB write threw

### Zone 3
Identical to Story 1, plus:
| Element | Copy | Style |
|---|---|---|
| Inline error | "Error al registrar asistencia. Intente de nuevo." | `text-sm`, `--color-danger-text`, below the button |

### Pass criteria
- Error label is visible below the button
- Register button remains active (not disabled or removed)
- State does not transition to READY_EMPTY
- No toast or chirp fires

---

## Story 3: CONFIRMED_MATCH — already attended visitor

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH`
**Condition:** `selectedRecord.attendanceStatus === true`

### Zone 3
| Element | Copy / Value | Style |
|---|---|---|
| Back link | "← Volver a la búsqueda" | `text-sm`, `--color-primary` |
| Visitor card | Same six fields as Story 1 | Same styles |
| Attendance badge | "Asistencia Ya Registrada" + "[HH:MM]" | `--color-attended-bg`, `rounded-lg`, border, checkmark icon |
| Undo button | "Anular Registro" | Full-width, 56px tall, ghost/outlined, `--color-danger` border and text |

### Interactive elements
- Back link: dispatches `BACK`
- "Anular Registro" button: opens confirmation bottom sheet (see Story 5)

### Pass criteria
- "REGISTRAR ASISTENCIA" button is **not visible**
- Attendance badge is visible with correct HH:MM timestamp in 24-hour local time
- Badge has a visually distinct background (`--color-attended-bg`, gray)
- "Anular Registro" button is ≥56px tall
- "Anular Registro" button is styled differently from "REGISTRAR ASISTENCIA" (no green fill)

---

## Story 4: CONFIRMED_MATCH — attended visitor, timestamp display

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH`
**Condition:** `attendanceStatus === true`, `attendanceTimestamp` is an ISO-8601 string

### Timestamp rendering rule
| Input | Expected display |
|---|---|
| `"2025-03-15T14:37:00.000Z"` (UTC) | "14:37" in device local time (example: Peru UTC-5 → "09:37") |
| `"2025-03-15T09:37:00.000-05:00"` | "09:37" |

The display must use the device's local timezone. Use `new Date(attendanceTimestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })` or equivalent.

### Pass criteria
- Time displays as HH:MM in 24-hour format
- Time reflects device local timezone (not UTC)
- If `attendanceTimestamp` is `null` (edge case), show "—" instead of crashing

---

## Story 5: CONFIRMED_MATCH — undo confirmation bottom sheet

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH` (modal sub-state)
**Trigger:** Worker tapped "Anular Registro"

### Overlay
| Element | Copy | Style |
|---|---|---|
| Overlay backdrop | — | Semi-transparent dark backdrop |
| Sheet heading | "¿Anular el registro?" | `text-xl`, bold |
| Sheet detail | "Esta acción eliminará el registro de asistencia de [visitorName]." | `text-base`, `--color-text-secondary` |
| Confirm button | "Sí, anular" | Full-width, 56px, `--color-danger` background, white text |
| Cancel button | "Cancelar" | Full-width, 56px, outlined secondary style |

### Interactive elements
- "Sí, anular": dispatches `UNDO_ATTENDANCE`
- "Cancelar": dismisses sheet; no state change

### Pass criteria
- Bottom sheet is anchored to the bottom of the viewport (not a centered modal)
- Both buttons are ≥56px tall
- `[visitorName]` is replaced with the actual name of the selected visitor
- Tapping the backdrop (outside the sheet) dismisses it (equivalent to "Cancelar")
- After "Sí, anular": badge disappears, "REGISTRAR ASISTENCIA" button appears

---

## Story 6: CONFIRMED_MATCH — undo IDB write failure

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH` (error sub-state)
**Condition:** `UNDO_ATTENDANCE` dispatched but IDB write threw

### Zone 3
Unchanged from Story 3, plus:
| Element | Copy | Style |
|---|---|---|
| Inline error | "Error al anular el registro. Intente de nuevo." | `text-sm`, `--color-danger-text`, below the undo button |

### Pass criteria
- Attendance badge remains visible (state not changed)
- "Anular Registro" button remains active
- Inline error is visible below the undo button
- Confirmation sheet has been dismissed before the error appears

---

## Story 7: CONFIRMED_MATCH — post-attendance reset (transition)

**State name:** Transitions from `CONFIRMED_MATCH` → `READY_EMPTY`
**Trigger:** Successful `ATTENDANCE_RECORDED`

### Expected zone state immediately after transition
| Zone | State |
|---|---|
| Zone 2 | Input cleared; placeholder text restored; results list gone |
| Zone 3 | Visitor card gone; placeholder restored; sync button visible |

### Simultaneous async feedback
| Event | Timing |
|---|---|
| Toast: "Asistencia registrada: [visitorName]" with **Deshacer** | Appears top right ~100ms after transition (see `global.md`) |
| Audio chirp | Plays ~100ms after transition (non-blocking) |

### Pass criteria
- Zone 2 and Zone 3 reset is **immediate** (same frame as state transition)
- Toast and chirp may lag by up to 100–200ms — this is acceptable
- No visitor data from the previous record is visible after reset
- Toast disappears after 5000ms unless replaced or dismissed with **Deshacer**

---

## Story 8: Scan — unattended visitor, auto-registered

**State name:** Stays in or returns to `ATTENDANCE_PHASE / appFlow / READY_EMPTY`
**Trigger:** `SCAN_SUCCESS` with a DNI that matches a visitor whose `attendanceStatus === false`, from any appFlow state

### Expected zone state
| Zone | State |
|---|---|
| Zone 1 | Normal `SCAN_SUCCESS` read feedback, then `IDLE` |
| Zone 2 | Input cleared; any previous search or selection discarded |
| Zone 3 | `READY_EMPTY` placeholder; no visitor card, no REGISTRAR ASISTENCIA button |
| Toast | "Asistencia registrada: [visitorName]" with **Deshacer** (success kind, top right) |

### Pass criteria
- The attendance record is written without any tap
- Only one chirp plays (the `SCAN_SUCCESS` read chirp)
- The scanner can read the next visitor straight away; the same code is ignored until it leaves the frame (re-scan guard)

---

## Story 9: Scan — already attended visitor (duplicate scan)

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH`
**Trigger:** `SCAN_SUCCESS` with a DNI that matches a visitor whose `attendanceStatus === true`

### Expected zone state
| Zone | State |
|---|---|
| Zone 3 | Story 3: card, "Asistencia Ya Registrada" badge with the original HH:MM, "Anular Registro" |
| Toast | "Asistencia ya registrada: [visitorName] a las [HH:MM]" (duplicate kind, no Deshacer) |

### Pass criteria
- No write happens; `attendanceTimestamp` and `syncedWithCloud` are unchanged
- The toast shows the original time, not the time of the scan
- The toast does not repeat while the same card stays in frame

---

## Story 10: Scan — auto-registration write failure

**State name:** `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH` (error sub-state)
**Trigger:** `SCAN_SUCCESS` matched an unattended visitor, but the IDB write threw

### Zone 3
Same as Story 2: the visitor card, the REGISTRAR ASISTENCIA button, and the inline error "Error al registrar asistencia. Intente de nuevo." The worker can tap the button to retry.

### Pass criteria
- The error tone (220Hz) plays; no success toast and no success chirp
- The failure is logged as `attendance.register.failed` with `rowIndex`, `code` and `dni` only (ADR 0001); the visitor's name is never logged
- Tapping REGISTRAR ASISTENCIA follows Story 1 (success → `READY_EMPTY` and a success toast)

---

## Story 11: Deshacer on the success toast

**State name:** Unchanged (`READY_EMPTY` after either registration path)
**Trigger:** The worker taps **Deshacer** within 5000ms of the success toast, and the toast has not been replaced

### Pass criteria
- The attendance record is removed (`attendanceStatus = false`, `attendanceTimestamp = null`, `syncedWithCloud = false`) with no confirmation sheet
- The toast is dismissed and no visitor card is shown; Zone 3 stays on the `READY_EMPTY` placeholder
- The scanner re-scan guard is unaffected: the same card still in frame is not re-registered by the undo
- If the write fails: the failure log records it, and the toast is replaced by "No se pudo anular. Búsquelo y use \"Anular Registro\"." (no Deshacer)
- If another toast replaces the success toast first, its Deshacer is gone and only the "Anular Registro" route remains
