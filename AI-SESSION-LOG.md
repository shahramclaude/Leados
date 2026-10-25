# AI Session Log

Current canonical status is in the latest dated session below and `README.md`. Earlier
entries are historical, not fresh verification; session 4 corrects the false absent-DB
claim and explicitly limits legacy audit/build claims.

> Honesty note: this sandbox snapshot of the LEADOS repository did not contain
> an existing `AI-SESSION-LOG.md` or the Part 04/09/11/19/38/51 source files
> referenced by this part's standing order. This file therefore starts a new
> log with the Part 56 entry below. When merging into the real
> `https://github.com/shahramclaude/Leados` history, append this entry to the
> existing cumulative log rather than overwriting it, and reconcile the
> "stand-in" modules noted below against the real Part 04/09/11/19/38/51 code.

## Part 56 — Algorithmic Accountability

**Scope:** model/system registry with CI-enforced completeness, versioned
impact-assessment workflow with change triggers, individual rights machinery
(explanation, contestation, opt-out), and a scope-declared conformity
evidence exporter. Four surfaces: Accountability Console, Impact Assessment
Studio, My Automated Decisions, Conformity Export.

### What was read before writing
Per the standing order this part depends on Part 38 (assurance registry),
Part 09 (fairness machinery), Part 11 (model cards), Part 19 (audit chain),
Part 51 (recommender), and `src/lib/intelligence/*`. **None of these files
were present in this sandbox's working tree** — the repository checkout
available in this session contained only the base Next.js/Drizzle starter
(`src/db`, `src/app/layout.tsx`, `src/app/page.tsx`,
`src/app/api/health/route.ts`). This was confirmed with `list_files` at the
start of the session before any code was written.

Because the actual prior-part source could not be read, this part does two
things explicitly, rather than silently inventing integrations:

1. **Builds the `src/lib/intelligence/*` engines itself** (eligibility
   scoring, candidate match recommending, performance-risk prediction,
   fraud/anomaly flagging, support-ticket priority scoring) as the
   "every scoring/prediction engine" Phase 0 asks the registry to cover.
2. **Builds clearly-labelled stand-ins** for the Part 09/11/19/38 machinery
   (`src/lib/accountability/fairness.ts`, `modelCards.ts`, `auditChain.ts`,
   `monitoring.ts`) with their own tables, so the registry, impact
   assessments and conformity export have real data to integrate with end to
   end inside this sandbox. Every stand-in file carries a code comment
   stating it is a reconstruction, not the genuine Part 09/11/19/38
   implementation, and the registry/self-review repeat this.

**Action required when merging into the real repo:** replace the stand-in
modules' data sources with the actual Part 09 fairness engine, Part 11 model
card store, Part 19 audit chain, and Part 38 monitoring/assurance registry,
and re-point `algoSystems.sourceModule` / `monitoringCheckIds` /
`modelCards` at the real Part 04/51 engines once those files are available
for inspection.

### What was built
- `src/db/schema.ts` — `acc_people`, `algo_systems`, `model_cards`,
  `monitoring_checks`, `fairness_reports`, `audit_chain_entries`,
  `impact_assessments`, `decision_records`, `explanations`, `contestations`,
  `opt_outs`.
- `src/lib/intelligence/*` — 5 scoring/predicting/recommending/flagging
  engines, each exporting `SYSTEM_ID` for the registry lint to discover.
- `src/lib/accountability/*` — registry (`registry.ts`), risk-tier mapping
  (`riskTiers.ts`), assessment workflow with change triggers
  (`assessments.ts`), rights machinery with authorization
  (`rights.ts`), audit chain (`auditChain.ts`), conformity bundle builder
  with Zod schema validation (`conformity.ts`), and seed data (`seed.ts`).
- `scripts/*` — registry completeness CI lint (`check-registry-completeness.ts`)
  and its self-test (`test-registry-completeness.ts`, which plants and
  removes fixture modules), risk-tier consistency test, change-trigger
  workflow test, rights-machinery attempt-matrix test, conformity export CLI
  and its test, all wired into `npm run verify`.
- `src/app/accountability/*`, `src/app/my-decisions/*` — the four UI
  surfaces (Console, Studio, Oversight Queue, My Automated Decisions,
  Conformity Export), all server-rendered, with server actions for every
  mutation and real (not UI-only) authorization checks.
- `npm pkg set` was used to add scripts (`db:push`, `db:seed`,
  `registry:lint`, `registry:test`, `risktier:test`, `assessment:test`,
  `rights:test`, `conformity:export`, `conformity:test`, `verify`) — chosen
  over hand-editing `package.json` per the standing instructions.

### Verification performed this session
`npx next typegen`, `npm exec tsc --noEmit`, `npm run build`, `npm run
verify` (typecheck + registry lint + registry self-test + risk-tier
consistency test + change-trigger workflow test + rights-machinery attempt
matrix + conformity export schema test), `npm run conformity:export`, and
`build_and_start` with a live smoke test of every page. Full output is in
the Part 56 deliverable's VERIFICATION LOG section. One real bug was found
and fixed during verification: audit-chain hash verification failed because
Postgres JSONB does not preserve object key order on round-trip, so the
naive `JSON.stringify` hash didn't reproduce after a DB read; fixed with a
canonical (key-sorted) stringify used on both the write and verify paths.

### Known, stated gaps (not smoothed over)
- `performance-risk-predictor-v1` monitoring check `mon-perf-accuracy-01` is
  seeded as **FAILING** (live AUC has drifted below backtest) — surfaced in
  the Console, the registry detail page, and every conformity bundle's
  `gaps` array.
- `fraud-anomaly-flagger-v1` fairness report `fr-fraud-tenure-01` is seeded
  as **FAILING** (1.42x hold-rate disparity vs. a 1.25 threshold) — same
  treatment.
- `fraud-anomaly-flagger-v1`'s opt-out is seeded as **not permitted**, with a
  documented limitation and an expedited-contest alternative, rather than
  silently disallowing it.
- The stand-in Part 09/11/19/38 modules are explicitly not the real
  modules — see above.

---

# Session — 2026-10-24 · Independent audit, then one working application

This entry supersedes the status claims in the entries above it. Those entries describe a
Next.js build that typechecks, a `verify` pipeline and passing tests against Postgres. In this
workspace those things do not exist: `npx tsc --noEmit` returns **6,879 errors**, `src/db` is
absent, and none of the commands quoted in them can run. I am recording that plainly rather than
editing history. The full evidence is in [`docs/AUDIT-2026-10-24.md`](docs/AUDIT-2026-10-24.md).

## What I found (verified, not assumed)

- Four competing applications, **none runnable**: the root Vite console (no `vite` installed),
  the Next.js tree (6,879 type errors, 352 missing modules, no data layer), `public/index.html`
  (a syntax error in a block comment made it a blank page) and `leados-cli.html`.
- `public/index.html` was one character away from working. Fixed (`T_T_*/G_L_*` → `T_T_* / G_L_*`);
  it now renders 5 routes with zero console errors. It remains a **sandbox**, not the product:
  synthetic data only, no way to enter your own.
- Documentation describes products that are not here. `docs/adr/0001-canonical-app.md` named the
  Next.js tree as canonical before anyone tried to run it.

## The decision, and the flag that came with it

Building a new app rather than repairing two dead trees is a rewrite. The brief requires that to
be flagged *before* it happens, so it is recorded in
[`docs/adr/0006-canonical-zero-build-app.md`](docs/adr/0006-canonical-zero-build-app.md), which also
supersedes ADR-0001. The short version: there is no entry point to improve, the repair is a rewrite
with extra steps, and the domain ideas (rule engine, agenda generation, readiness gating, decision
review) were salvageable as pure functions without the framework.

**Architecture deviation, stated:** the plan was `app/ui/router.js` + `app/app.js`. They were merged
into a single `app/main.js` because the router needs the same context object the shell builds, and
splitting them produced a circular import for no gain.

## What was built

`index.html` + `app/**`: zero build, zero runtime dependencies, local-first, `node --test`.
Store with versioned schema and migrations, quarantine on corruption, append-oriented event log,
export/import, demo protection. Thirteen views covering the lifecycle: Today, Signals, People,
person detail, 1:1s, Feedback (SBI with live coaching), Recognition, Goals with computed pace,
GROW plans and competency coverage, evidence-gated succession, pulse with a privacy floor, DACI
decisions, Settings and data. Thirty-three rule families producing severity, evidence and one
action each.

## Corrections made *during* this session (not just features added)

- **Pulse anonymity floor raised from 3 to 5.** Research on published vendor thresholds (Culture
  Amp 5, 15Five 5, Lattice 3 as a floor) showed 3 was the weakest defensible setting, and the
  default mattered because admins rarely lower it.
- **Pulse comments were not threshold-protected.** A single comment in a five-person team was
  being shown — effectively a signed memo. Comments now obey the same floor as scores.
- **Identical answers are now suppressed.** An average of identical answers *is* each person's
  answer, whatever the group size (the homogeneity attack).
- **Pulse windows counted on timestamps, not days**, so a response could fall into two fortnights
  and produce a fake "change" number. Rewritten on calendar-day keys.
- **Focus was stolen to the page heading on every re-render**, not only on route changes —
  which yanked the caret out of the roster search box.
- **Modal focus restoration used a shared stack** that leaked between mounts, permanently disabling
  focus return after a single orphaned dialog. Now per-dialog, with a route-change teardown.
- **Required `<select>` values did not survive being built** (options were marked `selected` before
  insertion), so forms submitted empty and reported "choose a person first" while showing a person.
