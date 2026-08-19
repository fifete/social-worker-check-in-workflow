> What this file answers: When and how does Zone 2 execute searches, what is the diacritic-insensitive matching algorithm, what is the result cap, and what does the zone render in each search outcome?

---

## Zone Description
Zone 2 occupies approximately 25% of the viewport below Zone 1. It contains a single text input field and a results list. It is visible and interactive during `ATTENDANCE_PHASE`.

---

## States

### Empty / READY_EMPTY
**Condition:** `input.value.length < 3` or field is blank.

**Visible elements:**
- Search input: placeholder text **"Buscar por nombre o DNI..."**
- No results list rendered

**Behavior:**
- No query executes while input length < 3
- If the worker types 1–2 characters, no results appear and no error is shown (silent threshold)
- If the field is cleared from ≥3 chars back below 3, dispatch `SEARCH_CLEARED` → `READY_EMPTY`

---

### Searching (3+ characters entered)
**Condition:** `input.value.length >= 3` after each `input` event, debounced at **150ms**.

**Behavior:** Execute the matching query against `visitorStore`. See Matching Algorithm below.

---

### No Results
**Condition:** Query returns 0 records.

**Visible elements:**
- Search input (value preserved)
- Label below input: **"Sin resultados"** (`text-sm`, `--color-text-secondary`)

**State event:** `SEARCH_NO_RESULTS` dispatched → `READY_EMPTY` (Zone 3 stays empty).

---

### MULTI_MATCH (2–15 results)
**Condition:** Query returns 2–15 records (or more; see cap rule).

**Visible elements:**
- Search input (value preserved, editable)
- Scrollable results list with up to 15 rows
- Each row:
  - Primary text: `visitorName` (`text-base`, bold)
  - Secondary text: `visitorId` (`text-sm`, `--color-text-secondary`)
  - Minimum height: 56px (`min-h-14`)
  - Tap target: full row width

If the raw query returns more than 15 records, only the first 15 are displayed. No "load more" control exists. A sub-label below the list reads: **"Mostrando los primeros 15 resultados. Sea más específico para filtrar."** (visible only when the raw count exceeds 15).

**State event:** `SEARCH_RESULTS_MULTIPLE` dispatched → `MULTI_MATCH`.

**Interactions:**
- Worker taps a row → `VISITOR_SELECTED` → `CONFIRMED_MATCH`
- Worker updates the input → re-query → re-route

---

### Single Result
**Condition:** Query returns exactly 1 record.

**Behavior:** Auto-select without waiting for user tap. Dispatch `SEARCH_RESULT_SINGLE` with the record → `CONFIRMED_MATCH`.

The results list is not rendered; the transition to Zone 3 is immediate.

---

## 3-Character Threshold Rule
The search query **must not execute** when `input.value.length < 3`. This is enforced to:
1. Avoid returning the entire `visitorStore` on 1–2 character inputs
2. Prevent excessive IndexedDB reads on fast typing
3. Keep the result list meaningful on first render

The threshold is counted on the trimmed input value (leading/trailing whitespace ignored).

---

## 15-Result DOM Cap
The results list never renders more than 15 DOM nodes. This is a hard cap enforced at render time, not at query time. The underlying query may retrieve more records; only the first 15 are passed to the renderer.

**Rationale:** Unlimited DOM growth degrades scroll performance on low-end Android devices. 15 rows at 56px each = 840px, which fits comfortably within the scrollable Zone 3 + 2 height without requiring excessive scrolling.

---

## Matching Algorithm

### Inputs
- Query string: `input.value.trim()` (minimum 3 characters)
- Fields searched: `visitorName`, `visitorId`

### Normalization (applied to both query and record fields before comparison)

```javascript
function normalize(str) {
  return str
    .normalize('NFD')                  // decompose diacritics
    .replace(/[\u0300-\u036f]/g, '')   // strip combining marks
    .toLowerCase()
    .trim()
}
```

This makes the following pairs equivalent:
- `"García"` matches `"garcia"`, `"GARCIA"`, `"García"`
- `"Pérez"` matches `"perez"`, `"PEREZ"`
- `"ñoño"` → normalized to `"nono"` (ñ → n)

### Match rule
A record matches if:

```javascript
normalize(record.visitorName).includes(normalize(query))
  OR
normalize(record.visitorId).includes(normalize(query))
```

This is a **substring match** — the query does not need to be at the start of the field value.

### Sort order
Results are returned in the order they exist in `visitorStore` (insertion order = spreadsheet row order). No re-sorting is applied.

---

## Error Handling

If the IDB query throws at any point:
- Dispatch no state event
- Show inline label below the input: **"Error al buscar. Intente de nuevo."** (`text-sm`, `--color-danger-text`)
- Input remains editable; next keystroke re-attempts the query
