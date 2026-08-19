> What this file answers: How does a single visitor check-in proceed from first input to completed IndexedDB record, including the already-attended intercept and the undo path?

---

## Precondition
State machine is in `ATTENDANCE_PHASE / appFlow / READY_EMPTY`. `visitorStore` is hydrated. Device has no required network connectivity.

---

## Named Steps

### Step 1 — Input: barcode scan or text search
Zone 1 (scanner) and Zone 2 (search input) are active simultaneously. Two input paths lead to the same `CONFIRMED_MATCH` state.

---

**Path A — Barcode scan**

The scanner sub-state machine reaches `SCAN_SUCCESS` (via the 800ms hold window confirmed in `CANDIDATE_DETECTED`). The `dispatchBarcodeResult` action fires the `BARCODE_RESULT` event to `appFlow` with the decoded string as payload.

The app looks up the decoded string against `visitorId` in `visitorStore` (exact match).

| Lookup result | Outcome |
|---|---|
| Exactly 1 match | Dispatch `BARCODE_RESULT` with visitor record → `CONFIRMED_MATCH` |
| 0 matches | Scanner returns to `IDLE`; decoded string is pre-filled into Zone 2 search input to allow manual fallback |

**Path B — Text search**

Worker types into the Zone 2 input field. The search query executes when `input.value.length >= 3`.

The query is diacritic-insensitive and performs a substring match against both `visitorName` and `visitorId`. See `ui-behavior/zone2-search.md` for the matching algorithm.

Results are capped at 15 records.

### Step 2 — Route by result count

| Count | Event dispatched | State transition |
|---|---|---|
| 0 | `SEARCH_NO_RESULTS` | `READY_EMPTY` — show "Sin resultados" in Zone 2 |
| 1 | `SEARCH_RESULT_SINGLE` | `CONFIRMED_MATCH` |
| 2–15 | `SEARCH_RESULTS_MULTIPLE` | `MULTI_MATCH` |
| > 15 | `SEARCH_RESULTS_MULTIPLE` (first 15 only) | `MULTI_MATCH` |

**Failure path:** If the IDB query throws an error, show inline in Zone 2:

> "Error al buscar. Intente de nuevo."

Do not change state.

### Step 3 — MULTI_MATCH: worker selects from list
State: `ATTENDANCE_PHASE / appFlow / MULTI_MATCH`.

Zone 2 renders a scrollable list of up to 15 result rows. Each row shows `visitorName` and `visitorId`.

Worker taps a row → dispatch `VISITOR_SELECTED` with the tapped record → `CONFIRMED_MATCH`.

Updating the search field re-executes the query and re-routes per Step 2.

Clearing the field to fewer than 3 characters → dispatch `SEARCH_CLEARED` → `READY_EMPTY`.

### Step 4 — CONFIRMED_MATCH: render full visitor card
State: `ATTENDANCE_PHASE / appFlow / CONFIRMED_MATCH`.

Zone 3 renders the full visitor card with these fields:
- `visitorName` — large, bold
- `visitorId` — DNI number
- `relationship` — relationship to host
- `visitorAge` — age
- `hostName` — name of the adolescent being visited
- `visitType` — type of visit

### Step 5 — Already-attended intercept
If `selectedRecord.attendanceStatus === true`:

- Render a **locked gray badge**: "Asistencia Ya Registrada [HH:MM]"
  - `HH:MM` is derived from `attendanceTimestamp` formatted as local time
- Render a low-profile "Anular Registro" button below the badge
- **Do NOT render** the "REGISTRAR ASISTENCIA" button

If the worker taps "Anular Registro", proceed to Step 7.

### Step 6 — Register attendance
If `selectedRecord.attendanceStatus === false`:

Render the green **"REGISTRAR ASISTENCIA"** button.

Worker taps the button → dispatch `ATTENDANCE_RECORDED`.

The app writes to `visitorStore` synchronously before any state transition:

```
visitorStore.put({
  ...selectedRecord,
  attendanceStatus:   true,
  attendanceTimestamp: new Date().toISOString(),
  syncedWithCloud:    false
})
```

**On IDB write success:**
1. State machine transitions to `READY_EMPTY` (immediate)
2. Zone 2 search input cleared; Zone 3 cleared (immediate)
3. Toast notification queued — non-blocking, does not block the reset
4. Audio chirp queued — non-blocking, does not block the reset

**No network call is made. `syncedWithCloud: false` accumulates until Phase 3.**

**Failure path:** If the IDB `put` throws, do **not** transition state. Show inline in Zone 3:

> "Error al registrar asistencia. Intente de nuevo."

The "REGISTRAR ASISTENCIA" button remains active.

### Step 7 — Undo attendance ("Anular Registro")
Worker taps "Anular Registro" (visible only when `attendanceStatus === true`).

The app writes to `visitorStore`:

```
visitorStore.put({
  ...selectedRecord,
  attendanceStatus:   false,
  attendanceTimestamp: null,
  syncedWithCloud:    false
})
```

**On IDB write success:** Dispatch `UNDO_ATTENDANCE`. State remains `CONFIRMED_MATCH`. Zone 3 re-renders with `attendanceStatus = false`: the gray badge is removed and the green "REGISTRAR ASISTENCIA" button appears.

**Failure path:** If the IDB `put` throws, show inline:

> "Error al anular el registro. Intente de nuevo."

Do not change displayed state.

---

## Recovery Summary

| Step | Failure | Recovery action |
|---|---|---|
| Step 1 (barcode) | No matching record | Pre-fill Zone 2 with decoded string; scanner returns to IDLE |
| Step 2 | IDB query throws | Inline error in Zone 2; no state change |
| Step 6 | IDB write fails | Inline error in Zone 3; remain in CONFIRMED_MATCH |
| Step 7 | IDB write fails | Inline error in Zone 3; no state change |
