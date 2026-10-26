# LeadOS — a leadership workspace that keeps its own receipts

LeadOS helps a first-time manager turn real conversations, feedback, goals and commitments
into evidence-linked next steps. Its team-health indicator is an explainable heuristic over
those records, not an objective leadership grade or a substitute for listening to people.

The **canonical application is `index.html` + `app/**`**. It runs in your browser with no
account, application backend, database or runtime package dependency. The static server
only serves files; app records stay in this browser's `localStorage` unless you explicitly
export them. **Optional passphrase encryption** can seal that stored copy (Settings → Protect
this browser copy). Exports are separate files and stay unencrypted unless you choose
*Create encrypted backup*; a lost passphrase cannot be recovered by anyone.

```sh
node scripts/serve.mjs --host 0.0.0.0 --port 5173
# or: npm run app
# Open http://localhost:5173
```

Node 18+ can serve the application; there is no build or dependency install required to run
it. For the test tooling, use Node 22+ (verified with Node 22.22.3):

```sh
npm ci --no-audit --no-fund
npm run verify:canonical     # ESLint + ADR-0007 boundary gate + docs link gate + 457 automated tests across 37 suites
```

## Honest state of this repository

This checkout also contains older React/Next.js applications, consoles, database code and
large historical documents. Their presence is not evidence that those products run. Per
**[ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md)**, they are quarantined as a frozen
historical archive in place, **not rebuilt or deleted**, and enforced via `npm run check:boundary`
so zero canonical `app/**` modules can ever import from them.

| Path | Current status |
|---|---|
| `index.html`, `app/**` | **Canonical product:** 76 native JavaScript modules, CSS and shell; Schema v22; tested below. |
| `scripts/serve.mjs`, `scripts/check-canonical-boundary.mjs`, `scripts/check-docs-links.mjs` | Dependency-free static server + canonical boundary and documentation link gates. |
| `tests/app/**` | Canonical automated suite (`457` tests across `37` suites), run by `npm test` / `npm run verify:canonical`. |
| `scripts/app-browser-smoke.mjs`, `scripts/app-onboarding-smoke.mjs`, `scripts/app-manager-support-smoke.mjs` | Optional real-Chromium lifecycle/mobile/accessibility checks; Session 29 also ran a full Chromium `143.0.7499.0` WCAG 2.1 AA + `1440px`/`390px`/`320px` reflow audit across 11 routes and 4 modals ([validation report](docs/VALIDATION-2026-10-25-session-29.md)). |
| `public/index.html` | Quarantined older synthetic-data console (ADR-0007), not the product; runtime status **[UNVERIFIED]**. |
| `src/**`, root React files, `drizzle/`, `openapi.yaml` | Quarantined frozen historical archive (ADR-0007); current builds, security and workflows **[UNVERIFIED]**. |
| `deprecated/vite-index.html` | Quarantined old Vite entry (ADR-0007). |

**Correction to earlier documentation:** `src/db/` exists. It contains a PostgreSQL/Drizzle
client, schema and repositories; `src/app/page.tsx` is a PostgreSQL starter page. Claims that
the data layer is absent were wrong. The starting checkout contained 3,650 tracked files,
3,495 source files and 316,352 source lines. All source was scanned for inventory/imports;
that is **not** personal line-by-line verification of the whole legacy tree. Historical
TypeScript error counts were not rerun. See the latest focused
[capacity, flow & portfolio allocation audit](docs/AUDIT-2026-10-25-session-24.md),
the [cross-domain operational cases & automation audit](docs/AUDIT-2026-10-25-session-23.md),
the [inline error accessibility audit](docs/AUDIT-2026-10-25-session-22.md), the previous
[browser validation audit](docs/AUDIT-2026-10-25-session-21.md), the earlier
[architecture inventory](docs/AUDIT-2026-10-25-session-17.md), and the corrected
[architecture decision](docs/adr/0006-canonical-zero-build-app.md).

## What it actually does

### Conversations and feedback

- Log a 1:1 as held, moved or skipped; compute cadence, cancellation streaks and adherence
  from real dates. Generate editable agenda suggestions with a reason for each item, pre-check
  the top items inside the *Log a 1:1* dialog so you can check/uncheck what was actually
  covered, and automatically exclude retired or dropped GROW commitments.
- Build a **printable, shareable one-meeting prep sheet** (`#/prep/<personId>`): the topics the
  person has asked to raise, the generated agenda with reasons, every open commitment grouped
  by source (past-1:1 actions, 30-60-90 onboarding / transition / re-boarding checkpoints,
  feedback follow-ups, development actions, delegation checkpoints), what happened since you
  last spoke, outcomes at risk, and a notes area. Check or uncheck employee topics and agenda
  suggestions directly on the prep sheet and click **Log the 1:1** to carry your exact selection
  into *Log a 1:1* with true agenda provenance (`their-topic`, `delegation`, `onboarding`, etc.) —
  clearing covered employee topics only when a `held` 1:1 is saved while keeping uncovered ones
  queued for next time. Confidential conflict records and anonymous pulse answers are excluded by
  construction and named on the sheet.
- Execute **30-60-90 check-ins from Today**: overdue and next-seven-day phase conversations
  across onboarding, internal transitions and return-to-work plans, ordered by due date.
  Today shows the four oldest conversations and an explicit link to the full **Check-ins due**
  queue (`#/onboarding?status=checkins`). Log the two-way conversation in place; cancelling
  changes nothing, saving removes only that phase from the queue, and checkpoints/other phases
  remain untouched. **Open plan** follows the exact plan (`?plan=<id>`), including a completed
  plan rather than silently substituting a newer plan for the same person. The seven-day
  look-ahead is a fixed interface convention, not a validated deadline or a notification service.
- After a Day 30/60/90 conversation is actually recorded, add an **explicit, dated manager-owned
  follow-up** for the concrete action you will take. The task keeps the exact check-in ID, plan,
  phase and date; it is separate from candid blockers, never copied into performance-review
  evidence, and never housed in a synthetic 1:1. The shared 1:1 commitment board shows it as
  yours to do, and a later real held 1:1 can mark it done, carry it forward with a date, or drop
  it. The source phase/date survives carries and is included in the commitments CSV.
- Run structured **30-60-90 onboarding, role-transition & return-to-work ("re-boarding")
  scaffolding** (`#/onboarding`, `Schema v14`): written role clarity, peer buddy assignment,
  stakeholder introduction tracking (`met`/`metOn`), a scoped early win, editable checkpoints
  across Day 30 / Day 60 / Day 90 horizons, and dated two-way phase check-in conversations. New
  joiners get the onboarding template; a tenured person promoted or moved into a new scope gets
  a labelled **role-transition** plan (old-role handover inventory, written scope/authority
  delta, first early win in the new seat, 60-day old-habits calibration); and a person returning
  from extended leave gets a **return-to-work (`reboarding`)** plan (what changed while away,
  agreed 4-week load pacing, peer catch-up buddy, key re-connections) with explicit guidance
  never to record medical or personal leave reasons. Transition and return-to-work plans anchor
  to day one of the new phase — `person.startDate`, `person.role` and tenure are never
  rewritten. Missing scaffolding is flagged on the manager (`ONB-02`…`ONB-05`), never as a
  personality or performance grade on the person, and 30-60-90 check-ins are kept out of
  performance review packets so people in a new phase can raise confusion safely.
- **Record who owes each promise, and see your own debts** (`Schema v8`): every 1:1 action
  carries an owner — *they* do it, *you* do it, or *both* of you — or is explicitly left
  unrecorded, which the board counts rather than guessing. Promises you own appear in a private
  **"What you owe"** card on Today, in an "I owe" stat and an inline owner column on the 1:1
  board, and in `CONV-07` once one is overdue. A promise that is carried forward keeps its owner;
  reassigning one is a separate, logged action, and closed promises cannot be rewritten.
- **Reconcile last time's promises when you log the next 1:1** (`Schema v7`): every open
  commitment appears with how long it has been alive and how often it has moved, and the leader
  records an explicit outcome — done in this conversation, still open, carried forward with a new
  date, or dropped with a reason. Nothing is carried automatically, the original keeps a link to
  its successor, and a broken or cyclic chain is repaired by reopening the promise rather than
  losing it. Carried promises show on the 1:1 board, the person page, the prep sheet, the CSV
  export and signal `CONV-06` once the same promise has survived two conversations.
- Capture owned, dated meeting actions; overdue commitments surface on Today.
- Record Situation → Behaviour → Impact feedback with a live, non-blocking specificity coach.
  Track praise/constructive balance and follow-up dates without imposing a target ratio.
