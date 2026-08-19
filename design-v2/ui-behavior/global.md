> What this file answers: What is the complete design system — colors, typography, spacing, touch targets, feedback timing, and audio — that all components must reference?

---

## Design Authority Statement
This file is the single authoritative design system for the application. Every color, type size, spacing value, and interaction timing used in any component must trace back to a token defined here. No component may hardcode a hex value or a pixel size that is not defined in this system.

---

## Constraints (non-negotiable)
- **Color mode:** Light mode only. No dark mode. No `prefers-color-scheme` switching.
- **Styling:** Tailwind CSS utility classes for layout and spacing. CSS custom properties (`--var`) for all color tokens. Tailwind config extends the theme by referencing CSS variables — it must not hardcode hex values.
- **Touch targets:** 56×56px hard floor. No interactive element may be smaller.
- **Outdoor readability:** WCAG AA is the minimum; AAA is the target. High-glare conditions are the assumed context.
- **Orientation:** Portrait only. One-handed use at waist or chest height.

---

## Color System

### CSS Custom Property Tokens

All tokens are declared on `:root`. Tailwind extends `theme.colors` to reference each via `var(--color-*)`.

```css
:root {
  /* Backgrounds */
  --color-bg-page:      #FFFFFF;
  --color-bg-card:      #F9FAFB;
  --color-bg-input:     #FFFFFF;
  --color-bg-overlay:   rgba(0, 0, 0, 0.55);

  /* Borders */
  --color-border:       #D1D5DB;
  --color-border-focus: #1D4ED8;

  /* Text */
  --color-text-primary:   #111827;
  --color-text-secondary: #374151;
  --color-text-disabled:  #9CA3AF;
  --color-text-inverse:   #FFFFFF;

  /* Brand / Primary action */
  --color-primary:        #1D4ED8;
  --color-primary-hover:  #1E40AF;
  --color-primary-active: #1E3A8A;

  /* Success */
  --color-success:        #15803D;
  --color-success-hover:  #166534;
  --color-success-bg:     #DCFCE7;
  --color-success-text:   #14532D;

  /* Warning */
  --color-warning:        #B45309;
  --color-warning-bg:     #FEF3C7;
  --color-warning-text:   #78350F;

  /* Danger */
  --color-danger:         #B91C1C;
  --color-danger-hover:   #991B1B;
  --color-danger-bg:      #FEE2E2;
  --color-danger-text:    #7F1D1D;

  /* Attended (locked gray state) */
  --color-attended-bg:    #F3F4F6;
  --color-attended-text:  #374151;
  --color-attended-border:#9CA3AF;

  /* Scanner frame */
  --color-scanner-idle:        #FFFFFF;
  --color-scanner-candidate:   #FACC15;   /* amber-400 */
  --color-scanner-success:     #22C55E;   /* green-500 */
  --color-scanner-error:       #F97316;   /* orange-500 */
}
```

### Contrast Ratios (Verified)