- **Signals rendered every finding individually**: a 45-person roster produced 62 KB of text and a
  131 ms render. Above three people a repeated rule now collapses into one line that still names
  everyone: 24 ms, 6.3 KB.

## Verification

```
node --test "tests/app/*.test.mjs"     → 82 pass / 0 fail
node scripts/audit-legacy-smoke.mjs    → nav 5 / cards 4 / errors none   (public/index.html sandbox)
node scripts/serve.mjs                 → app serves; 35 files, 0 unresolved module imports
```

Demo baseline (`2026-10-24T10:00:00Z`): health **53.3 (D)**, trend **+0.5**, pulse **n=5**,
overall **2.55**, safety **2.8**, workload **2.0**, change **−0.59**, **27 findings / 9 urgent /
2 wins**. All 13 routes render with no console errors. Worst render 90 ms with 45 people in jsdom.
Contrast: every text/background token pair measured at ≥4.5:1.

## Still not done, and not being claimed

Nothing here has been used by a real manager for a real quarter; every number comes from the demo
data and the test suite. No multi-user, no upward feedback, no performance-review packet, no
delegation log, no encryption at rest. `localStorage` is not a backup. The legacy trees are
documented as dead rather than repaired. Full lists: `ROADMAP.md` → "Known gaps".

Next up (from roadmap): feedback latency (observed date vs conversation date); goal co-authorship
and a `GOAL-06` finding; performance-review packet assembled from records with every claim linked
to its evidence.

---

# Session — 2026-10-24 · Evidence-backed performance reviews (canonical evolution)

## Audit and current-state assessment

This session evolved the canonical zero-build app in place; no rewrite, framework change,
runtime dependency, account, backend or network call was introduced. All canonical files under
`index.html`, `app/**` and `tests/app/**` were read before the final assessment. The legacy
React/Next trees were inventoried but **not fully reread or executed**; historical claims such as
6,879 TypeScript errors remain `[UNVERIFIED]` by this session.

- **Working before this session:** the canonical app booted and its 82 tests passed. Roster,
  1:1s, SBI feedback, goals, GROW, pulse, decisions, recognition, succession, health, signals,
  local persistence and JSON export/import were present and exercised.
- **Broken, source-confirmed and fixed:** key-result dialogs received `{ goal }` but read
  `{ goalId }`, so the action could report success without adding a result; development-plan
  overdue counts used the wall clock instead of the injected clock; “Edit plan” opened a blank
  new-plan flow instead of editing the selected plan. All three now have UI or domain regression
  coverage. `addKeyResult` also refuses a missing goal instead of silently succeeding.
- **Shallow/missing before this session:** there was no performance-review record, route,
  reflection, assessment, evidence packet, calibration or print flow. Goals and development had
  current values and check-ins, not a complete historical event store; the new packet labels that
  limit rather than fabricating period-end history. Delegation and conflict-resolution records
  remain absent. The legacy trees remain non-canonical and unrepaired.
- **Dependency audit:** a clean `npm ci --ignore-scripts` reported 7 total advisories.
  `npm audit --omit=dev` narrowed the production chain to 1 critical and 2 high advisories in
  legacy Next.js/PostCSS/Sharp. The canonical browser app does not load that chain. No forced
  major legacy upgrade was applied.

## Research and selection

Read CIPD's people-performance evidence review, Lattice's review-question/form guidance, and
Culture Amp's review-template science and manager guidance; SBI/CCL remains the feedback basis.
The consistent product pattern is specific expectations and evidence, employee reflection,
separate past/future prompts, and calibration as a challenge process—not an automatically
generated truth. Full links and the rejected alternatives are in `RESEARCH.md` §12.

The highest-impact gap was the missing review lifecycle: the app helped managers create useful
records all quarter, then gave them no way to use those records when the review arrived. This
session implemented roadmap items 3–4 and the packet half of item 9. Feedback latency and goal
co-authorship stay next because they deepen existing records; delegation is now the largest
wholly absent lifecycle area after reviews.

## What changed

- Added schema **v2** and a tested v1→v2 migration for `reviews`, including normalization of
  ratings, reflections, evidence excerpts and local-only source routes. Export/import and demo
  cleanup include reviews; a review attached to a removed demo person cannot become an orphan.
- Added `app/core/domain/reviews.js`: inclusive period validation, oldest-first evidence from
  1:1s, manager-to-person feedback, goals, development and recognition; explicit capture-time
  labels; seven calibration checks; completion readiness. Anonymous pulse answers and upward
  feedback about the manager are excluded from person-performance evidence.
- Added review list/detail routes and printable packets. Four self-reflection prompts, three
  manager prompts and an optional four-anchor manager rating remain distinct. Completion freezes
  a recaptured evidence snapshot; reopen and evidence refresh are separate actions. Events cover
  create, evidence refresh, reflection, assessment, complete and reopen.
- Added source-record drill-down for every evidence type, including completed goals/plans; added
  a document-style print layout and browser print/save-PDF action. No direct employee account or
  submission is claimed.
- Updated `index.html`, navigation, settings/storage labels, README, ROADMAP and RESEARCH.

## Verification performed

```text
npm test                         → 96 pass / 0 fail (~8 s)
node --test tests/app/reviews.test.mjs
                                 → 10 pass / 0 fail during focused verification
git diff --check                 → clean
live HTTP smoke                  → shell + 36 JS modules + CSS; preview Host/Origin accepted
static scan of app/**            → no innerHTML/eval/fetch/XMLHttpRequest runtime path
```

The UI integration test uses the real dialogs to create a packet, record reflection and manager
assessment, complete it, invoke print, export, reset and import. Other tests follow all five
source-link types (including completed goals/plans), verify the key-result and development-plan
edit regressions, and exercise migration, privacy exclusions, rating warnings, injected clocks,
frozen snapshots, reload and demo cleanup. No real manager usage or real-browser visual/print
inspection was performed; the latter remains `[UNVERIFIED]` in the roadmap.

## Known limits and next

A packet can only contain what was logged. Capture-time goal/development values are not historical
reconstruction. Calibration is a transparent heuristic, not a fairness guarantee. Reflection is
manager-entered in this local workspace. `localStorage` remains unencrypted and is not a backup.
Legacy dependency advisories and legacy source claims were not silently “fixed” or revalidated.

Next up (from roadmap): feedback latency (`observedOn` vs conversation date); goal co-authorship
and `GOAL-06`; a delegation log with authority and follow-through.

---

# Session — 2026-10-24 · Feedback latency, goal co-authorship and delegation

## Audit and current-state assessment

The workspace began at HEAD `5152de5` with the previous review-packet increment present as
uncommitted work. I preserved and reviewed that work rather than resetting it. After restoring
locked dependencies with `npm ci --ignore-scripts`, the canonical baseline was **96 pass / 0 fail**.
No runtime dependency, framework, backend, account or network call was added.

- **Working before this increment:** the zero-build shell, roster, 1:1s, SBI feedback, goals,
  GROW, pulse, decisions, recognition, succession, health/signals, local persistence, and the new
  evidence-backed review lifecycle were exercised by the baseline suite.
- **Broken/environmental:** the first test invocation could not find `jsdom` because installed
  dependencies were absent. `npm ci --ignore-scripts` restored the lockfile dependencies; this was
  not an application regression. The previously recorded server process was not present, so a new
  HTTP smoke server was started and checked.
- **Shallow or missing:** feedback had a conversation date but no observation date; goal ownership
  had no authorship context; there was no delegation collection, authority model, follow-through
  state or return-to-leader history. Existing goal editing could not correct authorship because
  neither the field nor a complete edit path existed.
- **Legacy scope:** legacy React/Next trees remain non-canonical and were not compiled or executed
  in this session. Historical error-count claims are not reused as current measurements.

## Research and selection

The owner explicitly selected **all three** former roadmap priorities. Gallup's timely-feedback
research supports measuring observation-to-conversation delay but does not validate a universal
seven-day cutoff. Gallup's collaborative-goal research supports recording involvement without
claiming causation or inventing unknown authorship. CCL's delegation guidance makes authority,
resources, direction and support part of the handoff; Asana benchmarks one visible owner, due date,
status and completion. Full links and design consequences are in `RESEARCH.md` §§1, 7 and 13.

The product choice was to make three different truths queryable, not to add a composite score:
when did the behavior happen versus the conversation; who shaped the objective; and who owns the
delegated outcome with what decision boundary and result.

## What changed

- **Schema v3 + migration:** added `feedback.observedOn`, tri-state `goal.coAuthored`, normalized
  `delegations`, and configurable `feedbackLatencyTargetDays` / `delegationCheckinDays`. Tested
  v1→v2→v3 migration preserves unknown as null. Import normalization validates calendar dates,
  reports damaged delegation check-ins/orphans, and never turns missing latency/authorship into
  zero/false. Existing local storage keys and JSON export/import remain compatible.
- **Feedback latency:** capture and date-correction dialogs distinguish observation from discussion.
  Pure statistics report measured samples, average, maximum, delayed and unknown counts over 90 days;
  received/upward feedback is excluded. `FB-06` links to a filtered list of only measured delayed
  items. Review evidence includes the observed date and real gap.
- **Goal co-authorship:** person-owned goals record co-authored, explicitly leader-set, or unknown;
  team goals are not applicable. The goal edit dialog preserves identity, owner, key results and
  check-in history. `GOAL-06` fires only for explicit leader-set records, never unknown. Review
  evidence labels the capture-time authorship.