- Store observation and conversation dates separately. Unknown observation dates stay
  unmeasured, not zero-day feedback; date corrections preserve the original note.

### Goals, delegation, development and succession

- Goals have key results, computed progress, confidence and dated check-ins. A goal with no
  measurable results is unmeasured, not 0%. Authorship is co-authored, explicitly leader-set
  or unknown; unknown does not trigger the leader-set warning.
- Delegate an outcome with one accountable owner, expected result, resources/support, dates
  and explicit decision authority: recommend, agree first, act-and-inform or own.
- Check in, record blocks, complete with the delivered result, or explicitly accept the work
  back with a reason and next step. Closed delegations retain their history. Stretch delegations
  hand off in one click (**Add to GROW** / **Start GROW plan**, `Schema v12`) into an explicitly
  linked GROW commitment (`delegationId`) that survives carry-forwards, links bidirectionally
  across `#/delegations`, `#/growth`, `#/people/<id>`, CSV exports and `Hold review`, and prompts
  explicit coaching reflection when the delegation completes or returns — never silently closing
  the GROW commitment on your behalf.
- Today now shows an executable **delegation follow-through** queue for blocked work, overdue
  outcomes, missing due dates and stale check-ins. Record a check-in or explicitly complete the
  outcome directly from the queue; the existing validated dialogs/events are reused, and marking
  work on track does not complete it. The full queue opens `#/delegations?filter=attention`.
  Items are ordered for leader support, not to score or rank the owner; the configured check-in
  cadence is a team convention, and no reminder is sent.
- GROW plans separate Goal, Reality, Options and Will. A plan without a dated commitment is
  reported as incomplete, not treated as progress. Show competency coverage across the team.
- **Development commitments follow the same ledger as 1:1 promises** (`Schema v9`): each one can be
  closed in a recorded review, **carried forward** with a new date — the original stays in the plan
  history and "carried 2× since 14 Sep" is derived from the chain, never stored as a counter — or
  **dropped with a mandatory reason**. Dropped is never counted as done, and a dropped or carried
  version leaves the completion denominator, so moving a date cannot look like progress.
- **A review is a record, not a date edit.** *Hold review* captures when it happened, what was
  discussed, the outcome for every live commitment and the next date you agreed — and Today's
  **Development reviews** queue (`#/today`) surfaces overdue, due-within-7-days and unscheduled
  GROW reviews with an inline *Hold review* button so you can settle commitments without hunting
  through another screen. Pushing the review date without holding one increments a deferral
  counter instead of silently rescheduling: `GROW-07` fires at two deferrals, and `GROW-06`
  fires when one commitment has been carried twice. A closed or moved commitment is kept in an
  expandable record with its dates and reason.
- Succession readiness challenges unsupported claims using recorded development, feedback and
  conversation evidence (`#/readiness`), stores optional development-gap & stretch notes per
  seat, and wires a one-click **Start transition** handoff (from `#/readiness` or `#/people/<id>`)
  directly into a pre-filled `role-transition` 30-60-90 plan showing the candidate's readiness
  status and notes as context — without fabricating `roleClarity` or overwriting roster titles.

### Performance reviews

- Assemble an evidence packet for a person and inclusive period: dated 1:1s, feedback,
  goal check-ins, development, recognition and delegation outcomes with source links.
- Keep four self-reflection prompts separate from three manager-assessment prompts and an
  optional behaviour-anchored rating. Reflection is manager-entered, not independently
  submitted by an employee account.
- Seven calibration checks challenge thin, recent-only, one-sided or unsupported assessments.
  These are transparent prompts, not proof of fairness or an automated performance score.
- Completion recaptures and freezes evidence; reopening and refreshing are separate audited
  actions. Current goal/development/delegation values are labelled **at capture**, not falsely
  reconstructed at period end. Browser print/save-PDF is wired; visual print output remains
  **[UNVERIFIED]** in this session.
- A completed packet offers an explicit choice to open a goal or GROW form. The review's
  development focus is editable draft text; a goal still needs a measurable key result, and a
  GROW plan still needs a newly written Will commitment. Review next steps are shown as a
  discussion prompt, never copied into commitments. Each created record retains a validated
  `sourceReviewId`, links back to the packet in the UI and CSV, and remains blank on legacy records
  (`Schema v13`). Completing a review creates nothing by itself.

### Conflict resolution — a working record, not an HR case system

- Start with a neutral situation, coordinator and follow-up date; hear 2–8 participants'
  perspectives and underlying interests, including people outside your roster.
- Participation is unknown, willing or declined. Unknown is never consent. Informal
  agreement requires an explicitly appropriate route, everyone willing/heard, and recorded
  process and information-sharing limits.
- Record an explicitly confirmed agreement and 1–12 owned, observable, dated commitments.
  Keep agreement versions and the context captured with each one.
- Record real results, then an all-party follow-up that checks those results. An agreement
  is **not** resolution; an earlier same-day check cannot verify results recorded later.
- Close only when current-context commitments and verification support it. Reopening keeps
  history and requires a fresh check; materially changed context requires a new agreement.
- For serious/uncertain matters, record the qualified support contact and next check date.
  **A support handoff sends nothing and is not resolution.** The manager must contact the
  appropriate person; the app is not a mediator, investigation or emergency service.
- Private case content is excluded from generated 1:1 agendas, person timelines, readiness,
  health scoring and performance-review evidence. General reminders use counts/status only.
  This is exposure minimisation, **not access control**: full JSON backups include the notes.

### Team pulse

- Four dimensions: psychological safety, clarity, sustainable workload and growth.
- Default reporting floor is **5 complete responses**; supported settings are 3–25.
  Aggregate, dimension means and weekly trend use the **same complete four-answer cohort**.
  Partial responses cannot supply a misleading privacy floor or distort released means.
- Suppress the entire vector when any dimension, or each response's overall mean, is
  identical across the cohort. Otherwise overall/other means could reveal a suppressed
  dimension by subtraction. Future responses are excluded from current windows.
- Comments need their **own** minimum number of nonempty, varied comments. Score-response
  count alone does not release a lone comment. Suppressed comparisons stay null, not zero.
- Anonymous records store `personId: null`; imports strip an identity value. The local app
  cannot verify independent respondents or guarantee anonymity against a determined observer.
  Writing style and someone with access to the browser/export can still identify people.

### Decisions, recognition and next steps

- DACI decisions capture roles, reversibility, options and rationale, support audited edits when
  governance metadata changes (`DEC-03`), deep-link directly from `DEC-01`/`DEC-03` signals via
  `#/decisions?decision=<id>`, surface token-matched DACI involvement on `#/people/<id>`, and
  feed Today's actionable **Decision reviews** queue (`#/today`) with inline *Review outcome*
  settlement (guarding undecided choices out of `reviewsDue` and rewinding post-snapshot reviews
  in historical trends).
- Recognition records real contributions; drought prompts use logged dates.
- **46 deterministic signal rules**, including `ONB-01`…`ONB-05`, `CFL-01`…`CFL-04`, `GROW-06` and
  `GROW-07`, produce
  evidence, urgency and one next action. Similar person findings roll up rather than flooding the
  page. Conflict reminders never include case titles, names or notes and work without a roster.
- Optional demo data is clearly labelled. The demo refuses to replace real records without
  confirmation, including workspaces containing only delegations or conflict records.

### Optional passphrase encryption of the browser copy

- Turn it on in **Settings → Protect this browser copy**. The stored blob becomes a versioned
  envelope: PBKDF2-HMAC-SHA-256 (600,000 rounds, random 16-byte salt) derives an AES-256-GCM
  key from your passphrase; every write gets a fresh 96-bit IV. The passphrase is never stored,
  and the key never leaves the tab.
- **Plaintext → encrypted is verified before it overwrites anything:** derive, encrypt,
  decrypt, compare, then write. If any step fails the workspace stays plain text and says so.
- A reload shows a **lock screen** and nothing else: no navigation, no records, no half-loaded
  state. A failed attempt reports the failure and leaves the stored ciphertext byte-identical.
- While locked, **every write path is refused** — including imports, demo loading, reset and CSV
  export — so nothing can replace the only copy of the ciphertext. `Export JSON` in that state
  hands back the untouched encrypted file rather than an empty workspace.
- **Change passphrase** re-keys with a new salt (the old passphrase stops working), **Lock now**
  discards the key after flushing pending writes, and **Turn off encryption** writes plain text
  again only after the write succeeds.