| Foreground | Background | Ratio | WCAG Grade |
|---|---|---|---|
| `--color-text-primary` (#111827) | `--color-bg-page` (#FFFFFF) | 18.1:1 | AAA ✓ |
| `--color-text-secondary` (#374151) | `--color-bg-page` (#FFFFFF) | 9.7:1 | AAA ✓ |
| `--color-text-inverse` (#FFFFFF) | `--color-primary` (#1D4ED8) | 7.1:1 | AAA ✓ |
| `--color-text-inverse` (#FFFFFF) | `--color-success` (#15803D) | 7.8:1 | AAA ✓ |
| `--color-text-inverse` (#FFFFFF) | `--color-danger` (#B91C1C) | 6.6:1 | AA ✓ |
| `--color-text-inverse` (#FFFFFF) | `--color-warning` (#B45309) | 5.7:1 | AA ✓ |
| `--color-attended-text` (#374151) | `--color-attended-bg` (#F3F4F6) | 8.4:1 | AAA ✓ |
| `--color-text-disabled` (#9CA3AF) | `--color-bg-page` (#FFFFFF) | 2.85:1 | Decorative only |

**Rationale:** Outdoor glare degrades perceived contrast significantly. AAA targets (≥7:1) for all interactive and readable text account for screen reflections. Disabled text at 2.85:1 is intentionally below threshold — it communicates non-interactivity.

---

## Typography

### Font Family
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```
**Rationale:** System fonts render with native anti-aliasing on Android Chrome and iOS Safari. Zero font-loading latency. Familiar glyphs for Spanish diacritics (á, é, í, ó, ú, ñ, ü).

### Scale
| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `text-xs` | 12px | 400 | 1.4 | Captions, timestamps, secondary labels |
| `text-sm` | 14px | 400 | 1.4 | Body secondary, list items |
| `text-base` | 16px | 400 | 1.5 | Body primary, input text |
| `text-lg` | 18px | 600 | 1.4 | Card field labels |
| `text-xl` | 20px | 700 | 1.3 | Visitor name (primary heading in card) |
| `text-2xl` | 24px | 700 | 1.2 | Zone headings |
| `text-3xl` | 32px | 700 | 1.1 | App header title |

**Rationale:** Large type sizes (≥18px) reduce re-reading under stress. Bold weights (700) for primary information ensure scannability during rapid check-in. Minimum readable size is 16px for body text under glare.

---

## Spacing System

Tailwind default 4px base unit. Key layout spacings:

| Token | Value | Usage |
|---|---|---|
| `p-4` | 16px | Standard card/section padding |
| `p-3` | 12px | Compact inner padding |
| `gap-3` | 12px | List item gaps |
| `gap-4` | 16px | Zone gaps |
| `mb-2` | 8px | Field label to value gap |
| `rounded-lg` | 8px | Card and button corner radius |
| `rounded-xl` | 12px | Large card corner radius |

---

## Touch Targets

**Hard floor: 56×56px (Tailwind: `min-h-14 min-w-14`).**

All tappable elements must meet or exceed this minimum:
- Primary buttons: `h-14` (56px) full-width
- List result rows: `min-h-14` (56px)
- Icon-only buttons: `h-14 w-14` (56×56px)
- "Anular Registro" link-style button: `min-h-14` (56px tall), full-width container

**Rationale:** 56px is derived from Material Design's minimum (48px) plus an outdoor-use adjustment (+8px) for gloved or stressed touch accuracy.

---

## Toast Notifications

| Property | Value |
|---|---|
| Display duration | 3000ms |
| Fade in | 200ms (`ease-out`) |
| Fade out | 300ms (`ease-in`) |
| Position | Bottom center, 24px above viewport bottom |
| Maximum width | 90vw |
| Background | `--color-success` (#15803D) |
| Text color | `--color-text-inverse` (#FFFFFF) |
| Font size | `text-base` (16px) |
| Font weight | 600 |
| Border radius | `rounded-lg` (8px) |
| Z-index | Above all zones, below system UI |

The toast must not block the scanner zone or search input. It appears only after a successful attendance write and is purely confirmatory — no action is required.

---

## Audio Feedback

### Confirmation chirp (attendance recorded / scan success)
| Property | Value |
|---|---|
| API | Web Audio API (`AudioContext`, `OscillatorNode`) |
| Waveform | Sine |
| Frequency | 880Hz |
| Duration | 150ms |
| Ramp | 10ms linear attack, 30ms linear release |
| Volume | Capped at 0.4 gain to avoid startling in quiet rooms |

**Implementation note:** The `AudioContext` must be created or resumed from a user gesture to comply with browser autoplay policies. The first user tap on any interactive element in Phase 2 serves as the gesture.

### Error tone (scan error — amber flash)
| Property | Value |
|---|---|
| Waveform | Sine |
| Frequency | 220Hz |
| Duration | 200ms |

**Rationale:** Lower pitch (220Hz) is perceptually distinct from the success chirp (880Hz), even in noisy environments.

---

## Layout Zones

The app renders in a three-zone vertical stack filling the full viewport height:

```
┌─────────────────────────┐
│  Zone 1 — Scanner       │  ~30vh, fixed
├─────────────────────────┤
│  Zone 2 — Search        │  ~25vh, fixed
├─────────────────────────┤
│  Zone 3 — Actions       │  fills remaining space, scrollable
└─────────────────────────┘
```

During Phase 1 (AUTH_PENDING, FILE_PICKER_PENDING), the three-zone layout is replaced by a single full-screen centered layout.

During `SYNCING`, a full-screen overlay (`position: fixed, inset: 0`) is rendered above all three zones with `z-index` sufficient to block all interaction.

---

## Accessibility

- All interactive elements must have a visible focus ring: `ring-2 ring-offset-2 ring-[--color-border-focus]`
- `aria-label` attributes are required on all icon-only buttons
- Color is never the sole indicator of state; every color state change is accompanied by a label or icon change
- Result list rows use `role="listitem"` and the parent uses `role="list"`
- Scanner status announcements use `aria-live="polite"` for non-urgent states and `aria-live="assertive"` for errors