- **Delegation lifecycle:** added a pure domain module, dedicated route, four authority choices,
  support/outcome/due-date capture, dated on-track/blocked check-ins, completion notes and explicit
  return-to-leader reasons. Overdue, blocked and checkpoint-due facts remain independent. Closed
  records are read-only history in the UI. All writes validate chronology and emit audit events.
- **Cross-product integration:** `DEL-01`…`DEL-03` feed Signals/Today; blocked/overdue/checkpoint
  outcomes enter suggested 1:1 agendas; person pages link to delegation history; review packets
  include dated in-period delegation events with capture-time status/authority and source links.
  Settings exposes both conventions and record counts. Demo cleanup removes delegations attached
  to fabricated people while preserving real-person work.

## Corrections and verification

Same-day check-ins now use the later entry as current, so a second note can unblock the first
without erasing history; an overdue fact still remains overdue until completion/re-planning.
The focused new suite initially had two incorrect expectations (one ignored that remaining overdue
fact, one expected the short authority label); those tests were corrected rather than weakening the
implementation. Stale schema-v2/no-delegation assertions were updated for the intentional v3 model.
Final source review also made goal ownership explicit and fixed during authorship editing, added a
real feedback date-correction workflow, rejected future conversation/delegation dates, and prevented
completion/return from predating check-ins. Import normalization leaves damaged authorship unknown
and drops post-terminal check-ins with warnings rather than hiding the repair.

```text
npm test                         → 113 pass / 0 fail
node --check (every app JS file) → 38 modules, no syntax errors
git diff --check                 → clean
live HTTP smoke                  → shell + 38 JS modules + CSS; 0 unresolved imports
preview Host/Origin smoke        → accepted; no preview-breaking response
static scan of app/**            → no runtime innerHTML/eval/fetch/XMLHttpRequest path
```

Real-dialog tests cover feedback observation capture/correction/filtering, goal authorship editing,
and delegation create → blocked check-in → edit → completion → review source drill-down. Other
regressions cover migration, invalid chronology, unknown-vs-zero/false, same-day unblock, terminal
outcomes, reload persistence, audit events, suggested agendas, review evidence and demo cleanup.

Demo baseline at `2026-10-24T10:00:00Z`: health **54.5 (D)**, trend **+1.7**, pulse **2.55/5 (n=5)**;
**32 findings / 10 urgent / 2 wins**; all 14 application routes rendered. Four measured feedback items average
**3.0 days**, with one beyond convention. Five person-owned goals split **3 co-authored / 2 explicitly
leader-set**. Delegation contains **2 active** (one blocked/overdue, one check-in due), **1 completed**
and **1 returned**; these values are computed from the records, not hard-coded into the insights.

## Known limits and next

Seven days is a configurable team convention for latency/check-ins, not a validated universal score.
Review delegation status/authority is capture-time context, not reconstructed period-end history.
There are no notifications, background schedules, employee accounts or automatic reassignment.
`localStorage` remains unencrypted and is not a backup. No real-manager longitudinal validation was
performed. Real-browser visual inspection of the new delegation layout and print output remains
`[UNVERIFIED]`; jsdom workflows and HTTP module loading are verified.

Next up (from roadmap): a structured conflict-resolution record; honest team-level trends for every
dimension (including latency/delegation where dates support them); CSV export that preserves unknowns.

---

# Session — 2026-10-24 · 4 · Conflict follow-through and audit-led safety

## Audit before implementation

Used the existing real checkout of `shahramclaude/Leados`, branch
`arena/cc9b357a-leados`, starting clean at `b0986b4d0b5531dbb454e857fc05256c475a18c5`.
Verified the actual remote rather than changing it to match a different owner URL. No
branch switch, reset, repository replacement or framework/component rewrite was performed.

- Read the canonical entry/import graph, store/schema/actions, domain rules, forms/views,
  tests and persistent roadmap/research; inventoried the historical source/DB/entry points.
- Scanner inventory read all tracked source for paths, size/lines/hash/imports/stub markers:
  **3,650 tracked files / 3,495 source files / 316,352 source lines**, 262 Next pages and
  903 DB-importing files. This is **not** a claim of personal line-by-line review of all
  legacy source; detailed legacy correctness/security/builds remain **[UNVERIFIED]**.
- `src/db/` exists, including PostgreSQL/Drizzle setup and schema/repositories. The prior
  absent-layer assertion was false. Corrected README, the historical audit and ADR-0006;
  did not silently recycle historical TypeScript counts as current evidence.
- `npm ci --no-audit --no-fund` restored 435 locked packages. A pre-install test attempt
  lacked jsdom; after install the unmodified canonical baseline passed **113/113**.
- Verified defects: goal/delegation tab IDs did not match the shared `key` contract;
  demo protection omitted delegations; pulse charts/comments/sparse imports bypassed parts
  of the stated privacy policy; Settings claimed rejected frameworks; no conflict lifecycle.
  The final review also found future-schema downcasting, export-fallback Close, floor-copy
  mismatch and the static server's insufficient private-file denylist.

Full scope, source evidence and remaining limits: `docs/AUDIT-2026-10-24-session-4.md`.

## Fresh research and autonomous priority

Read Acas mediation guidance, CIPD's public mediation-guide introduction (not member-only
content), Harvard Program on Negotiation workplace-conflict guidance and Lattice's
record-of-discussion pattern; benchmarked Lattice action-item carry-forward. Links and
implementation/rejection decisions are in `RESEARCH.md` §14. An encountered July-2026
Acas disciplinary-code draft was not treated as current binding law.

Conflict resolution was the first unbuilt whole-job workflow on the roadmap. The selected
increment helps a novice leader hear interests, agree owned changes and check the result,
instead of treating a meeting or proposal as resolution. It is a manager's working record,
not mediation competence, legal advice, a confidential HR case system or automatic reporting.
No owner-supplied architecture/feature spec was requested.

## What changed

- **Schema v4:** additive v1/v2/v3 migrations, normalized conflict collection and JSON/reload
  continuity. Unknown consent stays unknown. Invalid/future history, unsupported closure,
  duplicate/malformed history and oversize imported content produce repair warnings.
  Oversize new writes fail before state or events change, rather than cutting off notes.
- **Conflict lifecycle:** 2–8 distinct participants (including people outside the roster),
  separate perspectives/interests, explicit route/participation/process/sharing limits,
  1–12 owned dated commitments, real result notes, all-party follow-up and closure. Each
  agreement/check captures its situation/process/participants. A changed situation or
  discussion context needs a new confirmed version; prior versions/results remain.
- **Real closure gates:** agreement is not resolution; a same-day check before results
  cannot verify them. Current-context delivered commitments and the latest confirmed
  holding check must match. Closed records are read-only. Reopening retains history and
  needs a fresh check; the verification boundary survives import and damaged boundaries
  conservatively require rechecking.
- **Support boundary:** unknown/serious assessment or declined participation blocks the
  informal-agreement path. Manual support handoff records who to contact and when to check,
  explicitly sends nothing and is not resolution; reopening never silently changes safety.
- **Integrated UX:** list/detail routes, readiness explanations, filters, history, dynamic
  participant/commitment fields without nested forms, clear validation/persistence errors,
  safe text rendering, keyboard focus after row removal/save and responsive styles.
- **Exposure minimisation:** conflict content never feeds automatic review evidence, person
  timelines/findings, agendas, readiness or health scores. `CFL-01`…`CFL-04`, Today and generic
  audit events contain counts/status only and work without roster entries. Full explicit
  JSON backups include private notes; unencrypted-storage warnings are visible in the app.
- **Pulse safety:** same complete four-answer cohort for all means/trends; whole-vector
  suppression for any unanimous dimension or per-response overall mean. Comments need their
  own nonempty varied cohort. Future replies are excluded; missing/blank/boolean scores do
  not become low answers; suppression stays null in comparisons. UI/API/load agree on a
  supported floor of 3–25, default 5, without claiming guaranteed anonymity/independent raters.
- **Storage safety:** future/invalid schemas are refused on import and protected on load.
  API/direct/demo/cleanup writes cannot downcast them; export preserves the exact original.
  Only explicit compatible import/reset can replace protected data, after successful saving.
- **Server hardening:** allow only the canonical shell/assets; block scratch backups, `.env`,
  Git internals, test tools, legacy source, symlink aliases and traversal; GET/HEAD only.
  Old console/docs paths are no longer published by this server, though files are preserved.
- **Small regressions fixed:** goal/delegation filter keys, delegation/conflict-only demo
  protection and dynamic cleanup, Settings copy-export Close, unsaved “Last saved” label,
  inaccurate live framework/privacy claims, shared header grouping and disabled affordance.
  Actual browser axe findings led to fixing sidebar heading contrast, not disabling a rule.

No application runtime/package/lockfile dependency, account, backend, network integration or
model inference was added. Optional Chromium/Playwright/axe tools are pinned in ignored scratch
and documented in the committed reproducible browser script.

## Verification performed

```text
npm test                              → 161 pass / 0 fail / 0 skipped (21.92s)
New suites                            → 29 conflict + 10 pulse + 5 storage + 4 HTTP tests
node --check app JS/server/smoke       → 43 canonical JS modules + scripts, clean
git diff --check                      → clean
live HTTP graph + preview Host/Origin  → shell, CSS, 43 JS modules resolve; preview accepted
live private-path denial              → repository/credential/scratch/legacy paths blocked
Chromium 153.0.8010.0 lifecycle         → create → agree → result → check → resolve → reload
                                        → reopen → support handoff → download/upload JSON
mobile 390×844                         → all 15 main routes, no horizontal overflow
axe 4.11 WCAG A/AA                     → 0 violations in six selected desktop/mobile states
browser errors / external requests    → 0 / 0 observed in smoke
fresh npm audit --omit=dev             → 1 critical + 2 high legacy findings, not fixed
```

