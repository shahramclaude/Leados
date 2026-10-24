# LeadOS — a leadership workspace that keeps its own receipts

LeadOS is a working leadership application for a first-time manager. You enter what
actually happened — the 1:1 you held, the feedback you gave, the goal you set, the
comment someone left in the pulse — and it scores the health of your team from those
records, tells you which single thing to do next, and shows the evidence behind every
claim it makes.

It runs entirely in the browser: no account, no server, no database, no network calls.
Your records are stored in this browser's `localStorage` and can be exported as JSON at
any time.

```
node scripts/serve.mjs        # → http://localhost:5173
```

Or `npm run app`. Node 18+ is the only requirement — there is no build step and no
runtime dependency.

```
npm test                      # 113 tests: domain rules, store, and full UI integration
```

---

## Honest state of this repository

This repository previously contained **four competing, non-runnable applications**
(a Next.js/Postgres tree with 262 pages, a Vite React console, a standalone HTML
console, and a stubbed `src/db` that does not exist). That history is why the docs in
`docs/` describe products that do not exist in this repo. The audit that established
this is in [`docs/AUDIT-2026-10-24.md`](docs/AUDIT-2026-10-24.md); the decision to
stop patching and build one runnable app is in
[`docs/adr/0006-canonical-zero-build-app.md`](docs/adr/0006-canonical-zero-build-app.md).

| Path | Status |
|---|---|
| `index.html`, `app/**` | **Canonical application.** Runs, is tested, is what you are looking at. |
| `scripts/serve.mjs` | Static server for the app (no build, no dependencies). |
| `tests/app/**` | 113 tests run by `node --test`. |
| `public/index.html` | A separate, older single-file console. Preserved as a sandbox, one syntax bug fixed, not the product. |
| `src/**`, root `App.tsx`/`main.tsx`, `drizzle/`, `openapi.yaml` | **Legacy / non-canonical.** Not executed or verified in the latest session. |
| `deprecated/vite-index.html` | The old root Vite entry, kept rather than deleted. |

The legacy React/Next trees were inventoried but not compiled or executed in the latest
session, so this document makes no current error-count or build claim for them. They remain
non-canonical; the runtime and test claims below apply only to `index.html` + `app/**`.

Legacy code is left in place rather than deleted: it is evidence, some of its domain
reasoning was salvaged into `app/`, and removing 139 directories would bury the
history that makes the current design defensible.

---

## What it actually does

### Conversations
- Log a 1:1 as **held, moved or skipped** — a moved 1:1 is a signal, not a blank.
- Cadence is computed per person from real dates: `overdue`, `due`, `never`, with the
  streak of skipped meetings and adherence over the last four.
- **Agenda generation** from the person's live record: overdue actions, stale feedback,
  a goal with no check-in, a review date that has passed. Every suggestion carries its
  reason and can be removed before the meeting.
- Meeting actions have owners and due dates; overdue ones surface on Today.

### Feedback (SBI, not vibes)
- Situation → Behaviour → Impact, validated as you type with a live quality meter.
- Coaching, not blocking: it flags generalisations ("always", "never"), judgement words
  and missing impact, and explains why each weakens the note.
- Praise/constructive balance per person, because "no feedback" and "only criticism"
  are different failures.
- Follow-ups are scheduled and chased.
- `observedOn` is distinct from the conversation date. The 90-day latency average and
  `FB-06` use only real date pairs; missing dates stay **unmeasured**, never 0 days. The
  latency convention is configurable, and existing dates can be corrected in the UI.

### Goals (OKR-shaped)
- Objectives with measurable key results; progress is computed, never typed in.
- **Expected progress at today's date** is computed from the elapsed share of the
  window, so "behind pace" is arithmetic rather than opinion.
- A goal with no key results is reported as *unmeasured*, never as 0% — the two are
  different facts and conflating them is how reporting lies.
- Check-ins capture a note, a confidence and the current numbers. A stated "on track"
  that contradicts the pace is called out explicitly.
- Team-level goals (no single owner) get the same checks.
- Person-owned goals record **co-authored / explicitly leader-set / unknown**. Unknown is
  not inferred as leader-set. `GOAL-06` fires only on an explicit leader-set record, and
  the edit dialog corrects authorship without replacing key results or check-in history.

