> What this file answers: What does Zone 1 render in each scanner sub-state, what are the transition timings, and what feedback must be surfaced for every failure path?

---

## Zone Description
Zone 1 occupies approximately the top 30% of the viewport. It contains the camera feed, a framing overlay, and all scanner state feedback. It is visible during `ATTENDANCE_PHASE` (states `READY_EMPTY`, `MULTI_MATCH`, `CONFIRMED_MATCH`). It is not rendered during Phase 1 or `SYNCING`.

---

## Framing Overlay
A visible rectangular overlay is rendered over the camera feed at all times while the camera is active. The overlay uses **corner bracket** markers (not a faint full rectangle), formed by four L-shaped brackets at the corners of the expected scan area.

- Corner bracket color in `IDLE`: `--color-scanner-idle` (white)
- Corner bracket size: 24px arms, 3px stroke
- The brackets are centered horizontally and occupy approximately 80% of Zone 1's width
- An instructional label below the frame reads: **"Apunte al código de barras"**

The overlay must be distinct enough to be visible against any background the camera captures.

---

## States

### IDLE
**Trigger:** Camera permission granted; no barcode candidate in frame. Also the default state on entry and the state returned to after `SCAN_SUCCESS`, `SCAN_ERROR`, and on `FALLBACK_ACTIVE` becoming available.

**Visible elements:**
- Live camera feed (full Zone 1 background)
- White corner bracket frame overlay
- Instructional label: **"Apunte al código de barras"**

**User interactions:** None. The scanner passively processes frames.

**Transitions out:**
- `CANDIDATE_DETECTED` — when the barcode detector reports a candidate
- `CAMERA_PERMISSION_DENIED` — when the browser denies camera access
- `BARCODE_DETECTOR_UNAVAILABLE` — when `'BarcodeDetector' in window` is false

---

### CANDIDATE_DETECTED
**Trigger:** Barcode decoder reports a candidate value in the current frame.

**Visible elements:**
- Live camera feed
- Frame corner brackets shift to `--color-scanner-candidate` (amber-400)
- A circular progress arc inside the frame begins filling clockwise, completing at 800ms
- Progress arc color: `--color-scanner-candidate`
- Label updates to: **"Mantenga el código en el encuadre..."**

**Hold window:** 800ms. This is a fixed spec value — do not make it configurable without updating this file.

**User interactions:** None. The worker must hold the device still.

**Transitions out:**
- After 800ms (guard `candidateStillLocked` passes) → `SCAN_SUCCESS`
- `CANDIDATE_LOST` — candidate disappears from frame before 800ms → `IDLE`
- `SCAN_AMBIGUOUS` — decoder reports conflicting reads → `SCAN_ERROR`

---

### SCAN_SUCCESS
**Trigger:** 800ms hold confirmed with a stable candidate.

**Visible elements:**
- Camera feed briefly occluded by a full-frame green flash (50% opacity overlay)
- Frame corner brackets shift to `--color-scanner-success` (green-500)
- Label: **"¡Código leído!"**

**Simultaneous feedback (fired via `entry` actions):**
1. `flashGreen` — triggers CSS animation class on Zone 1 frame
2. `playChirp` — 880Hz, 150ms sine chirp via Web Audio API
3. `triggerHaptic` — `navigator.vibrate(50)` if supported

**Transition timing:** After 600ms, auto-transition to `IDLE`.

**Transitions out:**
- After 600ms → `IDLE`

---

### SCAN_ERROR
**Trigger:** Barcode lock failed (candidate value changed mid-hold) or decoder reports an ambiguous read.

**Visible elements:**
- Frame corner brackets shift to `--color-scanner-error` (orange-500)
- Brief amber flash overlay on Zone 1 (50% opacity, 300ms)
- Label: **"No se pudo leer. Inténtelo de nuevo."**

**Simultaneous feedback:**
1. `flashAmber` — triggers CSS animation class on Zone 1 frame
2. Error tone — 220Hz, 200ms sine tone via Web Audio API

**Transition timing:** After 2000ms, auto-transition to `IDLE`.

**Transitions out:**
- After 2000ms → `IDLE`

**Important:** The zone must never appear frozen or blank. The amber label must be visible for the full 2000ms. The user must never have to guess whether the scanner is still active.

---

### CAMERA_DENIED
**Trigger:** `getUserMedia()` throws `NotAllowedError` or the browser permission prompt is denied.

**Visible elements:**
- Camera feed is replaced entirely. No video renders.
- Large centered icon: a camera with a slash through it
- Error message (two lines):
  - **"Cámara no disponible"** (bold, `text-xl`)
  - "Permiso de cámara denegado. Active el permiso en la configuración de su navegador." (`text-sm`, `--color-text-secondary`)
- Retry button (full-width, 56px tall): **"Reintentar"**

**User interactions:**
- Tapping "Reintentar" dispatches `RETRY_CAMERA` → state transitions to `IDLE`, which re-requests camera permission

**Transitions out:**
- `RETRY_CAMERA` → `IDLE`

---

### FALLBACK_ACTIVE
**Trigger:** `'BarcodeDetector' in window` evaluates to `false` on initialization. The `@zxing/browser` library is loaded as a fallback decoder.

**Visible elements:**
- Identical to `IDLE` in all visual respects, with one addition:
- A small, non-intrusive badge in the bottom-right corner of Zone 1: **"Modo compatibilidad"** (`text-xs`, muted background)

**Behavioral note:** `FALLBACK_ACTIVE` is functionally equivalent to `IDLE` — it still transitions to `CANDIDATE_DETECTED` on detection events. The `@zxing` library fires the same `CANDIDATE_DETECTED` event interface as the native `BarcodeDetector`.

**Transitions out:**
- `CANDIDATE_DETECTED` → `CANDIDATE_DETECTED`
- `CAMERA_PERMISSION_DENIED` → `CAMERA_DENIED`

---

## No-Silent-Failures Rule
Every error path in Zone 1 must surface a visible label inside Zone 1 itself. The scanner must never:
- Appear as a blank black rectangle without explanation
- Appear frozen on the last frame without a status label
- Silently stop processing without user notification

---

## Zone 1 Transition Timing Summary

| Transition | Duration |
|---|---|
| `CANDIDATE_DETECTED` → `SCAN_SUCCESS` (hold window) | 800ms (fixed) |
| `SCAN_SUCCESS` → `IDLE` (auto reset) | 600ms |
| `SCAN_ERROR` → `IDLE` (auto reset) | 2000ms |
| Frame color shift (IDLE → CANDIDATE_DETECTED) | Immediate (CSS) |
| Green/amber flash overlay animation | 300ms |
