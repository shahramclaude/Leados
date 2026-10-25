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
npm test                     # 340 domain, capacity/flow, cross-module automation, persistence, review handoff, manager follow-up, 1:1 reconciliation, development-ledger, ownership, onboarding/transition/reboarding, Today queues, prep, CSV, trend, encryption and jsdom/axe tests
```

## Honest state of this repository

This checkout also contains older React/Next.js applications, consoles, database code and
large historical documents. Their presence is not evidence that those products run. They
are preserved, **not rebuilt or deleted**, and are not imported by the canonical app.

| Path | Current status |
|---|---|
| `index.html`, `app/**` | **Canonical product:** 63 native JavaScript modules, CSS and shell; tested below. |
| `scripts/serve.mjs` | Dependency-free static server. |
| `tests/app/**` | Canonical automated suite, run by `npm test`. |
| `scripts/app-browser-smoke.mjs`, `scripts/app-onboarding-smoke.mjs`, `scripts/app-manager-support-smoke.mjs` | Optional real-Chromium lifecycle/mobile/accessibility checks; all three passed on Chromium 153 in session 21. The newest covers the manager-owned check-in follow-up and real-1:1 flow. |
| `public/index.html` | Older synthetic-data console, not the product; detailed runtime status this session **[UNVERIFIED]**. |
| `src/**`, root React files, `drizzle/`, `openapi.yaml` | Legacy/non-canonical; current builds, security and workflows **[UNVERIFIED]**. |
| `deprecated/vite-index.html` | Preserved old Vite entry. |

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

Signals `CAP-01`–`CAP-05` report utilisation, queue delay/WIP breaches, undecided demand, missing
effort estimates and unachievable target dates. A **`portfolio`** CSV scope (18 total) exports the
whole ledger with derived PERT values and value density, formula-injection safe.

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

- **Schema v16**, with additive v1→…→v16 migrations; pre-v5 records retain `null` for unknown
  historical completion dates and check-in snapshots rather than fabricating history. The v5→v6
  through v10→v11 steps add onboarding, 1:1 ownership, GROW history and explicit onboarding kinds
  without inferring missing facts. v11→v12 adds explicit GROW-to-delegation links; v12→v13 adds
  nullable performance-review provenance on goals and GROW plans; v13→v14 adds the separate
  `state.managerSupport` ledger; v14→v15 adds `state.cases`, `state.links` and
  `settings.caseReviewDays` (default 14) without fabricating historical cases or links, and strips
  any forbidden `conflict` or `pulse` link references on normalization. v15→v16 adds
  `state.portfolio` and four planning conventions (`capacityHoursPerWeek`, `planningHorizonWeeks`,
  `operationalLoadPct`, `wipLimitPerPerson`); existing goals, cases and delegations are **not**
  converted into portfolio items, because an effort or value estimate nobody gave would be
  invented data. Open cases with recorded capacity days still count as implicit reserves. Existing check-ins and 1:1
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
added. Research and product tradeoffs are in `RESEARCH.md` §§14–29.
The five health dimensions use weights 24/20/20/16/20 for cadence/feedback/clarity/growth/
wellbeing. Missing dimensions stay null and weights renormalise; grades are A/B/C/D/F.
Historical comparison uses Schema v5 dated snapshots where recorded and explicitly labels
checkpoints `approximate` when pre-v5 or in-place edited fields lack history.

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
- Legacy build/runtime, Safari/Firefox, real assistive-technology and physical-device
  use, print visual output and large-workspace performance remain **[UNVERIFIED]**.
- A fresh `npm audit --omit=dev` reports **1 critical and 2 high** findings in the legacy
  Next/PostCSS/Sharp dependency chain. The canonical module graph imports none of it. This
  increment did not upgrade or validate that legacy app; its dependencies must not be treated
  as safe for deployment merely because the static app works.

## Documentation

- [ROADMAP.md](ROADMAP.md) — verified inventory, ordered next work and rejected directions.
- [RESEARCH.md](RESEARCH.md) — frameworks, product benchmarks and design consequences.
- [Current audit](docs/AUDIT-2026-10-25-session-23.md) — Session 23 cross-domain operational cases, parallel automation engine, and verification boundaries.
- [Session 22 audit](docs/AUDIT-2026-10-25-session-22.md) — inline validation error accessibility audit.
- [Session 19 audit](docs/AUDIT-2026-10-25-session-19.md) — Session 19 handoff audit, source provenance and verification boundaries.
- [Session 18 audit](docs/AUDIT-2026-10-25-session-18.md) — delegation-queue gap decision and verification boundaries.
- [Previous audit](docs/AUDIT-2026-10-25-session-17.md) — phase-conversation queue, source inventory and browser evidence.
- [Session 4 audit](docs/AUDIT-2026-10-24-session-4.md) — conflict lifecycle and Chromium baseline.
- [Historical audit](docs/AUDIT-2026-10-24.md) — original record with explicit corrections.
- [AI-SESSION-LOG.md](AI-SESSION-LOG.md) — cumulative session history, including corrections.