- **Idle auto-lock:** an unlocked, encrypted workspace locks itself after a configurable window of
  inactivity (default 30 minutes, 0 = off, set in Settings). It warns first with a non-destructive
  "keep working or lock now?" prompt and locks automatically after one minute, so an unattended
  unlocked tab cannot leave your notes readable. The lock is recorded in the event log.
- **Encrypted backups:** `Export encrypted JSON` produces a portable envelope for the same
  passphrase (or a new one if the workspace is not encrypted). `Import JSON` accepts both
  plain-text and encrypted files; an encrypted import into a plain workspace is explicitly
  disclosed as a downgrade, and restoring an encrypted backup into a lock screen keeps the
  workspace encrypted.
- **Limits stated in the UI, not only here:** no recovery key, no reset link, no account; a lost
  passphrase means the encrypted copy cannot be opened. Encryption protects a copied profile or
  backup file, not a browser someone can already use while the workspace is unlocked. CSV and
  plain-text JSON exports remain unencrypted. Web Crypto requires a secure context — over plain
  HTTP on a LAN address the lock screen says so before you type a passphrase.
- Envelope headers (KDF name, rounds, salt, purpose) are bound into the GCM additional
  authenticated data, so tampering with them fails authentication instead of silently weakening
  the file; a foreign envelope asking for more than 2,000,000 rounds is refused rather than
  burning the CPU.

### Cross-domain operational cases & parallel rules automation (`#/cases`, `Schema v15`)

- Register an **Operational Case** (`incident`, `risk`, `escalation`, or `initiative`) on `#/cases`
  or escalate directly from an active **Goal**, **Delegation**, or **Decision**.
- Model each case across seven connected disciplines:
  - **Engineering FMEA (`computeFmea`):** Severity × Probability × Detection RPN (`1..1000`),
    **AIAG-VDA (2019) Action Priority** (elevating Severity 9–10 failure modes even when RPN is
    modest), and post-mitigation residual RPN reduction %.
  - **Math/Statistics & Finance (`computePertImpact`):** Three-point Beta-PERT financial cost and
    diverted team-capacity days ($\mu = \frac{O + 4M + P}{6}$, $\sigma = \frac{P - O}{6}$,
    $P_{10}..P_{90}$), expected unmitigated vs residual loss, net risk-adjusted value, mitigation
    ROI multiple, and explicit opportunity cost.
  - **Production / Safety Science (`evaluateRca`):** Structured **Toyota 5-Whys** causal chain,
    **Reason Swiss-Cheese** missing systemic barrier, preventive action, and an automatic warning
    when text blames an individual without naming a process guardrail.
  - **Political Science (`summarizeStakeholderCoalition`):** **Mendelow Power × Interest**
    stakeholder matrix (*Manage closely*, *Keep satisfied*, *Keep informed*, *Monitor*), stance
    tracking (`champion` → `blocker`), and scheduled briefing checkpoints.
- **Event-driven parallel cross-module propagation (`app/core/domain/automation.js`):** saving or
  updating a case (previewed live inside the dialog before saving) evaluates deterministic,
  idempotent rules inside a single atomic store transaction to simultaneously:
  1. Schedule stakeholder coalition cadences (`RULE-STAKE-01`),
  2. Create & link a PERT-backed **DACI Decision** (`RULE-DEC-01`),
  3. Create & link an accountable **Mitigation Delegation** with calibrated authority (`RULE-DEL-01`),
  4. Append a risk check-in & adjust confidence on the impacted **Goal** (`RULE-GOAL-01`), and
  5. Queue blameless support & barrier talking points into **1:1 agendas & printable prep sheets**
     (`RULE-COACH-01`) — strictly excluded from performance-review rating evidence and isolated
     from confidential `conflicts` and anonymous `pulses`.
- **Closed-loop feedback:** completing linked mitigation delegations automatically transitions an
  open/mitigating case to **Monitoring** (`RULE-SYNC-DEL-01`), and resolving the case records
  residual FMEA verification while appending a resolution check-in on the linked goal.

### Capacity, flow & portfolio allocation (`#/capacity`, `Schema v16`)

The operating-plan layer. Goals, delegations, cases and 30-60-90 plans record *intent*; this is
the only screen that answers "given the people I actually have, what can we commit to, what has
to give, and how confident should I be in that date?" It applies four disciplines to the same
records:

- **Operations research — capacity supply.** Focused hours per person ÷ an 8-hour day × the
  planning horizon, reduced by an explicit **transition ramp** (active 30-60-90 plan: 0.45 in the
  first month, 0.75 while ramping, 0.8 in a role transition, 0.7 on return-to-work) and by a
  configurable **operational reserve** (default 20%) for interrupts and support. Headcount is
  never used as capacity.
- **Queueing theory — what utilisation actually costs.** **Little's Law** (WIP = throughput ×
  cycle time; Little, 1961) and **Kingman's diffusion approximation** give a queue-delay
  multiplier from utilisation, so 86% committed is shown as *≈7× service time spent waiting*
  rather than as a reassuring percentage. Throughput is measured from delivered items only, and
  the app refuses to state a rate from a single completion.
- **Economics & finance — allocation under scarcity.** Each item carries a three-point
  **Beta-PERT** effort and value estimate; ranking uses **value density** (expected value ÷
  expected person-days), the funding boundary is marginal (the next item that fits, and the first
  one that does not), and an over-committed plan names the **lowest-value committed work to
  release first** instead of the newest or least popular.
- **Statistics — a date range, not a promise.** Independent PERT variances are additive, so the
  funded portfolio produces **P50/P80/P90** completion dates and **cumulative** target-date risk
  (each target is judged against all work due by then, not against that item alone).

**Parallel cross-module automation (Schema v16):**

1. **`RULE-CAP-01` — capacity reserve registration.** Registering a case with a capacity estimate
   creates a committed reserve entry in the plan (dated from the case, linked `consumes-capacity`);
   editing the estimate updates that same record in place; resolving the case **releases** the
   capacity; reopening it reinstates the reserve. No second data entry, no duplicate.
2. **`RULE-CAP-02` — over-allocation trade-off decision.** When committed work exceeds allocatable
   capacity, exactly one **DACI decision** is opened (never more than one while it is unanswered)
   containing the real numbers and concrete options: defer the lowest-value item, cut the next
   one, accept the queue delay, or stop starting unfunded work.
3. **`RULE-CAP-03` — funding decision → goal impact.** Deferring or cutting goal-backed work
   writes an explainable check-in on that goal and, if it was on track, moves it to at risk;
   re-funding writes the follow-up. A capacity decision can never be silently detached from the
   objective it starves.
4. **`RULE-CAP-04` — delegation completion → portfolio delivery.** When a plan item is explicitly
   linked to an active delegation, recording its verified completion marks that item delivered on
   the same date, keeps the typed graph edge, writes an automation audit event and removes its work
   from committed capacity. Returned delegations do not trigger this rule; the engine does not
   mistake reassignment for delivery. A closed delegation cannot be used to create new open plan
   demand. **Sync rules** also repairs existing completed-delegation links from older workspace
   state; it is safe and idempotent to run again.
5. **`RULE-CAP-06` — settled case capacity calibration → portfolio.** After at least five cases
   have recorded actual diverted days and the median actual/forecast ratio is at least 1.25×,
   settling or backfilling a case automatically refreshes every open case reserve in the same
   transaction. Normal-priority cases use the observed median; high-priority cases use the
   observed P80. The reserve (not the case estimate) receives the contingency, then capacity
   trade-off and seeded Monte Carlo tail-risk rules re-run. The live case dialog previews the
   adjustment and sample size. The frozen opening estimate is unchanged for honest later scoring;
   below n=5 or below the 25% threshold there is no automatic uplift. This is a local reference
   class, not a validated universal coefficient or external benchmark.

Signals `CAP-01`–`CAP-05` report utilisation, queue delay/WIP breaches, undecided demand, missing
effort estimates and unachievable target dates. A **`portfolio`** CSV scope (19 total, with `hiring`) exports the
whole ledger with derived PERT values and value density, formula-injection safe.

### Selection & hiring (`#/hiring`, `Schema v17`)

Hiring is the highest-leverage decision most managers make and the one they get the least training
for, so LeadOS models it as a measurement problem with a decision at the end rather than a pipeline
with a score. A **requisition** records what the role must be able to do, who will interview, and
(optionally) the interview effort it will consume. A **candidate** record holds the evidence
collected and the decision — and nothing about protected characteristics.

