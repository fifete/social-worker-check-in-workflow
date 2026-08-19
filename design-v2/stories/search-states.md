> What this file answers: What are the distinct visual states for Zone 1 (scanner) and Zone 2 (search) during READY_EMPTY and MULTI_MATCH, what copy renders in each, and what are the pass/fail criteria?

---

## Layout
During `ATTENDANCE_PHASE`, the viewport uses the three-zone stack: Zone 1 (scanner, ~30vh) / Zone 2 (search, ~25vh) / Zone 3 (actions, remaining space). All search stories occur within this layout.

---

## Story 1: READY_EMPTY — initial state

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY`
**Scanner sub-state:** `IDLE`

### Zone 1
| Element | Value |
|---|---|
| Camera feed | Live video (full Zone 1 background) |
| Frame overlay | White corner brackets centered over expected scan area |
| Instructional label | "Apunte al código de barras" |

### Zone 2
| Element | Value |
|---|---|
| Search input | Empty; placeholder: "Buscar por nombre o DNI..." |
| Results list | Not rendered |

### Zone 3
| Element | Value |
|---|---|
| Placeholder icon | Person silhouette or magnifying glass (non-interactive) |
| Placeholder label | "Escanee o busque un visitante para comenzar." |
| Sync button | "Sincronizar Datos con Drive" (full-width, outlined style) |

### Interactive elements
- Search input: accepts text
- Sync button: dispatches `SYNC_INITIATED`

### Pass criteria
- Camera feed is live (not a static image or black rectangle)
- Frame brackets are visible over the camera feed
- Search input is focused or easily tappable
- Sync button is ≥56px tall
- No visitor card is shown

---

## Story 2: READY_EMPTY — search input < 3 characters

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY`

### Zone 2
| Element | Value |
|---|---|
| Search input | 1–2 characters typed; no results list |

### Pass criteria
- No results list appears
- No "Sin resultados" label appears
- No error appears
- Zone 3 placeholder remains visible

---

## Story 3: READY_EMPTY — search returns 0 results

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY` (after `SEARCH_NO_RESULTS`)

### Zone 2
| Element | Value |
|---|---|
| Search input | ≥3 characters typed |
| No-results label | "Sin resultados" |

### Zone 3
Unchanged from Story 1 (placeholder remains).

### Pass criteria
- "Sin resultados" label appears below the input
- No results list is rendered
- Zone 3 is unchanged

---

## Story 4: READY_EMPTY — scanner CANDIDATE_DETECTED

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY`
**Scanner sub-state:** `CANDIDATE_DETECTED`

### Zone 1
| Element | Value |
|---|---|
| Camera feed | Live video |
| Frame overlay | Corner brackets shift to amber-400 (`--color-scanner-candidate`) |
| Progress arc | Circular arc filling clockwise, completes at 800ms |
| Label | "Mantenga el código en el encuadre..." |

### Pass criteria
- Frame color has visibly changed from IDLE state
- Progress arc is animated (not static)
- Label is visible inside Zone 1
- Worker can tell the scanner is actively reading

---

## Story 5: READY_EMPTY — scanner SCAN_SUCCESS

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY`
**Scanner sub-state:** `SCAN_SUCCESS` (briefly, 600ms)

### Zone 1
| Element | Value |
|---|---|
| Camera feed | Occluded by 50% green overlay flash |
| Frame brackets | Green-500 (`--color-scanner-success`) |
| Label | "¡Código leído!" |

### Simultaneous feedback
- Audio chirp (880Hz, 150ms)
- Haptic vibrate (50ms)

### Pass criteria
- Green flash is visible for ≥300ms
- Label "¡Código leído!" is readable during the flash
- State auto-transitions to IDLE after 600ms
- If a matching record is found, state transitions to CONFIRMED_MATCH

---

## Story 6: READY_EMPTY — scanner SCAN_ERROR

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY`
**Scanner sub-state:** `SCAN_ERROR` (2000ms)

### Zone 1
| Element | Value |
|---|---|
| Frame overlay | Orange-500 (`--color-scanner-error`) corner brackets |
| Amber flash | 50% opacity amber overlay, 300ms animation |
| Label | "No se pudo leer. Inténtelo de nuevo." |

### Simultaneous feedback
- Error tone (220Hz, 200ms)

### Pass criteria
- Amber flash and label are visible for 2000ms
- Zone 1 does not appear blank or frozen
- Auto-transitions to IDLE after 2000ms

---

## Story 7: READY_EMPTY — scanner CAMERA_DENIED

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY`
**Scanner sub-state:** `CAMERA_DENIED`

### Zone 1
| Element | Value |
|---|---|
| Camera feed | Not shown |
| Icon | Camera with slash icon (centered) |
| Heading | "Cámara no disponible" |
| Detail | "Permiso de cámara denegado. Active el permiso en la configuración de su navegador." |
| Retry button | "Reintentar" |

### Pass criteria
- No black rectangle visible (camera feed fully replaced)
- All three text elements are readable
- Retry button is ≥56px tall
- Tapping Reintentar re-requests camera permission

---

## Story 8: READY_EMPTY — scanner FALLBACK_ACTIVE

**State name:** `ATTENDANCE_PHASE / appFlow / READY_EMPTY`
**Scanner sub-state:** `FALLBACK_ACTIVE`

### Zone 1
| Element | Value |
|---|---|
| Camera feed | Live video |
| Frame overlay | Same as IDLE (white brackets) |
| Instructional label | "Apunte al código de barras" |
| Fallback badge | "Modo compatibilidad" (small badge, bottom-right of Zone 1) |

### Pass criteria
- Zone 1 is visually identical to IDLE except for the small fallback badge
- Badge is small and non-intrusive (must not obscure the scan area)
- Scanner functionality works identically to IDLE

---

## Story 9: MULTI_MATCH — results list

**State name:** `ATTENDANCE_PHASE / appFlow / MULTI_MATCH`

### Zone 1
Unchanged from READY_EMPTY IDLE.

### Zone 2
| Element | Value |
|---|---|
| Search input | ≥3 characters typed; value preserved |
| Results list | 2–15 rows; each row shows `visitorName` (bold) + `visitorId` (secondary) |

### Zone 3
| Element | Value |
|---|---|
| Placeholder label | "Seleccione un visitante de la lista." |

### Interactive elements
- Each result row: tap → `VISITOR_SELECTED`
- Search input: editing re-runs query

### Pass criteria
- Each row is ≥56px tall
- Rows are scrollable if they overflow Zone 2 height
- Tapping any row transitions to CONFIRMED_MATCH
- Editing the input updates the results in real time

---

## Story 10: MULTI_MATCH — overflow (> 15 results)

**State name:** `ATTENDANCE_PHASE / appFlow / MULTI_MATCH`

### Zone 2
| Element | Value |
|---|---|
| Results list | Exactly 15 rows shown |
| Overflow notice | "Mostrando los primeros 15 resultados. Sea más específico para filtrar." |

### Pass criteria
- Exactly 15 rows render (not 16 or more)
- Overflow notice is visible below the list
- No "load more" or pagination control exists
