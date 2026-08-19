> What this file answers: What are the distinct visual states for authentication and setup screens, what copy and elements render in each, and what are the pass/fail criteria?

---

## Layout Note
During `AUTH_PENDING` and all `FILE_PICKER_PENDING` sub-states, the three-zone layout is replaced by a single full-screen centered column layout. The app logo/title appears at the top. All content is vertically centered in the remaining space.

---

## Story 1: AUTH_PENDING

**State name:** `AUTH_PENDING`

**Zone layout:** Full-screen single column (no Zone 1/2/3)

### Rendered elements (top to bottom)
| Element | Copy / Value | Style notes |
|---|---|---|
| App title | "Control de Visitas" | `text-3xl`, bold, `--color-text-primary`, centered |
| Subtitle | "Sistema de registro de asistencia" | `text-base`, `--color-text-secondary`, centered |
| Spacer | — | `mt-8` |
| Sign-in button | "Iniciar sesión con Google" | Full-width, 56px tall, `--color-primary` background, white text, Google icon prepended |

### Interactive elements
- "Iniciar sesión con Google" button: triggers `requestSignIn()`

### Pass criteria
- App title and subtitle are visible and readable
- Sign-in button is ≥56px tall and full-width on a 390px viewport
- Tapping the button opens the GIS popup without navigating away from the page
- No error is shown on first load

### Fail criteria
- Button is absent or non-tappable
- Any Zone 1/2/3 content is visible
- Network request is made before the button is tapped

---

## Story 2: AUTH_PENDING — popup blocked error

**State name:** `AUTH_PENDING` (error sub-state)

**Zone layout:** Full-screen single column

### Rendered elements
| Element | Copy / Value |
|---|---|
| App title | "Control de Visitas" |
| Subtitle | "Sistema de registro de asistencia" |
| Error alert | "El navegador bloqueó la ventana emergente. Permita ventanas emergentes e intente de nuevo." |
| Retry button | "Reintentar" |

### Interactive elements
- "Reintentar" button: re-calls `requestSignIn()`

### Pass criteria
- Error alert is visible with amber/warning styling
- "Reintentar" button is ≥56px tall
- No sign-in button from Story 1 is visible simultaneously with the retry button

---

## Story 3: FILE_PICKER_PENDING — AWAITING_SELECTION

**State name:** `FILE_PICKER_PENDING / AWAITING_SELECTION`

**Zone layout:** Full-screen single column

### Rendered elements
| Element | Copy / Value |
|---|---|
| Step indicator | "Paso 1 de 2: Seleccionar planilla" |
| Instruction | "Seleccione la planilla maestra de asistencia desde Google Drive." |
| Open Picker button | "Seleccionar Planilla" |

### Interactive elements
- "Seleccionar Planilla" button: opens Google Picker

### Pass criteria
- Step indicator is visible
- Button is ≥56px tall
- Picker opens on tap (requires internet connection)

---

## Story 4: FILE_PICKER_PENDING — COLLISION_PROMPT

**State name:** `FILE_PICKER_PENDING / COLLISION_PROMPT`

**Zone layout:** Full-screen single column

### Rendered elements
| Element | Copy / Value |
|---|---|
| Warning heading | "Se encontró un archivo existente" |
| File name display | "{masterFileName}_ASISTENCIA" |
| Explanation | "Se encontró una copia previa del archivo. ¿Qué desea hacer?" |
| Option button 1 | "Usar archivo existente" |
| Option button 2 | "Crear copia nueva" |

### Interactive elements
- "Usar archivo existente": dispatches `USE_EXISTING_FILE`
- "Crear copia nueva": dispatches `CREATE_NEW_COPY`

### Pass criteria
- Both buttons are ≥56px tall
- `{masterFileName}` is replaced with the actual file name from the Picker result
- Both options are clearly distinct (not identically styled — recommended: primary style for "Usar" and outlined/secondary for "Crear")

---

## Story 5: FILE_PICKER_PENDING — FETCHING_DATA (loading)

**State name:** `FILE_PICKER_PENDING / COPYING_FILE` or `FILE_PICKER_PENDING / FETCHING_DATA`

**Zone layout:** Full-screen single column

### Rendered elements
| Element | Copy / Value |
|---|---|
| Spinner | — (animated) |
| Progress label | "Cargando datos del evento..." |

### Interactive elements
None. All buttons are hidden or disabled during loading.

### Pass criteria
- Spinner is visible and animating
- No interactive elements are reachable
- Label accurately reflects the current operation (copy vs. fetch)

---

## Story 6: FILE_PICKER_PENDING — inline error state

**State name:** `FILE_PICKER_PENDING / AWAITING_SELECTION` (after a failed operation)

**Zone layout:** Full-screen single column

### Rendered elements
| Element | Copy / Value |
|---|---|
| Error alert | One of the failure messages defined in `sequence-diagrams/setup.md` |
| Retry button | "Reintentar" |

### Pass criteria
- Error message text matches the failure path that triggered it (copy failure vs. fetch failure vs. collision check failure)
- "Reintentar" is ≥56px tall
- Previous step buttons are not duplicated