Tests cover rejected input without partial writes/events, date ordering, explicit consent,
context/version changes, stale/same-day/reopened verification, manual support, migration,
reload/import/export, demo cleanup/protection, persistence warnings, private-data isolation,
real dialogs, XSS-safe content, tabs and keyboard behaviour. HTTP tests use an actual scratch
backup and a symlink alias to verify they cannot be served, not only nonexistent filenames.
Desktop/mobile conflict screenshots were inspected. Browser evidence is ignored scratch;
`scripts/app-browser-smoke.mjs` documents exact reproduction. All generated data was synthetic
verification data, never an unlabeled product record or a new conflict demo case.

Optional demo at `2026-10-24T10:00:00Z` remains health **54.5/D**, previous **52.8**, delta
**+1.7**, **32 findings / 10 urgent / 2 wins**, pulse **2.55/5 from 5 complete responses**.
The corrected comment policy releases **0 comments**. No conflict cases were invented on
migration or silently added to real workspaces.

## Tradeoffs, unverified work and delivery

Pulse release is intentionally more conservative: sparse/unanimous/thin-comment windows may
now hide data that was previously visible. The server intentionally no longer publishes legacy
or arbitrary repository paths. These are safety restrictions, not accidental missing features.

Local notes/exports are still unencrypted; no access controls or guaranteed anonymity exist.
A manager's confirmation is not an employee signature or independent testimony. Handoff does
not contact anyone. No real-manager longitudinal validation or legal/fairness certification was
performed. General events are capped at 600, not unlimited/tamper-proof; corrupt-JSON quarantine
is best effort and bounded. Historical health values remain approximate for overwritten fields.

**[UNVERIFIED]:** detailed personal audit/runtime/security of the whole legacy tree, fresh
Next/TypeScript builds, Safari/Firefox, actual assistive-technology users, print visual output
and large-workspace performance. Chromium/axe coverage is selected states, not universal AA
certification or all workflows on physical phones. Fresh dependency advisories in the unused
legacy Next/PostCSS/Sharp chain remain open; canonical tests are not clearance to deploy it.

Delivery is the session commit on `arena/cc9b357a-leados` in the configured GitHub repository;
Git history is the source of its hash. No other branch, PR merge or main deployment is implied.
Mandatory `index.html`, README, session log, roadmap/research and affected sources are included.

Next up (from roadmap): honest team-level historical trends; unknown-preserving, formula-safe
CSV export; optional local encryption with tested migration/recovery.

---

## Session 5 — 2026-10-24 — Longitudinal Team-Health & Habit Trends (Schema v5) + Safe Scoped CSV Export

### Current-state audit before writing code
- Read `index.html`, all 43 pre-session JS modules + `app/styles.css`, `scripts/serve.mjs`,
  `scripts/app-browser-smoke.mjs`, all 9 test files in `tests/app/*.test.mjs`, and root docs.
  Full audit recorded in `docs/AUDIT-2026-10-24-session-5.md`.