- **Industrial/organisational psychology — the method determines the weight.** Each observation is
  tagged with the method used, and methods carry the validity coefficients from **Sackett, Zhang,
  Berry & Lievens (2022)**, the re-analysis that corrected decades of range-restriction
  overcorrection: structured interviews `.42`, job-knowledge tests `.40`, work samples `.33`,
  cognitive ability `.31`, unstructured conversations `.19`, years of experience `.07`. (Schmidt &
  Hunter's 1998 table is the better-known predecessor and is higher on every method — work samples
  were `.54` and ranked first; the 2022 revision puts structured interviews first. Using the newer,
  lower numbers is the conservative choice, and it changed one product claim: the app no longer
  calls a work sample the strongest available signal.) A 5/5 structured interview moves the estimate
  by at most `.42`, which is exactly why one conversation cannot decide anything.
- **Statistics — combined in log-odds, discounted when correlated.** Evidence is summed on the
  log-odds scale and converted back once. A repeated rating of the same competency by a different
  interviewer counts half; by the same interviewer, a quarter — so five unstructured chats with one
  manager never masquerade as five independent signals. A 3/5 rating is genuinely neutral and moves
  the estimate not at all. Rater disagreement of three or more points on one competency is
  **surfaced, not averaged away**: the app says to run a work sample or a calibration conversation.
- **Decision science — the falsification test.** Every assessment states how many further strong
  observations at the opposite extreme would move the estimate across the 50% line. The estimate is
  labelled decision support, never a prediction, and the offer gate is described as a convention
  (evidence weight ≥ `0.50`, at least two methods, all required competencies covered) rather than a
  validated cutoff.
- **Economics — the vacancy is never free.** The funnel tracks stage counts and conversion rates;
  a **cost of vacancy** is reported only from a daily figure the leader recorded. If none is
  recorded the app says the delay is unpriced rather than deriving one from a salary band. Cycle
  time is withheld below two completed hires, the same small-sample discipline as the flow metrics.
- **Process fairness without protected data.** No attribute is stored, so the check made is
  procedural: the same competencies assessed for everyone who reached the same stage. A rejection
  resting on less evidence than the process promised is allowed only with an explicit, recorded
  acknowledgement — the same gate as an offer made on thin evidence.

**Parallel cross-module automation (Schema v17):**

1. **`RULE-HIRE-01` — interview effort becomes committed capacity.** An active requisition with a
   recorded three-point effort estimate creates a `hiring`-kind entry in the operating plan
   (`consumes-capacity`, funded, value deliberately unmeasured), refreshed in place when the
   estimate or target changes, **completed as delivered** when the seat is filled, and **released**
   when the role is cancelled or held. A requisition with no estimate reserves nothing: the plan
   never invents an effort figure.
2. **`RULE-HIRE-02` — an accepted offer closes the loop into people and onboarding.** Accepting an
   offer creates the roster record and a new-hire 30-60-90 plan (seeded with the standard
   checkpoints, anchored on the agreed start date), marks the role filled, writes typed edges
   `candidate → requisition`, `requisition → person` and `person → onboarding`, and completes the
   interview reserve so its capacity returns to delivery. One action, one transaction, no
   re-entry.
3. **`RULE-HIRE-03` — a stalled role becomes an operational case, once.** A role that has not moved
   for the configured window (`hiringStallDays`, default 30) is escalated through the *same* path as
   every other module, so the case arrives with FMEA severity/probability/detectability, financial
   PERT fields, a stakeholder coalition, a DACI decision and an accountable delegation already
   attached. The `autoEscalated` flag on the requisition keeps it to exactly one case for the life
   of the role, even if that case is later closed.

Signals `HIRE-02`–`HIRE-07` report stalled roles, target-date slippage, roles with no competencies,
interview effort missing from the plan, final-round decisions short on evidence, and uneven process
coverage. A **`hiring`** CSV scope (19 total) exports roles, competencies, evidence weight and
coverage per candidate with formula-injection protection; it is flagged as sensitive because it
contains named candidate data. Deleting a candidate record removes its evidence and graph edges —
data minimisation is an obligation, not an archive policy.

### Candidate data: a retention reminder, never an automatic eraser (`Schema v18`)

Candidate records are the most sensitive thing this workspace holds and the least useful once the
decision is made. They are now covered by an explicit data-minimisation review rather than by hope:

- **`candidateRetentionDays`** (default **180**, `0` turns the review off) sets how long a closed or
  settled record stays useful. A candidate still in play on an open role is never flagged — that
  record is the working file for a live decision.
- **Nothing is deleted automatically.** A timer that erases records inside a local tool that also
  keeps the audit trail can destroy the reasoning behind a decision someone is still questioning. The
  app lists what is past the window on `#/hiring` and raises signal **`HIRE-08`**; a person decides,
  record by record, with a confirmation that names what else goes (the evidence, the graph edges) and
  says it cannot be undone.
- **"Keep in touch" is an exemption, and it stays visible.** A silver medallist you intend to call
  about the next opening is listed as exempt rather than silently skipped, so retaining a record
  remains a decision you can see.
- **The clock runs from the last recorded fact** about the person (decision, offer, hire or activity).
  A record with no dates is reported as unknown age, never guessed at, and a typo in the setting falls
  back to the default rather than switching the reminder off.

### Longitudinal team-health & habit trends and scoped CSV export

- View **8-week, 12-week and 6-month** checkpoint trends across composite health, all five
  health dimensions, feedback observation-to-conversation latency and delegation follow-through
  on `#/health` (with direct dimension drill-down from `#/today`).
- Checkpoints before the workspace recorded management activity stay `pre-history` (`null`),
  never `0`. Historical reconstruction restores team members archived after a past checkpoint
  (preventing survivorship bias), uses Schema v5 dated check-in/completion snapshots where
  present, marks pre-snapshot mutable fields **`approximate`** (hollow chart markers + plain
  explanation), and compares composite deltas across **matched dimensions** so newly unlocked
  pulse data never produces a false composite drop.
- Every trend chart pairs non-color stroke/shape encoding with a collapsible HTML data table
  (`<th scope="col|row">`) carrying exact checkpoint values and privacy-suppression states.
- Export **17 purpose-limited CSV tables** from Settings (`people`, `onboarding`, `oneOnOnes`,
  `actions`, `feedback`, `goals`, `delegations`, `growthPlans`, `recognition`, `readiness`,
  `decisions`, `cases`, `caseLinks`, `reviews`, `pulseSummary`, `healthTrends`, plus
  confirmation-gated confidential `conflicts`) with a copyable preview modal when downloads are
  restricted.
- Export an **operational copy** (Settings, plain or encrypted): a restorable JSON backup with
  the confidential conflict records and their event-log traces left out, for moving devices or
  sharing records upwards. The omission is declared inside the file (counts only) and in its
  `leados-operational-…` filename; restoring one reports what was left out, and replacing a
  browser that still holds conflict records requires explicit confirmation — so the safe-to-
  share file can't quietly become the one that deleted your mediation history.
- Text cells starting with `=`, `+`, `-`, `@`, control whitespace or full-width formula
  prefixes (`＝`, `＋`, `－`, `＠`) are prefixed with `'` (OWASP CWE-1236) while negative
  numbers stay numeric and unknown values stay blank (`""`). `pulseSummary` exports only
  anonymity-checked weekly aggregates and independently thresholded comments.

## Data integrity and architecture

- **Schema v18**, with additive v1→…→v18 migrations; pre-v5 records retain `null` for unknown
  historical completion dates and check-in snapshots rather than fabricating history. Normalization
  additionally repairs hiring records rather than rejecting the workspace: an unknown candidate
  stage falls back to the earliest real stage, out-of-order effort triples are re-ordered, an
  interviewer, competency or candidate/requisition reference that no longer exists is dropped with a
  warning, and an out-of-range rating is clamped. The v5→v6
  through v10→v11 steps add onboarding, 1:1 ownership, GROW history and explicit onboarding kinds
  without inferring missing facts. v11→v12 adds explicit GROW-to-delegation links; v12→v13 adds
  nullable performance-review provenance on goals and GROW plans; v13→v14 adds the separate
  `state.managerSupport` ledger; v14→v15 adds `state.cases`, `state.links` and
  `settings.caseReviewDays` (default 14) without fabricating historical cases or links, and strips
  any forbidden `conflict` or `pulse` link references on normalization. v15→v16 adds
  `state.portfolio` and four planning conventions (`capacityHoursPerWeek`, `planningHorizonWeeks`,
  `operationalLoadPct`, `wipLimitPerPerson`); existing goals, cases and delegations are **not**
  converted into portfolio items, because an effort or value estimate nobody gave would be
  invented data. v16→v17 adds `state.requisitions`, `state.candidates` and three hiring conventions
  (`hiringBaseRate` as an explicitly labelled prior assumption, `hiringStallDays`,
  `interviewHoursPerStage`) without converting any person, goal or case into a role or a candidate:
  who you have and who you might hire are different facts, and the migration reports what it left
  empty rather than inferring it. v17→v18 adds one hiring convention — the candidate retention
  reminder — and deliberately adds **no field to any candidate record**: a retention clock has to
  start from a date that was actually recorded, so the review reads the existing dates at review time
  instead of back-filling a `retentionStartsOn` nobody ever observed. Open cases with recorded capacity days still count as implicit reserves. Existing check-ins and 1:1
  actions are never migrated into manager commitments. Recorded check-ins gain stable IDs so a
  follow-up preserves the exact phase and the date captured when the manager chose the task.
  Normalization warns on a broken source link but preserves the manager's open commitment text.
  Unrecognised 1:1 owner values are cleared and reported, never coerced into a plausible one; GROW
  "will" actions carry no owner field at all.
