# Design process

How the failure design of this app is done. Follow it instead of improvising.

Work from generic to specific, like drawing a portrait: the frame and the shapes first, the details last. Perfectionism needs a detail to fix; this order leaves it nowhere to start.

Words used here (step, box, black-box page) belong to this guide, not to [GLOSSARY.md](./GLOSSARY.md), which stays domain-only. Say "step", never "phase": the glossary reserves "phase" for Setup, Attendance and Sync. The "Step 0–6" in [design-v2/index.md](./design-v2/index.md) is the authoring order of that spec, not this guide.

"You" means the owner who decides. "Worker" and "visitor" are the domain terms for the app's end users.

## The five steps

1. **Explore.** Build the Wayfinder map (#3): what is known, what is open, which tickets exist.
2. **High-level overview.** Draw the main components. This is [design-v2/index.md](./design-v2/index.md); no separate file. Each component is a **box**. In scope: Browser DB and Drive Sync. Login/Picker and Scanner/Search are listed, not designed.
3. **Black-box page, per box.** Draw the box and every arrow that crosses its edge. Draw nothing inside. Give each arrow a Type. The result is the box's **black-box page**.
4. **Critical pass, per box.** Run the failure questions on each arrow and decide only the one-way doors. Everything else goes under **Mapped, not decided** with a safe default. This is one pass per box, appended to the same page.
5. **Screens prototype, per box.** A throwaway prototype of the box's screens, after its critical pass. It answers one stated layout question and is discarded afterwards. Not yet specified on the map.

## Rules

- **Finish step 3 for every box before starting any step 4.** A reconcile ticket then checks that the arrows match across pages.
- **An arrow between two boxes appears on both pages.** The reconcile ticket compares the two ends.
- **Questions about the inside of a box wait for step 4.** They do not go on the step-3 page.
- **Every arrow has a Type**, as a column on its table.
- **Critical only.** A one-way door is a decision that is hard to reverse, changes what the worker sees or what counts as an error, or what data is kept or lost. Only these are put to you as questions. Everything else is listed under **Mapped, not decided** with a safe default; the agent does not decide it alone.
- **The agent never guesses at domain meaning.** Where a term is unclear, use the domain-modeling skill and update `GLOSSARY.md`.
- **Time box:** about 15 minutes per box page per step. It is a soft cap, not a gate. Whatever is unanswered goes under **Mapped, not decided**.
- **Screens wait for step 4 of the same box.** Step-4 decisions are recorded in words and never mention UI.

## Arrow Types

| Type | Meaning |
|---|---|
| **Worker action** | The worker taps, scans or types. |
| **Local read/write** | The app reads or writes IndexedDB. |
| **Drive/Sheets call** | A request to the Google Drive or Sheets API. |
| **Sentry event** | An event sent to, or buffered for, Sentry. |
| **Configuration** | A value the box needs before it starts. |

## The failure questions

Ask these of every arrow in step 4.

1. What can fail?
2. How is the failure detected?
3. What state does it leave behind: is data lost, duplicated or half-written?
4. What does the worker see?
5. What is recorded, and where (log, Sentry)? Which fields, and is any of it personal data?
6. Who closes the loop, and how: retry, the worker, or someone reading Sentry?
7. Is the answer a one-way door?

Answers to 1–6 that are not one-way doors go under **Mapped, not decided**.

## The four sides

A step-3 page is organised by the four sides of the box.

| Side | Holds | Question it answers |
|---|---|---|
| **Left** | Upstream: whatever triggers the box, and its reply to it | Who wakes me up? |
| **Right** | Downstream: whatever the box calls | What do I depend on? |
| **Top** | What the box is configured with | What do I need before I start? |
| **Bottom** | What the box leaves behind: records, logs | How does anyone know what happened? |

### Example: the Drive Sync box

It shows the format, not the decided page.

```markdown
# Drive Sync

## Left (upstream)
| Arrow | Type |
|---|---|
| Worker taps "Sincronizar datos con Drive". Reply: success or failure. | Worker action |

## Right (downstream)
| Arrow | Type |
|---|---|
| Write pending sync records to the working copy (`batchUpdate`). | Drive/Sheets call |
| Flush the log to Sentry, before the purge. | Sentry event |

## Top (configuration)
| Arrow | Type |
|---|---|
| Working copy id, from Setup. | Configuration |

## Bottom (left behind)
| Arrow | Type |
|---|---|
| Purge of the visitor and session stores after a confirmed write. | Local read/write |
```

Nothing in it says how a partial write is detected or when the purge may run. Those are step 4.

## Box page layout

After step 4 the page holds, in order: the four sides, **Critical decisions** (one-way doors only, each answering the failure questions for its arrow), and **Mapped, not decided**.

| Item | Why it can wait | Safe default |
|---|---|---|

## Where things live

- **Pages:** `docs/boxes/<box>.md`. Step 3 creates the page; step 4 appends to it. [design-v2/](./design-v2/index.md) only links to the pages.
- **Decisions:** recorded on the box page. Write an ADR in `docs/adr/` only for a decision that is hard to reverse, surprising and a real trade-off.
- **Tickets:** step 3 is `wayfinder:prototype`, step 4 is `wayfinder:grilling`, chores are `wayfinder:task`. Step-4 tickets are blocked by the reconcile ticket.
- **Progress:** map #3 and its closed tickets.

## Order of work for a new part

1. Open the step-3 ticket before any step-4 ticket.
2. Do the step-3 page and reconcile it with its neighbours.
3. Only then open and work the step-4 tickets.
4. Then open the box's step-5 ticket, blocked by its step-4 ticket.