### Delegation (outcome + authority + follow-through)
- Delegate one outcome to one owner with a concrete expected result, due date, support and
  one of four explicit decision boundaries: recommend, agree first, act-and-inform, or own.
- Dated check-ins record on-track/blocked progress and notes. Overdue, blocked and checkpoint-
  due states stay distinct; `DEL-01`…`DEL-03` turn them into actions, and suggested 1:1 agendas
  include the outcome that needs attention.
- Completion requires the delivered result; “accept back” explicitly returns accountability to
  the leader with a reason and next step. Closed records stay read-only in the UI as history.
- Delegations persist, export/import, appear in review evidence and person pages, and are removed
  safely with demo data. No backend, reassignment automation or notification promise is implied.

### Growth (GROW) and succession
- Plans are scored on how far down **G**oal → **R**eality → **O**ptions → **W**ill they
  actually got; a plan with no dated commitment is reported as a hope, not a plan.
- Competency coverage across the team, including which capabilities nobody is developing.
- Succession readiness is **evidence-gated**: a "ready now" claim with no recent
  feedback, no growth evidence and no conversation history is flagged as unsupported
  rather than believed.

### Performance reviews (evidence packet + calibration)
- Prepare a draft for a person and an inclusive date period. The packet assembles dated
  1:1s, manager-to-person feedback, goal check-ins, development activity and recognition,
  oldest first, with delegation outcomes and a working link back to every source record.
  Feedback excerpts include observation-to-conversation latency; goals include authorship.
- Four employee self-reflection prompts and three forward/backward-looking manager prompts
  keep the person's context separate from the assessment. There is no employee self-rating;
  the optional manager rating uses four behaviour-anchored labels.
- Seven explicit calibration checks (`CAL-01`…`CAL-07`) challenge thin evidence, recency
  concentration, unsupported high/low ratings, thin rating narratives and one-sided evidence.
  They are review prompts, not an automated fairness judgement or a generated score.
- Current goal, development and delegation status/authority values are labelled **at capture**.
  Completion recaptures and freezes the evidence snapshot; reopening and refreshing are separate,
  audited actions.
- Print/save-PDF uses the browser's print dialog and a document-style print layout. Reviews
  are included in schema-v2/v3 migrations, local persistence, JSON export/import and demo cleanup.

### Team pulse (anonymous, with a real privacy floor)
- Four dimensions: psychological safety, clarity, sustainable workload, growth.
- **No aggregate is shown below 5 responses** (the published default at Culture Amp and
  15Five; 3 is the weakest floor in the market). Suppression is a first-class state, not
  an empty chart.
- **Identical answers are also suppressed**: if every response is the same, the average
  *is* each person's answer, so the group size does not protect anyone.
- Comments obey the same floor and are stored with no person attached. Anonymous
  responses have no `personId` field at all, and the schema normaliser strips one if it
  appears in a hand-edited import.
- Windows are computed on calendar days, so a response cannot land in two fortnights
  and produce a fake "change" figure.

### Decisions (DACI)
- Every decision records driver, approver, contributors, informed, reversibility, the
  options considered and the rationale *before* the outcome is known.
- Open decisions that have gone quiet, and reviews whose date has passed, are surfaced.
- Outcomes are reviewed later, in public, against the rationale that was written down.

### The signal engine
- 38 rule families (`CONV-*`, `FB-*`, `GOAL-*`, `DEL-*`, `GROW-*`, `ONB-*`, `PULSE-*`, `DEC-*`,
  `REC-*`, `SUCC-*`, `READY-*`, `TEAM-*`) over your records, each producing a severity,
  a confidence, the evidence that triggered it and exactly one next action.
- Findings are banded by urgency, and a rule that fires for more than three people
  collapses into one line that still names everyone — a forty-person roster produces a
  readable page, not a wall.
- Nothing is fabricated: every number traces to a record you entered. The demo
  workspace is the single exception, is labelled `DEMO` everywhere, and refuses to
  overwrite real records without an explicit confirmation.

### Data
- Versioned schema (currently **v3**, with tested v1→v2→v3 migrations),
  normalisation on load, and a quarantine path: a corrupt blob opens an empty workspace with an explanation and the
  raw text kept, rather than a blank screen or a crash.