- Follow-through links are repaired on load and import, in plain language: a successor that is
  missing, belongs to another person, sits earlier in time or forms a cycle clears the carry and
  reopens the promise; a successor that names a predecessor with no forward link has the link
  rebuilt; duplicate action ids inside one meeting are dropped with a warning.
- Load/import normalisation reports repairs. Conflict dates, explicit confirmation, supported
  closure and reopening boundaries are rechecked; malformed/duplicate conflict history produces
  warnings. Oversize conflict writes are rejected before any state/event change, not silently cut.
- The static server allows only the canonical shell/assets, rejects write methods, and refuses
  symlink aliases. It does not publish scratch backups, `.env`, `.git`, test tools or legacy source.
  Historical console/docs files remain in the repository but are no longer served by this entry.
- Future/invalid declared schema versions are not silently downcast: imports are rejected;
  incompatible saved data is write-protected and exports unchanged for recovery. Only explicit
  compatible import/reset can replace it, and protection survives a failed replacement write.
- Corrupt JSON opens a fresh workspace with a warning; recovery quarantine is **best effort**,
  capped at 500,000 characters and can itself fail when storage is full. Keep external backups.
- Each storage write replaces one JSON blob. On ordinary write failure, changes remain **in
  memory only**, with a persistence error; conflict dialogs and Settings report this explicitly.
  Imports adopt nothing unless the replacement saves. Reloading loses unsaved in-memory changes.
- Meaningful mutations append events; the general log retains the latest **600** entries.
  Conflict agreement/check/transition history stays in its record. Neither is tamper-proof.

```text
index.html                 shell, landmarks, navigation and modal/toast roots
app/main.js                router, application context, shell and error boundary
app/actions.js             DOM-free validated write API
app/conflict-actions.js    conflict lifecycle validation and generic audit events
app/core/                  schema, injected storage/clock, pure domain modules
app/core/crypto.js         PBKDF2-SHA-256 + AES-256-GCM envelope (no I/O, injectable crypto)
app/ui/                    shared DOM/forms/dialogs/charts
app/views/                 route renderers, not persistence implementations
tests/app/                 node:test domain/store/jsdom tests
```

No runtime framework, package dependency, account, network service or model inference was
added. Research and product tradeoffs are in `RESEARCH.md` §§14–40.
The five health dimensions use weights 24/20/20/16/20 for cadence/feedback/clarity/growth/
wellbeing. Missing dimensions stay null and weights renormalise; grades are A/B/C/D/F.
Historical comparison uses Schema v5 dated snapshots where recorded and explicitly labels
checkpoints `approximate` when pre-v5 or in-place edited fields lack history.

## Verification — 2026-10-26, session 32

- `npm run verify:canonical`: **`eslint .` (`0` errors/warnings), `check:boundary` (`76` canonical ES modules & `37` test suites, `0` quarantined-tree or network leaks), `check:links` (`0` broken internal links), and `457 passed, 0 failed, 0 skipped` across 37 suites** (up from 456 across 37 before Session 33).
- New `tests/app/case-calibration.test.mjs` (10 tests, Session 32) verifies:
  1. Hand-pinned FAIR frequency × magnitude maths (occurrence Brier fixtures, exposure/spend/diverted-days
     ratios, the actuarial loss-development aggregate), snapshot-first vs `resolution-estimate` scoring,
     verdict sample floors, and reference-class hint floors.
  2. `RULE-FCT-03` opening-forecast freeze at first quantification (creation or later edit), immune to
     subsequent estimate edits; settled-actuals capture in `resolveCase` + `recordCaseActuals` backfill
     with validation; reopen voiding; point-in-time actuals rewind.
  3. `RULE-FCT-04` one-shot under-reserving governance decision (median ≥1.25× at n=5) linked to the
     worst settlement, idempotent while unreviewed; `FCT-05`…`FCT-07` firing on sufficient evidence and
     silent on the demo baseline ("collecting evidence", one settlement at 1.1939×).
  4. Regression coverage for both Session 32 audit defects: the `updateCase` closed-status capacity-reserve
     leak (reserve now released + goal check-in via the Edit path) and `reopenCase` stale resolution notes.
  5. v21→v22 additive migration with dirty-actuals/snapshot repair and null-preservation; `cases` CSV
     settlement columns + `calibration` CSV case rows with CWE-1236 escaping; JSDOM `#/cases` card,
     settled-actuals detail panel and both dialogs with `axe-core` (0 violations).