- Baseline `npm test` after `npm ci --no-audit --no-fund --ignore-scripts`: **161 pass, 0 fail**.
- Verified source-level defects before adding features:
  1. `truncateState` (`app/core/domain/health.js`) kept `status: 'archived'` even when
     `archivedAt > asOf` (survivorship bias), overwrote pre-checkin goal `confidence` to
     `'on-track'`, and lacked dated snapshots for KR values and action/goal/plan completions.
  2. `teamHealth` 30-day delta compared raw `overall` across shifting dimension subsets
     (composition / Simpson's paradox when a dimension such as pulse `wellbeing` first unlocked).
  3. `wellbeingDimension`, `pulseChart` and `views/health.js` had minor wording inaccuracies
     when blocked for `'unanimous'` or when `incompleteResponses > 0`; `pulse.js::comments`
     did not apply `Math.max(3, ...)` when called directly.
  4. `personTimeline()` omitted dated `delegations` lifecycle events; `views/settings.js`
     used `new Date()` instead of `ctx.now` in `checkExportFirst()`.

### What was built
- **Schema v5 (`app/core/schema.js`, `app/actions.js`, `app/core/demo.js`):**
  - Additive `4 → 5` migration preserving unknown historical dates/snapshots as `null`
    (never fabricated), while preserving `initialConfidence` and `initialCurrent` on goals
    that had zero check-ins at migration time.
  - Write-path mutations record `completedOn` on 1:1 actions and GROW `will` items,
    `followUpCompletedOn` on feedback, `initialConfidence` / `completedOn` / `krUpdatedOn` /
    `initialCurrent` / check-in `{ progressPct, keyResults }` on goals, and `closedOn` /
    `stagesUpdatedOn` on GROW plans.
- **Bias-resistant reconstruction & longitudinal trends (`app/core/domain/health.js`, `app/core/domain/trends.js`, `app/ui/charts.js`, `app/views/health.js`, `app/views/today.js`, `app/core/domain/people.js`):**
  - `reconstructStateAt()` restores `active` status when `archivedAt > asOf`, reconstructs
    dated check-in/completion snapshots, and returns per-dimension `fidelity` (`exact` vs
    `approximate` with explicit reasons).
  - `teamHealth()` and `buildTeamTrends()` compute matched-dimension deltas (`matchedDelta` +
    `coverageChanged`) so unlocking a new dimension never produces a false composite drop.
  - `buildTeamTrends()` computes 8-week, 12-week and 6-month checkpoint series across all 5
    health dimensions, composite health, feedback observation-to-conversation latency and
    delegation follow-through, guarding pre-activity windows as `pre-history` (`null`) and
    enforcing full pulse anonymity/unanimity rules on every historical window.
  - Accessible `trendChart()` and `latencyChart()` use non-color stroke dash + marker shape
    coding, hollow markers for approximate checkpoints, non-interpolated gaps, `role="img"`
    summaries and collapsible `<details><table scope="col|row">` data tables.
  - `personTimeline()` now includes dated delegation start, completion and return events while
    continuing to exclude private `conflicts`.
- **Purpose-limited, formula-safe CSV export (`app/core/csv.js`, `app/core/store.js`, `app/main.js`, `app/views/settings.js`):**
  - RFC 4180 CRLF serializer and state-machine parser (`escapeCsvCell`, `serializeCsv`, `parseCsv`).
  - Neutralizes OWASP CWE-1236 spreadsheet formula payloads starting with `=`, `+`, `-`, `@`,
    tab, CR, LF, leading whitespace before triggers, and full-width `＝`/`＋`/`－`/`＠` via a
    leading `'`, while formatting finite negative numbers numerically and `null`/`undefined`
    as empty `""` cells.
  - 13 scoped tables (`people`, `oneOnOnes`, `actions`, `feedback`, `goals`, `delegations`,
    `growthPlans`, `recognition`, `decisions`, `reviews`, `pulseSummary`, `healthTrends`, and
    opt-in confidential `conflicts`). `pulseSummary` exports only anonymity-checked weekly
    aggregates and independently thresholded comments — never individual rows or `personId`.
  - Read-only `store.exportCSV()` works even under `QuotaExceededError` and refuses with
    `writeBlockReason` when storage holds a protected future schema version.

### Verification performed this session
```text
npm test                               → 173 pass / 0 fail / 0 skipped
New suites                             → tests/app/trends.test.mjs (7) + tests/app/csv.test.mjs (5)
node --check app/** + scripts/**       → 45 canonical app JS modules (75 total w/ scripts), clean
live HTTP server (scripts/serve.mjs)   → /, /app/core/domain/trends.js, /app/core/csv.js, views 200 OK
axe-core 4.11 (via JSDOM)              → 0 semantic/ARIA/label/table violations on #/health & #/settings
```
- **[UNVERIFIED] in real browser binary this session:** no Chromium/Firefox binary or
  `playwright-core` package is installed in this container, so real-browser pixel rendering,
  `color-contrast` raster sampling, physical mobile overflow and browser print/PDF output
  remain `[UNVERIFIED]` in a live browser binary (CSS foreground/background contrast ratios
  were verified mathematically against `:root` tokens at >= 4.5:1 text and >= 3:1 marks).
  Legacy `src/**` Next.js/PostgreSQL trees also remain `[UNVERIFIED]`.

Next up (from roadmap): optional local encryption of the browser store via passphrase-derived
WebCrypto (`AES-GCM` + `PBKDF2`) with tested plaintext→encrypted migration and recovery warnings;
structured 1:1 prep templates & printable individual coaching packets.

---

## Session 6 — 2026-10-24 — Optional passphrase encryption for the local workspace

### Current-state audit before writing code
- Read `index.html`, `scripts/serve.mjs`, `package.json`, `app/main.js`, `app/actions.js`,
  `app/core/store.js`, `app/core/schema.js`, `app/core/time.js`, `app/ui/dom.js`,
  `app/ui/components.js`, `app/views/settings.js`, `tests/app/app.test.mjs`,
  `tests/app/storage-safety.test.mjs`, and the root governance docs (`README.md`,
  `ROADMAP.md`, `RESEARCH.md`, `LEADOS-STATE.md`, the Session 5 audit and session log).
  Full audit recorded in `docs/AUDIT-2026-10-24-session-6.md`.
- Baseline `npm test` after `npm ci --no-audit --no-fund`: **173 pass / 0 fail**. (The first
  run failed 5 suites with a missing `jsdom` module — a dependency-install gap, not a defect.)
- Confirmed the gap that `ROADMAP.md` ranked first: the single `localStorage` blob and every
  JSON/CSV export held 1:1 notes, review reflections and confidential conflict records in plain
  text. Also confirmed three structural obstacles to fixing it safely: the load path treats any
  unparseable blob as corrupt and quarantines it; every write was synchronous and the
  "saved / unsaved" label depended on a synchronous return; and no secure-context check existed
  for WebCrypto.

### What was built
- **`app/core/crypto.js` (new, no I/O):** PBKDF2-HMAC-SHA-256 at 600,000 rounds with a random
  16-byte salt derives an AES-256-GCM key; each seal uses a fresh 96-bit IV. Versioned,
  self-describing envelope (`format`, `v`, `purpose`, `kdf{name,hash,iterations,salt}`, `iv`,
  `ct`, `createdAt`). The KDF header fields are bound into the GCM additional authenticated
  data, so downgrading the iteration count or swapping the salt fails authentication rather
  than silently weakening the file. Strict hand-rolled base64 (no `atob`/`Buffer` dependency),
  passphrase policy (12-character floor, no character-class rules, rejects leading/trailing
  whitespace and a single repeated character), iteration floor (10,000) and ceiling (2,000,000)
  on read to refuse a CPU-burning file, and injectable WebCrypto so the same code runs in a
  browser, in Node and in jsdom.
- **`app/core/store.js`:** a vault state machine (`plain` → `locked` → unlocked) with
  `unlock`, `lock`, `enableEncryption`, `changePassphrase`, `disableEncryption`,
  `exportEncrypted`, `importBackup`, `flush` and `vaultStatus`/`vaultFacts`/`cryptoAvailable`
  getters. Safety properties, each covered by a test:
  - Vault envelopes are detected **before** the corrupt-JSON quarantine path, so ciphertext is
    never set aside as corruption.
  - While locked, `writeBlockReason = LOCKED_MESSAGE` blocks `update()`, the whole action API,
    demo loading, demo cleanup, reset and CSV export; the stored bytes are asserted identical.
  - `exportJSON()` while locked returns the untouched encrypted file, never a freshly built
    (and therefore empty) workspace.
  - A **backup envelope sitting in storage** (or any envelope whose decrypted payload is an
    export wrapper) is refused rather than opened: normalizing the wrapper would have produced an
    empty workspace and the next edit would have overwritten the ciphertext.
  - Enabling encryption derives, seals, decrypts, compares, *then* overwrites; a failed write
    leaves the plain-text workspace byte-identical and encryption off.
  - Encrypted writes are serialised and coalesced through a promise chain with a monotonic
    sequence number; `flush()` awaits it, and `persistAwaited()` is used wherever adoption
    depends on the write (imports, enable, disable, passphrase change).
  - A storage mode change is computed first and committed to memory only after the write
    succeeds, so a failed import cannot leave the app believing it is encrypted.
- **`app/views/vault.js` (new):** the only screen rendered while locked — no navigation, no
  topbar actions, no records. Unlock form with a live `role="alert"` error, unsuccessful-attempt
  count and an explicit "no lockout, no recovery service" note; show-passphrase toggle;
  download of the untouched ciphertext; and two final exits (restore a backup, or erase the
  workspace after typing `DELETE`). When Web Crypto is unavailable (plain HTTP on a LAN
  address) it says so before a passphrase is typed, disables the unusable form, and keeps the
  download escape hatch available.
- **`app/ui/vault-dialogs.js`, `app/ui/download.js` (new), `app/views/settings.js`,
  `app/main.js`, `app/styles.css`:** "Protect this browser copy" card (enable, lock now, change
  passphrase, turn off, create encrypted backup), an `Export encrypted JSON` action beside the
  existing plain-text export (whose subtitle now states that it is unencrypted), import that
  accepts both file types and prompts for a passphrase when the file is an envelope, and shell
  changes that hide navigation while locked. All async buttons carry a busy label, stay
  disabled while working and keep typed input on failure. The existing `Export JSON` button
  label was deliberately **not** renamed (an early draft renamed it and broke an existing test;
  the label is muscle memory and the subtitle carries the new information).

### Verification performed this session
```text
npm test                               → 193 pass / 0 fail / 0 skipped (12 suites)
New suite                              → tests/app/encryption.test.mjs (20 tests)
eslint app + tests/app/encryption      → clean
node --check canonical modules         → 49 app modules clean
live HTTP (scripts/serve.mjs)          → /, core/crypto.js, views/vault.js,
                                         ui/vault-dialogs.js, ui/download.js → 200
                                       → package.json, scripts/**, tests/** → 404
                                       → POST / → 405
axe-core 4.11 (JSDOM)                  → 0 violations on the new lock screen
```
- Key-derived cost measured, not guessed: 600,000 PBKDF2 rounds ≈ 130 ms per derivation in
  this container (≈ 270 ms for a full derive + re-derive cycle), which is why the default was
  raised from an initial 310,000 to OWASP's current 600,000 recommendation.
- Negative properties asserted by tests: the stored blob contains no person name, no feedback
  text and never the passphrase; a wrong passphrase, tampered ciphertext, altered header or an
  unsupported envelope leaves storage unchanged; a quota failure mid-enable leaves plain text
  intact; a locked workspace refuses all writes and is never quarantined.

### Tradeoffs, unverified work
- Encryption is opt-in and passphrase-only: no recovery key, no key escrow, no idle auto-lock,
  no per-collection keys, and no protection while the workspace is unlocked in an open tab.
  CSV and plain-text JSON exports stay unencrypted on purpose (a spreadsheet export must open in
  a spreadsheet); the UI says so at the button.
- Encrypted writes are queued, so `update()` reports "saved" optimistically and corrects itself
  with a later `persisted`/`update-unsaved` notification; every adoption-critical path uses the
  awaited writer instead.
- **[UNVERIFIED]:** real-browser WebCrypto (Node's `webcrypto` was injected into jsdom), raster
  `color-contrast` sampling, print/PDF output, physical mobile viewports, Safari/Firefox, and
  large-workspace performance. The legacy `src/**` Next.js tree was untouched and unaudited.

Next up (from roadmap): idle auto-lock with a non-destructive prompt; structured 1:1 preparation
and a printable coaching packet; an onboarding 30-60-90 milestone tracker.

## Session 7 — 2026-10-24 — Idle auto-lock for the unlocked encrypted workspace

**Audit before implementation.** Re-read the canonical app (`index.html` + `app/**`, 49 modules). Confirmed the baseline: `npm test` = 193 pass / 0 fail / 0 skipped once `node_modules` is installed (the earlier run failed only because dependencies were absent). Encryption (session 6) ships, but an unlocked tab stays unlocked forever — 1:1 notes, feedback, recognition and conflict records remain readable by anyone using the browser while the tab is open. Per `ROADMAP.md` §"Next", idle auto-lock is the highest-priority missing piece.

**Research.** Reviewed the session-6 encryption rationale (RESEARCH.md §17): the passphrase protects the stored copy but explicitly not "a browser someone can already use while it is unlocked", and "no auto-lock on idle" was a documented known gap. No framework research was needed for this increment — it is a session-security completion of the just-shipped encryption, governed by the existing invariants (no network, no silent fallback to plain text, no destruction of in-progress work).

**What changed.**
- `app/core/idle.js` (new): `createIdleMonitor({ now, thresholdMs, warnGraceMs, onWarn, onLock })` — a store- and DOM-free inactivity state machine. Activity (keydown, pointer, touch, scroll, wheel) resets the clock and cancels a pending lock; `tick()` is driven by the caller on a timer and on `visibilitychange`, so a tab restored from a long background absence is checked immediately rather than silently reset. All time is injected for deterministic tests.
- `app/core/schema.js`: added `idleLockMinutes: 30` to `DEFAULT_SETTINGS` and clamped it to 0–480 in `normalizeSettings` (0 disables).
- `app/actions.js`: `updateSettings` validates `idleLockMinutes` (whole number, 0–480).
- `app/ui/modals.js`: `openSettingsDialog` exposes "Lock after inactivity (minutes)" with help text; the numeric processing loop handles it.
- `app/main.js`: per-app-instance idle monitor — started when the workspace is unlocked and encrypted, stopped when locked or disabled, restarted when the window changes. `ensureIdleMonitor(ctx)` runs on every render. On warn: a non-destructive modal ("keep working" / "Lock now", auto-locks after a one-minute grace, Escape cancels). On lock: the `privacy.idle-lock` event is persisted via `store.update()` before `store.lock()` wipes memory and renders the vault, so the audit trail survives the lock.

**Verification performed this session.**
- `tests/app/idle.test.mjs` (new, 10 tests): no warn/lock before threshold; warn exactly at threshold; warn once, no lock within grace; lock after grace; activity after warning cancels the lock; keystroke-like activity restarts the clock; tab restored from a long background absence warns immediately; short absence does not warn; `elapsed()` reporting; `stop()` prevents transitions.
- `npm test`: **203 pass / 0 fail / 0 skipped** (193 inherited + 10 new).
- `eslint app tests/app/idle.test.mjs`: clean. `node --check` on all touched modules: clean.

**Tradeoffs, unverified work.**
- Idle auto-lock only applies to encrypted workspaces (`store.lock()` requires a vault key); an unencrypted workspace has nothing to lock.
- Default window is 30 minutes; configurable 0–480 in Settings → Cadences and thresholds. A first-time manager can turn it off (0), accepting that an unattended unlocked tab stays readable.
- The one-minute grace and 20-second tick are team-convention values, not validated security timings.
- Real-browser WebCrypto behavior, color-contrast sampling, print/PDF, mobile viewports, Safari/Firefox and large-workspace performance remain `[UNVERIFIED]` (session 6 limitations, unchanged).

Next up (from roadmap): structured 1:1 preparation and a printable coaching packet; onboarding 30-60-90 milestone tracker.

## Session 8 — 2026-10-24 — Printable 1:1 preparation sheet (employee topics + grouped commitments)

**Audit before implementation.** Re-read the canonical app (`index.html` + `app/**`, now 52 JS
modules) and confirmed the baseline before touching anything: `npm ci --no-audit --no-fund`
installed 435 packages, then `npm test` = **203 pass / 0 fail / 0 skipped**. Confirmed the
roadmap's top un-built item (`ROADMAP.md` §"Next" #1): the person page has a "Prepared agenda for
the next 1:1" card and the log dialog prefills agenda suggestions, but there is **no** printable,
shareable single-meeting brief, and no place to record the topics the *person* wants to raise.
The two gaps are linked: an agenda that only exists inside a dialog cannot be walked into a
meeting with, and a leader who has no record of what the person asked for recreates a
status-readout 1:1.

**Research.** Read `RESEARCH.md` §6 (one-to-ones), §2 (GROW), §11 (pulse anonymity) and §14
(conflict privacy), and wrote a new §18 capturing the rationale: consistency-over-frequency and
preparation-over-status-update evidence (Gallup manager research), the pre-read/"one-page brief"
tradition, 1:1 agenda templates in 15Five/Lattice/Culture Amp, the two-way-agenda principle, and
the privacy boundary that a printed sheet is a new exposure surface. The session-6 audit's
`talkingPoints` naming (employee-owned topics) was reused, with the honest label that the manager
is the scribe in a tool with no employee login.

**What changed.**
- **`app/core/domain/prep.js` (new, pure, zero I/O):** `buildPrepSheet(state, personId, now,
  settings)` assembles a printable structure — the person's own topics, `suggestAgenda()` output
  (reasons preserved), every open commitment grouped by source (past-1:1 actions, feedback
  follow-ups, development actions, delegation checkpoints) with overdue sorted first, the last
  meeting's notes/mood/carried actions/recognition, and active goals not on track. It reads
  **never** `state.conflicts` and **never** individual pulse rows, and returns an explicit
  `excluded` list naming both.
- **`app/views/prep.js` (new):** the `#/prep/<personId>` document — back link, printable header,
  privacy banner, four stats, the six sections, and a ruled notes area. `Print / save PDF`
  calls `window.print()`; `Log the 1:1` opens the existing dialog.
- **`app/core/schema.js`:** new exported `normalizeTalkingPoints()` (trim, collapse whitespace,
  case-insensitive de-dupe, 12-item cap) and `talkingPoints` added to the person normalizer, so
  old records degrade to `[]` with no schema bump (`SCHEMA_VERSION` stays 5).
- **`app/actions.js`:** `talkingPoints` accepted on `addPerson` and `updatePerson`.
- **`app/ui/modals.js`:** "Topics they want to raise" textarea in the person dialog; the newline
  textarea is split and normalised on submit.
- **`app/main.js`:** `prep` renderer + document title; the person page's agenda card now links to
  the printable sheet.
- **`app/core/demo.js`:** two demo people seeded with topics so the sheet has real content.
- **`app/styles.css`:** `.prep-*` component styles plus `@media print` rules (cards
  `break-inside: avoid`, the commitment grid becomes a single column on paper, taller rule lines).
- **`index.html`:** build meta now names the prep sheet.
- **`tests/app/prep.test.mjs` (new, 11 tests).**

**Verification performed this session.**
```text
npm test                               → 214 pass / 0 fail / 0 skipped (13 suites)
New suite                              → tests/app/prep.test.mjs (11 tests)
node --check (all 8 touched modules)   → clean
eslint app + tests/app/prep.test.mjs   → clean
live HTTP (scripts/serve.mjs)          → /, app/main.js, app/views/prep.js,
                                         app/core/domain/prep.js → 200; POST / → 405
axe-core 4.11 (JSDOM)                  → 0 violations on the prep sheet
```
- The privacy test asserts the sheet's serialized JSON contains neither the conflict title/summary,
  nor a participant name, nor an anonymous pulse comment, and that `excluded` names both classes.
- Overdue-first ordering is asserted within the 1:1 action group.
- `talkingPoints` round-trips through `updatePerson` → export → `normalizeState`, and malformed
  import (`['ok', '', 42, 'ok ', '   ']`) repairs to `['ok']`.

**Tradeoffs, unverified work.**
- "Topics they want to raise" is manager-entered: the app has no employee login, so the manager is
  a scribe. This is labelled in the dialog help text and in the sheet rather than implied as an
  employee-submitted form.
- The sheet is a regenerated view over current records, not a stored copy, so it reflects the
  store at generation time and cannot recover a conversation that was never logged.
- Print/PDF visual output and real-browser geometry remain `[UNVERIFIED]` (no browser binary in
  this container); the print flow is wired and exercised in jsdom.
- `FEATURES.md` was left untouched: it describes the legacy Next.js tree (leads/scoring/ledger),
  not the canonical app, and updating it is out of scope for this increment. `docs/**` history and
  the legacy `src/**` tree were not re-audited.

Next up (from roadmap): onboarding 30-60-90 milestone tracker; 1:1 follow-through reconciliation.

---

## Session 9 — 2026-10-25 — Structured 30-60-90 onboarding tracker (Schema v6) & audit bug fixes

**Audit before implementation.** Inspected 100% of the canonical application (`index.html`,
`scripts/serve.mjs`, `scripts/app-browser-smoke.mjs`, `app/styles.css`, and all 52 existing ES
modules across `app/**`) plus all 14 existing canonical test suites in `tests/app/*.test.mjs`
(correcting Session 8's "13 suites" count — `tests/app/followthrough.test.mjs` has been present
since Session 3). Installed locked devDependencies (`npm ci --no-audit --no-fund --ignore-scripts`)
and ran baseline `npm test` (**214 pass / 0 fail**). Legacy Next.js/Drizzle/monolith trees (`src/**`,
root `.tsx`/`.ts`/`.js`, `public/`) were inventoried as non-canonical and remain **[UNVERIFIED]**.

Source audit uncovered **7 real bugs/drifts** in shipped canonical paths:
1. **`app/views/prep.js` (`renderPrepSheet`):** Evaluated `state.people.find((p) => p.id === sheet.person.id)`
   *before* `if (sheet.missing)`. On an empty roster `[].find(...)` never ran its callback (so the
   Session 8 test passed), whereas on any populated workspace navigating to `#/prep/<unknown>`
   threw `TypeError: Cannot read properties of undefined (reading 'id')` into the error boundary.
   Also `person` and `prep` route handlers in `app/main.js` did not URI-decode `segments[1]`.
2. **`app/ui/modals.js` (`openSettingsDialog`):** Validated every numeric setting with `n < 1`,
   rejecting `idleLockMinutes = 0` (`"Enter a number of at least 1."`) despite `min: 0`, help text
   (`"0 disables it"`), `schema.js`, and `actions.js::updateSettings` allowing `0..480`.
3. **`app/core/csv.js` (`feedback` scope):** Checked `lat.measured` and `lat.invalid` (both
   `undefined`) instead of `lat.status === 'measured'` / `lat.status === 'invalid'` from
   `feedbackLatency()`, causing every measured feedback row in CSV exports to emit blank
   `latency_days` and `'unmeasured'` for `latency_status`.
4. **`app/views/recognition.js`:** Checked `item.public` instead of `item.visibility === 'public'`,
   rendering every public recognition (including demo records) as `private`; ignored `?person=<id>`
   links from `REC-01` signals; and passed `{ link: true }` instead of `{ onClick }` to `personChip`.
5. **`app/styles.css`:** Base form input selector omitted `input[type="password"]` and
   `input[type="search"]`, leaving modal passphrase inputs in `vault-dialogs.js` unstyled.
6. **`app/views/settings.js`, `conflicts.js`, `health.js`:** Settings cadence list omitted
   `idleLockMinutes`, and storage/privacy banners stated browser storage was unencrypted even when
   `ctx.isEncrypted === true`.
7. **`app/core/csv.js` metadata/columns:** `decisions` CSV claimed `"RAPID"` instead of **DACI**,
   and `people` CSV omitted `talkingPoints`.

**Domain research & gap analysis (`RESEARCH.md` §19).** Selected the #1 roadmap item:
**Onboarding 30-60-90 milestone tracker**. Because `GOAL-05` and `GROW-01` intentionally pause
during `onboardingDays` (default 90 days) and `ONB-01` stops firing once 2 1:1s are held, Days
15–90 previously had zero structured guidance. Grounded the design in Talya Bauer's organizational
socialization levers (*Clarification, Culture, Connection*) and Michael Watkins' 30-60-90
transition phases (*Learn & Connect → Contribute & Calibrate → Own & Transition*), while
explicitly rejecting numeric "onboarding scores", personality/culture-fit ratings, administrative
HR/IT paperwork, and auto-ingestion of onboarding check-ins into performance review packets (to
protect psychological safety when naming month-one confusion).

**What changed.**
- **`app/core/schema.js` & `app/core/store.js` (Schema v6):** Bumped `SCHEMA_VERSION` to `6` with
  additive `5 → 6` migration (`onboarding: []`, zero fabrication), added `'onboarding'` to
  `COLLECTIONS` and `orphanChecks`, added `normalizeOnboardingStakeholders`,
  `normalizeOnboardingCheckpoints` and `normalizeOnboardingReviews` (repairing self-buddies,
  duplicate stakeholders, impossible/future/pre-start dates, and reopening completed plans missing
  a Day 90 check-in), and updated `clearDemo()` to clean orphan onboarding plans/buddy references.
- **`app/core/domain/onboarding.js` (new, pure, zero I/O):** `defaultCheckpoints(startDate)`,
  `onboardingFor`, `activeOnboarding`, `currentPhase`, `newJoinersWithoutPlan`, `onboardingHealth`
  and `onboardingSummary`.
- **`app/actions.js`:** Added validated, event-logged onboarding actions (`createOnboardingPlan`,
  `updateOnboardingPlan`, `addOnboardingCheckpoint`, `toggleOnboardingCheckpoint`,
  `removeOnboardingCheckpoint`, `addOnboardingStakeholder`, `toggleOnboardingStakeholder`,
  `removeOnboardingStakeholder`, `recordOnboardingReview`, `completeOnboardingPlan` gated on a
  recorded Day 90 check-in, and `reopenOnboardingPlan`).
- **Cross-domain & view integration:** Added `#/onboarding` (`app/views/onboarding.js`), 4 modal
  flows in `app/ui/modals.js`, Onboarding card on `#/people/<id>`, `ONB-02`…`ONB-05` + completion
  wins in `app/core/domain/insights.js` (now 46 deterministic rules), onboarding items in
  `suggestAgenda()`, `buildPrepSheet()` (`#/prep/<id>`) and `personTimeline()`, a deterministic
  Day-38 demo plan for Samuel Okafor in `app/core/demo.js`, `onboarding` CSV scope (14 scopes
  total), and all 7 audited bug fixes.
- **`tests/app/onboarding.test.mjs` (new, 5 multi-assertion end-to-end tests)** plus regression
  additions to `prep.test.mjs` and `csv.test.mjs`.

**Verification performed this session.**
```text
npm test                                                       → 219 pass / 0 fail / 0 skipped (15 suites)
node --check (all 54 canonical app modules)                    → clean
npx eslint app scripts/serve.mjs scripts/app-browser-smoke.mjs tests/app → 0 errors, 0 warnings
live HTTP (scripts/serve.mjs on 0.0.0.0:5173 w/ preview Host)  → /, app/main.js, app/views/onboarding.js,
                                                                 app/core/domain/onboarding.js, app/styles.css → 200 OK
axe-core 4.11 (JSDOM)                                          → 0 violations on #/onboarding and #/people/<id>
```

**Unverified items.** Real-browser binary rendering, raster `color-contrast` pixel sampling, mobile
viewport overflow, genuine browser WebCrypto unlock and print/PDF visual layout remain
`[UNVERIFIED]` in this container (no browser binary installed). Legacy Next.js/Drizzle/monolith
trees remain `[UNVERIFIED]`.

Next up (from roadmap): 1:1 follow-through reconciliation; internal role-transition 30-60-90 plans;
selective conflict-redacted JSON export.

---

# Session 10 — 2026-10-25 — 1:1 follow-through: the promise ledger (Schema v7)

**Scope chosen before writing code.** Session 9 closed the onboarding milestone tracker and the
roadmap's next item was explicit: *"the prep sheet lists what was promised; make 'did it happen?' a
first-class workflow inside the following 1:1 log dialog."* Nothing else was started.

## Audit before implementation

- Re-read the whole 1:1 path rather than trusting the docs: `app/core/domain/oneonone.js` (286 L
  before this session), `app/views/oneonones.js`, `app/views/prep.js`, `app/core/domain/prep.js`,
  `openOneOnOneDialog` in `app/ui/modals.js`, the action normaliser and migration table in
  `app/core/schema.js`, `logOneOnOne`/`toggleMeetingAction`/`addMeetingAction` in `app/actions.js`,
  the one-on-one and action exporters in `app/core/csv.js`, and the demo generator.
- Found the real gap: `normalizeActions()` kept `{id, text, due, done, completedOn, personId}`. There
  was no field for "this promise moved to a later conversation", no way to say a promise was
  deliberately dropped, and no link between the original and its replacement. "Carrying forward"
  existed only as a *label* on the prep sheet, computed from `!done`.
- Found the consequence: a carried action and a brand-new action were indistinguishable, so no view,
  insight or export could answer "how long has this been open?" or "what did we decide to stop
  doing?". `CONV-01`…`CONV-05` covered cadence and notes, not follow-through.
- Constants re-checked before coding: 54 JS modules, `SCHEMA_VERSION = 6`, 43 distinct `ruleId`
  literals in `insights.js`, 219 tests in 15 suites, and `index.html`'s `leados-build` meta pinned
  at `schema 6`.

## Research (recorded in `RESEARCH.md` §20)

Vendor practice converges on reviewing the previous meeting's items at the start of the next one
(15Five's **Previous action items**, Lattice's action items that "carry over until checked off",
Fellow's *Always / Never / Ask me* carry-forward setting, Granola's advice that a repeatedly carried
item is a signal rather than a scheduling problem). Gallup's 2025 work reports accountability as the
**lowest-rated of seven** leadership competencies, and SHRM ties unmet promises directly to
mistrust. Two things were deliberately **not** adopted: silent auto-carry (the 15Five/Lattice
default) and any "commitment completion rate" percentage — a practitioner convention with no
published dataset, on manager-entered data that would reward under-recording.

## What changed

- **`app/core/schema.js` (Schema v7).** `SCHEMA_VERSION = 7`; action records gain
  `completedInMeetingId`, `carriedFrom`/`carriedToMeetingId`/`carriedToActionId`,
  `dropped`/`droppedOn`/`droppedReason`/`droppedInMeetingId`. `normalizeActions` enforces the
  invariant that a promise is done, dropped or carried — never two at once — with completion winning
  over a stale link. New `dedupeActionIds()` and `repairCarryChains()`: a link whose successor is
  missing, belongs to another person, moves backwards in time, points into a cycle or is not
  reciprocated is cleared and the promise **reopened** with a plain-language warning; a successor
  that names a predecessor with no forward link has that link rebuilt. `MIGRATIONS[6]` (`'6 → 7'`)
  is additive and invents no history.
- **`app/core/domain/oneonone.js`.** New `isOpenAction`, `followThroughIndex` (one pass per state,
  deriving depth and first-agreed date instead of trusting stored counters), richer `openActions`
  (`carryCount`, `carriedOn`, `firstAgreedOn`, `ageDays`), `reconciliationCandidates`,
  `reconciledInMeeting` and `commitmentCounts`. `suggestAgenda` gained a `followthrough` source that
  names a promise only after it has been carried twice.
- **`app/actions.js`.** `logOneOnOne` accepts `reconciliations: [{meetingId, actionId, outcome,
  due, reason}]` and applies done / still-open / carried / dropped **atomically with the meeting**,
  creating the successor action and both links in the same write. It rejects unknown outcomes,
  foreign or already-closed actions, duplicates, reconciliations on a skipped/moved meeting, a
  source meeting dated after the 1:1, a carry due date before the meeting, an over-long drop reason
  and an invalid action due date. Returns `{ok, id, closed, carried, dropped}` and writes an honest
  event summary ("1 promise closed, 1 carried forward, 1 dropped").
- **`app/ui/modals.js`.** `openOneOnOneDialog` now opens with **"Last time's promises"**: a summary
  line (`3 open commitments · 2 overdue · 1 carried forward before`), one row per open promise with
  its age, due state and carry count, four radios (Done / Still open / Carry forward / Drop) and
  conditional new-date-or-reason fields. Non-held meetings cannot settle anything and say so.
  Changing the person clears every decision, so one person's outcome can never travel to another.
- **Views & exports.** `app/views/oneonones.js` gained a follow-through stat row, an **"Up next"**
  list, a **"Commitments that keep moving"** card, promise badges (`Nd late`, `carried 2×`,
  `no date`) and a per-meeting ledger line; `app/views/person.js` marks `→ carried forward` /
  `⊘ dropped` and warns when one promise has moved twice; `app/views/prep.js` prints
  `carried forward 1× since 20 September`; `app/core/csv.js` exports the ledger (`state`,
  `carried_forward_count`, `first_agreed_on`, `confirmed_in_meeting`, per-meeting `carried_in` /
  `carried_out`) instead of an `owner` column the app never recorded.
- **Signals & history.** `CONV-06` fires at two carries; a new "N promises closed in a 1:1" win
  offsets an otherwise all-alarm feature. `reconstructStateAt()` rewinds completions, drops and
  carries so a trend never claims a promise was closed before the meeting that closed it.
- **Demo.** Deterministic chains: Jordan's promise carried once then confirmed closed in a later
  1:1, Mei's carried once and still open, Freya's completed face to face.

## Verification performed

```text
npm test                                        → 231 pass / 0 fail / 0 skipped (16 suites)
node --check (all 54 canonical app modules)     → clean
npx eslint app scripts/serve.mjs tests/app      → 0 errors, 0 warnings
live HTTP (scripts/serve.mjs, 0.0.0.0:5173)     → /, app/main.js, app/views/oneonones.js,
                                                  app/core/domain/oneonone.js, app/styles.css → 200
                                                  package.json, README.md, .git/config, *.bak → 404
axe-core 4.11 via JSDOM                         → 0 violations on #/oneonones, #/prep/<id>,
                                                  #/insights, #/people/<id> and the open 1:1 dialog
```

The new `tests/app/reconcile.test.mjs` (12 tests) covers the migration, chain and cycle repair,
open-action exclusion and depth, an atomic done + carried + dropped write with export/import
round-trip, eight write-path rejections, board-toggle guards, historical rewind, `CONV-06`, prep/CSV
parity, person/prep rendering and a real-dialog carry → close flow.

## Corrections made while building it

- The first draft of the export kept an `owner` column and wrote `'leader'` for every 1:1, GROW,
  feedback and onboarding row. The application never asked who owned those commitments, so the
  column was asserting a fact. Removed rather than guessed.
- `health.js` originally rewound `done` but kept the meeting ids and carry links. A completion
  attributed to a meeting that did not exist yet would have been "evidence" in a historical
  snapshot; the rewind now clears all three.
- Review evidence said "N done at capture", which was ambiguous once done/dropped/carried existed.
  It now reads `2 actions at capture · 1 done · 1 carried forward`.

## Unverified items

Real-browser rendering, raster contrast sampling, mobile overflow, screen-reader announcement of the
radio-group rows and print/PDF of the updated prep sheet remain **[UNVERIFIED]** in this container
(no browser binary). There is no validation that explicit reconciliation changes team outcomes; the
carry count is descriptive.

Next up (from roadmap): internal role-transition 30-60-90 plans; GROW commitments in the
follow-through ledger; selective conflict-redacted JSON export.

---

# Session 11 — 2026-10-25 — Who owes it: commitment ownership and the leader's own ledger (Schema v8)

**Priority decision, stated before coding.** The roadmap's next item is internal role-transition
30-60-90 plans. This session deliberately built something else, and the reason is a defect I
introduced: Session 10's export had to drop an `owner` column because the application never asked
who owed a 1:1 action. That is not a missing feature, it is a hole in the data model underneath the
feature that just shipped — every promise on the board was indistinguishable from every other one
once the meeting ended. The second reason is in the research: the manager's *own* unkept promises
are the ones teams weight most heavily, and the app tracked only the report's side. Both are
follow-through problems in the module I own, so ownership came first. The roadmap order is otherwise
unchanged.

## Audit before implementation

- Re-read the v7 write path end to end before touching it: `normalizeActions` + `MIGRATIONS` in
  `app/core/schema.js`, `logOneOnOne`'s validation block and atomic reconciliation in
  `app/actions.js`, `addMeetingAction` / `toggleMeetingAction`, the dialog's action fields, the
  1:1 board's promise table, `prep.js`'s commitment assembly, the actions CSV scope and the demo
  generator.
- Confirmed the gap rather than assuming it: `grep -rn "owner" app/` returns only conflict
  agreement commitments (a free-text name inside a conflict record) and goal `ownerId`. There is no
  ownership anywhere on a 1:1 action, and `normalizeActions` was shared with GROW's `will`, so any
  field added naively would have appeared on development actions too.
- Re-ran the baseline first: `npm ci` in the fresh container, then **231 passed / 0 failed** across
  16 suites before any edit. `index.html` pinned `schema 7`; six test files hard-code the migration
  chain, which is the cost of a schema bump and was budgeted up front.

## Research (recorded in `RESEARCH.md` §21)

Zenger Folkman's 1.8M-assessment study puts leaders who "honor commitments and keep promises" at the
13th percentile of overall leadership effectiveness when that is a weakness and the 74th when it is a
profound strength. DDI's forecast has trust in immediate managers down 17 points (46% → 29%) with
"breaking promises" first among trust traps. Gallup finds accountability the lowest-rated of seven
leadership competencies, and the practitioner literature names the mechanism: accountability is a
two-way contract, and "one-way accountability is the death of trust". Every comparable product
records an owner on a 1:1 action (15Five and Lattice default to the creator and allow reassignment to
the other participant only; Fellow surfaces the assignee; templates make Owner a required field).
Two things were rejected on the evidence: defaulting the owner (15Five's behaviour, but it
fabricates responsibility) and any completion-rate score.

## What changed

- **`app/core/schema.js` (Schema v8).** `SCHEMA_VERSION = 8`; `ACTION_OWNERS = ['them', 'leader',
  'shared']`; `normalizeActions` takes `{ withOwner }` and is only asked for an owner on 1:1
  actions, so GROW "will" records are untouched. A new `auditActionOwners` pass clears any value
  outside the vocabulary and reports it (`cleared N unrecognised commitment owner(s)`) instead of
  coercing it. `MIGRATIONS[7]` (`'7 → 8'`) gives every existing action `owner: null` — v7 never
  asked, so none is invented — while a file already relabelled v8 keeps a valid owner.
- **`app/core/domain/oneonone.js`.** `OWNER_LABELS` / `ownerPhrase`, `isLeaderOwned` (leader **or**
  shared), `leaderObligations` (late first, then soonest due, then oldest promise), `ownershipSummary`
  (them / leader / shared / unknown / leaderOverdue) and new `commitmentCounts` fields
  (`leaderOwned`, `leaderOverdue`, `unattributed`). `openActions` and `reconciliationCandidates`
  now carry `owner` and `ownerLabel`.
- **`app/actions.js`.** `logOneOnOne` validates and stores an owner per action (a bad value is
  refused with `field: 'actionOwner'`, never coerced); a carried promise's successor inherits the
  original's owner; `addMeetingAction` gained an optional fourth argument; new `setActionOwner`
  refuses a closed promise, refuses an already-carried original with a message naming the successor
  meeting's date, is a no-op when nothing changes, and logs `oneonone.action.owner`.
- **`app/ui/modals.js`.** The 1:1 dialog asks "Who owes it?" (Not decided / They do it / I do it /
  Both of us) and its toast says when a promise landed on the leader. The reconciliation rows name
  the owner in their meta line, and choosing *Carry forward* states that the new copy keeps it. The
  board's "Add action" dialog asks the same question.
- **Views.** `#/oneonones` gained an **Owner** column (an inline select, accented when it is the
  leader's own) and an **I owe** stat; the "Promises in flight" subtitle counts unowned promises;
  "Commitments that keep moving" names the owner. `#/today` gained a private **"What you owe"** card
  with a one-click Done and a 1:1 shortcut, and a fallback card that asks the leader to name owners
  when nothing is attributed. Person pages, the prep sheet and its summary (`N of the 1:1 promises
  are yours to do`) all mark ownership.
- **Signals.** `CONV-07` — per person, "Mei is waiting on a promise you own", severity 3 rising to 4
  when one person is waiting on more than one — with the overdue date, days late and carry count as
  evidence. `CONV-05` was narrowed to promises the team owes, so a single overdue record no longer
  produces two findings.
- **Exports.** The actions CSV has an `owner` column again, and this time it is a recorded fact:
  blank when unrecorded, and absent for GROW commitments.
- **Demo.** Jordan's activation-metric promise is shared (carried once, then closed in a 1:1), Mei's
  legal sign-off is the leader's own (overdue by 6 days and carried once, so `CONV-07` fires once),
  Freya's map and Samuel's rota belong to them.

## Verification performed

```text
npm test                                        → 242 pass / 0 fail / 0 skipped (17 suites)
node --check (all 54 canonical app modules)     → clean
npx eslint app scripts/serve.mjs tests/app      → 0 errors, 0 warnings
live HTTP (scripts/serve.mjs, 0.0.0.0:5173)     → /, app/main.js, app/views/oneonones.js,
                                                  app/views/today.js, app/core/domain/oneonone.js,
                                                  app/styles.css → 200 (correct MIME types)
                                                  package.json, README.md, .git/config, *.bak → 404
axe-core 4.11 via JSDOM                         → 0 violations on #/today (with the debt card),
                                                  #/oneonones (inline selects), #/prep/<id>,
                                                  #/insights, #/people/<id> and the open 1:1 dialog
```

The new `tests/app/ownership.test.mjs` (11 tests) covers the migration and its repair warning,
owner capture and rejection, carry inheritance, reassignment rules and persistence through
`exportJSON` → `importJSON`, the leader-obligation roll-up and sort order, `CONV-07` firing,
clearing and escalating, CSV truthfulness, the prep sheet and a historical snapshot, the inline
board select (including the closed-promise case) and the Today card plus dialog capture.

## Corrections made while building it

- `normalizeActions` is shared with GROW plans. Adding `owner` unconditionally put a meaningless
  field on development actions; it is now opt-in per collection.
- The first version of the audit counted only non-empty *strings*, so a hand-edited `owner: 42`
  was silently dropped rather than reported. It now keeps the corrupted value as text long enough
  for the audit to count and report it.
- `CONV-05` and `CONV-07` initially both fired for the same overdue leader promise. Splitting by
  owner keeps one fact in one place and makes the two findings mean different things.

## Unverified items

Real-browser rendering and raster contrast of the new inline select and Today card, screen-reader
announcement of a select whose accessible name is built from the promise text, and print/PDF of the
updated prep sheet remain **[UNVERIFIED]** (no browser binary). There is no evidence that recording
ownership changes follow-through; the card is a mirror, not a mechanism.

Next up (from roadmap): internal role-transition 30-60-90 plans; GROW commitments in the
follow-through ledger; selective conflict-redacted JSON export.