- Append-oriented event log (capped at 600 entries, retained during demo cleanup) records what changed and when.
- Export/import JSON round-trips through a validation and migration pass.
- Storage failures (quota, private mode) surface as a warning in Settings instead of
  silently losing writes.

### Accessibility
- Skip link, landmark structure, `aria-current` navigation, focus-trapped dialogs with
  Escape and focus restoration, `aria-live` for async results, visible focus rings,
  AA contrast on every token pairing, reduced-motion and print stylesheets, and a
  responsive layout down to 360 px.

---

## How it is built

```
index.html              shell only: landmarks, nav containers, modal/toast roots
app/main.js             router, context, shell rendering, error boundary
app/core/               pure domain: time, schema, store, demo, domain/*
app/actions.js          every write, DOM-free, returns {ok,error,field}
app/ui/                 dom, components, charts, modals, options
app/views/              one renderer per route
tests/app/              node:test — domain, store, and jsdom integration
```

Rules the code holds itself to:

1. **Domain logic is pure and testable without a DOM.** Scoring never reads `Date.now()`
   or `localStorage`; the clock and storage are injected.
2. **Views render, actions mutate.** A view never writes to the store directly.
3. **No fake data outside `app/core/demo.js`**, which is labelled as demo in the data
   model, the top bar and Settings.
4. **Unmeasured is not zero.** A dimension with no records returns `null` and is
   excluded from the weighted mean; it never contributes a zero.
5. **Every insight has an evidence line and an action.** A finding that cannot name what
   triggered it is a bug, not a feature.

Scoring in one paragraph: five dimensions — cadence, feedback, clarity, growth,
wellbeing — each scored 0–100 from records, weighted (feedback and clarity highest),
with `null` dimensions removed and the remaining weights renormalised. The result is
graded A–E and compared with the same calculation run over the record set truncated to
30 days ago. That comparison is only shown when there is history older than 30 days;
otherwise it says so rather than inventing a baseline.

---

## Known limitations (stated, not hidden)

- **Single leader, single workspace.** No multi-manager or org hierarchy, no sharing;
  data lives in one browser profile. Export is the only transfer mechanism.
- **localStorage is not a backup.** It is per-profile and per-origin; clearing site data
  deletes everything. The app pushes you to export, but does not do it for you.
- **Trend needs history.** Health trends and pulse trends require records older than
  their window; before that they render "not enough history" rather than a line.
- **Cadences are defaults, not universal scores.** Evidence favours timely, meaningful
  feedback (see `RESEARCH.md`); the feedback target defaults to 21 days, while observation-
  to-conversation and delegation-check-in conventions default to 7 days. All are configurable;
  the 7-day values are team conventions, not research-validated cutoffs.
- **No notifications.** There is no background scheduler in a browser tab; the app can
  only tell you what is due when you open it.
- **Review evidence is not a complete HR system of record.** It can only use what was logged;
  goal/development values and delegation status/authority are capture-time snapshots, not
  reconstructed period-end history. Self-reflection is entered into this local workspace by
  the manager, not submitted through an employee account. Calibration warnings are transparent
  heuristics, not proof of fairness. Real-browser visual inspection of review print and the
  new delegation layout remains `[UNVERIFIED]`; jsdom workflows and HTTP module loading are tested.
- **Legacy dependency advisories remain.** `npm audit --omit=dev` reports 1 critical and 2 high
  advisories in the unused legacy Next.js/PostCSS/Sharp chain. The canonical app loads none of
  those packages; no forced major upgrade was applied in the review-packet session.
- **Pulse anonymity is honoured in the data model, not against a determined observer.**
  With a very small team, a comment's writing style can still identify someone; the
  floor reduces the risk and the copy says so.
- **The legacy trees are dead weight.** They are documented as such, not repaired.

## Documentation

- [`ROADMAP.md`](ROADMAP.md) — what exists, what is next, what was rejected and why.
- [`RESEARCH.md`](RESEARCH.md) — the leadership frameworks and evidence behind the rules.
- [`docs/AUDIT-2026-10-24.md`](docs/AUDIT-2026-10-24.md) — the audit that started this.
- [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md) — session-by-session record, including
  corrections to earlier claims.