- New `tests/app/scenarios-sensitivity.test.mjs` (7 tests, Session 30) verifies:
  1. Strict zero-mutation isolation (`projectScenarioState`, `compareScenarios`, `computeSensitivityTornado`, and opening/toggling `#/scenarios` leave `store.state`, `localStorage`, and `events` untouched).
  2. Law & Kelton Common Random Numbers (`seed`) determinism and variance reduction across scenario deltas.
  3. Brooks's Law onboarding mentoring drag vs. Watkins 30-60-90 ramp crossover (late hires reduce near-term horizon net capacity; early hires with freed interview reserve add net capacity).
  4. Keeney–Raiffa Pareto frontier dominance classification and Eschenbach/Howard One-at-a-Time Tornado P80 schedule swing ranking.
  5. `RULE-SCN-01` (#21) non-destructive DACI logging (`recordScenarioDecision`) vs. atomic workspace commitment (`commitScenarioLevers`, cascading `RULE-CAP-01`, `RULE-CAP-03`, `RULE-CAP-05`, and `RULE-CHG-01`..`05`), `SCN-01` Pareto-relief insight, and `sensitivity` CSV (#21) formula-injection escaping.
  6. Regression coverage for all **7 pre-existing cross-module defects** discovered in the Session 30 audit (`documentTitle` routes, `cases[].stakeholders[].keyMessage` governance/redaction, `RULE-CAP-05` catalog threshold wording, `reconstructStateAt` candidate rewind, `personOptions`/`goalOptions` sentinels, `openSettingsDialog` simulation/change fields & zero-allowed minima, and `personSupply` future `startDate` proration).
  7. End-to-end interactive `#/scenarios` UI lever edits, hypothetical request injection, modal commitment (`RULE-SCN-01`), and `axe-core` (`0` violations in JSDOM).
- Live HTTP static server (`scripts/serve.mjs`) verified returning `200 OK` with expected MIME types for `/`, `/app/main.js`, `/app/core/domain/scenarios.js`, and `/app/views/scenarios.js`.
- **Not verified in Session 30 (`[UNVERIFIED]`):** `@sparticuz/chromium` is not installed in this container's `node_modules` and external browser CDNs are outside the sandbox allowlist, so real graphical browser rendering (`1440px`/`390px`/`320px`) of the new `#/scenarios` view and `tornadoChart`, spoken assistive-technology announcements (NVDA/JAWS/VoiceOver/Orca), Firefox/Safari engines, print pagination, and real-manager field comprehension remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 20

- `npm test`: **315 passed, 0 failed, 0 skipped** across 24 test files.
- Scoped ESLint on the changed application modules and affected tests, `node --check` for changed
  JavaScript, and `git diff --check` passed.
- JSDOM/API tests cover explicit task creation after a held phase check-in, blank user-controlled
  task text, stable source phase/date through edits/carries, Today and 1:1 ledger actions, real
  meeting reconciliation, CSV provenance, snapshot rewind, and exclusion from performance-review
  evidence. These are automated tests, not real-browser or usability validation.
- `npm ci --no-audit --no-fund` installed the existing lockfile dependencies; package manifests
  and lockfile were not changed. No build, backend, dependency or network request was added.
- Real mobile/browser and assistive-technology validation, manager/employee comprehension, print
  output, large-workspace behavior, and full manual legacy source/build/deployment audit remain
  **[UNVERIFIED]**.

## Verification — 2026-10-25, session 27

- `npm test`: **408 passed, 0 failed, 0 skipped across 29 suites** (session 26 shipped 368 across
  27). New: `tests/app/retention.test.mjs` (23, candidate-data retention), `tests/app/scale.test.mjs`
  (5, large-workspace correctness and timing) and `tests/app/access-audit.test.mjs` (12, structural
  accessibility and destructive-confirmation safety). Timings and method are in the
  [validation report](docs/VALIDATION-2026-10-25-session-27.md).
- **Dependency audit remediated:** `next` 16.2.6 → 16.4.3, `postcss` 8.5.8 → 8.5.31,
  `eslint-config-next` → 16.4.3, `drizzle-kit` 0.31.10 → 0.31.11. `npm audit --omit=dev` now reports
  **0 vulnerabilities** (was 1 critical, 2 high). Four moderate advisories remain in a dev-only
  `drizzle-kit → esbuild 0.18.20` chain whose advisory concerns a development *server* that this
  repository never runs; the offered "fix" is a breaking downgrade of the migration CLI, so it was
  declined and explained rather than applied.
- **The legacy Next app does not build, and did not before this change** — verified against both
  dependency sets: `next build` fails on `src/lib/agent/tools.ts` importing `toolEffects` from
  `src/db/schema`, and `tsc --noEmit` reports 6,977 errors. Deployment is therefore moot rather than
  "risky"; the canonical zero-build app imports none of these packages. This is recorded, not fixed:
  repairing a non-canonical tree is a separate decision.
- **Real browser and screen-reader validation could not be performed here.** Playwright's browser CDN
  and Google's are outside the sandbox network allowlist; the in-package `@sparticuz/chromium` build
  launches only with `libnspr4`/`libnss3`, which requires a system package install the container
  cannot reach. In place of a browser, a structural audit asserts what axe cannot: one `h1` per
  screen with no skipped levels, an accessible name on every interactive control, captioned tables
  with `scope`d headers, landmark structure and a working skip link, dialog focus trap and
  restoration, and state that is announced rather than only coloured. Reading order and
  comprehension with an actual assistive technology remain **[UNVERIFIED]**, as does any manager's
  real hiring decision.
- **Large-workspace validation:** a 120-person / 300-case / 180-item / 40-role / 320-candidate
  workspace with 900 typed edges normalizes in ~35 ms, builds insights in ~42 ms, and exports all 19
  CSV scopes in under 50 ms each; every edge resolves at both ends and a second normalization is a
  no-op. A 300-role × 5,000-candidate stress case exposed an O(roles × candidates) scan in
  `hiringSummary` and the hiring CSV export, now single-pass indexed (~110 ms at that ratio).
- Five defects were found by these tests and fixed: destructive confirmations that ran *before* the
  user answered (and, in cases, showed no message at all), focus lost to `<body>` when a dialog
  trigger was re-rendered away, two uncaptioned capacity tables, a retention window that a typo could
  silently switch off, and the quadratic scan above.

## Verification — 2026-10-25, session 26

- `npm test`: **368 passed, 0 failed, 0 skipped across 27 suites** (baseline before this session was
  341 across 26). The new `tests/app/hiring.test.mjs` adds 27 tests covering the evidence
  mathematics (log-odds combination, correlated-evidence discounting, neutrality at 3/5, the
  falsification test), competency coverage and the offer gate, process parity, the cycle-time floor
  and vacancy honesty, the v16→v17 migration and normalization repairs, action validation, and the
  three automation rules end to end — including "a stalled role raises exactly one case even after
  repeated syncs" and "accepting an offer creates the roster record, the 30-60-90 plan, three typed
  links and frees the reserve, once".
- `axe-core` in JSDOM: **0 violations** on `#/hiring`, on `#/hiring/:id?candidate=…` and inside the
  requisition dialog. One genuine defect was found by the suite and fixed: two tables had an empty
  header cell, which axe reports as `empty-table-header`.
- `scripts/serve.mjs` returns `200` for `/`, `app/main.js`, `app/views/hiring.js`,
  `app/ui/hiring-modals.js`, `app/core/domain/hiring.js` and `app/styles.css`.
- Not verified: no GUI browser, screen reader or mobile device was available in this container, so
  real-browser rendering, keyboard traversal, print output and assistive-technology announcements
  for the new screens remain **[UNVERIFIED]**. No manager has used this module on a real hiring
  round, so the validity weights are the published coefficients applied as weights — not evidence
  that this implementation predicts anyone's performance.

## Verification — 2026-10-25, session 22

- A review of the shared form helper found that inline validation errors were announced as alerts
  and marked invalid, but were not connected to their matching fields. The helper now adds the
  current error ID to `aria-describedby` while preserving help text; a successful retry removes
  the stale error description. See the [focused audit](docs/AUDIT-2026-10-25-session-22.md).
- The updated JSDOM and manager-follow-up Chromium checks verify the field's `aria-invalid`,
  `role=alert` error text, both help/error descriptions and error cleanup. Axe remains at zero for
  the selected views, but it did not discover this relationship gap by itself.
- No actual screen reader/assistive technology, GUI browser, or comprehension study was available.
  NVDA/JAWS/VoiceOver/TalkBack/Orca announcements, possible duplicate alerts and manager/employee
  comprehension remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 21

- The two existing Chromium smoke scripts and the new `scripts/app-manager-support-smoke.mjs`
  all pass with headless Chromium **153.0.8010.0**, using isolated fictional records and no
  external application requests.
- The new script runs the recorded Day 30 check-in → separate manager-authored action with a
  manager-chosen date → exact source link → explicit completion in a real held 1:1. It checks
  that candid blocker text is not copied into the commitment or the 1:1 board, and that opening
  the 1:1 dialog creates no synthetic meeting.
- At **1440×1000** and **390×844**, the covered screens have no horizontal overflow. Eight axe-core
  scans for WCAG 2.1 A/AA rule tags report zero findings. Browser keyboard checks cover initial
  focus, Tab and Shift+Tab containment, Escape dismissal and focus return to the opener.
- These are selected automated checks in one headless Chromium version, not full visual review,
  screen-reader certification or a manager/employee comprehension study. Those, other browser/
  device configurations, print/PDF and large-workspace behavior remain **[UNVERIFIED]**.

## Verification — 2026-10-25, session 19

- `npm test`: **312 passed, 0 failed, 0 skipped** across 24 test files.
- Scoped ESLint on changed application modules and schema-version tests, changed-module syntax
  checks, and `git diff --check` passed.
- JSDOM exercised both review handoff forms, source validation/export and reverse links. No real
  Chromium/mobile or assistive-technology test was run for this increment; those remain
  **[UNVERIFIED]**.
- Legacy build/runtime/security, print/PDF output, full manual source review, large-workspace
  performance and manager/employee outcomes remain **[UNVERIFIED]**.

## Historical verification — 2026-10-25, session 17

- `npm test`: **305 passed, 0 failed/skipped** across 23 test files (`tests/app/*.test.mjs`).
  The 293-test baseline passed before edits. Twelve new `onboarding-queue.test.mjs` tests
  cover inclusive UTC date boundaries, deterministic ordering, all three plan kinds, archived/
  inactive/orphan/future exclusions, unheld phases, no private-data access, validation, inert
  cancellation, in-place logging, exact-plan/all-due filters, persistence/audit history, visible
  failed writes, and XSS-safe rendering. Existing migration, encryption, follow-through,
  performance-review, decision, GROW, prep, pulse, export and actual-HTTP server tests still pass.
- All 55 canonical JS modules pass `node --check`; scoped ESLint passes with zero warnings.
- **Chromium 153.0.8010.0:** both optional smoke scripts pass, using isolated fictional records,
  no user's browser data and no external application requests. The new script covers Today →
  overflow → full check-in queue → validation → log re-boarding conversation → save/reload →
  exact source plan → stale-link recovery. The existing script covers conflict lifecycle,
  export/import, keyboard trapping, fifteen mobile routes and health. Combined, **11 WCAG
  A/AA axe scans report zero violations**, including color contrast in real Chromium.
- No horizontal document overflow at the tested **1440×1000** desktop and **390×844** mobile
  states. Browser verification found and repaired existing onboarding-toolbar and Settings
  export/backup-button overflow; the older smoke script's two stale checkbox selectors now
  use the real accessible labels.
- Demo re-measured at `2026-10-25T10:00:00Z`: health **55.1 (C)**, matched 30-day trend **+8.3**
  (`previous: 46.8`, `approximate`), **37 findings / 25 rule IDs / 12 urgent / 4 wins**, unchanged.
  Today's new queue shows Samuel's Day 30 check-in **8 days overdue**. No demo records changed.
- Schema stays **v12**; no migration, account, backend, runtime dependency or network call was
  introduced. `npm audit --omit=dev` still reports 1 critical / 2 high legacy dependency findings.
- **[UNVERIFIED]:** full manual line-by-line legacy review/build/runtime, Safari/Firefox,
  real screen-reader and physical-device use, print/PDF visual output, large-workspace
  performance and real-manager outcome improvements. Automated source inventory is not
  personal verification of all 333k source lines. See the [audit](docs/AUDIT-2026-10-25-session-17.md).

Optional browser reproduction on Linux (tools are test-only, installed in ignored scratch):

```sh
# Keep the static server running in another terminal.
npm install --prefix tmp/browser --no-save --no-audit --no-fund \
  playwright-core@1.64.1 @sparticuz/chromium@153.0.0 axe-core@4.11.0
node scripts/app-browser-smoke.mjs
node scripts/app-onboarding-smoke.mjs
node scripts/app-manager-support-smoke.mjs
# Evidence: tmp/browser-evidence/, tmp/onboarding-evidence/ and
# tmp/manager-support-evidence/ (not committed)
```

## Known limitations and next

- **One leader, one browser profile.** No accounts, employee submission, multi-manager sharing,
  authentication or background notifications. Never store notes you are not authorised to hold;
  export contains sensitive data. Clearing site data deletes the workspace.
- Pulse suppression is intentionally more conservative: some previously visible sparse,
  unanimous or thin-comment windows now remain hidden. A floor is not an anonymity guarantee.
- Cadence and latency/check-in cadences are configurable; the review queues use a fixed
  seven-day look-ahead. None is a validated universal deadline. No real-manager longitudinal validation or proof of improved outcomes is claimed.
- Encryption is optional and passphrase-only: no recovery key, no key escrow, and no protection while the workspace is unlocked and in active use. An unlocked, encrypted workspace now auto-locks after a configurable inactivity window (default 30 minutes, 0 = off, set in Settings), warning first so nothing in progress is discarded. CSV and plain-text JSON exports are always unencrypted, and full JSON backups still contain conflict
  notes; the operational copy leaves conflict records and their event traces out, but still
  contains 1:1 notes, feedback and reviews — "conflict-free" is not "safe for any audience".
  Its omission marker is a declaration the import path trusts, so a hand-edited unmarked file
  is indistinguishable from an honestly conflict-free workspace. Enabling encryption replaces
  the browser's single stored blob, so a passphrase lost before the next unlock is
  unrecoverable by design.
- Follow-through is self-reported. A promise is only recorded as kept, carried or dropped when
  the leader logs the next 1:1; the app cannot observe delivery, and it deliberately sends no
  reminder (no backend, no notifications). A workspace with few logged 1:1s therefore shows few
  reconciliations — the gap is the missing conversation, not a hidden tracking failure.
- Ownership is whatever the leader recorded. "Not recorded" is a real state that the board counts
  and the export leaves blank; the app never infers an owner from who tends to do that kind of
  work, and "What you owe" is private to the browser (no employee view exists, so nobody else can
  see it or hold the leader to it).
- The 1:1 prep sheet is assembled from records, not a meeting transcript: it surfaces what was
  promised and still open, and cannot recover a conversation that was never logged. "Topics they
  want to raise" is recorded by the manager because the app has no employee login — the manager
  is the scribe, not an employee-submitted form. Print/PDF visual output remains **[UNVERIFIED]**
  in a real browser.
- Hiring stores candidate names and interview evidence in the same local browser copy as everything
  else. A retention *reminder* (default 180 days, `Schema v18`) lists records past the window and
  raises a signal, but deletion stays explicit, one record at a time, and audited — a workspace shared
  with a laptop profile still shares its candidates, and a reminder is not a guarantee that anyone
  acted on it. The validity weights are published population averages used
  as fixed weights (structured interviews: `.42`, 80% interval `.18`–`.66`), not a prediction about
  any individual, and no manager has run a real hiring round against this module, so whether the
  weighted read improves a real decision is **[UNVERIFIED]**. Cost of vacancy is reported only from a
  daily figure the leader enters; if it is left blank the module shows the delay as unpriced rather
  than estimating one.
- **Organizational Design, Team Topologies & Shewhart XmR Statistical Process Control (`#/changes`, `Schema v19`)**:
  models team-boundary redesigns, charter changes, and ritual shifts across Kotter's 8-Step progression
  (with foundational-skip warnings), Lewin Force-Field driving vs. restraining barriers, Conway's Law /
  Skelton & Pais Team Topologies + Sweller Cognitive Load + Brooks inter-team coordination channels
  (`N(N-1)/2`), Galbraith's 5-Point Star + Holmström–Milgrom incentive-mismatch checks, Mendelow +
  Tsebelis veto-player coalitions, and Beta-PERT transition effort & J-Curve payback economics. Active
  changes propagate atomically (`RULE-CHG-01`..`05`) into capacity reserves (`#/capacity`), DACI charter
  decisions (`#/decisions`), opted-in Watkins 30-60-90 `role-transition` plans (`#/onboarding`) + blameless
  1:1 prep (`#/prep/:id`), coalition briefing schedules, and linked OKR risk telemetry (`#/goals`),
  cascading vertically into `RULE-CAP-02` if transition reserves + role-transition ramps push team
  capacity past 100%. Shewhart/Wheeler Individual & Moving Range (`XmR`) charts (`X̄ ± 2.66 mR̄`, `URL = 3.267 mR̄`,
  Western Electric Rules 1–4) separate routine common-cause noise from real special-cause process shifts
  on both `#/changes/:id` metrics and `#/health` longitudinal trends (requiring ≥4 measured windows and ≥3
  adjacent moving ranges; missing windows are never interpolated). Force-field weights, cognitive load
  ratings, and transition economics remain manager-estimated inputs rather than observed telemetry, and
  participation in an organizational change never enters individual performance review evidence. Real-browser
  visual rendering and screen-reader usability on `#/changes` remain **[UNVERIFIED]**.
- **Seeded Monte Carlo Portfolio, Critical-Chain Bottlenecks & Coupled J-Curve Simulation (`app/core/domain/simulation.js`, `#/capacity`, `#/changes/:id`, `Schema v20`)**:
  deterministic Mulberry32 PRNG + Marsaglia–Tsang Gamma / Vose Beta-PERT sampling (`seed = 42` default,
  configurable 250–5,000 trials in Settings) simulates right-skewed 3-point PERT commitments jointly across
  funded portfolio work, incident reserves, hiring effort, and active organizational changes. Surfaces Sam
  Savage's *Flaw of Averages* (`overloadProbability` when expected person-days appear to fit `≤ 100%`),
  Goldratt's *Critical Chain* owner-constrained `P50`/`P80`/`P90` calendar dates vs. fungible team-sum dates,
  variance-contribution sensitivity drivers, and coupled Satir J-curve valley depth & payback quantiles on
  `#/changes/:id`. Wired into `RULE-CAP-05` (idempotent goal tail-risk check-ins + Flaw-of-Averages DACI
  trade-off decisions) and `SIM-01`/`SIM-02` signals, with accessible SVG histogram & fan charts backed by
  expandable HTML data tables. Trial independence is assumed; correlated common-mode shocks are not modelled.
- **Pre-Export Candidate Retention (`HIRE-08`) & Contextual-Integrity Disclosure (`app/core/domain/export-governance.js`, `app/ui/export-dialogs.js`, `Schema v20`)**:
  before exporting plain JSON, operational JSON, encrypted backups, or `hiring`/`cases`/`changes` CSV scopes,
  LeadOS inspects the workspace for overdue candidate records past `candidateRetentionDays` (GDPR Art. 5(1)(e)
  storage limitation), disabled retention windows, confidential conflict cases, and candid `skeptical` /
  `resistant` / `opposing` stakeholder or veto-player notes (Nissenbaum *Contextual Integrity*). Offers
  optional export-only redactions (`pruneOverdueCandidates`, `redactStakeholderStances`, `redactConflicts`)
  that scrub the exported copy without mutating the live workspace and append a private-content-free
  `export.disclosed` audit event.
- **Non-Persisted Counterfactual Scenario Sandboxing, Pareto Frontier Dominance & One-at-a-Time Tornado Sensitivity (`app/core/domain/scenarios.js`, `#/scenarios`, `Schema v20`)**:
  rehearses scope trims (Reinertsen CD3), uncommitted urgent requests, incident mitigation (`#/cases`),
  active org-change phasing (`#/changes`), Brooks's Law hiring start-date vs. mentoring drag (`#/hiring`),
  and Argyris & Schön double-loop operating-policy shifts (`operationalLoadPct`, `capacityHoursPerWeek`,
  `wipLimitPerPerson`) over isolated `structuredClone` snapshots using Law & Kelton Common Random Numbers
  (`seed`), without mutating `store.state` or appending audit events until explicitly committed. Surfaces
  Keeney–Raiffa Pareto-optimal vs. dominated options, Samuelson marginal shadow pricing of capacity,
  Tsebelis veto-player / OKR coalition risk, and an accessible diverging SVG `tornadoChart` ranking
  one-at-a-time P80 schedule drivers (`sensitivity` CSV #21). Explicit commitment via `RULE-SCN-01` (#21)
  records a calibrated DACI decision (`recordScenarioDecision`) or atomically executes levers across
  portfolio, cases, changes, goals, and settings (`commitScenarioLevers`). Graphical browser rendering of
  `#/scenarios` in Session 30, spoken screen-reader output, and real-manager comprehension remain
  **[UNVERIFIED]**.
- **Forecast Calibration & Reference-Class Learning Loop (`app/core/domain/calibration.js`, `#/decisions`,
  `#/capacity`, `Schema v21`)**: closes the loop over the app's own predictions. Decisions now record an
  optional Cromwell-clamped (5–95%) probability when the call is made — scenario decisions derive theirs
  automatically from the CRN overload odds — and the outcome review scores it with Brier (1950),
  Murphy (1973) reliability/resolution/uncertainty decomposition and an accessible reliability
  (calibration-curve) diagram; the forecast is frozen after review so hindsight cannot game the record.
  Funding planned work freezes its PERT forecast into an immutable snapshot (`RULE-FCT-01`) so delivery
  actuals — now captured in the Deliver dialog or backfilled later, never pre-filled from the estimate —
  score the belief held at commitment. Median actual/estimate ratios, interval-coverage honesty, and
  Flyvbjerg (2006) reference-class uplifts feed the Capacity delivery forecast; ≥5 scored items at
  ≥1.25× median optimism opens one DACI governance decision (`RULE-FCT-02`), while `FCT-01`…`FCT-04`
  signals surface estimate bias, too-narrow ranges, decision overconfidence, and unrecorded actuals.
  Verdicts refuse to render below n=5 (the demo honestly shows "collecting evidence": Brier 0.04, n=2
  estimate pairs). Ships with the `calibration` CSV scope (#22). Graphical browser rendering of the
  Session 31 calibration card, spoken screen-reader output, and field comprehension remain
  **[UNVERIFIED]**.
- **Case-Cost Calibration Ledger (`app/core/domain/calibration.js`, `#/cases`, `Schema v22`)**: the third
  prediction ledger, completing the learning loop over operational risk. When a case is first quantified,
  `RULE-FCT-03` freezes its opening beliefs (PERT exposure distribution, diverted-capacity expectation,
  planned mitigation spend, pre-mitigation FMEA probability) into an immutable snapshot; when the case
  resolves, settled actuals — did it materialise, realised exposure, actual mitigation spend, actual
  diverted days, each recordable independently and never pre-filled from the estimate — score against
  that frozen forecast. FAIR's (Freund & Jones, 2015) two legs are scored separately: occurrence
  (FMEA-implied probability vs materialisation, Brier) and magnitude (realised vs expected exposure
  with interval-coverage honesty), alongside spend and diverted-days discipline (the diverted-days leg
  is also the first accuracy read on `RULE-CAP-01` capacity reserves, deliberately excluded from the
  effort ledger in Session 31). The aggregate Σrealised ÷ Σexpected-unmitigated is the actuarial
  loss-development factor for the case book; at n≥5 with median development ≥1.25×, `RULE-FCT-04`
  opens one DACI decision offering reference-class contingency uplifts, linked to the worst
  under-assessment, while `FCT-05`…`FCT-07` surface reserve adequacy, occurrence blind spots and
  unscored settlements. **`RULE-CAP-06` closes the ledger-to-capacity loop:** once five actual
  diverted-days settlements establish a ≥1.25× median under-reserve, open case capacity reserves
  receive a median uplift (P80 for high-priority cases), automatically re-triggering deterministic
  capacity trade-offs and seeded Monte Carlo tail-risk checks. The dialog previews the factor and
  sample count; case estimates and their frozen scoring baseline remain untouched. Five is a
  conservative product trigger, not statistical proof or a universal policy, and real-team
  validation remains **[UNVERIFIED]**. Session 32 also fixed two audited cross-module defects: closing a case via
  the Edit dialog previously leaked its capacity reserve as open forever, and reopening left stale
  resolution notes diverging from a reload. Graphical browser rendering of the case-cost card and
  `caseRatioChart`, spoken screen-reader output, and field comprehension remain **[UNVERIFIED]**.
- Legacy build/runtime, Safari/Firefox, spoken assistive-technology output and physical-device
  use, print visual output and field comprehension remain **[UNVERIFIED]**.
- **The legacy Next app does not build and is quarantined under [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md).**
  `next build` fails on `src/lib/agent/tools.ts` importing a `toolEffects` export that does not exist in
  `src/db/schema`, and `tsc --noEmit` reports 6,977 errors; the root `App.tsx` imports `./lib/store`,
  `./lib/seed`, `./lib/engine` and `./components/*` that are not in the repository. ADR-0007 freezes these
  non-canonical paths as a read-only historical archive and enforces `npm run check:boundary` so canonical
  `app/**` modules never depend on them. Session 27 removed every production advisory (`npm audit --omit=dev`:
  **0**); four moderate advisories remain in a dev-only `drizzle-kit → esbuild 0.18.20` chain.
- **Accessibility is verified in Headless Chromium `143.0.7499.0` + `jsdom`, not with spoken screen readers.**
  Session 29 executed real Headless Chromium `143.0.7499.0` against `scripts/serve.mjs` across 11 routes at
  `1440×1000`, `390×844`, and `320×800` (WCAG 1.4.10 Reflow) plus 4 live modals, uncovering and fixing 7 real
  contrast, label-in-name (`wcag21a`), and flex-reflow defects (`0` `axe-core` WCAG 2.1 AA violations and `0`
  horizontal overflows post-fix). Spoken screen-reader output (NVDA, JAWS, VoiceOver, Orca), Firefox/WebKit
  rendering, and human manager comprehension remain **[UNVERIFIED]**. See the
  [Session 29 validation report](docs/VALIDATION-2026-10-25-session-29.md) and earlier
  [Session 27 validation report](docs/VALIDATION-2026-10-25-session-27.md).

## Documentation

- [ROADMAP.md](ROADMAP.md) — verified inventory, ordered next work and rejected directions.
- [RESEARCH.md](RESEARCH.md) — frameworks, product benchmarks and design consequences.
- [Session 29 validation report](docs/VALIDATION-2026-10-25-session-29.md) — real Chromium 143 WCAG 2.1 AA & 320px/390px/1440px reflow audit, defects fixed, and `[UNVERIFIED]` boundaries.
- [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md) — frozen archive-in-place quarantine disposition of the legacy Next.js / Vite trees.
- [Current audit](docs/AUDIT-2026-10-25-session-23.md) — Session 23 cross-domain operational cases, parallel automation engine, and verification boundaries.
- [Session 22 audit](docs/AUDIT-2026-10-25-session-22.md) — inline validation error accessibility audit.
- [Session 19 audit](docs/AUDIT-2026-10-25-session-19.md) — Session 19 handoff audit, source provenance and verification boundaries.
- [Session 18 audit](docs/AUDIT-2026-10-25-session-18.md) — delegation-queue gap decision and verification boundaries.
- [Previous audit](docs/AUDIT-2026-10-25-session-17.md) — phase-conversation queue, source inventory and browser evidence.
- [Session 4 audit](docs/AUDIT-2026-10-24-session-4.md) — conflict lifecycle and Chromium baseline.
- [Historical audit](docs/AUDIT-2026-10-24.md) — original record with explicit corrections.
- [AI-SESSION-LOG.md](AI-SESSION-LOG.md) — cumulative session history, including corrections.
