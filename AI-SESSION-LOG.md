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

# Session 12 — 2026-10-25 — Development commitments in the follow-through ledger (Schema v9)

**Priority decision, stated before coding.** The roadmap's next item was internal role-transition
30-60-90 plans. This session built the *second* item — GROW commitments in the follow-through ledger —
first, because the roadmap named it as item 2 and because Session 10's ledger left the module it most
resembles still using a checkbox. After two sessions of rebuilding 1:1 promise handling (v7 ledger,
v8 ownership), the development plan was the last place where "I moved the date" and "we had the
conversation" were the same stored fact. Building role-transition plans on top of an onboarding model
would have been easy; leaving GROW's `will` as the weakest part of the data model was the bigger lie.

## Audit before implementation

- Read the whole v8 growth path before editing: `normalizeGrowthPlans` and `normalizeWillActions` in
  `app/core/schema.js`, the `MIGRATIONS` table, every writer in the growth block of `app/actions.js`,
  `app/core/domain/growth.js` end to end, `views/growth.js`, `views/person.js`, `views/today.js`'s loose
  ends, the growth dialogs in `ui/modals.js`, `domain/prep.js`, `domain/insights.js`'s `GROW-*` rules,
  `domain/health.js`'s rewind, `domain/reviews.js`'s growth evidence, and the `actions` / `growthPlans`
  CSV scopes.
- Confirmed the gap rather than assuming it: a GROW action had exactly `{id, text, due, done,
  completedOn, personId}` plus (since v8) no owner; `reviewOn` was written straight through by
  `updateGrowthPlan`, and `planHealth` treated a pushed date as a scheduled review with no memory that
  it had slipped. There was no record of what a review decided and no way to represent "not doing this
  any more" except deleting the plan.
- Baseline measured first: fresh container, `npm ci --no-audit --no-fund`, then **242 passed / 0 failed**
  across 17 suites before any edit. `index.html` pinned `schema 8`; six test files hard-code the
  migration chain and three pin `SCHEMA_VERSION`, which was budgeted as part of the bump.

## Research (recorded in `RESEARCH.md` §22)

The practitioner literature converges on cadence and record-keeping rather than frameworks: plans die
because "check-ins stop after the initial planning meeting", "nothing is scheduled", and "obsolete goals
stay active"; "annual review is not a cadence, it is a postmortem"; the review must be a documented
conversation ("the conversation is the plan"), and dropping a goal is a *best practice* when priorities
change, not an admission of failure. The habit literature does **not** support a 30-day rule (Singh et
al. 2024: median 59–66 days, range 4–335 for simple behaviours), so the default is labelled a convention.
Gallup's numbers (33% strongly agree their manager helps them set goals they care about; 14% that reviews
inspire improvement) frame why the module matters but are correlational. Product benchmarking: Lattice
Grow and 15Five keep development plans inside 1:1 and review cadence and carry goals forward, but mostly
auto-roll or use a checkbox — nobody exposes the per-commitment decision, which is the gap filled here.

## What changed

- **`app/core/schema.js` (Schema v9).** `SCHEMA_VERSION = 9`. `normalizeWillActions` gained
  `addedOn`, `dropped*`, `carried*` and `completedInReviewId`; new `normalizeGrowthReviews` and
  `repairWillChains` (orphan successor → reopened, missing back-reference → rebuilt, stale or cyclic
  reference → cleared, each reported); plans gained `reviews[]`, `reviewDeferrals`, `reviewMovedOn`.
  `MIGRATIONS[8]` (`'8 → 9'`) adds the fields with `null`/`0`/`[]` and never invents a review.
- **`app/core/domain/growth.js`.** `isOpenWill`, `willChain`/`willIndex` (derived depth and first-agreed
  date, cycle-safe), `willState`, `openWillActions` (late → soonest due → most-carried, with `carryCount`,
  `firstAgreedOn`, `overdue`, `daysUntilDue`), `carriedWillActions`, `reviewHistory`, `lastReview`,
  `reviewedIn`. `planProgress` now counts only live commitments (retired copies, dropped and done split
  out); `reviewState` returns `deferrals`, `lastReviewedOn`, `reviewCount`; `planHealth` names carried
  versions and repeated deferrals; `stagnationDays` counts held reviews and stage edits as movement.
- **`app/actions.js`.** New `newWillAction` factory (one v9 shape, `addedOn` stamped on write). Writes:
  `carryWillAction` (rejects a closed plan, a non-open action, a missing or past date, and an unknown
  review id; links the original and creates the successor **with the id the original already points
  at**), `dropWillAction` (reason 3–300 chars), `logGrowthReview` (validates date/notes/next date and
  every decision, applies them atomically, stamps the review id, resets deferrals), and
  `updateGrowthPlan` now counts a pushed `reviewOn` as a deferral. `saveGrowthPlan`/`addWillAction`
  validate dates and stamp `addedOn`; `toggleWillAction` refuses carried/dropped copies.
- **`app/ui/modals.js`.** `openCarryWillDialog`, `openDropWillDialog` and `openGrowthReviewDialog` — the
  review dialog reuses the 1:1 reconciliation row pattern (four outcomes, per-row date or reason) so the
  same decision looks the same in both places.
- **Views.** `#/growth` shows live commitments with carry badges, overdue state, Carry/Drop per row, an
  expandable closed/moved record with reasons, a review log with what each review settled and a **Hold
  review** entry point; stats now count open / carried / reviews held. Person pages show carried work and
  review count. Today names the person whose development review is overdue and flags commitments
  carried twice.
- **Signals, exports, snapshots.** `GROW-06` (carried ≥ 2×) and `GROW-07` (review moved ≥ 2×); GROW rows
  in the `actions` CSV gain `state`, `carried_forward_count`, `first_agreed_on`; `growthPlans` gains
  `will_open`, `will_carried`, `will_dropped`, `reviews_held`, `last_reviewed_on`, `review_deferrals`;
  `reconstructStateAt` rewinds completion, drops, carries and reviews to the snapshot date.
- **Demo.** Mei's plan now contains a commitment carried twice, one carried once and late, one closed in
  a review, one dropped with a reason, one recorded review and two deferrals — every state reachable
  from the UI without hand-editing a file.

## Verification performed

```text
npm test                                        → 259 pass / 0 fail / 0 skipped (18 suites)
node --check (all 54 canonical app modules)     → clean
npx eslint app scripts/serve.mjs scripts/app-browser-smoke.mjs tests/app
                                                → 0 errors, 0 warnings
live HTTP (scripts/serve.mjs, 0.0.0.0:5173)     → /, app/main.js, app/views/growth.js,
                                                  app/ui/modals.js, app/core/domain/growth.js,
                                                  app/styles.css → 200; traversal, package.json,
                                                  scripts/serve.mjs, unknown assets → 404
axe-core 4.11 via JSDOM                         → 0 violations on #/growth (carried badges,
                                                  Carry/Drop, review log), #/people/<id>, #/today,
                                                  #/settings and the open review dialog
demo baseline at 2026-10-24T10:00Z              → health 55.1 D; 36 findings / 12 urgent /
                                                  24 rule ids / 4 wins
```

The new `tests/app/growth-ledger.test.mjs` (17 tests) covers the migration and its no-invention rule,
chain repair (orphan, back-reference, cycle), carry validation and inheritance, drop-with-reason,
live-only progress, the review write path and each of its rejections, deferral counting and reset,
`GROW-06`/`GROW-07` firing and clearing, CSV parity in both scopes, snapshot rewind, the demo fixture,
and the `#/growth` page plus review dialog in jsdom.

## Corrections made while building it

- **A real defect caught by the tests, not by review:** `carryWillAction` pre-generated the successor's
  id for the original's `carriedToId`, then called `newWillAction` without passing it, so the clone got a
  *second* id and the link pointed at a record that did not exist. `repairWillChains` would have reopened
  the promise on the next load; the test suite surfaced it immediately and the factory now takes the id.
- A scripted edit intended for the new review dialog renamed the 1:1 dialog's submit handler instead,
  which silently broke logging a 1:1 (test 8 went from pass to fail). Reverted and re-applied against the
  unique block.
- My first cycle-repair assertion assumed which end of the loop gets cut. The implementation cuts the
  action's `carriedToId`, leaving exactly one live promise; the test now asserts the invariant (one live
  row, a terminating walk) rather than an implementation detail.
- `README.md` claimed **46** signal rules while the code contained **44** before this session. Rather
  than leave the number accidentally correct after adding two, the count is now verified by grep and the
  stale claim is recorded here.

## Unverified items

Real-browser keyboard/screen-reader behaviour of the per-commitment Carry/Drop buttons, the review
dialog's radiogroup and the `<details>` record, and print output of the growth page remain
**[UNVERIFIED]** (no browser binary; JSDOM + `axe-core` only). There is no evidence that a visible carry
count changes a manager's development behaviour, and a review recorded here is the leader's account of a
conversation, not the report's.

Next up (from roadmap): internal role-transition 30-60-90 plans; selective conflict-redacted JSON
export; a review-due queue on Today.

# Session 13 — 2026-10-25 — Internal role-transition 30-60-90 plans (Schema v10)

**Priority decision, stated before coding.** This session built the roadmap's #1 item — the one
Session 12 deliberately deferred. A first-time leader's most common "first 90 days" is not a hire:
it is promoting someone (classically IC → Lead) and watching them keep doing the old job while
nobody writes down what the new one is. The app forced that situation into a "new joiner" record
anchored to the day the person joined the company — or, more likely, into nothing at all. In plain
language: when you give someone a bigger seat, LeadOS now helps you run their first 90 days in that
seat, with the old job's handover made explicit, instead of pretending they started yesterday.

## Audit before implementation

- Confirmed which app is canonical before touching anything: ADR-0006 names `index.html` + `app/**`
  as the one supported application; the rest of the tree (`src/**`, root TSX, `public/`, `docs/`
  program history) is explicitly non-canonical and was left untouched.
- Ran the incoming test suite before any edit: **259 pass / 0 fail** across 18 suites (after
  `npm ci`; without `node_modules` the jsdom suites fail to load — the first naive `npm test` in
  this container showed 11 false failures for that reason alone, recorded here so the next session
  does not chase them).
- Read the entire onboarding path: `normalizeState`'s onboarding block, `normalizeOnboarding*`
  helpers and the `MIGRATIONS` table in `app/core/schema.js`; every onboarding action in
  `app/actions.js` (create/update/checkpoint/stakeholder/review/complete/reopen);
  `app/core/domain/onboarding.js` end to end; the four onboarding dialogs in `app/ui/modals.js`
  plus the `formDialog`/`buildForm` primitives in `app/ui/dom.js`; `app/views/onboarding.js`,
  the person-page card, `ONB-01`…`ONB-05` + roll-ups + wins in `domain/insights.js`, the agenda
  injection in `domain/oneonone.js`, `domain/prep.js` + `views/prep.js`, the timeline in
  `domain/people.js`, both CSV consumers of `state.onboarding`, the demo fixture and
  `tests/app/onboarding.test.mjs`.
- Confirmed the three concrete gaps in code rather than assuming them: (1) no way to record *what
  kind* of 30-60-90 a plan is or what move it represents; (2) `createOnboardingPlan` defaulted
  `startDate` to `person.startDate`, so any plan for a tenured person was anchored years in the
  past and born "past window" with `ONB-04`/`ONB-05` noise; (3) the six starter checkpoints and
  all user-facing copy assumed a new joiner. Also confirmed what did **not** need to change:
  `onboardingHealth` already anchors every calculation to `plan.startDate` (not tenure), and
  health/trends never read onboarding — so the feature is a record-shape change, not a
  scoring change.

## Research (recorded in `RESEARCH.md` §23)

Watkins' *First 90 Days* data: internal moves (promotions 4.1, unit moves 1.9, function changes
1.8 per leader career) outnumber company joins (3.5), success/failure in the first months predicts
overall success, and 56% of organisations support internal moves poorly — the promoted-from-within
case is the most under-supported of all. Failure modes are diagnostic (over-applying the old
seat's playbook; the "Doer Trap"), not effort. Internal-transfer practice (HiBob, Enboarder)
converges on: handover inventory of the old role, written new-role clarity, new stakeholder
introductions, buddy in the new team. These four map one-to-one onto the new transition template's
Day 30/60 checkpoints; §23 records the full reasoning, the rejected alternatives (resetting
`startDate`, inferring transitions from roster edits, a separate transitions collection, a
transition score) and the sources.

## What changed

- **Schema v10**: `ONBOARDING_KINDS = ['new-hire', 'role-transition']`; plans gain `kind` and
  `label` (≤160 chars). Migration 9→10 labels every existing plan `new-hire` with an empty label
  (the only kind v9 could create) and preserves a valid kind/label on an already-relabelled file.
  `normalizeState` repairs an unrecognised kind to `new-hire` with a warning, clips the label and
  warns (but keeps) an unlabelled transition — repair with a warning, never data loss.
- **Domain**: `planKind()` (pre-v10/hand-built records default to `new-hire` as a fact, not a
  guess), `KIND_LABELS`, `defaultTransitionCheckpoints()` (handover inventory → scope/authority
  delta → first early win in the new seat → 60-day old-habits calibration → end-to-end ownership
  → goals/GROW reset), `onboardingHealth` now exposes `kind`/`isTransition`/`label` and
  transition-flavoured buddy-gap evidence, `onboardingSummary` reports per-kind active counts,
  and `newJoinersWithoutPlan` requires a *new-hire* plan (a transition plan no longer silences a
  joiner's missing onboarding).
- **Write paths**: `createOnboardingPlan` validates kind, requires the label for transitions,
  defaults a transition's anchor to **today** and refuses an anchor before the person joined;
  the one-active-plan refusal now names the existing plan ("already has an active
  role-transition plan ("Support Director")"). `updateOnboardingPlan` accepts kind/label patches
  under the same rules, so a pre-v10 plan can be reclassified without losing checkpoints,
  check-ins or history. Event-log summaries distinguish transitions; event *types* are
  unchanged for history continuity.
- **Surfaces**: `#/onboarding` is now "Onboarding & transitions (30-60-90)" (sidebar and
  document title too) with a kind badge, the label in the card subtitle and a
  "1 onboarding · 1 transition" stat; person pages show "Role transition (30-60-90)" with the
  new scope; `ONB-03`–`ONB-05` and their roll-ups name the transition while `ONB-01`/`ONB-02`
  stay tenure-based; the wins counter counts both kinds; agendas and prep sheets say
  "transition check-in"; the person timeline records transition start/check-ins/completion with
  the label; CSV gains formula-safe `plan_kind`/`plan_label` in the `onboarding` scope and
  "Role transition Day N" `source_type` in `actions`.
- **Dialog**: plan-type select + "New role or scope" field; opening it for someone past the
  onboarding window pre-selects a role transition anchored to today; changing person/kind
  re-anchors the *suggested* date until the leader picks one themselves (after which it is
  never overwritten); sub-dialog titles are kind-aware.
- **Demo**: Mei Lin Chen (260 days' tenure, "wants more decision authority") now has a healthy
  day-12 role-transition plan ("Billing platform tech lead") beside Samuel's new-hire plan, so
  both kinds are visible on first launch; zero `ONB` signals fire for her.

## Verification performed

- `npm test`: **269 pass / 0 fail / 0 skipped** across 19 suites, including the new
  `tests/app/transitions.test.mjs` (10 tests: migration with source-immutability and
  relabelled-file preservation, kind-repair warnings, label-required/anchor rejections writing
  nothing, tenure proven untouched (1,334 days before and after), reclassification preserving
  history, signal wording incl. the joiner-with-only-a-transition-plan edge, Day 90 gate,
  timeline/wins, CSV kind columns + `'=2+5+cmd` label neutralisation, demo fixture, and two
  jsdom dialog flows with `axe-core` 0 violations on `#/onboarding`).
- Existing suites updated only where the schema bump or a deliberate copy change made an
  assertion stale: `SCHEMA_VERSION` pins (3), "'Schema v10'" (1), migration-chain deep-equals
  (7), the `#/onboarding` page title (1) and the wins-title wording (1). No behavioural
  assertion was weakened.
- All 54 canonical JS modules pass `node --check`;
  `npx eslint app scripts/serve.mjs scripts/app-browser-smoke.mjs tests/app` is clean.
- Live HTTP against `scripts/serve.mjs` on `0.0.0.0:5173`: `/`, `/app/main.js`,
  `/app/core/domain/onboarding.js`, `/app/views/onboarding.js`, `/app/ui/modals.js`,
  `/app/actions.js` all serve 200 with correct MIME types; allowlist/404 behaviour remains
  covered by `tests/app/server.test.mjs`.
- **Demo baseline re-measured and a stale claim corrected.** The session-12 baseline paragraph
  (health 54.5 (D), trend +7.7 `exact`, 35/22/12/3) does not reproduce on the untouched
  session-12 tree at its stated clock — measured via `git stash`: health **55.1 (C)**, trend
  **+8.3** (`approximate`), **36 findings / 24 rule ids / 12 urgent / 4 wins**, both before and
  after this session's changes. `ROADMAP.md` and `README.md` now carry the measured figures and
  say so. The identity of the pre/post aggregates is also the regression evidence that this
  session introduced zero health/signal drift.

## Corrections made while building it

- **Tooling confession, recorded for the next session:** batching several `edit_file` calls
  against the *same file* in one response silently dropped some edits (e.g. `SCHEMA_VERSION`
  stayed 9 while the migration to 10 landed; `insights.js` referenced an unimported `planKind`;
  `views/onboarding.js` gained a stray trailing `}` while losing a const declaration). The
  full-suite run caught the blast radius; every intended edit was then re-applied one file at a
  time and verified by grep + `node --check` + targeted tests before the final green run. Rule
  adopted: one edit per file per step, verify before continuing.
- A hand-computed tenure figure in the new test (969 days) was wrong — the engine's 1,334 is
  correct (2024 is a leap year); the test now asserts 1,334.
- `README.md`'s verification section and `ROADMAP.md`'s baseline both carried the stale
  session-12 numbers above; both were replaced with measured values rather than copied forward.

## Unverified items

Real-browser behaviour of the dialog's kind→date re-anchoring (native date pickers, focus
order), keyboard/screen-reader use of the two-kind `#/onboarding` list, and print output
remain **[UNVERIFIED]** (no browser binary; JSDOM + `axe-core` only — same standing debt as
§19). There is no evidence that scaffolding a promotion changes its outcome; the transition
plan, like onboarding, is a mirror of the leader's own follow-through, and it is the leader's
account of the move — the app cannot verify the old role was actually handed over.

Next up (from roadmap): selective conflict-redacted JSON export; review-due queue on Today;
succession → transition handoff; return-to-work ("re-boarding") plan kind.

# Session 14 — 2026-10-25 — Conflict-redacted operational JSON exports

**Priority decision, stated before coding.** This session built the roadmap's #1 item. In plain
language: before today the only way to move your whole LeadOS workspace to another device (or
share records upwards) was a JSON backup that always included every word of the confidential
conflict/mediation records — the most sensitive notes in the app — because the backup was
all-or-nothing. LeadOS can now write an **operational copy**: the same restorable backup with
the conflict records (and even their content-free event-log traces) left out, honestly labelled
inside the file and in its filename, and refused — loudly, with nothing written — if restoring
it would delete real conflict records from the browser you restore it into.

## Audit before implementation

- Re-confirmed the canonical app (`index.html` + `app/**`, schema v10) and the incoming suite:
  **269 pass / 0 fail** after `npm ci`, exactly as session 13 left it.
- Read the full export/import surface before designing: `exportJSON` / `exportCSV` /
  `exportEncrypted` / `importJSON` / `importBackup` / `parseImport` / `adopt` in
  `app/core/store.js`; the Settings export/import handlers; the encrypted-backup and
  passphrase dialogs (`app/ui/vault-dialogs.js`); the lock-screen restore paths
  (`app/views/vault.js`); the `overlayState` modal stack in `app/ui/dom.js` (confirm-on-top-of-
  dialog is supported; `confirmDialog`'s close-before-onConfirm ordering, however, makes a
  promise wrapper around it unsafe, so the new confirmation is a purpose-built `openModal`).
- Verified in code, rather than assuming: conflict content lives only in `state.conflicts`
  (other domains read counts via `conflictSummary`); conflict event summaries are content-free
  but carry `entity: 'conflict'`, timestamps and record ids; no conflict-delete action exists
  (so "records omitted = 0, events omitted > 0" cannot arise from the app itself); the export
  envelope `{ app, schemaVersion, exportedAt, state }` is identical for plain and encrypted
  backups, so a wrapper-level marker is readable on both paths after decryption.

## Research (recorded in `RESEARCH.md` §24)

CIPD mediation guidance: a mediator may report only *that* a meeting took place, never the
detail; multiple professional standards treat even the existence/status of a case as
confidential and destroy mediator notes. GDPR Art. 5(1)(c) minimisation ("adequate, relevant
and limited to what is necessary") — encryption does not excuse unnecessary data. Hence:
events omitted alongside records (counts only, the app's existing `CFL` convention), redaction
available plain and encrypted (applied before sealing), and the feature's real hazard framed
as *restoring from the incomplete file months later* — mitigated by the in-file marker, the
distinct filename, an always-on import warning, and a refusal (`redacted-replacement`) exactly
where records would otherwise die silently. §24 records the rejected alternatives (anonymised
fake names, keeping events, refusing redacted imports outright, guarding 0-omission copies,
inferring redaction without the marker) and sources.

## What changed

- **Store** (`app/core/store.js`): shared `buildExportWrapper` for every JSON backup
  (byte-identical envelope for full exports); `exportRedactedJSON()` returning
  `{ ok, json, omitted }` with locked/unopenable/future-schema refusals mirroring `exportCSV`
  (ciphertext and untouched originals are never handed back labelled "redacted");
  `exportEncrypted(passphrase, { redactConflicts })` sealing an operational copy with the
  omission reported; `parseImport` detects the marker defensively (malformed ⇒ treated as a
  full backup; non-integer counts coerce to 0); `redactionReplacementBlock` guards both write
  paths (`importJSON`, `importBackup`, each gaining `replaceWithRedacted`); `adopt` and
  `importBackup` push a `redactionWarning` and return `redacted` on success.
- **Settings** (`app/views/settings.js`): "Export operational copy (no conflict records)"
  button with plain-language explanation and counts in the toast/fallback dialog; the import
  flow catches `redacted-replacement`, asks via `askReplaceConflictRecords` (danger dialog
  that resolves false on Escape/✕/backdrop/Cancel) and retries only on explicit confirmation —
  across plain, encrypted-workspace and encrypted-file (passphrase retained in closure) paths;
  the encrypted-import success toast now carries the import warning like the plain path does.
- **Vault dialogs** (`app/ui/vault-dialogs.js`): the encrypted-backup dialog gains a
  "Leave out the confidential conflict records (operational copy)" checkbox (both vault and
  passphrase variants), a distinct `leados-operational-encrypted-…` filename and counts in the
  toast/fallback copy.
- **Lock screen** (`app/views/vault.js`): both restore paths append the last import warning to
  the success toast — previously the "records now stored unencrypted" note and (new) the
  redaction note were silently swallowed there. No extra block: `replaceLocked` /
  `replacePlaintext` confirmations already cover total replacement of unreadable data.
- **Wiring** (`app/main.js`): `exportRedactedJSON` exposed; `importJSON` and
  `exportEncryptedJSON` pass options through.
- **No schema change**: the marker lives in the export wrapper, not the state — still v10, no
  migration, `normalizeState` untouched.

## Verification performed

- `npm test`: **281 pass / 0 fail / 0 skipped** across 20 suites, including the new
  `tests/app/redacted-export.test.mjs` (12 tests: exact omission with live state and stored
  blob byte-identical and title/participant strings absent; full-export regression; clean
  import into an empty workspace with the warning; `redacted-replacement` refusal writing
  nothing then proceeding on confirmation via both write paths; ordinary full-backup
  replacement regression; 0-omission copy needs no confirmation and announces completeness;
  malformed markers ignored/coerced; locked refusal with full export still returning untouched
  ciphertext; future-schema refusal with original bytes preserved; encrypted operational
  backup round-trip + guard; jsdom Settings button flow with the fallback dialog's JSON
  asserted, encrypted-dialog checkbox asserted, `axe-core` 0 violations on `#/settings`).
- All 54 canonical JS modules pass `node --check`;
  `npx eslint app scripts/serve.mjs tests/app` is clean.
- Live HTTP against `scripts/serve.mjs` on `0.0.0.0:5173`: `/`, `/app/main.js`,
  `/app/core/store.js`, `/app/views/settings.js`, `/app/ui/vault-dialogs.js`,
  `/app/views/vault.js` all serve 200 with correct MIME types.
- Demo baseline re-measured: health **55.1 (C)**, trend **+8.3** (`previous: 46.8`,
  `fidelity: approximate`), **36 findings / 24 rule ids / 12 urgent / 4 wins** — identical to
  session 13, as expected for a change touching neither demo nor domain code.
- **Debugging note for the next session:** the new jsdom test initially failed its `axe-core`
  assertion with an empty-looking diff — `axeRes.violations.map(...)` returns a jsdom-realm
  Array and `assert.deepEqual` rejects it on prototype mismatch. Wrap in `Array.from(...)`,
  as `csv.test.mjs` already does.

## Unverified items

Real-browser behaviour of the operational-export download handler, the modal-stacked
replacement confirmation inside the import dialog, and screen-reader traversal of the new
Settings paragraph remain **[UNVERIFIED]** (JSDOM + `axe-core` only — same standing debt as
§19/§23). The marker is a declaration, not a proof: a hand-edited file that strips conflict
records *without* the marker is indistinguishable from an honestly conflict-free workspace,
so the import guard cannot fire for it (recorded in `ROADMAP.md` and `RESEARCH.md` §24 rather
than papered over with inference). Whether leaders actually keep operational copies and full
backups distinct in practice is untested against real usage, like everything else in this log.

Next up (from roadmap): review-due queue on Today; succession → transition handoff;
return-to-work ("re-boarding") plan kind.

---

# Session 15 — 2026-10-25

## Audit of current repository state

Read all 54 canonical application modules (`index.html`, `app/main.js`, `app/actions.js`,
`app/conflict-actions.js`, `app/styles.css`, `app/core/*.js`, `app/core/domain/*.js`,
`app/ui/*.js`, `app/views/*.js`), `scripts/*.mjs`, and representative suites in `tests/app/**`,
then ran baseline `npm test` (281/281 passing across 20 suites), `node --check`, and a
programmatic ESLint v9 `no-undef` scan across 82 canonical JS/MJS files.

Five concrete bugs/shallow spots were discovered in the canonical `app/**` codebase alongside
the top three roadmap workflow gaps:

1. **`ReferenceError` crash on `#/people/:id` GROW commitment actions:** `app/views/person.js`
   rendered an inline *Carry* button calling `openCarryWillDialog(ctx, ...)` without importing
   `openCarryWillDialog` (or `openDropWillDialog`) from `../ui/modals.js`, throwing at runtime
   whenever clicked and omitting *Drop* on the person page.
2. **Dead, unmounted suggested-agenda picker in `openOneOnOneDialog`:** `app/ui/modals.js`
   constructed `agendaBox`, wired `personId` change listeners and read `selectedAgenda` on
   submit, and `app/styles.css` already styled `.agenda-picks`/`.agenda-pick`, yet `agendaBox`
   was never passed into `buildForm([...])` — leaving managers unable to see or uncheck the
   auto-logged top-3 suggested agenda items.
3. **`buildForm` prop mismatches & duplicate checkbox `<label for>` elements (`app/ui/dom.js`):**
   onboarding modals passed `boxLabel` and `span: 2`, while `buildForm` only checked
   `checkboxLabel` and `wide` and wrapped checkboxes in an outer `<label for={id}>` *plus* an
   inner `<label class="check" for={id}>` — dropping explanatory checkbox copy and creating
   duplicate label associations.
4. **Retired/dropped GROW commitments leaking into `suggestAgenda` (`app/core/domain/oneonone.js`):**
   `suggestAgenda` iterated `(growth.will || []).filter((w) => !w.done)` instead of
   `openWillActions(growth, now)`, causing dropped and superseded carried-forward GROW
   commitments to reappear in 1:1 agenda suggestions.
5. **Missing `readiness` CSV scope, missing `recognition.visibility` CSV column, raw
   `onboarding` collection label in `#/settings`, and missing `.stack-sm`/`.kv-row` CSS rules:**
   `state.readiness` was the only operational collection with no CSV export; `openReadinessDialog`
   reset `rating` to `'ready-later'` on edit and offered no `notes` field; `recognition` CSV
   omitted `visibility`; `#/settings` showed raw `onboarding` instead of `30-60-90 plans`; and
   `.stack-sm`/`.kv-row` used on `#/people/:id` lacked definitions in `app/styles.css`.

Legacy `src/**`, root `.tsx`/`.ts`/`.js`, `drizzle/` and `public/index.html` remain preserved
and non-canonical (`[UNVERIFIED]` runtime status per ADR-0006).

## Research & prioritisation (`RESEARCH.md` §25)

Synthesised Whitmore's GROW *Will* review discipline (*Coaching for Performance*), Charan,
Drotter & Noel (*The Leadership Pipeline*) + Watkins (*The First 90 Days*), Ladge & Greenberg
(2015) + CIPD return-to-work guidance, GDPR Art. 9 special-category health data minimisation,
and product benchmarks (Lattice Grow / Talent Reviews, 15Five Growth Studio, HiBob / Enboarder
transition & re-boarding templates) to close all three connected execution loops on `ROADMAP.md`
plus the five audited bugs in one coherent Schema v11 increment.

## Changes built

- **Schema v11 (`app/core/schema.js`):** bumped `SCHEMA_VERSION` `10 → 11`; widened
  `ONBOARDING_KINDS` to `['new-hire', 'role-transition', 'reboarding']` (deliberately storing no
  leave-reason or medical field); added optional `notes` (`str(r.notes).slice(0, 1200)`) on
  `state.readiness`; added non-mutating `MIGRATIONS[10]` (`10 → 11`).
- **Today's actionable development-review queue (`app/core/domain/growth.js`, `app/views/today.js`):**
  exported `dueGrowthReviews(state, now)` ordered `overdue` → `soon` (≤ 7d) → `none`
  (unscheduled), excluding future-scheduled plans and archived people; added the
  *Development reviews* card on `#/today` with deferral badges and an inline *Hold review*
  button opening `openGrowthReviewDialog` directly on Today; deduplicated *Loose ends* for
  people already surfaced in *Development reviews*.
- **Succession → role-transition handoff & readiness stretch notes (`app/core/domain/readiness.js`,
  `app/actions.js`, `app/ui/modals.js`, `app/views/readiness.js`, `app/views/person.js`):**
  exported `transitionHandoff(state, personId, seat, now, settings)`; updated `setReadiness`
  and `openReadinessDialog` to store and pre-populate `existing.rating` + `existing.notes`;
  wired *Start transition* / *Open 30-60-90 plan* on `#/readiness` and `#/people/:id` into
  `openOnboardingPlanDialog` with `kind: 'role-transition'`, `label: seat`, `startDate: today`
  and a read-only *Succession handoff* callout — never fabricating `roleClarity` or rewriting
  `person.role`/`person.startDate`.
- **Return-to-work (`'reboarding'`) 30-60-90 plans (`app/core/domain/onboarding.js`,
  `app/actions.js`, `app/core/domain/{insights,oneonone,prep,people}.js`, `app/ui/modals.js`,
  `app/views/{onboarding,person}.js`):** added `defaultReboardingCheckpoints` (6 re-entry
  checkpoints centred on what changed while away, 4-week load pacing, peer catch-up buddy, key
  re-connections, bounded early deliverable, and Day 90 goal/GROW recalibration) and
  `starterCheckpointsForKind`; anchored `'reboarding'` to return date (`>= person.startDate`)
  with optional non-medical context label and explicit privacy copy; wired `ONB-03`–`ONB-05`
  signals, 1:1 agendas, prep sheets, timelines, `#/onboarding` per-kind counts and operational
  JSON exports while keeping joiner-only `ONB-01`/`ONB-02` tenure-based.
- **All 5 audited bug fixes (`app/views/person.js`, `app/ui/modals.js`, `app/ui/dom.js`,
  `app/core/domain/oneonone.js`, `app/views/settings.js`, `app/core/csv.js`, `app/styles.css`):**
  imported `openCarryWillDialog` and `openDropWillDialog` on `#/people/:id`; mounted
  `agendaBox` inside `openOneOnOneDialog`; fixed `buildForm` `boxLabel`/`span: 2` and single
  `<label for={id}>` on checkboxes; switched `suggestAgenda` to `openWillActions`; added 15th
  CSV scope `readiness` + `recognition.visibility` column; labelled `onboarding` as
  `30-60-90 plans` in Settings; defined `.stack-sm` and `.kv-row` in `app/styles.css`; updated
  `index.html` build metadata to Schema v11.

## Verification performed

- `npm test`: **289 pass / 0 fail / 0 skipped** across 21 suites (`tests/app/*.test.mjs`),
  including the new 8-test `tests/app/execution-loops.test.mjs` covering v10→v11 migration,
  `reboarding` lifecycle + signals/agenda/prep/timeline/CSV/redacted-JSON, `dueGrowthReviews` +
  direct `#/today` review settlement, succession → transition handoff + pre-populated
  *Edit rating*, `#/people/:id` *Carry*/*Drop* dialogs, interactive 1:1 suggested agenda
  checkboxes, `buildForm` single-label checkbox accessibility, Settings + `readiness`/`recognition`
  CSV exports, and `axe-core` 4.11 (`0` violations across every touched view and dialog).
- `node --check` passed on all canonical modules, scripts, and test suites; programmatic ESLint
  v9 scan (`no-undef`, `no-unreachable`, `no-dupe-keys`, `no-duplicate-case`, `no-self-assign`)
  passed with **0 errors** across 82 canonical JS/MJS files.
- Live HTTP check against `scripts/serve.mjs` (`0.0.0.0:5173`): `/` (`Schema v11` build tag)
  and `/app/core/schema.js` (`SCHEMA_VERSION = 11`) served `200 OK`; `/package.json` returned
  `404` per allowlist.
- Demo baseline re-measured at `2026-10-25T10:00:00Z`: health **55.1 (C)**, 30-day matched
  trend **+8.3** (`previous: 46.8`, `fidelity: approximate`), **36 findings across 24 rule ids,
  4 wins**, and **2 overdue development reviews** surfaced on Today (Samuel Okafor 9d overdue,
  Mei Lin Chen 6d overdue) — zero unintended health or signal drift.

## Unverified items

Real-Chromium binary execution (`scripts/app-browser-smoke.mjs` — `tmp/browser` Playwright
scratch is not pre-installed in this container), raster `color-contrast` pixel sampling,
physical mobile viewport testing, browser print/PDF visual output, real screen-reader traversal,
and legacy Next.js/React/PostgreSQL trees remain **[UNVERIFIED]** in this session.

Next up (from roadmap): decision review-due queue & outcome follow-through on Today;
delegation → GROW development handoff; 1:1 prep-sheet carry-through into `Log a 1:1`.

---

# Session 16 — 2026-10-25 — Decision Review Queue & Lifecycle Repair, Delegation-to-GROW Handoff, and 1:1 Prep Carry-Through (Schema v12)

## Current-state audit before writing code

Read `index.html`, all 54 canonical ES modules under `app/` (`main.js`, `actions.js`,
`conflict-actions.js`, `styles.css`, `core/*.js`, `core/domain/*.js`, `ui/*.js`, `views/*.js`),
`scripts/serve.mjs`, `scripts/app-browser-smoke.mjs`, `eslint.config.mjs`, `ROADMAP.md`,
`RESEARCH.md`, `README.md`, `docs/adr/0006-canonical-zero-build-app.md`, and representative
suites across the 21 test files in `tests/app/*.test.mjs`. Baseline `npm test` at `b6d177d`
passed **289/289**.

Source-verified gaps and defects identified before writing code:

1. **Decision lifecycle bugs & missing daily review queue (`app/core/domain/decisions.js`,
   `app/actions.js`, `app/views/decisions.js`, `app/views/today.js`, `app/views/person.js`):**
   - `reviewsDue` checked `d.reviewOn && !d.reviewedOn && compareDays(d.reviewOn, today) < 0`
     without checking `Boolean(d.chosen)`, allowing an *undecided* call with a past `reviewOn`
     date to trigger `DEC-02` as if an outcome review were due; `reviewDecision` likewise allowed
     reviewing an undecided call without chronology validation on `reviewedOn`, and
     `reconstructStateAt` did not rewind post-snapshot `reviewedOn` outcomes.
   - `DEC-01` routed to `#/decisions?decision=<id>`, which `views/decisions.js` ignored;
     `DEC-03` asked to *"Name the approver"*, yet no `updateDecision` action or *Edit* dialog
     existed once a decision was created; `#/today` lacked a *Decision reviews* execution card;
     `decisionsInvolving` used substring `.includes()` (`"Bo"` matching `"Bob"`), and DACI
     decisions never appeared on `#/people/:id`.
2. **Disconnected stretch delegations and GROW commitments (`app/core/domain/growth.js`,
   `app/views/delegations.js`, `app/views/growth.js`):**
   - Turning an owned stretch delegation into a tracked GROW `will` commitment required manual
     duplicate entry across `#/delegations` and `#/growth`, with no link preserved across carry
     chains and no coaching reflection prompt when the delegation completed or returned.
3. **1:1 prep-sheet & employee-topic dead end (`app/views/prep.js`, `app/ui/modals.js`,
   `app/actions.js`, `app/views/person.js`):**
   - `#/prep/:id` rendered `person.talkingPoints` and `suggestAgenda` as static text; clicking
     *Log the 1:1* ignored prep selections, collapsed all suggested agenda `source` fields to
     `'suggested'`, and never offered selective clearing of covered employee `talkingPoints`.

Legacy `src/**`, root `.tsx`/`.ts`/`.js`, `drizzle/` and `public/index.html` remain preserved
and non-canonical (`[UNVERIFIED]` runtime status per ADR-0006).

## Research & prioritisation (`RESEARCH.md` §26)

Synthesised Duke (*Thinking in Bets*), Kahneman, Lovallo & Sibony (*Before You Make That Big
Decision*) + Klein (*Premortem*), Bain RAPID / Intuit DACI, McCall, Lombardo & Eichinger / CCL
*Lessons of Experience* (70-20-10 stretch assignments) + Whitmore (*Coaching for Performance*),
Rogelberg (*The Surprising Science of Meetings*), and benchmarks across Cloverpop, Lattice,
15Five and Fellow to ship all three roadmap execution loops plus the audited decision/prep bugs
in one clean Schema v12 increment.

## Changes built

- **Schema v12 & historical rewind (`app/core/schema.js`, `app/core/domain/health.js`):**
  bumped `SCHEMA_VERSION` `11 → 12`; exported `DECISION_OUTCOMES`; added nullable `delegationId`
  on `growthPlans[].will[]` with `auditWillDelegationLinks` (clearing dangling or cross-person
  links with warnings) and undecided-decision outcome-review repair in `normalizeState()`; added
  non-mutating `MIGRATIONS[11]` (`11 → 12`); updated `reconstructStateAt` to rewind post-snapshot
  decision outcome reviews and post-snapshot `delegationId` links.
- **Decision review queue, editability & DACI person-page view (`app/core/domain/decisions.js`,
  `app/core/domain/insights.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/decisions.js`,
  `app/views/today.js`, `app/views/person.js`):** guarded `reviewsDue` on `Boolean(d.chosen)`;
  added `decisionReviewState`, `dueDecisionReviews` (`overdue` + `soon` ≤ 7d, prioritising
  `irreversible` on ties), `decisionsForPerson` and token-safe `decisionsInvolving`; added
  chronology/state validation on `addDecision`, `updateDecision` (preserving option `pros`/`cons`),
  `decideDecision` (optional `reviewOn` adjustment) and `reviewDecision`; added Today's
  *Decision reviews* card with inline *Review outcome*, `?decision=<id>` focus + *Edit* button on
  `#/decisions`, single-target `?decision=<id>` routing on `DEC-03`, and a *Decisions (DACI)*
  card on `#/people/:id`.
- **Stretch delegation ↔ GROW development handoff (`app/core/domain/growth.js`, `app/core/csv.js`,
  `app/core/demo.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/delegations.js`,
  `app/views/growth.js`, `app/views/person.js`):** added `linkedDelegationForWill`,
  `growthLinkForDelegation`, `unlinkedDelegationsForPerson` and `delegationGrowthHandoff`;
  validated `delegationId` across `saveGrowthPlan` and `addWillAction` and preserved it across
  `carryWillAction` and `logGrowthReview`; wired *Add to GROW* / *Start GROW plan* buttons and
  `GROW · <state>` links on `#/delegations`, `?plan=<id>` clear-filter banner on `#/growth`, and
  explicit coaching-reflection prompts (`awaitingReflection` / `wasReturned`) across `#/growth`,
  `#/people/:id` and `openGrowthReviewDialog` without silently auto-closing `will.done`; added
  `linked_delegation_id`, `linked_growth_plan_id` and `will_linked_delegations` CSV columns.
- **1:1 prep-sheet & employee-topic carry-through (`app/core/domain/oneonone.js`,
  `app/actions.js`, `app/ui/modals.js`, `app/views/prep.js`, `app/views/person.js`,
  `app/styles.css`, `index.html`):** added `buildMeetingAgendaCandidates` placing
  `person.talkingPoints` (`source: 'their-topic'`) ahead of provenance-preserved suggestions;
  made *Their topics* and *Suggested agenda* checkable on `#/prep/:id` and wired *Log the 1:1*
  and *Use this agenda* (`#/people/:id`) into `openOneOnOneDialog`; surfaced waiting employee
  topics on `#/people/:id`; updated `logOneOnOne` to clear checked `resolvedTalkingPoints` only
  when `status === 'held'` (refusing on `skipped`/`moved`); updated `index.html` metadata to
  Schema v12.

## Verification performed

- `npm test`: **293 pass / 0 fail / 0 skipped** across 22 suites (`tests/app/*.test.mjs`),
  including `tests/app/decision-growth-prep.test.mjs` covering Schema v11→v12 migration &
  normalization repairs, decision lifecycle/chronology/rewind/DACI/Today queue/`?decision=`/edit
  flows, delegation ↔ GROW handoff/carry/reflection/CSV/rewind flows, prep → 1:1 carry-through
  & selective `held`-only topic clearing, and `axe-core` 4.11 (`0` violations across every
  updated view and dialog).
- `node --check` passed on all canonical modules, scripts and test suites; `npx eslint
  --max-warnings=0 app tests/app scripts/serve.mjs` passed with **0 errors and 0 warnings**.
- Live HTTP check against `scripts/serve.mjs` (`0.0.0.0:5173`): `/` (`schema 12` build tag) served
  `200 OK`, `/package.json` returned `404` per allowlist, and live preview process is active.
- Demo baseline re-measured at `2026-10-25T10:00:00Z`: health **55.1 (C)**, 30-day matched
  trend **+8.3** (`previous: 46.8`, `fidelity: approximate`), **37 findings across 25 rule ids
  (`DEC-02` active on the 4-day-overdue warehouse-metrics decision review), 12 high/critical,
  4 wins**, **2 overdue development reviews** and **1 overdue decision review** surfaced on Today.

## Unverified items

Real-Chromium binary execution (`scripts/app-browser-smoke.mjs` — no Chromium binary installed in
this container), raster `color-contrast` pixel sampling, physical mobile viewport testing,
browser print/PDF visual output, real screen-reader traversal, and legacy Next.js/React/PostgreSQL
trees remain **[UNVERIFIED]** in this session.

Next up (from roadmap): actionable 30-60-90 phase check-in queue on Today; delegation checkpoint &
blocker follow-through queue on Today; post-review coaching continuity (`#/reviews` → GROW / Goals).



---

# 2026-10-25 — Session 17: make 30-60-90 phase conversations executable

## Audited before choosing work

- Confirmed `index.html` + `app/**` are the canonical zero-build product; package scripts,
  server allowlist, bootstrap/routing, schema v12 normalization, copy-before-mutation store,
  visible write-error path and 600-event capped history were inspected directly.
- Read the complete onboarding domain and relevant action/view/modal/form/CSS paths;
  reviewed existing onboarding and previous-session tests, README, research, roadmap and log.
- Mechanical inventory read all 3,688 tracked text files, including 3,527 source files /
  333,249 source lines. This is **not** full personal line-by-line legacy verification;
  the standing every-source-file manual audit remains **[UNVERIFIED]**. The canonical
  module graph had no missing imports; detailed legacy builds/runtimes remain unverified.
- `npm test` before edits: **293 pass / 0 fail / 0 skipped**.
- Highest-value gap: Day 30/60/90 conversations already had validated records and `ONB-04`
  reminders, but no direct execution from Today, unlike development and decision reviews.
  This was already #1 on the living roadmap, so no new architecture was warranted.

## Fresh research and resulting decisions

- Retrieved Sourcegraph's public onboarding-feedback milestones, onboarding reviews and
  hiring-manager responsibilities through GitHub's API, pinned at commit
  `5752928b213a3ddbc7cee4459524f404a5b96fb4`. Its documented Lattice workflow separates
  forms/checklist preparation from the subsequent two-way manager conversation.
- Read Frappe HR onboarding controller/doctype source, pinned at
  `20e9b8934d5f9d63522eb2fbeaa483b00e7cfe4f`, to benchmark anchor-relative activities and
  explicit actionable work. Deliberately did not adopt bulk task-completion semantics.
- Applied Bauer/socialization, Watkins/transitions and psychological-safety guardrails from
  the standing inventory. Fresh findings, precise source boundaries, implemented/planned/
  rejected capabilities and the fixed-seven-day look-ahead caveat are in `RESEARCH.md` §27.
  Vendor websites/live vendor accounts were not accessed; no fresh efficacy claims are made.

## Built incrementally

- Added pure `dueOnboardingReviews(state, now)`: separate unheld phase rows from active,
  started plans belonging to active people, overdue or due within seven UTC calendar days,
  oldest due date first with deterministic ties. Uses the existing diagnostic status;
  never reads conflicts, raw pulse answers or performance-review records.
- Added shared `app/ui/onboarding-checkins.js`. Today shows four oldest conversations,
  honest overdue/soon/plan counts, person/kind/target-date context, direct capture, exact-plan
  navigation and a full-queue overflow link. Empty Today queues are hidden, not fabricated.
- Added `#/onboarding?status=checkins` for the complete executable queue and `?plan=<id>`
  source-record scope. Person/plan filters survive tabs, completed plan links remain exact,
  and stale/archived-person links expose a clear recovery path instead of another plan.
- Reused `recordOnboardingReview` and its existing audit event. Cancelling writes nothing;
  logging does not finish checkpoints, mark other phases held or complete the plan. Dialogs
  identify the person/plan and remind return-to-work users not to store medical/leave reasons.
- Real Chromium uncovered two pre-existing mobile layout defects: full-plan toolbar width
  reached 864px at 390px; Settings export/backup labels reached 406px. Scoped wrapping rules
  now keep both within the tested viewport. No control was removed or functionality hidden.
- Corrected two stale checkbox selectors in the older browser smoke script to their actual
  accessible labels, enabling the existing end-to-end regression to complete.
- Added 12 automated regressions plus a reproducible dedicated Chromium smoke script.
- Updated `index.html`, README, research, roadmap, this log and a dated audit. Marked root
  `ARCHITECTURE.md` as historical/non-canonical and corrected its stale lint-enforcement claim.
- **Schema remains v12.** No runtime package, backend, account, network call, new personal-data
  field or fundamental architectural change. Browser tooling and reports stay in ignored scratch.

## Verification

- `npm test`: **305 pass / 0 fail / 0 skipped** across 23 test files, including the complete
  293-test baseline and 12 new boundary/purity/lifecycle/UI/persistence/security regressions.
- `node --check` on canonical modules/tests/serve/smoke scripts; scoped ESLint with
  `--max-warnings=0`; `git diff --check` pass.
- Chromium **153.0.8010.0**, Playwright Core **1.64.1**, axe **4.11.0**:
  - `scripts/app-onboarding-smoke.mjs` passes desktop/mobile queue → all-due → date validation
    → capture → audit/persist/reload → exact plan → stale link; keyboard trap/Escape checks;
    five WCAG A/AA scans with **zero violations**, including color contrast.
  - `scripts/app-browser-smoke.mjs` passes conflict lifecycle and export/import, keyboard,
    fifteen mobile routes and six further zero-violation WCAG A/AA scans.
  - Both have zero observed browser errors/external app requests, and no horizontal overflow
    in checked states at 1440×1000 / 390×844. Desktop/mobile queue screenshots inspected.
- Demo re-measured at `2026-10-25T10:00:00Z`: **55.1 (C)**, approximate trend **+8.3** vs
  **46.8**, **37 findings / 25 rule IDs / 12 urgent / 4 wins**, unchanged. New queue shows
  Samuel's Day 30 conversation **8 days overdue**. No demo data was changed.
- Fresh `npm audit --omit=dev`: **1 critical / 2 high** legacy dependency findings, unchanged;
  not imported into the canonical runtime, and not treated as cleared for legacy deployment.

## Honest remaining limits

Full manual every-source-line legacy verification/build/runtime/security remediation;
Safari/Firefox; real screen-reader or physical-device testing; print/PDF visual output;
large-workspace performance; cross-browser vault behaviour and real-manager outcome
validation remain **[UNVERIFIED]**. Browser/axe passes are selected-state evidence, not
accessibility certification. Phase support/blocker notes remain unowned free text; a
future explicit handoff should preserve candour and avoid copying into performance evidence.

Next up (from roadmap): executable delegation checkpoint/blocker queue on Today; explicit
performance-review focus → GROW/Goal handoff; owned manager-support commitments after phase
check-ins. All work stays on `arena/47873b08-leados` in the supplied checkout, not the different
owner URL in the standing brief.

---

# Session 18 — 2026-10-25 · Delegation follow-through on Today

## Audit-first state

- Repository: `shahramclaude/Leados`, supplied branch `arena/99a2c68b-leados`, based on
  `d7f4a3c3ae5c10f429918f0e7cd84cd2b08dd372`; initial working tree was clean. The brief names
  `wbweve/Leados`, but this session did not switch repositories/branches.
- Mechanical inventory after the change: 3,695 tracked/untracked non-ignored paths, 3,532 source
  files and 334,151 source lines; 3,099 source files live in the legacy `src/` tree. This is a
  file inventory/import check, not manual line-by-line review of all source. Full legacy audit,
  build/runtime and security remain **[UNVERIFIED]**.
- Read current README, roadmap, research, latest audit/session history and canonicality ADR.
  Directly inspected the canonical shell/bootstrap, v12 persistence/domain/action/delegation
  workflow, Today view, existing queue/dialog patterns, styles and delegation tests.
- Current canonical app remains `index.html` + `app/**`, local-first, browser ES modules,
  with no application backend. Existing delegation records already had due/blocked/stale health,
  an attention page and a validated check-in dialog; Today lacked a direct action lane. No
  architecture change or schema migration was warranted.

## Research refresh and product choice

Read CCL's first-time-manager research and Gallup's delegation article; source descriptions,
limits and rejected score/notification ideas are in `RESEARCH.md` §28. CCL frames the manager's
challenge as supporting without micromanaging or taking back the task. Gallup reports an
association in a selected sample of 143 Inc. 500 CEOs, not universal or causal evidence. Chosen
gap: make existing blocked/overdue/undated/stale delegation signals actionable from Today, while
explicitly treating them as support prompts, not ratings of the owner.

## Built

- Added pure `dueDelegationCheckins` with deterministic priority: blocked, overdue, no due date,
  then stale check-in. It preserves open records for archived owners and reads no conflict/pulse/
  review content.
- Added an accessible Today card with the reason, owner, due date and decision authority; direct
  **Record check-in** uses the existing dialog and offers an explicit completion dialog. Both reuse validated actions/events; links open the
  full attention board or exact delegation record. An on-track entry clears the attention row,
  not the active delegation.
- Kept the card visible for open work even when there is no active roster member; the page still
  invites adding a team without concealing the existing obligation.
- Added four regressions for pure ordering/privacy boundaries, cancel/no-write, audited check-in
  and explicit completion, reload, archived-owner visibility and selected-state axe checks.
- Updated `index.html`, README, roadmap, research, this log and
  `docs/AUDIT-2026-10-25-session-18.md`. Schema remains v12; no dependencies, network, backend,
  notifications or new personal-data fields.

## Verification

- Initial `npm test` was blocked by absent installed `jsdom` in this clean checkout. Installed
  the already-locked test dependencies with `npm ci --no-audit --no-fund` (no manifest changes).
- Targeted suite: 4 pass. Full `npm test`: **309 pass / 0 fail / 0 skipped** across 24 files.
- Selected Today and dialog JSDOM/axe scans report zero WCAG A/AA/21AA violations with color
  contrast excluded; these checks are not a live-browser or accessibility certification.
- All 56 canonical JS modules pass syntax checks; canonical relative-import graph has zero
  missing imports; `git diff --check` passes. Static server shell/new-module HTTP requests return
  200. No real Chromium/mobile, screen reader or human manager study was run in this session.

## Honest remaining limits

No reminders are sent; the seven-day delegation check-in setting is a local team convention.
Manager-entered status does not prove delivery or represent an employee-submitted account.
Safari/Firefox, real assistive technology, mobile browser layout, legacy application builds/security,
large-workspace responsiveness, and manager/employee outcomes remain **[UNVERIFIED]**. Full-source
manual legacy inspection remains incomplete and is not described as done.

Next up (from roadmap): explicit performance-review focus → GROW/Goal handoff; owned manager
support commitments after phase check-ins; real browser/assistive-technology and real-user
validation. All work is confined to `arena/99a2c68b-leados`.

# Session 19 — 2026-10-25 — Explicit Performance-Review → GROW / Goal Handoff (Schema v13)

## Audit-first state

- Checkout: `shahramclaude/Leados`, active branch `arena/3f644552-leados`, starting commit
  `f1c53d1` (merge of PR #17); the working tree was clean at session start.
- Completed a focused audit of the canonical performance-review view/actions, schema, goal and
  GROW dialogs/domains, CSV serializers and adjacent tests before editing. This does not certify
  manual review of the entire legacy repository.
- The review already held manager `development` and `nextSteps`; the gap was that completed
  packets had no intentional route to goal/GROW creation and those records had no source-review
  provenance.

## Research and product decision

- Reviewed CIPD's 2026 performance-management factsheet and MIT HR performance-review guidance:
  both describe continuous, improvement-focused dialogue and deliberate follow-up; CIPD also
  cautions against forcing rigid metrics onto complex work.
- Reviewed Lattice's official March 2026 product notes and Grow product page for the product
  pattern of moving from performance context into development plans/actions. These are vendor
  descriptions, not independent evidence of outcomes. Source details and limits are in
  `RESEARCH.md` §29.
- Selected an opt-in two-choice handoff only after review completion. Review development is
  editable prefill, not an agreed plan. The Goal route requires a user-entered measurable key
  result; the GROW route leaves Reality, Options and Will empty, presenting `nextSteps` only as a
  discussion prompt. Completing a review or opening either form writes no follow-up record.

## Built

- Added Schema v13 / v12 migration and nullable `sourceReviewId` on goals and GROW plans; old
  records remain unlinked. Normalization clears missing/cross-person sources and preserves valid
  provenance if a review is later reopened for correction.
- Added API validation that a handoff source is an existing completed review for the same person;
  the goal form keeps the reviewed person as owner and leaves authorship unknown.
- Added completed-review actions for **Start GROW plan** and **Create goal**, transparent/editable
  forms, a linked-record list on the review, source-review links from goal/GROW views and
  `source_review_id` in both CSV scopes. The GROW dialog discloses when saving will close an
  existing active plan (pre-existing behavior).
- Updated `index.html`, README, roadmap, research, audit and this log. No runtime dependency,
  backend, account, network call, reminder or additional personal-data field was added.

## Verification

- `npm ci --no-audit --no-fund` installed the existing lockfile dependencies; package manifests
  were unchanged.
- Pre-change baseline: **309 passed / 0 failed across 24 test files**.
- First full post-change run found nine stale test expectations for the new current schema version
  and cumulative migration list; no feature test failed. Updated those assertions.
- Targeted review tests: **12 passed**. Targeted app/JSDOM tests: **33 passed**.
- Final full `npm test`: **312 passed / 0 failed / 0 skipped across 24 files**.
- Scoped ESLint across changed application modules and affected migration tests passed. Changed
  JS syntax checks and `git diff --check` passed.
- JSDOM verified both visible paths end to end, no implicit writes on review completion or form
  opening, empty GROW Will before submission, user-authored Will after submission, source
  validation, CSV provenance and links in both directions.

## Honest remaining limits

Real Chromium/mobile interaction, physical-device layout, screen-reader/assistive-technology
checks, print/PDF visual output, human manager/employee comprehension, and outcome improvement
remain **[UNVERIFIED]**. Full manual legacy source review, legacy build/runtime/security, and
large-workspace performance remain **[UNVERIFIED]**. Automated JSDOM results are not usability
research or accessibility certification.

Next priorities: (1) owned manager-support commitments after 30-60-90 check-ins, preserving the
source phase and not copying candid blockers into review evidence; (2) real-browser and
assistive-technology validation of the queues and new review handoff; (3) legacy dependency and
deployment audit before any legacy app is used. All changes are confined to
`arena/3f644552-leados`.

## Session 20 — Explicit manager-owned follow-up after 30-60-90 check-ins

**Starting state:** active branch `arena/ba4903e2-leados` at `d59377d` (merge of PR #18), clean
before this priority. This focused audit covered the 30/60/90 check-in model and save path, the
existing 1:1 reconciliation/commitment ledger, review-evidence assembly, Today and prep-sheet
surfaces, CSV export, schema normalization/migrations and historical snapshot rewind. It did not
claim a manual line-by-line audit of the full repository. Detailed findings are in
`docs/AUDIT-2026-10-25-session-20.md`.

### Research and product decision

ACAS and CIPD induction guidance emphasize planned onboarding, regular manager dialogue, feedback
and review of support needs; MIT HR recommends concrete follow-up and shared responsibility;
Lattice documents assigned/dated action items that persist until completion. Their design relevance
and limits are recorded in `RESEARCH.md` §30. The improvement is an opt-in, dated action the manager
writes after an actually recorded check-in. It keeps stable source-check-in identity, plan, exact
phase and the date captured with the commitment; it is separate from a meeting and from review
evidence. Candid blockers are never prefilled, copied or converted into a task. A later actual held
1:1 may explicitly close, carry or drop the item.

### Implemented

- Added Schema v14 `managerSupport` ledger and stable IDs for recorded check-ins. Existing check-ins
  and meeting actions migrate without being guessed into new commitments; malformed/missing source
  links warn while preserving the user's task text.
- Added a blank, dated manager-action form after recorded Day 30/60/90 check-ins; actions are
  manager-owned, show on Today / the 1:1 board / the person prep sheet in a distinct group, retain
  source links through carries, and can be marked complete directly or settled in a real held 1:1.
- Extended 1:1 validation/application without changing the existing actual-meeting action path.
  No synthetic meeting is created. `actions` CSV now includes source check-in ID, plan, phase and
  held date; person timeline and historical reconstruction account for manager support records.
- Fixed an existing Today card edge case (`actions: null`) exposed by the new obligation row; the
  card now receives an empty action list when no overdue shortcut is needed.
- Added migration, source-date/identity, validation, API, carry, completion, CSV, timeline,
  snapshot-rewind, review-evidence exclusion and JSDOM interaction tests. Updated `index.html`,
  README, roadmap, research and focused audit. No package manifest/lockfile change, new dependency,
  backend, account, network call or notification was added.

### Verification

- `npm ci --no-audit --no-fund` installed the existing lockfile dependencies; the first test attempt
  before installation failed only because `jsdom` was absent. No pre-change full-suite baseline was
  independently rerun in this checkout.
- Final `npm test`: **315 passed, 0 failed, 0 skipped across 24 test files**.
- Scoped ESLint for changed JS modules/tests, `node --check` for changed JS and `git diff --check`
  passed.
- Real-browser/mobile/assistive-technology validation, human comprehension and outcome research,
  print/PDF and representative large-workspace behavior, and full manual legacy source/build/
  runtime/deployment/security validation remain **[UNVERIFIED]**.

### Next priorities

1. Real-browser/mobile and assistive-technology validation plus manager/employee comprehension.
2. Legacy dependency and deployment audit before any legacy deployment.
3. Large-workspace, cross-browser and print verification.

## Session 21 — Browser validation for manager-owned check-in follow-up

### Implemented

- Audited the current roadmap and optional browser smoke scripts. Session 20's manager-support
  lifecycle had comprehensive API/JSDOM coverage but no dedicated real-browser run; the conflict
  and phase-queue scripts did not exercise that new workflow.
- Added `scripts/app-manager-support-smoke.mjs`, an isolated headless-Chromium scenario using a
  fictional person and fixed clock. It records a Day 30 check-in with a candid blocker, explicitly
  creates a manager-owned action with a chosen due date, follows its source link, and closes it
  only through an actual held 1:1. It asserts no blocker copy, no action on check-in alone, and no
  synthetic meeting on opening the 1:1 dialog.
- Added mobile/desktop overflow and axe scans plus real-browser keyboard assertions for modal focus
  entry, Tab/Shift+Tab containment, Escape dismissal and return to the opener. The W3C APG source
  and rationale are in `RESEARCH.md` §31; findings are in `docs/AUDIT-2026-10-25-session-21.md`.
- Updated `index.html` build metadata, README, roadmap, research, focused audit and this log. No
  product behavior, schema, runtime dependency, backend, account or network request changed.
  Browser packages and evidence stay in ignored `tmp/`.

### Verification

- Existing conflict and onboarding-queue Chromium smoke scripts passed on Chromium
  **153.0.8010.0**; the new manager-support script passed on the same headless version.
- New script: 8 axe scans with zero findings, no page/console errors or external app requests,
  and no horizontal overflow at **1440×1000** and **390×844**. The tests cover a selected flow,
  not every route or device.
- `npm test`: **315 passed, 0 failed, 0 skipped across 24 test files**.
- `node --check`, scoped ESLint for the new script, and `git diff --check` passed. `npm ci` restored
  existing lockfile dependencies after the workspace initially lacked root `node_modules`; no
  package manifest or lockfile change resulted.
- Screen readers/assistive technology, manager/employee comprehension, physical-device and
  cross-browser behavior, print/PDF, and representative large-workspace performance remain
  **[UNVERIFIED]**. Axe is not a conformance certificate.

### Next priorities

1. Assistive-technology testing and manager/employee comprehension for manager-owned follow-up.
2. Legacy dependency and deployment audit before any legacy deployment.
3. Large-workspace, cross-browser and print verification.

## Session 22 — Accessible association for inline validation errors

### Implemented

- Continued the roadmap's first priority. Audited the shared form builder after reviewing W3C WAI
  guidance on dynamic form errors and `aria-describedby`.
- Found that the shared helper set `aria-invalid` and rendered an inline `role="alert"`, but the
  field's `aria-describedby` did not include that error text. Added a dynamic association to the
  error ID while preserving any help-text ID; clearing validation removes the stale error reference
  but leaves help text in place.
- Extended the manager-follow-up JSDOM flow and Chromium smoke script to verify `aria-invalid`,
  live error text, help/error association, and successful retry. Updated `index.html`, README,
  roadmap, research and focused audit.

### Verification

- Focused onboarding UI tests: **6/6 passed**.
- `npm test`: **315 passed, 0 failed, 0 skipped across 24 test files**.
- All three optional Chromium smoke scripts passed on headless Chromium **153.0.8010.0**. The
  manager-follow-up script's eight axe scans found zero issues; page/console errors and external
  app requests were also zero. Scoped ESLint, `node --check` and `git diff --check` passed.
- The workspace initially lacked `jsdom` and ignored Chromium test packages; `npm ci` restored the
  lockfile dependencies and pinned test tools were installed under ignored `tmp/`. No manifest or
  lockfile change was made.
- No installed GUI browser or screen-reader executable was available. No NVDA/JAWS/VoiceOver/
  TalkBack/Orca session or manager/employee comprehension study was performed. Actual announcement
  behavior, possible duplicate alert/description announcements and user comprehension remain
  **[UNVERIFIED]**.

### Next priorities

1. Actual assistive-technology testing and manager/employee comprehension.
2. Legacy dependency and deployment audit before any legacy deployment.
3. Large-workspace, cross-browser and print verification.

## Session 23 — Cross-domain Operational Cases & Event-Driven Parallel Propagation Engine (Schema v15)

### Implemented

- Confirmed `origin` (`https://github.com/shahramclaude/Leados.git`) and audited all existing
  canonical runtime modules (`index.html`, `app/**`, `scripts/serve.mjs`) and the baseline test
  suite (**315/315 passing across 24 test files**). Preserved non-canonical historical trees
  (`src/**`, root React/TS files, `public/index.html`, `drizzle/`) untouched; their build/runtime
  status remains **[UNVERIFIED]**.
- Implemented `app/core/domain/cases.js`: pure cross-domain Operational Case analytical module
  combining **AIAG-VDA (2019) FMEA Action Priority + RPN + residual RPN reduction %**
  (`computeFmea`), **3-point Beta-PERT financial & capacity estimation with risk-adjusted expected
  value & mitigation ROI** (`computePertImpact`), **Mendelow (1981) Power × Interest stakeholder
  coalition matrix & briefing cadence tracking** (`summarizeStakeholderCoalition`), **Toyota
  5-Whys & Reason (1990) Swiss-Cheese systemic barriers with individual-blame warnings**
  (`evaluateRca`), and privacy-safe link resolution (`linksForEntity`).
- Implemented `app/core/domain/automation.js`: pure, deterministic, idempotent event-driven
  cross-module rules engine (`AUTOMATION_RULES`, `previewCasePropagations`, `propagateCaseEvent`,
  `propagateCaseResolution`, `onDelegationCompleted`, `buildCaseFromUpstreamEntity`). Registering
  or updating an Operational Case simultaneously schedules stakeholder coalition cadences
  (`RULE-STAKE-01`), creates & links a PERT-backed DACI Decision (`RULE-DEC-01`), creates & links
  an accountable Mitigation Delegation with calibrated authority (`RULE-DEL-01`), appends an
  explainable risk check-in & shifts `on-track` Goal confidence to `at-risk` (`RULE-GOAL-01`), and
  queues blameless 1:1 coaching/support talking points (`RULE-COACH-01`) — while strictly excluding
  operational incidents from performance-review ratings and rejecting any `conflict` or `pulse`
  links. Completing linked mitigation delegations automatically transitions an open/mitigating Case
  to `monitoring` (`RULE-SYNC-DEL-01`).
- Upgraded schema, persistence, exports, and domain analytics (`app/core/{schema,store,demo,csv}.js`,
  `app/core/domain/{health,trends,people,oneonone,prep,insights}.js`, `app/actions.js`):
  - **Schema v15** (`MIGRATIONS[14]`): adds `state.cases`, `state.links`, and
    `settings.caseReviewDays` (default 14) without fabricating historical cases or links.
  - Added `{ logEvent }` transaction support in `store.update`, `clearDemo()` cleanup for demo
    cases/links, 2 realistic demo cases + 7 cross-module links in `demo.js`, and 2 new OWASP
    CWE-1236 formula-safe CSV scopes (`cases`, `caseLinks`, bringing `CSV_EXPORTS` to **17**).
  - Integrated cases & links into `reconstructStateAt`, `firstActivityDay`, `personTimeline`,
    `suggestAgenda`, `buildPrepSheet` (`openCases`), and `buildInsights` (`CASE-01`..`CASE-04` +
    resolved-case wins).
- Built WCAG-accessible UI surfaces and cross-module handoffs (`app/ui/case-modals.js`,
  `app/ui/modals.js`, `app/views/cases.js`, `app/main.js`, `app/styles.css`, `index.html`, and
  connected views `today.js`, `decisions.js`, `delegations.js`, `goals.js`, `person.js`, `prep.js`,
  `insights.js`, `settings.js`):
  - `#/cases` portfolio view and `#/cases/:id` detail workspace (Mendelow 2×2 matrix, FMEA &
    residual comparison, PERT & ROI breakdown, 5-Whys/Swiss-Cheese checklist, cross-module link
    strip, and active automation rule transparency).
  - `openCaseDialog` (with live FMEA, PERT, blameless RCA check, stakeholder editor, and real-time
    parallel propagation preview), `openCaseStakeholderCommsDialog`, `openResolveCaseDialog`, and
    `openLinkCaseEntityDialog`.
  - Upstream *Escalate to case* actions and bidirectional linked-case pills on `#/decisions`,
    `#/delegations`, and `#/goals`, Operational Cases triage card on `#/today`, and blameless case
    support cards on `#/people/:id` and `#/prep/:id`.
- Added `tests/app/cases-automation.test.mjs` and updated Schema v15 / CSV count assertions across
  existing migration tests. Updated `index.html`, `README.md`, `ROADMAP.md`, `RESEARCH.md` (§33),
  and `docs/AUDIT-2026-10-25-session-23.md`.

### Verification

- `npm test`: **322 passed, 0 failed, 0 skipped across 25 test files** (including 7 multi-stage
  end-to-end tests in `tests/app/cases-automation.test.mjs`).
- `axe-core` (JSDOM): **0 violations** across `#/cases`, `#/cases/:id`, `#/today`, `#/decisions`,
  `#/delegations`, `#/goals`, `#/people/:id`, `#/prep/:id`, `openCaseDialog`, and
  `openResolveCaseDialog`.
- `node --check` passed on all 26 modified/added ES modules; live `scripts/serve.mjs` HTTP server
  verified `200 OK` across `index.html`, `app/main.js`, `app/core/domain/cases.js`,
  `app/core/domain/automation.js`, `app/ui/case-modals.js`, `app/views/cases.js`, and
  `app/styles.css`.
- No Chromium/Playwright binary or screen reader was installed in this container: real graphical
  browser rendering/overflow on `#/cases`, assistive-technology screen-reader announcement
  behavior, print/PDF pagination, and real-manager comprehension remain **[UNVERIFIED]**.
- Remote sync: committed (`6026572`) and pushed branch `arena/298d32b2-leados` to
  `https://github.com/shahramclaude/Leados.git`, and opened Pull Request **#22**
  (`https://github.com/shahramclaude/Leados/pull/22`) targeting `main`.

### Next priorities

1. Run real-Chromium desktop/mobile overflow & keyboard smoke script on `#/cases` and `#/cases/:id`,
   plus assistive-technology screen-reader and manager/employee comprehension testing.
2. Legacy dependency and deployment audit before any legacy deployment.
3. Large-workspace, cross-browser and print verification.

## Session 24 — Team Capacity, Flow & Portfolio Allocation (Schema v16)

### Implemented

- Verified `origin` (`https://github.com/shahramclaude/Leados.git`) and re-audited the whole
  canonical runtime (`index.html`, `app/**`, `scripts/serve.mjs`, `tests/app/**`, all governing
  documents) before editing. Baseline after `npm ci`: **322/322 tests passing across 25 files**.
  Non-canonical historical trees (`src/**`, root React/TSX files, `public/`, `drizzle/`) were left
  untouched; their build/runtime status remains **[UNVERIFIED]**.
- Identified the one structural gap behind every other missing feature: LeadOS recorded *intent*
  (goals, delegations, cases, transition plans, decisions) and never answered *feasibility*.
  Shipped that layer as a derived operating plan rather than a new silo.
- Implemented `app/core/domain/capacity.js` (pure, no DOM/storage): `buildCapacityModel`
  (focused-hours supply with Watkins-style transition ramp, operational reserve, committed vs
  requested demand, per-person allocation, deficit/slack), `flowMetrics` (Little's Law throughput /
  WIP / cycle time over **delivered plan items only**, with a two-completion floor before any rate
  is stated, plus Kingman's diffusion-approximation queue-delay multiplier and a bottleneck name),
  `rankPortfolio` (value density, funding boundary, release candidates, target-risk), `pertTriple`
  (Beta-PERT / Malcolm et al. 1959), `normalCdf` (Abramowitz & Stegun 7.1.26), `utilisationBand`,
  `deliveryForecast` (**cumulative** P50/P80/P90 per target date, additive variance),
  `capacityHistory` and `capacitySummary`.
- Implemented three new rules in the existing event-driven engine (`app/core/domain/automation.js`,
  now 10 rules) rather than a parallel code path:
  - `RULE-CAP-01` — `case.created` / `case.updated` / `case.resolved` create, refresh, release or
    reinstate a **committed capacity reserve** linked `case --consumes-capacity--> portfolio`; also
    reported in the case dialog's live propagation preview.
  - `RULE-CAP-02` — an infeasible plan (>100% utilisation) opens **exactly one** DACI trade-off
    decision containing the numbers and generated options (defer the lowest-value-density item,
    cut the next, accept the delay, stop starting unfunded work); idempotent while unanswered.
  - `RULE-CAP-03` — `portfolio.decided` writes an explainable check-in on the linked goal when its
    funded work is deferred/cut (on-track → at-risk) and the follow-up when re-funded; funding new
    work writes nothing.
- Upgraded schema, persistence, exports and analytics (`app/core/{schema,store,demo,csv}.js`,
  `app/core/domain/{cases,insights}.js`): **Schema v16** (`MIGRATIONS[15]`) adds `state.portfolio`
  and four planning settings (`capacityHoursPerWeek` 32, `planningHorizonWeeks` 4,
  `operationalLoadPct` 20, `wipLimitPerPerson` 2) **without inventing effort or value**;
  `normalizePortfolio` repairs provenance, forces reserves to `funded`, clamps future decision
  dates and re-orders PERT triples; `clearDemo()` prunes demo plan items and demotes orphaned
  provenance to `manual`; 11 realistic demo items (2 of them case reserves) and two link families;
  the `portfolio` CSV scope brings `CSV_EXPORTS` to **18** (formula-injection safe);
  `CAP-01`..`CAP-05` join the signal engine under a new *Capacity & flow* domain.
- Built the UI: `app/views/capacity.js` (utilisation stacked bar with legend, Little/Kingman flow
  card, allocation recommendation, cumulative forecast with per-target risk, funding-decision
  table with Decide/Deliver/Release/Edit/Delete, per-person load bars, approximate utilisation
  sparkline, active-rule card), `app/ui/capacity-modals.js` (add/edit work, DACI decision, release
  with reason), nav entry + badge in `app/main.js`, a `#/capacity` attention card on `#/today`,
  and the capacity settings rows on `#/settings`.
- Seven new actions in `app/actions.js` (`addPortfolioItem`, `updatePortfolioItem`,
  `setPortfolioDecision`, `completePortfolioItem`, `releasePortfolioItem`, `deletePortfolioItem`,
  `syncCapacityPlan`) with defensive coercion (single-point estimates accepted and expanded,
  `previousDecision` passed so first-time funding is not treated as a plan change, `reopenCase`
  reinstates the released reserve, `deleteCase` removes it).
- Added `tests/app/capacity-flow.test.mjs` (**18 tests**) and updated Schema v16 / CSV-count /
  settings-string assertions across 14 existing test files. Updated `index.html` (build stamp →
  schema 16), `README.md`, `ROADMAP.md`, `RESEARCH.md` (§34 capacity/queueing inventory),
  `CHANGELOG.md`, `FEATURES.md` and `docs/AUDIT-2026-10-25-session-24.md`.

### Verification

- `npm test`: **340 passed, 0 failed, 0 skipped across 26 test files** (~106 s). Baseline was
  322/322.
- Five real defects were found by the new suite and fixed rather than asserted away: `null`
  utilisation reported as "slack" (now `unmeasured`), single-point PERT estimates rejected,
  first-time funding writing a spurious goal check-in, `reopenCase` leaving its reserve released,
  and `deleteCase` orphaning its reserve.
- `axe-core` (JSDOM): **0 violations** on `#/capacity` and on the add-work dialog.
- `node --check` and `npx eslint` clean on every added/modified module; `scripts/serve.mjs`
  returned `200` for `/`, `app/main.js`, `app/views/capacity.js`, `app/ui/capacity-modals.js`,
  `app/core/domain/capacity.js` and `app/styles.css`.
- `reconstructStateAt` now rewinds `state.portfolio` too: items created after the snapshot date
  are absent, a decision or delivery recorded later is undone (reason text cleared with the
  decision), and an item appears once its own start date arrives. Proven by the 18th test.
- Not verified: no Chromium/Playwright binary or screen reader in this container, so real browser
  rendering, mobile overflow, keyboard traversal, print/PDF and AT announcement on `#/capacity`
  remain **[UNVERIFIED]**.
- Remote sync: committed (`375a588`) and pushed branch `arena/f17d0077-leados` to
  `https://github.com/shahramclaude/Leados.git` (fast-forward, no force), and opened Pull Request
  **#23** (`https://github.com/shahramclaude/Leados/pull/23`) targeting `main`. Push and PR creation
  both returned success from `git`/`gh`; the PR is open, not merged or reviewed.

### Next priorities

1. Run a real-Chromium desktop/mobile overflow, keyboard and screen-reader smoke script on
   `#/capacity` (and the dialog flows), plus print/PDF pagination.
2. Legacy dependency and deployment audit; large-workspace and cross-browser verification.
3. Re-check the capacity layer once real managers use it: whether the delay multiplier changes
   behaviour, and whether the planning conventions match how the team actually works.

---

## Session 25 — Delegation completion → portfolio delivery (2026-10-25)

### Repository identity and audit

Before reading or changing files, verified `origin` with `git remote get-url origin`:
`https://github.com/shahramclaude/Leados.git` (match). Worktree began clean on the active
`arena/57c80a5a-leados` branch. Inventory: 3,711 tracked files; 65 canonical `app/**` files and
26 `tests/app/**` suites. The canonical app is `index.html` + `app/**`; relevant domain, action,
source-link and test code was read before implementation. This was a focused audit, not a
line-by-line reading of every tracked legacy file. Non-canonical React/Next/Drizzle, root TSX and
`public/index.html` runtime/deployment status remain **[UNVERIFIED]**.

### Product assessment and gap

The current canonical product has a local, versioned store, append-oriented events, an explicit
cross-module relationship graph, and working event-driven case/capacity/goal/delegation flows. A
real lifecycle hole remained: the capacity item dialog let a leader explicitly link plan work to an
active delegation, but recording delegation completion did not close that linked item. It kept
consuming committed capacity and did not enter the measured delivered-throughput data. This gap was
confirmed in `app/actions.js`, `app/core/domain/automation.js`, and `app/ui/capacity-modals.js`.

### Shipped

- Added declarative **`RULE-CAP-04`** (`delegation.completed` → `portfolio`) to the existing rules
  engine. Only open work explicitly sourced from that delegation is marked delivered, using the
  recorded completion date. The typed relationship is preserved/repaired and an auditable
  `automation.propagated` event plus structured result are emitted in the same store transaction.
- The item drops out of committed work and now counts as delivered for flow metrics. Returned work
  is not auto-completed, no effort is inferred, and unrelated work remains untouched.
- Guarded the action boundary against creating open demand from completed/returned delegations and
  against completion dates predating the linked plan item's start. **Sync rules** also repairs
  already-completed linked items from pre-rule workspace state, and is idempotent.
- No schema migration, new dependency, backend, network request or account was introduced.

Cross-module links added/updated: explicit `portfolio → delegation` (`funds`) links retain their
provenance; `RULE-CAP-04` synchronizes portfolio lifecycle from the delegation completion event.

### Research, tests, limits

Read existing research (§§13, 18, 34) and extended it in §35: Asana's owner/status execution
pattern, established 1:1 explicit-vs-auto-carry patterns, PDCA closed-loop control, Little's Law
WIP/throughput integrity, and the incentive/governance reason to distinguish completed from
returned work. No fresh vendor page retrieval or field study was conducted; contemporary vendor
claims are **[UNVERIFIED]**.

The new end-to-end regression traces person → delegation → explicit portfolio link → committed
capacity → completed delegation → delivered plan item/date → preserved graph edge, single audit
event and released committed demand. It also verifies duplicate-completion and impossible-date
rejection, closed-source records, and idempotent `syncCapacityPlan()` repair of a simulated
pre-rule workspace. `tests/app/cases-automation.test.mjs` updates the declared registry count.

`npm test` initially could not resolve absent `jsdom`; after `npm ci --no-audit --no-fund`, the
focused test passed (19/19). The first full run caught an outdated automation registry count (10 vs
11); this was fixed. **Final full-suite result: 341 passed, 0 failed, 0 skipped across 26 files**
(see current-session verification output). Real-browser rendering, screen-reader behavior, user
comprehension, representative production-scale usage, and legacy runtime/security remain
**[UNVERIFIED]**.

Audit: `docs/AUDIT-2026-10-25-session-25.md`. Roadmap priorities remain real-browser/AT/user
validation, legacy dependency/deployment audit, then large-workspace and real-practice validation.

### Sync result

Rechecked origin as `https://github.com/shahramclaude/Leados.git` before syncing. Feature commit
`d20a3ed` (`Close delegation to portfolio delivery loop`) pushed successfully to
`origin/arena/57c80a5a-leados`; GitHub confirmed creation of that remote branch. `gh pr create`
returned Pull Request **#24**, targeting `main`: https://github.com/shahramclaude/Leados/pull/24.
The PR is open, not merged. Follow-up status commit `124d7dd` also pushed successfully to the same
required branch (`d20a3ed..124d7dd` fast-forward); PR #24 now contains both feature and audit-status
commits. The session's final repository state and PR status are confirmed in the final report.

## Session 26 — Selection & hiring, and the cost of an empty seat (Schema v17, 2026-10-25)

### Repository identity and audit

`git remote get-url origin` → `https://github.com/shahramclaude/Leados.git` (match, verified before
reading or changing anything). Worktree clean at `fe7b896` (merge of PR #24); work on
`arena/caddc526-leados`. Baseline measured, not assumed: `npm ci --no-audit --no-fund` (dependencies
are not committed), then `npm test` → **341 passed, 0 failed across 26 suites**. Canonical app read
directly: `app/core/schema.js`, `app/core/store.js`, `app/actions.js`,
`app/core/domain/{cases,capacity,automation,insights}.js`, `app/main.js`, `app/core/csv.js`,
`app/core/demo.js`, `app/ui/{dom,components,options,case-modals}.js`, `app/views/cases.js` and the
test harness in `tests/app/capacity-flow.test.mjs`. The legacy `src/**` Next/React/Drizzle tree was
not executed; its runtime and deployment status remain **[UNVERIFIED]**.

### Product assessment and gap

Three specific holes, found in code rather than in the README:

1. **The operating plan could not see interviews.** `buildCapacityModel` derived demand from goals,
   cases, delegations, onboarding and maintenance. A team spending a day a week interviewing appeared
   fully available, so opening a role silently made the plan wrong.
2. **An accepted offer handed off to nothing.** `addOnboardingPlan` existed and worked; nothing
   connected "we hired this person" to "they are on the roster with a 30-60-90 plan".
3. **No evidence model existed anywhere.** Reviews grade an existing employee's past. Nothing helped
   decide a future hire, and nothing recorded *how* a judgement was formed — which is the strongest
   known determinant of whether a hiring judgement is any good.

Nothing was rewritten. Hiring was added as a peer of `cases` and `capacity`, reusing the store, the
action layer, the typed link graph, the shared escalation path and the event engine.

### Shipped

- **`app/core/domain/hiring.js`** (new, pure): method validity table, log-odds combination with
  correlated-evidence discounting (repeat competency × different rater 0.5, same rater 0.25),
  neutrality at 3/5, rater-disagreement surfacing, competency coverage, offer convention, process
  parity, funnel and cycle-time (withheld below two hires), cost of vacancy only from a recorded
  daily figure, suggested interview effort, requisition/candidate/workspace summaries and a stalled
  detector.
- **Schema v17**: `requisitions`, `candidates`; settings `hiringBaseRate` (default 45%),
  `hiringStallDays` (30), `interviewHoursPerStage` (3); defensive normalisers that repair unknown
  statuses, out-of-order PERT triples, dangling interviewer/person/competency references, unknown
  methods and out-of-range ratings, and drop orphaned candidates; `MIGRATIONS[16]` adds empty ledgers
  and conventions without inventing records.
- **`RULE-HIRE-01`** (`requisition.effort` → `portfolio`): a recorded three-point effort estimate
  becomes a committed `hiring` capacity item (`consumes-capacity` edge, funded, value deliberately
  unmeasured), refreshed in place, completed as delivered on a fill and released on hold/cancel. No
  estimate means no reserve — the plan never invents an effort figure.
- **`RULE-HIRE-02`** (`candidate.offer-accepted`): roster record + new-hire 30-60-90 plan + typed
  edges `candidate → requisition`, `requisition → person`, `person → onboarding` + completed reserve,
  in one transaction, idempotent, and double-accept refused at the action boundary.
- **`RULE-HIRE-03`** (`requisition.stalled`): routes through the *shared* escalation path, so the case
  arrives with FMEA severity/probability/detectability, financial PERT fields, a stakeholder
  coalition, a DACI decision and an accountable delegation already attached. `autoEscalated` keeps it
  to exactly one case for the life of the role, even if that case is later closed.
- **Actions**: 11 new endpoints with validation, audit events and typed errors; `syncHiring` repairs
  pre-rule state idempotently.
- **UI**: `#/hiring` and `#/hiring/:id?candidate=`, five dialogs, nav entry with a decision badge,
  a Today card, three Settings rows, and the style block the new components need.
- **Signals** `HIRE-02`…`HIRE-07`; **`hiring` CSV scope** (19 total, flagged sensitive); demo roles,
  candidates, reserve and links.
- **`tests/app/hiring.test.mjs`** — 27 tests. Suite total **368 passed, 0 failed, 0 skipped across 27
  files**; `axe-core` 0 violations on the index, the detail view and the dialog.

### Self-caught errors worth recording

The first draft of the validity table claimed `.18` for unstructured interviews — that figure is
*years of experience*; Schmidt & Hunter (1998) has `.38`. Retrieval then showed the 1998 table has
itself been superseded: Sackett et al. (2022) revised every estimate downward and reordered them
(structured interviews `.42` first, work samples `.33`, cognitive ability `.31`, unstructured `.19`).
The coefficients, the evidence floor (0.60 → 0.50) and one product claim ("a work sample is the
highest-validity signal") were all corrected. Had the module shipped on the draft numbers it would
have given plausible-looking, wrong advice at the exact moment a leader is most persuadable. Also
fixed: `ctx.now()` called as a function (it is a `Date`), a malformed ternary in the detail stat, and
two `th` cells axe reports as `empty-table-header`.

Cross-module links added/updated: `requisition → portfolio` (`consumes-capacity`),
`candidate → requisition` (`assessed-for`), `requisition → person` (`hires`), `person → onboarding`
(`onboards`), plus the escalation-path edges every case already carries. HIRED nodes join the entity
sets, so `linksForEntity` works for both new types, and the demo cleanup prunes their edges.

### Repository status

Actual result: committed as `624bd10` on `arena/caddc526-leados`; `git push origin
arena/caddc526-leados` created the remote branch (new branch, no force, no rewrite);
`gh pr create --base main` returned <https://github.com/shahramclaude/Leados/pull/25>. `npm test`
was run on the committed tree: **368 passed, 0 failed, 0 skipped**, exit status 0. Nothing in this
entry is predicted — the command output is the source. No dependency, backend, account, network call or build step was
added. Verification of real-browser rendering, keyboard traversal, screen-reader output and any
manager's actual hiring decision remain **[UNVERIFIED]**.

## Session 27 — Retention prompt, dependency remediation, scale and accessibility validation (2026-10-25)

### Repository identity and audit

`git remote get-url origin` → `https://github.com/shahramclaude/Leados.git` (match, verified before
reading or changing anything). Worktree clean at `3e44406` (the merge of PR #25); work on
`arena/31d51917-leados`, which already contained `origin/main`. Baseline measured, not assumed:
`npm ci --no-audit --no-fund`, then `npm test` → **368 passed / 0 failed across 27 suites**, and
`npm audit --omit=dev` → **1 critical, 2 high**.

### What was asked and what actually happened

The brief carried three priorities from session 26. One is **done**, one is **done with a correction
to its framing**, and one is **blocked by the environment** — reported as blocked, not approximated.

**1. Real-browser / screen-reader / manager-comprehension validation — BLOCKED.** Attempted three
routes and each failed for an environmental reason, recorded with the actual output:

- Playwright 1.64.1 installs from the npm registry, but its browser binaries come from
  `cdn.playwright.dev` and `storage.googleapis.com`; both are outside this sandbox's allowlist
  (`curl` → `000`, `SSL_ERROR_SYSCALL`).
- `@sparticuz/chromium` (a Chromium build delivered *inside* an npm package, so it arrives through
  the allowlisted registry) extracts to `/tmp/chromium` and then fails with
  `error while loading shared libraries: libnspr4.so`. Supplying `libnss3`/`libnspr4` needs root and
  `deb.debian.org`, which is also blocked.
- No system browser exists in the image (`find / -name "chromium*"` → nothing).

No screen reader can run here either (NVDA/JAWS need Windows, VoiceOver macOS, Orca a GTK/AT-SPI
stack plus audio), and a real hiring round needs a real manager. Rather than describe a JSDOM run as
"accessibility validated", the session shipped the strongest thing that *can* be measured: a
structural audit (`tests/app/access-audit.test.mjs`, 12 tests) asserting one `h1` per screen with no
skipped heading levels, an accessible name on every interactive control (glyph-only buttons rejected
outright), captioned tables with `scope`d headers and no empty header cells, landmark structure and a
working skip link, dialog focus trapping and restoration, and live-region announcements — on top of
axe-core reporting zero violations across `#/cases`, `#/capacity`, `#/hiring`, their detail screens and
an open dialog. It found four real defects (below). Comprehension, spoken reading order, contrast in a
real rendering engine, zoom/reflow and touch targets remain **[UNVERIFIED]** and are the roadmap's
first item, with a checklist written for the next session that has a browser.

**2. Dependency audit — DONE, and the framing needed correcting.** `next` 16.2.6 → **16.4.3**,
`postcss` 8.5.8 → **8.5.31**, `eslint-config-next` → 16.4.3, `drizzle-kit` 0.31.10 → 0.31.11.
`npm audit --omit=dev` → **0 vulnerabilities**. Four moderate advisories remain in a dev-only
`drizzle-kit → @esbuild-kit/core-utils → esbuild 0.18.20` chain; the advisory is about a development
*server* this repository never runs, and `npm audit fix --force` "resolves" it by downgrading
`drizzle-kit` to 0.18.1 — a breaking change. An `overrides` pin was attempted and **reverted** because
the package pins a 0.18.20 platform binary and npm reported the tree `invalid`; shipping a broken tree
to make a counter read zero is a worse outcome than an explained advisory.

The correction: **the legacy Next app does not build, and did not before this change.**
`npx next build` fails on `src/lib/agent/tools.ts` importing `toolEffects` from `src/db/schema`, and
`npx tsc --noEmit` reports 6,977 errors (5,974 in `src/**`), with the root `App.tsx` importing
`./lib/store`, `./lib/seed`, `./lib/engine` and `./components/*`, none of which exist. I verified this
against **both** dependency sets to be certain the upgrade did not cause it. So the honest status is
"no production vulnerabilities in the installed tree, and nothing there to deploy" — the advisories
never had a path to execution because there is no runnable build.

**3. Large-workspace validation + retention decision — DONE.** `tests/app/scale.test.mjs` (5 tests)
builds 120 people / 240 goals / 300 cases / 180 funded items / 40 roles / 320 candidates / 1,280
evidence observations / 900 typed edges and asserts invariants rather than "it did not throw": every
record preserved, every edge resolvable at both ends, no duplicate or invented edges, a second
normalization a byte-identical no-op, and derived analyses whose arithmetic still adds up. Measured:
normalize 35 ms, insights 42 ms, each of the 19 CSV scopes ≤ 50 ms. A **300-role × 5,000-candidate**
stress ratio then exposed an O(roles × candidates) scan in `hiringSummary` and the `hiring` CSV
export — 1.5 M comparisons, executed on every render of `#/hiring`, `#/today` and the signals panel.
Both now index candidates by role once (110 ms at that ratio), and the test prints timings so the
pattern returning is a number, not a mystery.

Retention: the roadmap asked for *a decision*, and the decision is **prompt, never erase**.
`Schema v18` adds `candidateRetentionDays` (default 180, `0` off) and a pure
`retentionReview(state, { now })` that reports which records have outlived the window. A candidate
still in play on an open role is never flagged; a "keep in touch" record is an **exemption that is
listed**, not a silent skip; a record with no dates is unknown age rather than guessed; the clock runs
from the last recorded fact. `#/hiring` gains a Data-minimisation card with a per-record, *named*,
confirmed delete, and signal `HIRE-08` raises the same fact in the signals panel with the window, the
oldest age and the exemption count. Deletion stays an explicit, audited action that removes the
evidence and the graph edges with the record. The demo now demonstrates both halves honestly: one
record past the window (Marcus Feld, 244 days) and one deliberate exemption (Aisha Bello, the silver
medallist kept for the next opening).

### Defects found and fixed

1. **Destructive confirmations did not confirm.** `confirmDialog` was callback-based, but cases,
   capacity and hiring called `await confirmDialog(...)` and treated the result as a boolean. The
   returned modal handle is truthy, so the record was deleted the instant the button was clicked, with
   the dialog left on screen able to change nothing — and in the cases module the dialog had **no
   text at all**, because the caller passed `body:` while the primitive only rendered `message:`.
   `confirmDialog` now returns a promise that settles only when the dialog closes (`true` on confirm,
   `false` on cancel/Escape/close/backdrop), still invokes `onConfirm` for the callback-shaped
   callers, and renders `message ?? body`. Covered for confirm, cancel, Escape and single execution.
2. **Focus lost to `<body>`** when a dialog's trigger had been re-rendered away; `openModal` now falls
   back to `main#view` (focusable, `tabindex="-1"`).
3. **Two uncaptioned tables in `#/capacity`** — the shared `table()` helper gained an optional
   `caption` (rendered visually hidden), and the target-risk table got one.
4. **A typo could switch the retention reminder off**: a negative or non-numeric window was clamped to
   `0`, which means "off". It now falls back to the default; `0` still means off, deliberately.
5. **The quadratic scans** in `hiringSummary` and the hiring CSV export.

Cross-module links updated: `HIRE-08` joins the hiring signals; the retention card reads the same
requisition/candidate graph as the rest of `#/hiring`; candidate deletion continues to remove its own
edges; and every link in a 900-edge workspace was asserted to resolve at both ends.

### Repository status

Committed and pushed on `arena/31d51917-leados`, with a pull request against `main`; the actual
result is recorded at the end of this entry once the commands have run — not predicted here. The work
was also re-verified after commit (`npm test`). Verification of real-browser rendering, screen-reader
output, comprehension and any manager's actual hiring decision remain **[UNVERIFIED]**, and the
dependency remediation does not make the non-canonical Next tree deployable: it does not build.

---

## Session 28 — Organizational Design, Team Topologies & Change Execution + Shewhart XmR Statistical Process Control (2026-10-25)

### Repository identity and baseline audit

1. Verified `git remote -v` before touching any file: `origin` = `https://github.com/shahramclaude/Leados.git`
   on branch `arena/dbbd815a-leados` at `c577fcf` (merge of PR #26 / Session 27).
2. Baseline verified: `npm ci --no-audit --no-fund && npm test` → **408/408 passing** across 29 suites;
   `npx eslint app scripts tests/app` → 0 issues in `app/**` and `tests/app/**`.
3. Audited canonical `app/**` modules and surfaced **5 pre-existing cross-module defects** alongside two
   major domain capability gaps (statistical signal-vs-noise separation and organizational boundary /
   topology / change execution). Uninspected legacy `src/**` / root `.tsx` files and real-browser /
   screen-reader rendering remain **[UNVERIFIED]**.

### Pre-existing defects found and fixed

1. **`app/core/schema.js` (`normalizePortfolio` order bug)**: `normalizePortfolio` ran *before*
   `normalizeRequisitions` and checked `reqIds`, which was empty at that point — silently wiping valid
   `sourceType: 'requisition'` links on hiring portfolio items back to `'manual'` on reload/import.
   Moved `normalizePortfolio` after `normalizeRequisitions` and `normalizeChanges`, preserving both
   `'requisition'` and `'change'` provenance.
2. **`app/core/domain/automation.js` (`previewCasePropagations` clock bug)**: `buildCapacityModel(state)`
   was called without `{ now }`, causing time-skewed previews under injected clocks. Fixed to
   `buildCapacityModel(state, { now })`.
3. **`app/core/domain/health.js` (`reconstructStateAt` historical rewind gap)**: `requisitions` and
   `candidates` were not filtered or rewound by `asOfDay` during point-in-time reconstruction. Added
   chronology filtering and status rewind for `requisitions`, `candidates`, and `changes`.
4. **`app/ui/capacity-modals.js` (`window.confirm` accessibility/UX defect)**: deleting a portfolio item
   used blocking native `window.confirm` (broken in headless/sandbox environments and inconsistent with
   keyboard-trapped dialogs). Replaced with `await confirmDialog(...)`.
5. **`app/views/settings.js` & `app/ui/modals.js`**: wired `changeReviewDays` (default 21, clamped 3–180)
   into Settings display and conventions editor.

### What was shipped (Schema v19)

- **Shewhart / Wheeler Individual & Moving Range (`XmR`) Statistical Process Control (`app/core/domain/spc.js`, `app/ui/charts.js`)**:
  - Pure `computeXmR` computing $\bar{X}$, $\overline{mR}$, $\hat{\sigma}_{\text{within}} = \overline{mR}/1.128$,
    $\text{UNPL}/\text{LNPL} = \bar{X} \pm 2.66\,\overline{mR}$ (clamped to physical bounds while retaining
    raw limits), $\text{URL} = 3.267\,\overline{mR}$, and Western Electric rules `WE-1`..`WE-4` with
    direction-aware polarity (`favorable` vs `adverse`), minimum floor ($\ge 4$ observations and $\ge 3$
    adjacent ranges), and strict non-interpolation across `null` gaps.
  - Pure `compareBaselineShift` verifying whether post-change observations represent a statistically
    confirmed shift beyond baseline XmR limits vs routine common-cause noise.
  - Accessible SVG `xmrChart` with natural limit lines, center line, highlighted special-cause points,
    and an expandable `<details>` X & mR `<table>` with `aria-label` and `scope`d headers.
  - Integrated into `buildTeamTrends` (`#/health` Shewhart XmR control stat + `SPC-01` adverse special-cause
    insight) and `#/changes/:id` process telemetry.
- **Organizational Design, Team Topologies & Change Execution (`app/core/domain/changes.js`, `app/ui/change-modals.js`, `app/views/changes.js`, `Schema v19`)**:
  - Synthesizes Conway's Law & Skelton/Pais Team Topologies + Sweller Cognitive Load + Brooks's Law
    ($N(N-1)/2$ inter-team coordination channels), Galbraith's 5-Point Star + Porter non-goals +
    Holmström–Milgrom incentive-mismatch detection, Kotter's 8-Step progression with foundational-skip
    warnings, Lewin Force-Field equilibrium (`high-tension-stalemate`, `blocked`, `fragile-forward`,
    `favorable`), Mendelow + Tsebelis veto-player coalitions, and Beta-PERT effort + J-Curve payback
    economics.
  - **Parallel + Vertical Event-Driven Automation (`RULE-CHG-01`..`05` + `RULE-CAP-02`)**:
    - `RULE-CHG-01`: reserves/updates/releases/completes PERT transition effort in `state.portfolio` (`sourceType: 'change'`).
    - `RULE-CHG-02`: creates & links DACI charter decisions for structural/irreversible changes.
    - `RULE-CHG-03`: queues blameless 1:1 talking points and starts opted-in Watkins 30-60-90 `role-transition` plans (`state.onboarding`), whose transition ramp automatically reduces allocatable supply in `#/capacity`.
    - `RULE-CHG-04`: schedules Mendelow/Tsebelis coalition & veto-player briefing cadences.
    - `RULE-CHG-05`: links strategic OKRs and logs explainable at-risk check-ins when a committed change is blocked by force-field or opposing veto players (and logs verification on anchoring).
    - **Vertical cascade**: inside the same atomic transaction, `evaluateCapacityTradeoff` (`RULE-CAP-02`) checks whether the new transition reserve + role-transition ramp pushed team utilisation $> 100\%$ and opens a Capacity trade-off decision automatically.
  - Bidirectional escalation between `#/cases` and `#/changes` (`escalateForceToCase`, `promoteCaseToChange` with circular-duplication guard), signals `CHG-01`..`05` + `SPC-01`, `#/today` triage card, `#/people/:id` & `#/prep/:id` integration, 2 rich demo changes (`chg-demo-1`, `chg-demo-2`), and formula-safe `changes` CSV export (#20).

### Verification and repository sync

- `npm test` → **415 passed, 0 failed across 30 suites** (`tests/app/changes-spc.test.mjs` + extended `tests/app/access-audit.test.mjs` + `tests/app/scale.test.mjs`).
- `npx eslint app scripts tests/app` → **0 errors, 0 warnings** across `app/**`, `scripts/serve.mjs`, and `tests/app/**`.
- `scripts/serve.mjs` live HTTP check → `200 OK` across `/`, `/app/main.js`, `/app/core/domain/spc.js`, `/app/core/domain/changes.js`, `/app/views/changes.js`, `/app/ui/change-modals.js`, and `/app/styles.css`.
- **Git sync confirmed**: committed (`dc6d95b`) and pushed to `origin/arena/dbbd815a-leados`, and opened Pull Request [#27](https://github.com/shahramclaude/Leados/pull/27) against `main`.
- Real-browser visual layout, screen-reader traversal, print/PDF output, and real-manager reorganization field trials remain **[UNVERIFIED]** in this container.

---

## Session 29 — Seeded Monte Carlo Portfolio & Coupled J-Curve Simulation, Pre-Export Retention & Contextual-Integrity Governance, ADR-0007 Quarantine Gate & Real Chromium 143 Audit (2026-10-25)

### Repository identity and baseline audit

1. Verified `git remote -v` before touching any file: `origin` = `https://github.com/shahramclaude/Leados.git`
   on branch `arena/4c1ab506-leados`, branched from `main` commit `5dcef708518baac745d3674035ccee7dc39a398b`
   (merged PR #27 from Session 28).
2. Unlocked real **Headless Chromium `143.0.7499.0`** execution in ephemeral `/tmp/browser-probe` +
   `/tmp/al2023` + `/tmp/fonts` (outside the Git checkout, zero repo binary bloat) against live
   `scripts/serve.mjs`, and audited all canonical modules + `store.js` / `csv.js` / `styles.css`.
3. Surfaced and fixed **8 pre-existing defects** (7 browser-only WCAG 2.1 AA contrast, label-in-name,
   `390px`/`320px` flex-reflow, and float-formatting defects + 1 `store.clearDemo()` omission leaving demo
   `state.changes` behind).

### What was shipped (Schema v20)

- **Seeded Monte Carlo Portfolio, Critical-Chain Bottleneck & Coupled J-Curve Simulation (`app/core/domain/simulation.js`, `app/ui/charts.js`, `app/views/{capacity,changes,settings}.js`, `Schema v20`)**:
  - Deterministic Mulberry32 PRNG + Marsaglia–Tsang Gamma / Vose Beta-PERT engine (`simulationSeed = 42`,
    `simulationTrials = 1000` default, configurable 250–5,000 in Settings).
  - Models Sam Savage's *Flaw of Averages* (`overloadProbability`, `flawOfAveragesTrap`) and Goldratt's
    *Critical Chain* owner-constrained schedule (`bottleneckCompletion` vs. fungible `teamCompletion` —
    uncovering an `+11` calendar-day `P80` slip on the demo workspace despite `99.1%` deterministic fit).
  - Couples portfolio congestion into active organizational change J-curves (`simulateChangeJCurve`,
    `simulateJointWorkspace`), computing stochastic valley depth (`troughValueP50`, `troughValueP90Worst`)
    and payback quantiles (`P10`/`P50`/`P80`/`P90`).
  - Wired into `RULE-CAP-05` (`evaluateMonteCarloTailRisk` — idempotent goal tail-risk check-ins +
    Flaw-of-Averages DACI trade-off decisions) and `SIM-01`/`SIM-02` insights, with accessible SVG
    `monteCarloHistogramChart` and `jCurveFanChart` + `<details>` HTML fallback tables.
- **Pre-Export Candidate Retention (`HIRE-08`) & Contextual-Integrity Disclosure (`app/core/domain/export-governance.js`, `app/ui/export-dialogs.js`, `app/ui/vault-dialogs.js`, `app/core/{store,csv}.js`, `app/actions.js`)**:
  - `inspectExportGovernance` scans JSON/backup and `hiring`/`cases`/`changes` CSV exports for overdue
    candidate records (`EXPORT-RET-01`), disabled retention windows (`EXPORT-RET-02`), confidential
    conflicts (`EXPORT-CFL-01`), candid `skeptical`/`resistant`/`opposing` stakeholder & veto-player
    stances (`EXPORT-STK-01`), and candidate evidence rows (`EXPORT-HIR-01`).
  - `openExportDisclosureDialog` presents explicit pre-export warnings and opt-in export-only redactions
    (`pruneOverdueCandidates`, `redactStakeholderStances`, `redactConflicts`) without mutating live
    workspace state, logging a private-content-free `export.disclosed` event.
  - Repaired `store.clearDemo()` to scrub demo `changes`, clear dangling `changeId` references, and
    report `remainingByType.change`.
- **ADR-0007 Legacy-Tree Quarantine Boundary Gate (`docs/adr/0007-legacy-next-tree-disposition.md`, `scripts/check-canonical-boundary.mjs`, `package.json`, `eslint.config.mjs`)**:
  - Formally freezes `src/**`, root `.tsx`/`.ts`, `deprecated/`, and `public/index.html` as a read-only
    archive and enforces zero cross-boundary imports, zero bare npm specifiers, and zero network calls across
    all `73` canonical `app/**` modules (`npm run check:boundary` & `npm run verify:canonical`).
- **Real Headless Chromium `143.0.7499.0` Validation (`docs/VALIDATION-2026-10-25-session-29.md`)**:
  - Audited 11 routes across `1440×1000`, `390×844`, and `320×800` (WCAG 1.4.10 Reflow) + 4 live modal
    dialogs → **0 `axe-core` WCAG 2.1 AA violations**, **0 horizontal overflows**, **4/4 modal keyboard
    traps & `Escape` focus restorations verified**, **0 console/page errors**.
  - Spoken screen-reader output (NVDA/JAWS/VoiceOver/Orca), Firefox/WebKit engines, physical print
    pagination, and human manager field studies remain **[UNVERIFIED]**.

---

## Session 30 — 2026-10-26 (`arena/ade7ab4b-leados` — Non-Persisted Counterfactual Scenario Sandboxing, Pareto Frontier Dominance, Brooks’s Law Onboarding Drag & One-at-a-Time Tornado Sensitivity + 7 Cross-Module Audit Fixes)

- **Repository identity & baseline audit**:
  - Confirmed `git remote -v` `origin` = `https://github.com/shahramclaude/Leados.git` on branch `arena/ade7ab4b-leados` (branched from `a268893`).
  - Installed lockfile dependencies (`npm ci --no-audit --no-fund`) and ran baseline `npm run verify:canonical` (`427/427` passing across `34` suites).
  - Audited 100% of canonical files (`index.html`, `app/main.js`, `app/styles.css`, `app/actions.js`, `app/conflict-actions.js`, `app/core/*.js`, 24 `app/core/domain/*.js`, 15 `app/ui/*.js`, 23 `app/views/*.js`, `scripts/*.mjs`, `eslint.config.mjs`), discovering and fixing **7 pre-existing cross-module defects**:
    1. `app/main.js` `documentTitle`: missing explicit titles for `capacity`, `changes`, `change`, and dynamic `hiring-detail` (`requisition.title`), plus added `scenarios`.
    2. `app/core/domain/export-governance.js`, `app/core/store.js`, `app/core/csv.js`: `cases[].stakeholders[]` stores private talking points under `keyMessage` (whereas `changes[].stakeholders[]` uses `notes`); export governance previously checked `s.notes` on cases and missed `keyMessage` during `EXPORT-STK-01` detection (`relevantNotes > 0`) and `redactStakeholderStances` JSON/CSV scrubbing.
    3. `app/core/domain/automation.js`: `RULE-CAP-05` catalog description stated `≥ 65%` overload odds while `evaluateMonteCarloTailRisk` triggered DACI escalation at `≥ 50%` (`0.5`); aligned catalog text to `≥ 50%`.
    4. `app/core/domain/health.js`: `reconstructStateAt` filtered `requisitions` and `candidates` by creation date only, leaving post-`asOfDay` interview `signals`, `stage`, `decision`, and `hiredOn` un-rewound.
    5. `app/ui/options.js`: `personOptions` ignored `{ includeNone, noneLabel, excludeId }` and `goalOptions` ignored `{ includeNone, noneLabel, personId }` passed by `hiring-modals.js`, `capacity-modals.js`, `case-modals.js`, and `change-modals.js`.
    6. `app/ui/modals.js`: `openSettingsDialog` omitted `changeReviewDays`, `simulationSeed`, and `simulationTrials`, and `Number(x) || default` prevented saving `0` (`operationalLoadPct: 0`, `idleLockMinutes: 0` off, `candidateRetentionDays: 0` off).
    7. `app/core/domain/capacity.js`: exported `personSupply` and added `person.startDate > dayKey(now)` `inHorizonShare` proration so future joiners within the planning horizon contribute only for active days in the window.
- **Counterfactual Scenario Sandboxing, Pareto Dominance & Tornado Sensitivity (`Schema v20` preserved)**:
  - **Domain (`app/core/domain/scenarios.js`)**: implemented pure DOM-free `projectScenarioState`, `evaluateScenario`, `compareScenarios`, `computeParetoFrontier`, `buildSuggestedScenarios`, and `computeSensitivityTornado` over isolated `structuredClone` snapshots using Law & Kelton Common Random Numbers (`seed`), Keeney–Raiffa Pareto frontier dominance (`overloadProbability`, `effectiveP80Days`, `netRiskAdjustedValue`), Samuelson marginal shadow pricing of capacity (`λ = ΔValue / ΔCommittedDays`), Reinertsen CD3 trim presets, Argyris & Schön single- vs. double-loop levers, Brooks’s Law mentoring drag (`mentoringDragDaysPerWeek`) vs. Watkins 30-60-90 ramp crossover, and Tsebelis veto-player / OKR `coalitionRisk`.
  - **Parallel + Vertical Rules Engine (`app/core/domain/automation.js`, `app/actions.js`, `app/core/domain/insights.js`)**: added `RULE-SCN-01` (#21 in `AUTOMATION_RULES`, `propagateScenarioCommitment`), `api.recordScenarioDecision` (non-destructive DACI logging with `funds` / `mitigates` / `decides` edges), `api.commitScenarioLevers` (atomic execution across `portfolio`, `cases`, `changes`, `settings`, `goals`, and `decisions`, cascading `RULE-CAP-01`, `RULE-CAP-03`, `RULE-CAP-05`, and `RULE-CHG-01`..`05` + `scenario.committed` audit event), and `SCN-01` Pareto-relief insight.
  - **Accessible Visualization, UI & CSV (`app/ui/charts.js`, `app/views/scenarios.js`, `app/core/csv.js`, `app/styles.css`, `app/views/{capacity,decisions,cases,changes,hiring}.js`)**: added accessible diverging SVG `tornadoChart` with expandable HTML data table, `#/scenarios` interactive sandbox with `?preset=` / `?case=` / `?change=` / `?req=` deep links from 5 views, and OWASP CWE-1236 formula-safe `sensitivity` CSV scope (#21).
- **Verification & honest `[UNVERIFIED]` boundaries**:
  - `npm run verify:canonical` → `eslint .` (`0` errors/warnings), `check:boundary` (`75` app ES modules & `35` test suites, `0` leaks), `check:links` (`0` broken links), and **`434/434` passing tests across `35` suites** (including 7 new tests in `tests/app/scenarios-sensitivity.test.mjs`, updated `access-audit.test.mjs`, `scale.test.mjs`, `csv.test.mjs`, and `cases-automation.test.mjs`).
  - Live HTTP verification via `scripts/serve.mjs` returned `200 OK` for `/`, `/app/main.js`, `/app/core/domain/scenarios.js`, and `/app/views/scenarios.js`.
  - Graphical browser layout/contrast rendering of `#/scenarios` in Session 30 (`@sparticuz/chromium` not installed in container `node_modules`), spoken screen-reader output (NVDA/JAWS/VoiceOver/Orca), Firefox/WebKit engines, print pagination, and real-manager field trials remain **`[UNVERIFIED]`**.
- **Repository sync**:
  - Committed and pushed branch `arena/ade7ab4b-leados` to `origin` (`https://github.com/shahramclaude/Leados.git`), and opened Pull Request **#29** (`https://github.com/shahramclaude/Leados/pull/29`) targeting `main`.

---

## Session 31 — 2026-10-26 (`arena/c73f8d7b-leados` — Forecast Calibration & Reference-Class Learning Loop: Brier/Murphy Decision Scoring, Funding-Time Forecast Snapshots, Delivery Actuals, Systematic-Optimism Governance + 1 Cross-Module Audit Fix)

- **Repository identity & baseline audit**:
  - Confirmed `git remote -v` `origin` = `https://github.com/shahramclaude/Leados.git` on branch `arena/c73f8d7b-leados` (branched from `06095a3`, merged PR #29 from Session 30) before any other action.
  - Installed lockfile dependencies (`npm ci --no-audit --no-fund`) and ran baseline `npm run verify:canonical` (`434/434` passing across `35` suites) before touching code.
  - Audited the prediction/actual surface across 100% of the relevant canonical files (`decisions.js`, `capacity.js`, `automation.js`, `schema.js`, decision/portfolio actions & modals, `insights.js`, `csv.js`, `demo.js`, `views/decisions.js`, `views/capacity.js`), establishing the session gap: decisions recorded outcomes with no probability ever stated, portfolio delivery recorded a date with no actual effort, and Session 30's CRN predictions lived in free-text rationale — the system predicted everywhere and scored nowhere. Also discovered and fixed **1 pre-existing defect**: Session 30's scenario commitment wrote the non-canonical lever value `'wanted'` (and a `'decision'` portfolio source type) verbatim into live state — the sandbox projection silently ignored `'wanted'`, so committed state diverged from the evaluated scenario until reload-time schema repair; now canonicalised at the view lever and the commitment boundary, and scenario-committed funding changes join `RULE-FCT-01`.
- **Forecast Calibration & Reference-Class Learning Loop (`Schema v21`)**:
  - **Domain (`app/core/domain/calibration.js`)**: pure DOM-free `decisionForecastPairs`, `brierScore`, `murphyDecomposition` (with the fractional-outcome residual reported, not hidden), `calibrationCurve` (reliability quintiles), `decisionCalibration` (Brier band + climatology skill + bias verdicts), `buildForecastSnapshot`, `estimatePairs` / `missingActualItems` / `scheduleAdherence`, `estimateCalibration` (median/mean/P80 actual÷estimate ratios, [optimistic, pessimistic] & P10–P90 coverage, optimism/padding/centred verdicts), `referenceClassAdjustment` (Flyvbjerg median & P80 uplifts, null below the n≥3 hint floor), and `calibrationSummary`. Verdicts refuse below n=5; unknown stays null end-to-end (no 50% defaults, no back-filled actuals).
  - **Schema v21 (`app/core/schema.js`)**: `decisions[].forecastProbability` (Cromwell-clamped 5–95, dropped when undecided), `portfolio[].actualEffortDays`, `portfolio[].actualValue`, `portfolio[].forecastSnapshot` (strictly validated), additive `20 → 21` migration inventing no history. A same-session tooling race (parallel edits to identical files) temporarily dropped several edits; all were detected by test failures, enumerated via marker sweep, repaired, and re-verified — recorded here so the episode is not invisible.
  - **Parallel + Vertical Rules Engine (`app/core/domain/automation.js`, `app/actions.js`, `app/core/domain/insights.js`)**: added `RULE-FCT-01` (#22, `freezePortfolioForecast`/`clearPortfolioForecast` — funding freezes the PERT belief scored at delivery; wired into item creation, funding decisions, and scenario commitments) and `RULE-FCT-02` (#23, `evaluateCalibrationGovernance` — at n≥5 & median ≥1.25× opens exactly one DACI decision offering median/P80 reference-class uplifts, estimation-practice investigation, or explicit acceptance, linked via `decides` to the worst overrun; triggered atomically inside `completePortfolioItem`/`recordPortfolioActuals`). Actions: forecast capture in `addDecision`/`decideDecision` with range coaching, the anti-hindsight freeze in `updateDecision`/`decideDecision` after outcome review, validated optional actuals in `completePortfolioItem`, new `recordPortfolioActuals`, and scenario decisions auto-recording `100 − CRN overload odds` as a structured forecast. Signals `FCT-01` (estimate bias both directions), `FCT-02` (intervals too narrow), `FCT-03` (decision forecast bias ≥15pp), `FCT-04` (≥3 delivered without actuals) — all silent on the demo baseline (Brier 0.04, n=2, "collecting evidence").
  - **Accessible Visualization, UI & CSV (`app/ui/charts.js`, `app/ui/modals.js`, `app/ui/capacity-modals.js`, `app/views/{decisions,capacity}.js`, `app/core/csv.js`, `app/styles.css`)**: reliability-diagram `calibrationChart` (SVG + expandable data table, text summary); Decide dialog forecast field with the leader's own base rate; Review dialog showing the forecast being scored; Edit-dialog forecast adjustment pre-review; new `openCompletePortfolioItemDialog` (replaces the one-click Deliver; actuals never pre-filled) and `openRecordActualsDialog`; `#/decisions` calibration card (stats, verdicts, chart, Murphy line, worst-miss table, missing-actuals backfill actions); `#/capacity` reference-class annotation beside the CLT P50/P80/P90 and forecast→actual effort cells; `calibration` CSV scope (#22) + `decisions` forecast/Brier columns; demo records extended with scored history (1 reviewed forecast, 1 pending, 2 snapshot-scored deliveries) without adding records or moving flow metrics.
- **Verification & honest `[UNVERIFIED]` boundaries**:
  - `npm run verify:canonical` → `eslint .` (`0` errors/warnings), `check:boundary` (`76` app ES modules & `36` test suites, `0` leaks), `check:links` (`0` broken links), and **`446/446` passing tests across `36` suites** (including 12 new tests in `tests/app/calibration.test.mjs`; 11 suites' version/migration-chain assertions updated 20→21 and `'19 → 20'` → `'19 → 20', '20 → 21'`, `AUTOMATION_RULES` 21→23, `CSV_EXPORTS` 21→22). One genuine domain bug was caught by the new suite before ship: `num(null)` evaluated to `0`, which would have scored missing forecasts as 0% — fixed and regression-pinned.
  - Live HTTP verification via `scripts/serve.mjs` returned `200 OK` for `/`, `/app/main.js`, `/app/core/domain/calibration.js`, and `/app/views/decisions.js`.
  - Graphical browser layout/contrast rendering of the calibration card & reliability diagram, spoken screen-reader output (NVDA/JAWS/VoiceOver/Orca), Firefox/WebKit engines, print pagination, and whether Brier feedback changes a real manager's forecasting behaviour over a quarter remain **`[UNVERIFIED]`**.
- **Repository sync**:
  - Committed and pushed branch `arena/c73f8d7b-leados` to `origin` (`https://github.com/shahramclaude/Leados.git`), and opened a Pull Request targeting `main` (URL reported in the session changelog). **Merged as PR #30** (`cdf4303`).

---

## Session 32 — 2026-10-26 (`arena/84252557-leados` — Case-Cost Calibration Ledger: FAIR Frequency × Magnitude Settlement Scoring, Opening-Forecast Freeze, Actuarial Loss Development & Under-Reserving Governance + 2 Cross-Module Audit Fixes + Point-in-Time Actuals Rewind)

- **Repository identity & baseline audit**:
  - Confirmed `git remote -v` `origin` = `https://github.com/shahramclaude/Leados.git` on branch `arena/84252557-leados` (branched from `cdf4303`, merged PR #30 from Session 31) before any other action.
  - Installed lockfile dependencies (`npm ci --no-audit --no-fund`) and ran baseline `npm run verify:canonical` (**446/446 passing across 36 suites**) before touching code.
  - Gap-analysed against `ROADMAP.md`: Session 31's #2 priority — the case-cost calibration ledger (`RESEARCH.md` §41.7) — was the last unscored prediction class. Cases carried PERT exposure/planned mitigation/diverted-capacity estimates since Session 23 and `RULE-CAP-01` reserves since Session 24, but resolution recorded only a date and a note. Audited the full case/calibration surface (`schema.js` `normalizeCases`, `calibration.js`, `automation.js` case/FCT rules, `addCase`/`updateCase`/`resolveCase`/`reopenCase`, `case-modals.js`, `views/cases.js`, `csv.js` cases+calibration scopes, `demo.js`, `health.js` rewind), discovering and fixing **2 pre-existing defects** plus one same-feature consistency gap:
    1. **Capacity-reserve leak on the Edit path**: `updateCase` setting status → `resolved`/`closed` routed only through `propagateCaseEvent`, which early-returns for closed cases — so the `RULE-CAP-01` reserve stayed `open` forever (silently shrinking apparent capacity) and the `RULE-GOAL-01` resolution check-in never fired. The edit path now runs `propagateCaseResolution` identically to `resolveCase`.
    2. **Live/reload divergence on reopen**: `reopenCase` cleared `resolvedOn` but left `resolutionNotes` in live state while schema normalisation blanks them on reload (same class as Session 31's `'wanted'` fix). `reopenCase` and `updateCase`'s open branch now clear `resolutionNotes` + `actuals` in step with the schema.
    3. **Point-in-time leak (v22 consistency)**: `reconstructStateAt` un-resolved cases resolved after the cutoff but would have carried their future `actuals` (and snapshots frozen after the cutoff) into historical snapshots; both now rewind out.
  - One editing incident, recorded for honesty (same class as Session 31's): two same-file edits to the new test file were issued in one tool block and the import edit was clobbered; detected immediately by the failing test run (`reconstructStateAt is not defined`), repaired, and re-verified. A full marker sweep over 24 feature identifiers across `app/` + `tests/app/` confirmed every other intended edit landed.
- **Case-Cost Calibration Ledger (`Schema v22`)**:
  - **Schema (`app/core/schema.js`)**: `cases[].forecastSnapshot` (strictly validated; dropped whole without a measurable leg) and `cases[].actuals` (`materialised`/`realisedExposure`/`mitigationSpend`/`divertedDays`/`settledOn`/`note`, each independently nullable, all-empty → null, closed cases only, unknown never coerced to zero); additive `21 → 22` migration inventing no history.
  - **Domain (`app/core/domain/calibration.js`)**: pure DOM-free `buildCaseForecastSnapshot`, `caseCostPairs` (four independent scores per settlement — FAIR (Freund & Jones, 2015) frequency leg: FMEA-implied probability vs materialisation, Brier; magnitude leg: realised vs PERT expectation with [O,P] + P10–P90 coverage on materialised cases only; spend and diverted-days discipline legs — the latter finally scoring the `RULE-CAP-01` reserves Session 31 deliberately excluded from the effort ledger), `missingCaseActuals`, `caseCostCalibration` (occurrence stats, exposure verdicts + interval verdict at the shared n≥5 floor, actuarial Σrealised ÷ Σexpected-unmitigated loss-development over complete single-currency settlements), `caseReferenceClassAdjustment` (hint floor n≥3), and `calibrationSummary` now exposing all three ledgers. Scoring prefers the frozen `opening-forecast`; pre-v22 history falls back to the labelled `resolution-estimate`.
  - **Parallel + Vertical Rules Engine (`app/core/domain/automation.js`, `app/actions.js`, `app/core/domain/insights.js`)**: added `RULE-FCT-03` (#24, `freezeCaseForecast` — first-quantification freeze at create/update, never at resolution, independent of `autoPropagate` like `RULE-FCT-01`) and `RULE-FCT-04` (#25, `evaluateCaseCalibrationGovernance` — at n≥5 & median development ≥1.25× opens exactly one DACI decision with reference-class contingency uplifts, P80 reserving, practice investigation, or explicit self-insured acceptance, linked `decides` to the worst under-assessment; triggered atomically inside `resolveCase` (new optional settled-actuals capture) and the new `recordCaseActuals` backfill). Signals `FCT-05` (reserve adequacy both directions), `FCT-06` (occurrence gap ≥20pp, mitigation-confound copy), `FCT-07` (≥3 unscored settlements) — all silent on the demo baseline (1 settlement, 1.1939×, "collecting evidence").
  - **Accessible Visualization, UI & CSV (`app/ui/charts.js`, `app/ui/case-modals.js`, `app/views/cases.js`, `app/views/decisions.js`, `app/core/csv.js`, `app/core/demo.js`)**: `caseRatioChart` (realised ÷ assessed bars vs the 1.0× line, capped display scale with true ratios printed + full `<details>` data table); Resolve dialog gains the optional "Settled actuals" section (blank fields, opening forecast shown for context) and `openRecordCaseActualsDialog` backfills/edits settlements; `#/cases` gains the case-cost calibration card (both FAIR legs, development factor, verdicts, missing-actuals backfill queue) and resolved-case settlement chips + Record/Edit buttons; case detail gains the "Settled Actuals vs Opening Forecast" panel; `#/decisions` calibration card gains a "Case costs" cross-reference; `cases` CSV gains 10 settlement columns and `calibration` CSV gains `case-exposure` / `case-occurrence` / `case-missing-actuals` rows (OWASP CWE-1236 safe; scope count unchanged at 22). Demo gains one resolved incident with a frozen snapshot + settled actuals (19500 vs 16333.33 expected) and a frozen snapshot on the open billing case — no signals fire, no flow metrics moved.
- **Verification & honest `[UNVERIFIED]` boundaries**:
  - `npm run verify:canonical` → `eslint .` (`0` errors/warnings), `check:boundary` (`76` app ES modules & `37` test suites, `0` leaks), `check:links` (`0` broken links), and **`456/456` passing tests across `37` suites** (10 new in `tests/app/case-calibration.test.mjs`; 18 suites' version/migration-chain pins updated 21→22, `AUTOMATION_RULES` 23→25, `RULE-FCT-*` catalog 2→4, demo case count 2→3 with the August-settled case surviving the Sept-1 rewind, settings "Schema v22" text). End-to-end API trace verified live: one case registration fanned out to DACI decision + delegation + goal check-in + 1:1 topic + capacity reserve + `RULE-FCT-03` freeze in parallel; resolution with actuals released the reserve, logged the goal check-in and scored all four legs (1.47×/1.3×/1.46×/Brier 0.09) against the frozen belief.
  - Live HTTP verification via `scripts/serve.mjs` returned `200 OK` for `/`, `/app/main.js`, `/app/core/domain/calibration.js`, `/app/views/cases.js`, `/app/ui/case-modals.js`, and `/app/core/domain/automation.js`.
  - Graphical browser layout/contrast rendering of the `#/cases` case-cost card, `caseRatioChart` and the new dialogs, spoken screen-reader output (NVDA/JAWS/VoiceOver/Orca), Firefox/WebKit engines, print pagination, and whether development-factor feedback changes a real team's exposure assessments over a quarter remain **`[UNVERIFIED]`**.
- **Repository sync**:
  - Committed and pushed branch `arena/84252557-leados` to `origin` (`https://github.com/shahramclaude/Leados.git`), and opened a Pull Request targeting `main` (URL reported in the session changelog).

---

## Session 33 — 2026-10-26 — RULE-CAP-06: Case Settlement Learning → Capacity Plan

### Repository identity and audit-first baseline

- Before reading or modifying project files, `git remote get-url origin` returned
  `https://github.com/shahramclaude/Leados.git`, matching the required repository. Working branch:
  `arena/cf6e8224-leados` (active); initial `git status` was clean.
- Audited the tracked-file inventory, canonical-app ADR, package scripts, root shell, current
  session log/README/roadmap/research, case-calibration domain, automation engine, action layer,
  capacity model, and case-dialog preview. The supported product remains `index.html` → `app/main.js`
  → `app/**`, local-first and zero-build; schema v22, typed graph, append-oriented audit history,
  dry-run preview and event-driven propagation already exist. No rewrite was justified.
- Current-state assessment, code-verified: core case estimates freeze into an opening forecast;
  settlement actuals are scored in the FAIR frequency/magnitude and capacity-days ledgers; `RULE-CAP-01`
  registers case reserves; `RULE-CAP-02` handles over-allocation; `RULE-CAP-05` checks seeded
  Monte Carlo tail risk. The gap: settlement calibration did not resize other open case reserves,
  so actual capacity experience stopped at a calibration report. Existing case-cost and capacity
  paths have action/UI/domain tests. **[UNVERIFIED]**: this session did not line-review all 3,000+
  quarantined legacy files, run the legacy Next build, use physical/mobile browsers or spoken
  assistive technology, or conduct a field study. README/ADR claims about the canonical boundary
  were checked against the gate, not treated as evidence that all historical trees work.
- Baseline `npm test` initially could not import `jsdom` because the checkout had no installed
  `node_modules`; this was an environment/dependency-install issue, not a product assertion. Ran
  `npm ci --no-audit --no-fund` from the checked-in lockfile (no package/lock changes), then tests.

### Research and gap decision

- Reviewed Flyvbjerg's reference-class forecasting paper and PMI-hosted article, plus Atlassian Jira
  Plans documentation for capacity and scenario planning; sources and design/rejection rationale are
  in `RESEARCH.md` §43. Product pattern adopted: feed observed delivery/capacity evidence into the
  operating plan and compare counterfactuals before commitment. Deliberately did not import external
  infrastructure uplifts into team software work.
- Cross-domain design: use actual/forecast *diverted days* rather than risk-cost ratios (dimensional
  integrity); queueing/capacity (Little / Kingman) and seeded Monte Carlo consume the revised reserve;
  economics makes over-allocation an explicit DACI trade-off; the existing operations feedback loop
  audits the update; managers retain their source estimates. Leadership/political governance keeps
  the action explainable, not a hidden score.
- Top roadmap gap selected: make the case-capacity forecast learn from the case-capacity calibration
  ledger. Five records and a 1.25× median trigger are conservative product controls, not statistical
  guarantees; this explicit limit is in the UI rationale and research/roadmap.

### Shipped — RULE-CAP-06 (no schema migration)

- `app/core/domain/calibration.js`: added pure `caseCapacityReferenceClassAdjustment`, dimensionally
  using settled diverted-days vs frozen forecast. No automatic change before n≥5 or below median
  1.25×. Ordinary cases use median; high Action Priority uses the observed P80. Applies to all three
  reserve PERT legs, not to the case estimate or immutable snapshot.
- `app/core/domain/automation.js`: registered event rule `RULE-CAP-06`. Resolution/backfill recalculates
  open case reserves in a single transaction, preserves source/typed links, records the rule in audit
  history, then re-runs deterministic `RULE-CAP-02` and seeded Monte Carlo `RULE-CAP-05`. The
  reference-class calculation is shared per refresh event, avoiding repeated calibration scans.
- `app/actions.js`: integrated the refresh in both resolve-time actuals capture and
  `recordCaseActuals` backfill. `previewCasePropagations` now shows the adjusted/raw reserve, quantile,
  factor and sample count; the existing case dialog renders the preview without a separate UI system.
- Tests: regression verifies four settlements do not uplift; the fifth updates an already-open reserve
  to 2× while the case's frozen estimate remains intact; high-priority helper uses P80; preview names
  the applied rule; catalog entry declares framework/targets/trigger. No fabricated sample data or
  external service. `index.html`, `README.md`, `ROADMAP.md`, and `RESEARCH.md` updated.

### Verification and known boundaries

- `npm run lint` — passed, 0 ESLint errors/warnings.
- `npm run check:boundary` — passed, 76 canonical app modules and 37 suites checked, zero legacy-tree
  or network leaks.
- `npm run check:links` — passed, 88 internal links across 107 Markdown files.
- `npm test` — **457 passed, 0 failed, 0 skipped across 37 suites** (after final implementation edits).
- Focused RULE-CAP-06 test proves the cross-module transaction; `scripts/serve.mjs` preview started on
  port 5173 and `GET /` returned HTTP 200 with the LeadOS title. No visual browser inspection is
  claimed; real desktop/mobile rendering, spoken AT, calibration performance in real teams, and the
  product-policy validity of n=5 / 1.25× remain **[UNVERIFIED]**.
- No schema or runtime dependency change. Repository synchronization result is recorded below after
  the explicit push operation.

### Repository synchronization

- Commit `5ad25a6` (`feat: calibrate case capacity reserves from actuals`) was pushed successfully to `origin/arena/cf6e8224-leados` at `https://github.com/shahramclaude/Leados.git` (remote confirmed the new branch). GitHub printed the branch PR creation URL: `https://github.com/shahramclaude/Leados/pull/new/arena/cf6e8224-leados`; no PR was opened in this session. The follow-up log-only commit `cd0e0d8` was also pushed successfully to `origin/arena/cf6e8224-leados`; the remote updated from `5ad25a6` to `cd0e0d8`.

## Session 34 — 2026-10-26 — RULE-COACH-02 closes the operational case → 1:1 learning loop

### Identity, audit scope and baseline

- The first repository check returned `origin https://github.com/shahramclaude/Leados.git` for fetch and push, matching the required canonical remote. Work stayed on active branch `arena/892f7066-leados`; baseline was clean at `9567cb5`.
- Enumerated tracked/untracked repository files and reviewed the canonical-app ADRs, package gates, `index.html`, README, roadmap/research, the case propagation/action/store/schema paths, relevant domain/UI code, and the case automation tests. Supported app is `index.html` → native ES modules in `app/**`, local-first and zero-build. No rewrite or schema migration was warranted.
- Verified current code has an event-driven typed-link propagation engine: cases already fan out to stakeholder cadence, DACI, mitigation delegation, goal telemetry, 1:1 support and capacity; closure releases capacity and updates a linked goal. Gap confirmed in `propagateCaseResolution` / `reopenCase`: the case-generated support topic had no reversible closeout lifecycle.
- Audit boundary: the whole repository inventory is present, but this session did **not** personally line-review all historical React/Next/TypeScript source files, execute their builds, validate a real graphical browser/screen reader, or perform a field study. Those legacy runtimes, production deployment posture, assistive-technology output and real-team impact remain **[UNVERIFIED]**. Current canonical assertions are limited to inspected code and tests.

### Research and cross-domain decision

- Reviewed Google SRE postmortem-culture and workbook guidance (see `RESEARCH.md` §44): operational learning should survive resolution as owned follow-up. Applied blameless learning / psychological safety to distinguish a systemic safeguard conversation from an individual rating. This does not claim that Google SRE guidance validates LeadOS's coaching outcomes.
- Shipped a shared event rule, `RULE-COACH-02`: generated support topics carry a stable case reference; resolving a case converts only its tagged topic into a systemic-learning prompt; reopening restores or re-queues active support. User-entered topics, reviews and their ratings remain unchanged. The ordinary store transaction logs each propagated person update. Untagged legacy topics are not guessed from title text. No new dependency, network call or schema version was added.
- Updated `index.html`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, and this session log. Roadmap priorities remain real-browser/AT review, consent-based field validation, legacy dependency review and broader workspace performance.

### Verification and limitations

- `npm ci --no-audit --no-fund` installed the lockfile tool dependencies; no package or lockfile change.
- `npm run lint` passed. `npm run check:boundary` passed (76 canonical modules, 37 suites, zero legacy/network leaks). `npm run check:links` passed (88 internal links across 107 Markdown files). `git diff --check` passed.
- `npm test` passed **457/457** across the canonical suite in 186 seconds. The focused `tests/app/cases-automation.test.mjs` passed **7/7** after the final prep-sheet assertion was tightened. It verifies case create → support prompt → resolve → learning prompt on the prep sheet → reopen → support restoration, idempotency, audit propagation, and preservation of an employee-authored topic.
- `npm run verify:canonical` reached the test phase after lint/boundary/link gates passed, but its single command exceeded the shell's 180-second limit before finishing the tests. The full `npm test` and each preceding gate were then completed separately; do not describe the aggregate command itself as having succeeded.
- Automated JSDOM/axe checks are not real browser rendering or spoken screen-reader certification. Whether managers understand/use the prompt and whether it improves learning remain **[UNVERIFIED]**.

### Repository synchronization

- Commit `536b837` (`feat: connect case closeout to coaching follow-through`) pushed successfully to `origin/arena/892f7066-leados` at `https://github.com/shahramclaude/Leados.git` (push exit 0; remote confirmed the new branch). No pull request was opened; GitHub returned the branch's PR creation URL: `https://github.com/shahramclaude/Leados/pull/new/arena/892f7066-leados`. This final session-log update will be committed and pushed separately.

## Session 36 — 2026-10-26 — negotiation delivery feedback

Identity first: origin https://github.com/shahramclaude/Leados.git matched the designated
repository before audit/modification. Branch arena/2430f7f3-leados clean at start; fetched
origin and HEAD matched origin/main (0/0 divergence). No branch switch or architecture swap.

Focused current-state audit: canonical static app, schema v23, transactional localStorage
store and explicit automation catalog exist. Agreement creates delegations but completion
and return did not feed agreement/goal records. Worse, schema normalization stripped both
negotiation provenance IDs. Fixed the verified persistence defect and shipped RULE-NEG-04,
observed delivery column, NEG-07 recovery findings, neutral goal telemetry and audit events.
No savings, goal progress, outcome ratings or replacement owners inferred. Existing
capacity completion automation still runs in the same transaction. Legacy modules and all
repository sources were NOT personally line-reviewed; that requested audit remains incomplete.

Tests: focused negotiation 20/20 including real action API completion/return, persistence
normalization, opt-out, obsolete-term guard, empty-term honesty, and existing JSDOM/axe
workflow. Added catalog entry required updating existing catalog-count assertion (30→31).
First full run: 475/477 (old count assertion plus case-calibration UI). After count fix,
serial full run: 476/477, only case-calibration route-render assertion failed. Isolated
case-calibration suite: 11/11 passed. Timing root cause **[UNVERIFIED]**; clean full suite not
claimed. Lint, boundary and doc-link gates pass. No real-browser/AT or field validation.

Changed files: index.html, README.md, ROADMAP.md, RESEARCH.md, AI-SESSION-LOG.md,
app/actions.js, app/core/schema.js, app/core/domain/automation.js,
app/core/domain/negotiation.js, app/core/domain/insights.js, app/views/negotiation.js,
tests/app/negotiation.test.mjs, tests/app/cases-automation.test.mjs.

Sync: commit/push pending at this log entry; actual result reported after command execution.

Sync confirmation: implementation commit e33a753 pushed successfully to
origin/arena/2430f7f3-leados (git push exit 0; remote confirmed new branch).
This follow-up log commit records that confirmed result; no PR or merge was requested.

## Session 37 — 2026-10-26 — Returned-commitment recovery lineage (`RULE-NEG-05`), ex-post agreement settlement governance (`RULE-NEG-06`, `NEG-08`), and store/rewind/test determinism

### Identity, audit scope and baseline

- Confirmed `git remote -v` matched `https://github.com/shahramclaude/Leados.git` before taking any action. Active branch is `arena/bece14f8-leados`, branched from `feef353` (post-Session 36 / PR #35).
- Audited the 79 canonical `app/**` ES modules, 38 `tests/app/*.test.mjs` test suites, `index.html`, `package.json`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, and `AI-SESSION-LOG.md`. The quarantined legacy React/Next/Drizzle/Vite trees (`src/**`, `public/index.html`, `deprecated/`) were not rebuilt or line-by-line audited and remain **[UNVERIFIED]** per ADR-0007.
- Identified five concrete gaps in the canonical application:
  1. **Returned-commitment recovery (`#/delegations` and `#/negotiations/:id`)**: Returning a delegation (`status: 'returned'`) raised `NEG-07`, but there was no explicit recovery/redelegation action that preserved the returned delegation record in history, recorded a countermeasure, tracked prior owners on negotiated terms, or cleared `NEG-07`.
  2. **Ex-post agreement settlement & BATNA-breach governance (`#/negotiations/:id`)**: Agreed negotiations stopped at paper terms (`stakesValue`, `agreedTerms[].agreedValue`) with no structured way to record realised deal value, counterparty delivery, or per-term settled values, and no governance trigger when a settled outcome breached the walk-away BATNA.
  3. **`store.clearDemo()` negotiation dangling-reference leak (`app/core/store.js`)**: `clearDemo()` filtered `negotiations` and `links` without including `negotiation` in `remainingByType` or scrubbing dangling demo `ownerId`, `linkedGoalId`, `escalationCaseId`, or `sourceId` references on retained user negotiations.
  4. **`reconstructStateAt()` negotiation & delegation recovery rewind gap (`app/core/domain/health.js`)**: `reconstructStateAt()` did not rewind `negotiations` (post-cutoff agreements and settlements) or delegation recovery lineage (`supersededByDelegationId`, `recoveredOn`) as of `asOfDay`.
  5. **Test determinism & scale coverage (`tests/app/case-calibration.test.mjs`, `tests/app/calibration.test.mjs`, `tests/app/scale.test.mjs`)**: `case-calibration.test.mjs` and `calibration.test.mjs` mutated `window.location.hash` with a 15ms timer flush instead of calling `app.navigate(...)` and `app.destroy?.()`, and `scale.test.mjs` did not include `delegations`, `negotiations`, or `changes`.

### Frameworks and implementation

- **Returned-Commitment Recovery & Immutable Lineage (`RULE-NEG-05`; Oncken & Wass 1974, Grove 1983, Hollnagel 2014)**:
  - Added `priorDelegationId`, `supersededByDelegationId`, `recoveredOn`, and `recoveryNote` on `delegations[]` with cycle-safe normalization (`repairDelegationRecoveryChains` in `app/core/schema.js`) and `deriveDelegationLineage` / `delegationSummary` (`unrecoveredReturned`, `recoveredReturned`) in `app/core/domain/delegations.js`.
  - Added `redelegateReturnedOutcome` and `recoverNegotiationTerm` in `app/actions.js`, `openRedelegateDialog` in `app/ui/modals.js`, `openRecoverNegotiationTermDialog` in `app/ui/negotiation-modals.js`, and lineage/recovery UI on `#/delegations` and `#/negotiations/:id`.
  - `RULE-NEG-05` (`propagateReturnedDelegationRecovery` in `app/core/domain/automation.js`) updates `term.ownerId`, `term.dueOn`, and `term.priorOwners`, carries forward `tracks-followup` and `mitigates` graph links, queues a blameless 1:1 handover talking point on the new owner with the prior return reason and countermeasure, and clears `NEG-07`.
- **Ex-Post Agreement Settlement & BATNA-Breach Governance (`RULE-NEG-06`, `NEG-08`; Williamson 1985, Hart & Moore 1988, Perold 1988, Raiffa 1982)**:
  - Added optional `settlement` (`settledOn`, `realisedValue`, `counterpartyDelivered`, `note`) on `agreed` negotiations and `settledValue` on `agreedTerms[]` (`app/core/schema.js`), voided on `reopenNegotiation`.
  - Built pure `evaluateNegotiationSettlement(record)` in `app/core/domain/negotiation.js` and `recordNegotiationSettlement` in `app/actions.js`, wired to `openNegotiationSettlementDialog` and the *Agreement settlement & realization* card on `#/negotiations/:id`.
  - `RULE-NEG-06` (`propagateNegotiationSettlement` in `app/core/domain/automation.js`, bringing `AUTOMATION_RULES` to 33 rules) logs an idempotent settlement check-in on linked goals and opens a linked DACI settlement review decision on BATNA breach, counterparty non-delivery, or material implementation shortfall. `NEG-08` surfaces completed high-stakes agreements awaiting settlement and adverse settled outcomes.
  - Added additive lineage columns to `delegations` CSV and settlement columns to `negotiations` CSV (`app/core/csv.js`).
- **Store, Rewind, Scale & Test Determinism**:
  - Updated `clearDemo()` in `app/core/store.js` and `reconstructStateAt()` in `app/core/domain/health.js`.
  - Hardened `tests/app/case-calibration.test.mjs` and `tests/app/calibration.test.mjs`, expanded `tests/app/scale.test.mjs`, and added 6 new Session 37 tests in `tests/app/negotiation.test.mjs` (now 26 tests in `negotiation.test.mjs`).

### Verification and boundaries

- `npm run verify:canonical` passed end-to-end:
  - `npm run lint` (`eslint .`): **0 errors, 0 warnings**.
  - `npm run check:boundary`: **79 app ES modules and 38 test suites verified with 0 quarantined-tree or network leaks**.
  - `npm run check:links`: **88 internal links across 108 markdown files resolve**.
  - `npm test`: **483/483 tests passing across 38 suites (`0 fail`)**.
- Real graphical browser rendering of the Session 35–37 Negotiation Workbench views, spoken assistive-technology output, and field manager comprehension remain **[UNVERIFIED]**.

### Repository synchronization

- Implementation commit `9e097ad` (`feat(negotiation): add returned-commitment recovery lineage (RULE-NEG-05) and ex-post settlement governance (RULE-NEG-06)`) pushed to `origin/arena/bece14f8-leados` at `https://github.com/shahramclaude/Leados.git` (`git push` exit 0; remote confirmed the new branch and PR creation URL `https://github.com/shahramclaude/Leados/pull/new/arena/bece14f8-leados`). This follow-up log commit records the verified push outcome.

## Session 38 — 2026-10-26 — Negotiated-versus-realised settlement calibration (`RULE-NEG-07`, `NEG-09`)

### Identity, audit scope and gap

- Verified `origin` fetch/push as `https://github.com/shahramclaude/Leados.git`, matching the user-designated repository. Stayed on active branch `arena/87943337-leados`, based at `5b113b2` from `origin/main`; did not switch branches. The working tree already contained the partial, untested calibration/automation edits described in the carried session context.
- Audited the canonical negotiation settlement evaluator, settlement normalization, `recordNegotiationSettlement()` action, automation catalog/transaction, negotiation insight IDs, Decisions/Negotiation views, CSV calibration scope, and their focused tests. Verified the actual evaluator contract (`dealDirection`, `stakesCurrency`, `stakesValue`, `realisedValue`, `favorableValueVariance`, `shortfallRatio`, `counterpartyDelivered`, `settled`, `settledOn`) before consuming it. No schema or dependency change was warranted.
- Gap: explicit settled values already existed but were not fed into an outside-view learning loop, missing comparisons were not actionable from calibration, and prior settlement cohorts were absent from new-negotiation preparation. Legacy React/Next/Drizzle/Vite trees were not rebuilt or line-by-line audited; their status remains **[UNVERIFIED]** under ADR-0007.

### Research and cross-domain decision

- Rechecked Bent Flyvbjerg's [2006 reference-class paper record](https://arxiv.org/abs/1302.3642) and André Perold's [1988 implementation-shortfall journal record](https://doi.org/10.3905/jpm.1988.409150). Flyvbjerg supports comparison against actual outcomes from comparable cases; Perold distinguishes a paper decision from execution outcome. Neither validates LeadOS's sample-size or trigger choices.
- Benchmarked product patterns from Oracle's [actuals / plans / forecasts tutorial](https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/planning-tutorials-calculating-actuals-and-preparing-plans-and-forecasts/index.html), Coupa's [strategy-to-contract-to-invoice product description](https://www.coupa.com/products/direct-material-sourcing/), and Suplari's [vendor-authored realized-savings article](https://suplari.com/blog/realize-savings-in-procurement-how-to-prove-what-your-team-actually-delivered). Treat Coupa/Suplari statements as vendor claims, not independent evaluation. Product lesson: preserve the signed baseline and do not claim savings without transaction-level evidence.
- Applied Flyvbjerg (outside view), Perold (directional implementation shortfall), Williamson/Hart (ex-post contract governance), Deming PDCA, descriptive statistics and missingness discipline, dimensional analysis, and DACI/fair-process guardrails. The 20% median-shortfall trigger and n=5 floor are explicit product review guardrails—not statistical significance, causal attribution, or individual performance scoring.

### Implemented: four-ledger calibration and cross-module flow

1. **Pure calibration (`app/core/domain/calibration.js`)**: added `negotiationSettlementPairs()` and `negotiationSettlementCalibration()` and included them in `calibrationSummary()`. Only agreed records with a positive explicit signed value and an explicit realised value are scored. Cohorts are strictly segmented by currency and issue direction. Settled records without a comparable pair retain a reason in the follow-up list; no value is inferred, no currency converted, and missing actuals are not treated as zero. Cohorts below n=5 expose counts only; at n≥5, a median shortfall ≥20% sets the review guardrail.
2. **Transactional propagation (`app/core/domain/automation.js`, `app/actions.js`)**: catalogued `RULE-NEG-07` and hooked it beside `RULE-NEG-06` in `recordNegotiationSettlement()`. The derived read model remains computed from source negotiation records; typed propagation metadata and an idempotent audit event are returned in the same safe-write transaction.
3. **Insights (`app/core/domain/insights.js`)**: reserved `NEG-09` for sufficient currency/direction cohorts meeting the material-median-shortfall trigger. It routes to `#/decisions` and explicitly directs review of baseline, scope, usage and delivery before cause attribution; it is not a negotiator or employee score.
4. **UI (`app/views/decisions.js`, `app/views/negotiation.js`)**: added an accessible settlement cohort table and record-by-record missing-actual follow-up list on `#/decisions`; added prior-cohort context to negotiation preparation, excluding the current record to prevent self-scoring. Small cohorts stay counts-only and no BATNA/target/forecast is automatically changed.
5. **CSV (`app/core/csv.js`)**: extended the existing `calibration` scope with `negotiation-settlement`, `negotiation-reference-class`, and `negotiation-missing-actual` rows. Cohort summaries remain counts-only under n=5; explicit source-pair rows remain labelled as recorded comparisons.
6. **Regression coverage**: added direction/currency separation, n=4 suppression, exactly-20% trigger, `NEG-09`, incomplete follow-up, CSV and JSDOM/axe assertions in `tests/app/calibration.test.mjs`; tested action-level RULE-NEG-07 propagation and duplicate-event idempotence plus negotiation-prep readout in `tests/app/negotiation.test.mjs`. Updated the existing automation catalog-count assertion from 33 to 34 in `tests/app/cases-automation.test.mjs`.

Updated `index.html`, `README.md`, `ROADMAP.md`, and `RESEARCH.md` §46. No schema migration, runtime dependency, backend or automatic forecast correction was added.

### Verification and known boundaries

- Focused `node --test tests/app/calibration.test.mjs tests/app/negotiation.test.mjs`: **40/40 passed**. After fixing the catalog-count expectation, `cases-automation` + the two focused suites passed **47/47**.
- The first end-to-end `npm run verify:canonical` surfaced one stale test expectation (`AUTOMATION_RULES.length` expected 33; catalog was correctly 34 after `RULE-NEG-07`). Updated the assertion to 34 and reran the complete command successfully.
- Final `npm run verify:canonical`: **485/485 tests passed across 38 suites**, `0` ESLint errors, canonical boundary verified **79 app ES modules / 38 suites with 0 leaks**, and `89/89` internal Markdown links resolved across 108 Markdown files. `git diff --check` also passed after final documentation edits.
- JSDOM + `axe-core` checks passed for the affected views. Real Chromium rendering, keyboard/AT usability outside JSDOM, actual invoice/GL verification, finance-approved baselines, manager comprehension and field effectiveness remain **[UNVERIFIED]**. The 20% and n=5 guardrails are not externally validated.

### Next priorities

1. Run real-Chromium desktop/mobile and keyboard/assistive-technology validation for the Decisions calibration table and negotiation-prep context.
2. Validate settlement actuals against consented, finance-approved baselines and source records before claiming savings or P&L impact.
3. Review the usefulness of n=5, empirical P80 and the 20% review threshold on representative data; keep them labelled heuristics until validated.
4. Continue focused canonical audits; legacy-tree runtime/security status and broad real-user impact remain **[UNVERIFIED]**.

### Repository synchronization

- Implementation commit `6207914` (`feat(negotiation): add settlement reference-class calibration`) pushed successfully to `origin/arena/87943337-leados` at `https://github.com/shahramclaude/Leados.git`. `git ls-remote` confirmed remote SHA `620791446f31e6f6f2034b9ed486c6adabad65ba`, matching local `HEAD`.
- Opened pull request [#37](https://github.com/shahramclaude/Leados/pull/37), base `main`, head `arena/87943337-leados`; `gh pr view 37` confirmed state `OPEN` and the same head SHA. No merge was performed.
- A first PR-create attempt was rejected because shell expansion made the Markdown body exceed GitHub's limit; the quoted body-file retry succeeded. The branch push and PR creation are both confirmed.

---

## Session 39 — 2026-10-26 — Budget & financial commitments (Schema v24, `RULE-FIN-01..03`, `FIN-01..05`)

### Repository identity and baseline

- Verified `origin` as `https://github.com/shahramclaude/Leados.git` (matches user-designated repository); stayed on active branch `arena/bf30bdcb-leados` at `5107ac8`; baseline `npm test` **485/485** (fresh sandbox needed `npm install --ignore-scripts` for dev-only jsdom — environment, not regression).
- Audit finding: no budget record existed. Money lived only as case PERT exposure, portfolio value triples and negotiation stakes/settlement actuals — nothing answered "what ceiling do I hold, what is encumbered, what is spent, am I forecast to breach?" Session 38's settlement actuals also lacked a finance-baseline home. The finance/capital-allocation leg was the largest cross-domain gap; stakeholder register deferred again (not rejected). Legacy quarantined trees not re-audited; status **[UNVERIFIED]** under ADR-0007.

### Research and cross-domain decision

- **Commitment/encumbrance accounting** (BILL encumbrance guide; Oracle Commitment Model docs): a commitment reserves budget authority when the obligation is entered; the encumbrance reverses when the actual lands. Basis for `planned → committed → spent/released`.
- **Budgetary control** (Anthony & Govindarajan): exercise control on forecast at completion, not post-period variance.
- **Liebman & Mahoney (2017, American Economic Review 107(11))**: 8.7% of federal procurement lands in the final week (4.9× weekly average), year-end IT projects 2.3–5.6× likelier to score below-median quality. Basis for ceiling-not-target design and FIN-05.
- Flyvbjerg reference classes + LeadOS n≥5 discipline for the fifth ledger; ratios are dimensionless so they pool across currencies without FX; 80% watch share and 1.20× median-overrun trigger are product guardrails, explicitly not validated constants. Full synthesis + rejected shortcuts: RESEARCH.md §47.

### Implemented

1. **Pure engine `app/core/domain/finance.js`** — `evaluateBudget` (FAC = recorded actuals + open encumbrances; planned = pipeline; inclusive breach/watch boundaries; missing actuals/unpriced commitments → `forecastUnderstated`, never zero-filled), `budgetsRollup`, `commitmentCalibration(Pairs)`, `calibratedForecast`, `sourceCompletion`, `formatMoney`.
2. **Schema v24** — `budgets` collection + additive 23→24 migration; one currency per envelope; blank ceiling = tracking-only; actuals only on spent lines; dead owners/sources cleared, amounts preserved; `budgetWatchPct` setting (80, clamp 50–100).
3. **Propagation** — `RULE-FIN-01` breach → exactly one open DACI (`budget →decides→ decision`, idempotent, release/request/accept options); `RULE-FIN-02` `funds` edges + neutral goal check-ins (confidence untouched) + reverse `actualsDueOn` stamping inside case-resolve / negotiation-settlement / portfolio-complete transactions; `RULE-FIN-03` actual → fifth calibration ledger with idempotent audit event.
4. **Surfaces** — `FIN-01..05`; `#/finance` + detail (forecast bar, calibrated-forecast banner, lines table, links); budget/line/actual dialogs (actual never pre-filled, live forecast preview); Today card; Decisions fifth-ledger readout; Settings threshold + record counts; `finance` CSV scope #24 + calibration commitment rows (CWE-1236-safe); `clearDemo` scrubbing; `reconstructStateAt` rewind; healthy demo envelope (FAC 37,640 vs 120,000, zero FIN findings). Conflicts/pulses forbidden as funding sources at action, schema and UI level.
5. **Tests** — `tests/app/finance.test.mjs` (12): FAC boundaries, counts-only <n=5 + cross-currency ratio pooling, v24 migration/normalisation, breach→single DACI idempotence, neutral goal telemetry, case-resolve→actuals-due→FIN-03 calibration trace (9,000→10,440, ratio 1.16), release/validation, FIN signals + demo silence, CSV, rewind, JSDOM list/detail + blank-actual dialog + axe. Brittle counters updated across 18 suites (SCHEMA_VERSION 23→24, AUTOMATION_RULES 34→37, CSV_EXPORTS 23→24, `23 → 24` migration-chain entries).

### Verification and known boundaries

- Final `npm run verify:canonical`: **497/497 tests across 39 suites**, 0 ESLint errors, boundary OK (82 app ES modules, 0 quarantined-tree/network leaks), **90/90** internal Markdown links across 108 files. First full run caught 19 migration-chain assertions (expected — appended `'23 → 24'`); complete rerun green.
- Live preview served via `scripts/serve.mjs` (0.0.0.0:5173); new modules return 200. Real-browser graphical rendering, spoken screen-reader output, manager comprehension, invoice/GL reconciliation and field usefulness of the 80%/1.20× guardrails remain **[UNVERIFIED]**. Amounts are leader-entered evidence, not audited finance data.
- Process note: parallel same-file programmatic edits corrupted schema.js/calibration.js/automation.js mid-session (race inside the editing tool); recovered via `git checkout` + single sequential patches with count assertions. No user data affected; recorded here as an agent-process defect, not an app defect.

### Next priorities

1. Real-Chromium desktop/mobile + keyboard/AT review of Finance, Decisions and negotiation-prep readouts.
2. Stakeholder influence register (Mendelow + Tsebelis veto players) as a first-class linkable record, export-governed from day one.
3. Cross-ledger calibration synthesis (five ledgers, same n floors, never a person score).
4. Field-validate budget watch-%/overrun guardrails; keep labelled heuristics until validated.

### Repository synchronization

- Implementation commit `8bd83a3` (`feat(finance): budget envelopes & financial commitments (schema v24)`) pushed successfully to `origin/arena/bf30bdcb-leados` at `https://github.com/shahramclaude/Leados.git`.
- Opened pull request [#38](https://github.com/shahramclaude/Leados/pull/38), base `main`, head `arena/bf30bdcb-leados`. No merge was performed.

## Session 40 — 2026-10-26 — Stakeholder Influence Register (Schema v25, `RULE-STK-01..04`, `STK-01..07`)

### Repository identity and baseline

- Verified `origin` as `https://github.com/shahramclaude/Leados.git` (matches user-designated
  repository); branch `arena/32c54333-leados` based at `ae7b0a8` (merge of PR #38, the
  Session 39 finance work). Baseline after the version-pin sweep: **497/497 tests green**.
- Audit finding: political analysis existed only as lightweight embedded stakeholder stubs
  duplicated inside cases, changes and negotiations — Mendelow quadrants were computed per
  stub but no persistent, portfolio-wide register existed, no Mitchell-Agle-Wood salience,
  no Tsebelis veto analysis, no coalition graph, and adverse political signals propagated
  nowhere. This was Session 39's stated #2 next priority. The quarantined legacy trees were
  not touched (ADR-0007); their status remains **[UNVERIFIED]**.

### Research and product decisions

- Implemented four named frameworks as executable derivation, not prose: Mendelow (1981)
  quadrants/cadence (reusing the canonical classifier, no vocabulary fork), Mitchell-Agle-
  Wood (1997) seven salience classes with threshold ≥4 attribute possession and confidence-
  adjusted score (×1.0/×0.85/×0.7), Tsebelis (1995/2002) veto heuristic (≤25 points per gate
  from stance ordinal ÷4 × power ÷5 ×25; cohesion +5 spread≤1 / +8 unified blocker; bands
  33/66; labelled an operational proxy, never a spatial model), and a union-find coalition
  network with power-weighted bloc centroids, directional edges and hidden-influencer
  detection. MAW twenty-year retrospective evidence on salience flux drove the decision to
  keep salience derived, never stored; Agle/Mitchell/Sonnenfeld (1999, urgency as strongest
  predictor) drove the RULE-STK-04 contact-decay watch.
- 2026 competitive audit (web research, marketing-page evidence — no trials, no independent
  benchmarking): Borealis/Simply Stakeholders/Quicker category leaders cover engagement
  logistics (comms logs, GIS, grievances, sentiment NLP) but stop at power-interest grids or
  closed proprietary scores; none document MAW salience classes, Tsebelis veto bands,
  theory-driven cross-entity governance propagation, local-first redaction or point-in-time
  rewind. Full sources, comparison table and rejected shortcuts: RESEARCH.md §48.
- Rejected shortcuts with reasons (strict matching over fuzzy name links; derived-not-stored
  salience; no NLP sentiment; no auto-conversion of stubs at migration; no meeting
  automation; no force-directed canvas) are tabulated in RESEARCH.md §48.

### Implemented

1. **Pure engine `app/core/domain/stakeholders.js`** (27 exports): salience, Mendelow
   integration via cases.js, Tsebelis initiative/portfolio veto analysis, union-find
   coalition network, strict stub reconciliation, stance-shift classification, per-record
   profile and the single `stakeholdersRollup` attention queue (empty-workspace safe).
2. **Schema v25** — `stakeholders` collection, additive 24→25 migration that invents no
   actors, normalizer repairs (enums, dates, dangling person/alliance links, contactLog and
   stanceHistory hygiene) with explicit warnings, orphan-link checks and the collection list.
3. **Event-driven propagation (`RULE-STK-01..04`, catalogue 37→41)** — idempotent
   `involves` edges; exactly-one DACI alignment decision per adverse-veto open initiative
   with a stable `[RULE-STK-02:type:id]` marker; blameless 1:1 stance-shift topics for
   person-linked high-salience records only; write-free read-side cadence watch. All runs
   inside existing store transactions with audit events and an `autoPropagate=false` escape.
4. **Actions** — `addStakeholder`/`updateStakeholder` (shared validating assembler, coaching
   errors rather than silent coercion), `logStakeholderStance` (append-only, shift
   classification), `logStakeholderContact` (cadence-proposed next date that never
   overwrites a later plan), `archiveStakeholder`, scoped `deleteStakeholder` cascade, and
   a write-free `previewStakeholder` dry run.
5. **Governance surfaces** — insights `STK-01..07`; `stakeholders` CSV scope #25 (32
   formula-safe columns) with contextual-integrity stance/note/veto redaction and scrub
   metadata; export-governance register counts; store redaction and `clearDemo` edge
   trimming; `reconstructStateAt` stakeholder rewind with an explicit approximate-fidelity
   note; 12-record demo at 100% reconciliation coverage that emits zero automation events
   and fires only the read-side STK-01 insight.
6. **UI** — `#/stakeholders` register/matrix/network tabs and `#/stakeholders/:id`
   dossier, three dialogs with live salience/Mendelow/veto readouts, alliance editor and
   propagation preview, Today triage card, nav route/badge/document titles, `stk-*` styles
   using existing design tokens and a screen-reader-only matrix description (no
   role="img" over interactive chips).
7. **Tests** — new `tests/app/stakeholders.test.mjs` (39 tests: framework math incl. band
   edges/cohesion/confidence, bloc graph, strict reconciliation, rollup emptiness,
   normalizer repairs incl. contactLog, additive migration, full CRUD + propagation
   idempotency, cadence semantics, archive/delete cascade, dry-run isolation, validation,
   demo silence, CSV columns/scrubbing, rewind fidelity, clearDemo, JSDOM workflows with
   axe-core 0 violations). Version pins swept across the other 17 touched suites
   (SCHEMA_VERSION 25, 41 rules, 25 CSV scopes, migration chains).

### Verification and known boundaries

- `npm test`: **536/536 across 40 suites, 0 failures** (~218 s). ESLint: 0 errors.
  `check-canonical-boundary`: OK — 85 app ES modules and 40 test suites, 0 quarantined-tree
  or network leaks. `check-docs-links`: 91 internal links across 108 Markdown files resolve.
- JSDOM/axe covers DOM structure and ARIA rules (color-contrast rule disabled per suite
  convention). Real-Chromium graphical rendering, spoken screen-reader output, keyboard
  traversal and field comprehension remain **[UNVERIFIED]** — no browser exists in this
  container. Veto band edges (33/66), confidence factors (0.85/0.7), cohesion penalties
  (+5/+8) and cadence defaults are transparent heuristics, not empirically validated
  constants. All political data is leader-entered; nothing is inferred from text.
- Process note: an earlier `goTo` test helper polled view child-count and resolved on the
  pre-hashchange render; replaced with a hashchange-synchronized wait, removing the
  flakiness. Two test-premise errors were caught and corrected against engine behavior
  (duplicate-name stubs both legitimately match; blocker→skeptical is a favorable shift).

### Repository synchronization

- Implementation commit `acbcc87` (`feat(stakeholders): Stakeholder Influence Register (Schema v25)`,
  46 files, +4,773/-71) pushed successfully to `origin/arena/32c54333-leados` at
  `https://github.com/shahramclaude/Leados.git` — remote confirmed `[new branch]`.
- Opened pull request [#39](https://github.com/shahramclaude/Leados/pull/39), base `main`,
  head `arena/32c54333-leados`; `gh pr view` reports state OPEN and MERGEABLE. No merge performed.

---

## Session 41 — 2026-10-26 — Forecast Integrity Terminal (Schema v26, `RULE-FCI-01..04`, `FI-01..05`)

### Repository identity and baseline

- `git remote get-url origin` → `https://github.com/shahramclaude/Leados.git` (matches the
  user-designated repository; the `.git` suffix is the same remote). Active branch
  `arena/053df11d-leados`, based on `0e9377c` of `main`. New checkout had no `node_modules`;
  `npm install --ignore-scripts` installed dev-only test tooling, no runtime dependency was
  added to the canonical zero-build app.
- Baseline before edits: `npm test` **536/536 across 40 suites**. Schema v25, 41 automation
  rules, 25 CSV scopes, 85 canonical app modules.

### Blunt audit of what was actually there

The canonical app is real and substantial: versioned localStorage store, additive migrations,
append-oriented events, typed cross-module graph, dozens of pure domain engines, a working
router, JSDOM/axe workflow tests and 25 purpose-limited CSV exports. Five separate calibration
ledgers already scored decisions, delivery effort, case exposure/capacity, negotiated value and
budget commitments.

What was shallow or missing: those ledgers were **rear-view mirrors**. None produced a
confidence-labelled range for a new promise, none pooled dimensionless bias across modules
under an honest statistical guardrail, and none automatically challenged an open estimate when
a different module settled a comparable outcome. `automation.js` had accumulated explicit
call sites from many actions — generalized enough for cases, changes and negotiations, but
still per-module glue for any new cross-cutting rule. Competitive tools in 2026 forecast
external events or employees; they do not close the leader's own promise→outcome loop. The
frozen `src/**`, root React and legacy console trees remain quarantined under ADR-0007; their
runtime/security status is **[UNVERIFIED]** and they were not edited or re-audited line by
line this session.

### Gap decision

The safe option was another standalone calibration chart. Rejected. The highest-leverage
increment was a **Forecast Integrity Terminal**: one typed prediction-atom ledger, proper
scoring for probabilities, distribution-free conformal bands for magnitudes, and a
generalized post-commit rule that propagates a settled outcome across modules in the same
atomic transaction. This directly implements the master prompt's cross-module spine and the
roadmap's next priority, using named methods rather than an LLM.

### What was built

- `app/core/domain/forecastIntegrity.js` — adapter registry over decision probability,
  portfolio effort, case exposure/diverted-days/mitigation spend, budget commitments and
  negotiated value; `conformalBand` with k=⌈(n+1)(1−α)⌉ finite-sample quantile; exact
  two-sided sign test; Brier/Murphy summary; interval-coverage diagnostics; class segmentation;
  board brief; `FI-01..05` signals; four-rule catalog; post-commit rule; challenge candidate
  derivation including a low-confidence mixed-quantity global prior.
- `app/core/domain/postCommit.js` + `app/core/store.js` — ADR-0008 generalized post-commit
  rules hook. Rules receive the event, injected clock/id factory, `logEvent` and warnings;
  failures are recorded as `automation.rule_error` events, never silent. `postCommitRules: []`
  disables rules for focused tests.
- Schema v26 — `forecastChallenges` collection with append-only response history, settings
  `forecastAutoPropagate` / `forecastCoveragePct`, additive v25→v26 migration, repair-not-reject
  normalization (dangling source pointers dropped with warnings), graph entity `forecast` and
  relation `forecasts`, `clearDemo` and `reconstructStateAt` parity.
- Actions — `syncForecastIntegrity()` (explicit scan, force-overrides pause),
  `respondForecastChallenge()` (accept/adapt/dismiss, dismissal requires a written reason),
  validated coverage/auto-propagation settings.
- UI — `#/forecasts` five-tab terminal, conformal band visualization, method card with
  visible assumptions, challenge table and response dialog, board brief with copy/download
  fallbacks, Today triage card, nav badge, topbar link, `FI-01..05` insights, 29-column
  formula-safe `forecasts` CSV scope (#26).
- `tests/app/forecast-integrity.test.mjs` — 22 tests covering the statistics, adapters,
  migration/normalizer, rule-error audit, real cross-module propagation, idempotency,
  pause/resume, responses, measurement delegation, signals, CSV, demo/rewind parity and
  JSDOM/axe UI.

### Cross-module propagation trace (executed through the real action API)

Create a person, a USD budget, one open commitment and one open funded portfolio item. Record
five budget actuals at 1.5× the committed amount. The **fifth** `recordBudgetActual` event
fires the post-commit rule inside the same store transaction: one class-specific challenge on
the open budget commitment (`ratio:budget-commitment:USD`), one low-confidence pooled-prior
challenge on the portfolio estimate (`global:mixed-quantity`), two `forecasts` graph edges to
their source records, two open DACI re-baseline decisions with `decides` edges, four
`automation.propagated` audit events and read-side `FI-01/FI-02` signals. Both recorded
forecasts remain byte-identical. A second scan creates zero challenges, decisions or links.
Pausing `forecastAutoPropagate` prevents outcome-driven writes; an explicit scan still works.
Three spent lines with no actual create exactly one blameless measurement-recovery delegation.

### Competitive/ambition benchmark chased

2026 AI forecasting research (AIA Forecaster, ForecastBench difficulty-adjusted Brier,
Metaculus Platt scaling) is closing the gap with human superforecasters on public events.
Decision-intelligence platforms (Aera Decision Cloud's decision memory, Cloverpop Decision
Bank, Quantexa Simulation Lab) remember enterprise decisions. People-analytics vendors
(Lattice, Culture Amp, Betterworks, Workhuman) calibrate ratings or predict attrition. None
of the surveyed materials combines proper scoring of a manager's own forecasts with
distribution-free prediction bands and same-transaction cross-module challenge propagation in
a local-first product. Sources, claims and limits: `RESEARCH.md` §49.

### Verification (measured this session)

- `npm run verify:canonical` passed end-to-end: **558/558 tests across 41 suites**, 0 ESLint
  errors, ADR-0007 boundary OK (**89 app ES modules / 41 suites, 0 leaks**), **97 internal
  Markdown links across 109 files** resolve.
- Focused `node --test tests/app/forecast-integrity.test.mjs`: **22/22 passed**; one initial
  `clearDemo` test premise used an id containing `-demo-` and was corrected, not the engine.
- JSDOM + axe-core: zero violations on all five `#/forecasts` tabs and the challenge response
  dialog; zero console errors in both UI workflows.
- `git diff --check` to be run before commit. Real-Chromium graphical rendering, spoken
  screen-reader output, keyboard traversal, manager comprehension, exchangeability after
  process changes, field validity of n=5 / 1.25× / 0.80× / p≤0.10 / 80% guardrails, and the
  O(records) post-commit scan on 1,000+ atoms remain **[UNVERIFIED]**. No invoice/GL
  reconciliation, employee performance scoring, FX conversion, LLM call or network request
  was added.

### Next priorities

1. Real-Chromium desktop/mobile + spoken-AT validation of the terminal and response dialog;
   test whether first-time managers understand marginal coverage and exchangeability.
2. Conformal drift research: weighted / rolling-origin variants, process-change detection and
   field validation of the guardrails on consented workspaces.
3. Natural-language case intake with confidence-scored auto-classification and human-confirmed
   routing into cases, risks, finance, stakeholders and coaching.
4. Decision-delay scenario simulation ("what happens if I wait two weeks?") with conformal
   bands and an auto-generated board pack.
5. Large-workspace performance measurement of the post-commit scan; legacy dependency/Next
   tree audit remains separately **[UNVERIFIED]**.

### Repository synchronization

- Implementation commit `c3ee891` (`feat(forecasts): cross-ledger forecast integrity terminal (Schema v26)`,
  49 files, +3,608/-79) pushed successfully to
  `origin/arena/053df11d-leados` at `https://github.com/shahramclaude/Leados.git`.
  `git ls-remote origin refs/heads/arena/053df11d-leados` returned
  `c3ee89103526c7608caa04d902d6e03fa78ad140`, matching local `HEAD`.
- Opened pull request [#40](https://github.com/shahramclaude/Leados/pull/40), base `main`,
  head `arena/053df11d-leados`; `gh pr view 40` reports state `OPEN` and tracks the pushed
  branch head. No merge was performed. A documentation follow-up commit `5469b96` was then
  pushed and `git ls-remote` / `gh pr view 40` both confirmed the same head SHA. Only this
  final synchronization-log clarification changed after that check; no code changed.
- Live preview server (`node scripts/serve.mjs --host 0.0.0.0 --port 5173`) returned HTTP 200
  with correct MIME types for `/`, `app/main.js`, `app/core/domain/forecastIntegrity.js`,
  `app/views/forecasts.js`, `app/ui/forecast-modals.js` and `app/core/domain/postCommit.js`.

---

## Session 42 — 2026-10-26 — One independent offline HTML file (`LeadOS-standalone.html`)

### Repository identity and baseline

- `git remote get-url origin` → `https://github.com/shahramclaude/Leados.git` (matches the
  user-designated repository). Active branch `arena/3e9243fc-leados`, based on `2464d6f`
  (merge of PR #40). Baseline full suite **558/558 across 41 suites**.
- The owner asked for an "independence HTML file" that can be copied to any other PC and run
  locally. The existing `index.html` alone could not do this: it loads `./app/main.js`, which
  imports 88 more ES modules and an external stylesheet.

### Blunt audit and gap decision

The canonical app genuinely has no backend, database, framework or runtime npm dependency,
but "zero-build" is not the same as "zero-folder". A `file://` page has an opaque origin;
module scripts are fetched with CORS semantics and local files cannot send allow headers, so
relative `import` statements are blocked. Copying only `index.html` would produce a blank
page, and asking a first-time manager to install Node, run `scripts/serve.mjs`, copy 89 files
or pass Chrome's `--allow-file-access-from-files` flag is a failure of the actual user need.

The safe option was a README note explaining why local files do not work. Rejected. The
highest-leverage increment was a genuine single-file build artifact: bundle the whole module
graph into one classic inline script, inline the CSS, keep modular source as the source of
truth, and make the data-migration boundary explicit.

### What was built

- `LeadOS-standalone.html` — 1.7 MB self-contained offline app with all 89 modules and CSS
  inlined, a classic IIFE script, no external script/link/module/fetch, a
  `connect-src 'none'; object-src 'none'; base-uri 'none'` CSP, build/source fingerprint
  meta tags, a portability banner and a distinct `leados.standalone.v1` storage key.
- `scripts/build-standalone.mjs` — esbuild-based reproducible builder with `--out`, minify
  control, source SHA-256 fingerprint, schema/commit build id, replacement-safety
  (`$&` in minified bundles), hard invariants against residual external assets, dynamic
  imports, `fetch()` and external CSS URLs, and a guard that refuses to overwrite canonical
  `index.html`. `esbuild` is an explicit build-time-only devDependency.
- `app/core/store.js` — honours `window.__LEADOS_STORAGE_KEY__` so a local file cannot
  overwrite a served workspace. `app/main.js` — catches `window.localStorage` access that
  can itself throw on an opaque origin; exposes `isStandalone` / `standaloneBuildId` in the
  render context.
- `app/views/settings.js` — new "Portable offline copy" card: download link in served mode,
  Export/Import JSON migration guidance in standalone mode, and honest caveats about
  `localStorage`, Web Crypto and unencrypted plain JSON exports.
- `scripts/serve.mjs` — exposes only the deliberate standalone artifact outside `app/**`.
- `app/ui/components.js`, `app/ui/dom.js`, `app/styles.css` — fixed a real axe-core
  `heading-order` violation found while booting the standalone empty workspace.
- `tests/app/standalone.test.mjs` — 7 tests; `package.json` scripts `build:standalone` and
  `verify:standalone`; `docs/adr/0009-single-file-offline-distribution.md`; `RESEARCH.md` §50;
  README/ROADMAP/CHANGELOG/index.html updates.

### Cross-module / product verification

- The standalone file boots in JSDOM from `file:///C:/Users/Test/Desktop/LeadOS-standalone.html`
  and from a second arbitrary filename/path. It renders Today, navigates to Settings and
  Forecast Integrity via hash routing, shows the portability banner and data-export guidance,
  makes zero `fetch`/WebSocket attempts, and has zero axe-core violations.
- The build regenerates to any output filename and refuses to overwrite `index.html`.
  `npm run verify:canonical`: **565/565 tests across 42 suites**, 0 ESLint errors, 0
  canonical-boundary leaks (89 app ES modules / 42 suites), 105 internal Markdown links
  across 110 files.
- The served app and the standalone file were both HTTP-smoke-tested after the server
  allowlist change; the live preview server continued to serve `/` and all new assets with
  200 responses.

### Competitive / ambition benchmark

TiddlyWiki has shipped a complete wiki in one portable HTML file for years; 2026 single-file
tooling such as `vite-plugin-singlefile` and offline product builds use the same pattern.
The category's hard limit is not computation but storage: `localStorage` is ~5 MB,
`file://` origins are browser-specific, and reliable save-back to the HTML file needs extra
savers. LeadOS adopts the single-file app pattern without pretending records are embedded:
explicit Export JSON / Import JSON remains the data-migration contract. Sources and rejected
shortcuts are in `RESEARCH.md` §50.

### Boundaries / [UNVERIFIED]

JSDOM proves boot, structure and no-network behaviour. Real Chrome/Edge/Firefox/Safari
`file://` `localStorage` policies, Web Crypto availability, Blob downloads, printing,
spoken screen-reader output, cross-OS copy and manager comprehension of the export step
remain **[UNVERIFIED]**. The standalone HTML is a build artifact and must be regenerated
after canonical source changes. No claim is made that plain JSON exports are encrypted or
that a local file is a backup.

### Repository synchronization

- Implementation commit `8ec8902` (`feat(standalone): one self-contained offline HTML app`,
  20 files, +2,830/-19) pushed successfully to
  `origin/arena/3e9243fc-leados` at `https://github.com/shahramclaude/Leados.git`.
  `git ls-remote origin refs/heads/arena/3e9243fc-leados` returned
  `8ec8902b35b6858b642f45cc44e121f17bd1c4da`, matching local `HEAD`.
- Opened pull request [#41](https://github.com/shahramclaude/Leados/pull/41)
  (`feat(standalone): ship one self-contained offline HTML app`), base `main`, head
  `arena/3e9243fc-leados`. `gh pr view 41` reports state `OPEN`, `mergeable: MERGEABLE`,
  and both pushed commits (`8ec8902`, `a07ef6d`). No merge was performed. This
  synchronization-log update is a documentation-only follow-up commit; no application code
  changed after the PR was opened.
- The standalone artifact is committed at `LeadOS-standalone.html`. The live preview server was
  restarted after the static-server allowlist change so the artifact is downloadable from
  `/LeadOS-standalone.html`.
- Final verification before the push: `npm run verify:canonical` → **565/565 tests across 42
  suites**, 0 ESLint errors, 0 canonical-boundary leaks (89 app modules / 42 suites), 105
  internal Markdown links across 110 files; `npm run verify:standalone` → **7/7**.

---

## Session 43 — 2026-10-26 — Natural-Language Intake Terminal (Schema v27)

### Scope

Executed the reusable master prompt: remote verified as
`https://github.com/shahramclaude/Leados.git` before any changes; baseline audited at
565/565 tests across 42 suites on `main` snapshot `0de9fef` without rebuilding; a 2026
competitive hunt across six intelligent-triage / HR-NLP / calibration sources (recorded in
RESEARCH.md §51) informed the design; then shipped a substantial multi-module feature — an
on-device natural-language intake terminal with cross-module event-driven propagation, a
conflict privacy wall and a human-agreement calibration ledger.

### What was built

- `app/core/domain/intake.js` — deterministic triage engine: 14 weighted-evidence
  categories, stemming, phrase matching, NegEx negation windowing, softmax (T=2.2) with
  uniform-prior shrinkage (0.08), completeness/ambiguity/stakes checks, entity extraction
  (people with ambiguity handling, money incl. Danish `kr.`/thousands-dot conventions,
  durations, person-days, percentages, recurrence, severity), evidence spans with offsets,
  engine version `intake-2026.10-v1`, calibration aggregation counts-only below n=5.
- `app/core/schema.js` — Schema v27: additive `intakeDrafts` collection (v26→v27) with
  `normalizeIntakeDrafts` (blank-text drops, enum/status/coercion repairs), key migration,
  clearDemo and rewind parity; no historical record converted into a draft.
- `app/actions.js` — `analyzeIntake`, `saveIntakeDraft`, `reanalyzeIntakeDraft`,
  `confirmIntakeDraft` (human-confirmed routing through the unchanged `addCase`
  propagation engine), `markIntakeDraftRouted`, dismiss/delete; `diffCaseSuggestion`
  computes exact edited-field telemetry against the engine's suggested case input.
- `app/views/intake.js` + router/sidebar wiring — `#/intake` composer, evidence-explained
  analysis, live propagation preview, drafts queue, calibration card; JSDOM/axe clean.
- `app/core/domain/insights.js` — RULE-INTAKE-06 stale-draft signal; TODAY_CAPABILITIES
  and rules tables updated; conflicts/pulses remain unreadable by the engine.
- `app/core/domain/health.js` — rewind support for `intakeDraft.*` events.
- `app/core/csv.js` — `intakeCalibration` analytics scope (#27): 13 columns, zero
  free-text/PII, appears automatically in Settings CSV exports.
- `app/core/demo.js` — three engine-generated demo drafts covering the
  analyzed/confirmed/dismissed lifecycle, linked to a real demo case.
- `docs/adr/0010-on-device-nl-intake-triage.md`, RESEARCH.md §51, ROADMAP, README,
  CHANGELOG, index.html build meta; `LeadOS-standalone.html` rebuilt at 91 modules/v27.

### Bugs found through the new tests (real product defects, not test fixtures)

1. `splitSentences` fragmented decimal/abbreviation dots — `DKK 250.000,50` split into
   three fragments so the money extractor only saw `DKK 250`. Fixed with a
   single-character placeholder (`\uE000`, equal length keeps offsets byte-accurate)
   protecting abbreviation dots (`kr.`, `approx.`, …) and `\d\.\d` decimal dots.
2. `diffCaseSuggestion` only diffed override presence, so `kind` edits never appeared in
   calibration `editedFields`. Rewritten to diff the final effective case input against
   the engine suggestion directly.

### Verification

- **600/600 canonical tests across 43 suites, 0 failures** (35 new intake tests including
  migration, privacy wall, calibration ledger, CSV data-minimization, axe-clean UI; four
  existing CSV-suite count pins updated 26→27 scopes).
- ESLint: 0 errors/warnings; canonical boundary: 91 app modules / 43 suites / 0 leaks;
  docs-link check: 109 links across 111 Markdown files, all resolve.
- `npm run build:standalone` → 1,770,774 bytes, 91 modules, schema v27, sha256
  `fd0d8bbbb56fb459` (the `verify:standalone` gate rebuilt once more after the Session 43
  `index.html` meta edit, so the committed artifact carries this later fingerprint).
  Live static server smoke-tested: `/`, `app/main.js`,
  `app/core/domain/intake.js`, `app/views/intake.js` and the standalone artifact all
  return HTTP 200 with correct MIME types.
- [UNVERIFIED]: real-browser rendering, screen-reader output, non-English vocabulary and
  empirical confidence-band calibration until workspaces accumulate n≥5 confirmations.

### Repository synchronization

- Origin verified as `https://github.com/shahramclaude/Leados.git` (fetch and push) before
  any commit; all work stayed on branch `arena/598e35bf-leados`.
- Implementation commit `c304141` (`feat(intake): on-device natural-language intake triage
  terminal (Schema v27)`, 48 files, +3,705/-84) pushed successfully.
  `git ls-remote origin refs/heads/arena/598e35bf-leados` returned
  `c30414114e88e64e7e7dd22f6cf73e4b8926b6ec`, matching local `HEAD` exactly.
- Opened pull request [#42](https://github.com/shahramclaude/Leados/pull/42)
  (`feat(intake): on-device natural-language intake triage terminal (Schema v27)`), base
  `main`, head `arena/598e35bf-leados`. `gh pr view 42` reports state `OPEN`,
  `mergeable: MERGEABLE`, single commit `c304141`. No merge was performed. This
  synchronization-log update is a documentation-only follow-up commit; no application code
  changed after the PR was opened.
## Session 44 — 2026-10-26 — Decision Tempo & Timing Terminal (Schema v28)

### Scope

Executed the reusable master prompt: remote verified as
`https://github.com/shahramclaude/Leados.git` before any change; baseline re-run at
600/600 tests across 43 suites; a 2026 competitive hunt across twelve sources on decision
latency, the decision-intelligence market and decision-logging tools (recorded in
RESEARCH.md §52); then shipped the roadmap's twice-named next priority — decision-delay
economics — as a full terminal with a measured latency ledger rather than a slider.

### What was built

- `app/core/domain/decisionTempo.js` — pure engine: Reinertsen delay profiles with a
  value-at-stake cap and derived weekly rate; closed-form preposterior EVSI
  (`E[max(0, posterior mean)] − max(0, prior mean)`, spread `√(s₀² − s_t²)`), switch
  probability, information horizon, CD3 ranking; McKinsey decision taxonomy with
  per-class guardrails; `decisionValueTerms` over typed links (case PERT exposure,
  budget commitments, portfolio value, negotiated stakes) with per-currency totals and
  no cross-currency summation; `decidedOn`-based latency samples with split-conformal
  bands (counts-only below n=5, coverage bound reported); `decisionTempoRule` with
  RULE-DLY-01..05; `decisionTempoSignals` DLY-01..06; deterministic `tempoBrief`; and a
  week/state-keyed report memo so the nav badge, Today card and terminal share one report.
- `app/core/schema.js` — Schema v28: `SCHEMA_VERSION = 28`, seven `tempo*` settings,
  `tempoSchedules` collection, `decidedOn` on decisions with `normalizeDecidedOn`,
  `normalizeTempoSchedules` (enum/date/number repairs, orphan drop, one-live-timebox-per-
  decision demotion), `tempo` in the link entity sets, additive `MIGRATIONS[27]`.
- `app/actions.js` — `armTempoSchedule`, `updateTempoSchedule`, `abandonTempoSchedule`,
  `deleteTempoSchedule`, `scanDecisionTempo`, `tempoReport`, `tempoScheduleDraft`;
  `decidedOn` stamped in `addDecision`/`decideDecision`; `daysBetween` import.
- `app/views/tempo.js` + `app/ui/tempo-modals.js` + router/nav/Today wiring — `#/tempo`
  five tabs (queue, timing lab, ledger, calibration, board pack), arm dialog with a live
  engine preview, blameless abandon dialog; JSDOM/axe clean.
- `app/views/decisions.js` — tempo line (class, CD3, value at stake, carrying cost,
  decide-by or debt days, waiting verdict) plus a "Time it" button and a Timing-debt stat.
- `app/core/domain/insights.js`, `app/core/domain/health.js`, `app/core/csv.js`,
  `app/core/demo.js`, `app/views/settings.js`, `app/styles.css` — signals and domain
  ordering, rewind parity, CSV scope #28, demo timeboxes and measured latencies, settings
  thresholds, `.tempo-*` and `.decision-tempo-line` styling.
- `docs/adr/0011-decision-tempo-terminal.md`, RESEARCH §52, ROADMAP, README, FEATURES,
  CHANGELOG, `index.html` build meta; `LeadOS-standalone.html` rebuilt.

### Bugs found through the new tests (real product defects, not test fixtures)

1. **The first EVSI formula was wrong-signed.** Computing EVSI as
   `E[max(0, X_t)] − max(0, E[X])` on the *posterior standard deviation* makes information
   value fall as ambiguity resolves, and it can exceed EVPI. A monotonicity test caught it;
   it was replaced with the correct preposterior form over the posterior *mean* spread,
   which is 0 at t = 0, non-decreasing, and bounded by EVPI by construction. Every verdict
   in the terminal changed as a result.
2. **The report rows were written against a nested shape that did not exist.** Three stale
   `row.decision.decision*` references in `app/views/tempo.js` and two in
   `app/core/csv.js` crashed the whole screen and the CSV export; the row contract is flat
   (`{decision, valuation, timing, schedule, cd3, debtDays}`) and is now asserted.
3. **`armTempoSchedule` could create a second live timebox and drop the derived value.**
   Arming now converts an existing proposal in place and re-derives `derivedAmount` from
   linked records; a normaliser invariant demotes any duplicates that arrive by import.
4. **Decision debt was only visible when a timebox was armed.** A decision older than its
   own class guardrail is late whether or not the leader ever modelled it; the fallback
   decide-by date is now `decision.date + class guardrail`.
5. **Overview table rows were passed to `table()` wrapped**, so every cell renderer read
   `undefined`; the queue now passes the report rows and the value-at-stake cell reads the
   row directly.
6. **The arm dialog said "Save timebox" for a proposal** — a proposal is not a commitment;
   the verb now follows the record's state ("Arm timebox" vs "Save timebox").

### Verification

- **629/629 canonical tests across 44 suites, 0 failures** (29 new tempo tests covering
  preposterior math, taxonomy, derived value, verdicts, action guards, five rules,
  migration, normalisation, rewind, CSV minimisation, signals, and a JSDOM/axe UI
  workflow; four existing CSV-suite count pins updated 27→28 scopes and the standalone
  module-count assertion made version-agnostic).
- ESLint: 0 errors; canonical boundary: 94 app modules / 44 suites / 0 leaks; docs-link
  check: all internal Markdown links resolve.
- `npm run build:standalone` → 1,871,755 bytes, 94 source modules, schema v28, source
  `5e2ad27`, minify on, sha256 `b4d6f0ba78d893b4`.
- [UNVERIFIED]: real-browser rendering and screen-reader output, the normal/normal
  preposterior on skewed payoffs, multi-option decisions, and empirical calibration of the
  timing verdicts (no workspace has enough settled decisions yet).

### Sync report (Session 44)

- Commit: `f2a0be6` — "Session 44: Decision Tempo & Timing Terminal (Schema v28)"
  (50 files changed, +1,533 / −124 plus the five new files). Any later commits on the branch
  are documentation-only follow-ups to this log.
- Push: `git push origin arena/fd850110-leados` → `* [new branch]`. Verified with
  `git ls-remote origin refs/heads/arena/fd850110-leados` returning a SHA identical to local
  `git rev-parse HEAD` after every push (last checked at the end of the session); working tree
  clean. Pull request not opened in this session; GitHub returns the compare
  link `https://github.com/shahramclaude/Leados/pull/new/arena/fd850110-leados`.
- Pages served: `/`, `/app/views/tempo.js`, `/app/core/domain/decisionTempo.js` all
  HTTP 200 from the zero-dependency server on `0.0.0.0:5173`.

## Session 45 — 2026-10-27 — Operational Resilience, Dependency & Continuity Terminal (Schema v29, `RULE-RES-01..06`, `RES-01..07`)

### Repository identity & blunt baseline audit

- Verified `origin` = `https://github.com/shahramclaude/Leados.git` on active branch `arena/7e13870e-leados` at HEAD `2d57000` (`main`); baseline `npm run verify:canonical` (**629/629** across 44 suites) and `npm run verify:standalone` (**7/7**) passed cleanly before edits. Quarantined `src/**` / root `.tsx` files remain untouched per ADR-0007 (`[UNVERIFIED]`).
- **Blunt current-state gap:** LeadOS lacked structural operational-continuity intelligence — it had no multi-tier dependency DAG, no Simchi-Levi `TTS`/`TTR`/`REI` survival shortfall math, no Avelino Bus Factor or human-verification firewall, no supplier `HHI` or Williamson hold-up leverage analysis, no EU DORA Art. 26/29 Nth-party choke-point visibility or continuity-drill calibration, and no zero-write disruption stress lab.
- **9 concrete cross-module defects uncovered during baseline audit and fixed in Session 45:**
  1. `app/main.js` `documentTitle` omitted `intake` (Session 43) and `tempo` (Session 44), falling back to generic `LeadOS` — fixed for `intake`, `tempo`, `resilience`, and `resilience-detail`.
  2. `app/core/store.js` `clearDemo()` omitted `tempo` from its `keep` map on `draft.links`, silently deleting user-created timebox graph edges when clearing demo data — fixed (`tempo` and `dependency` preserved).
  3. `app/core/store.js` `clearDemo()` left orphaned `tempoSchedules` when demo `decisions` were removed — fixed.
  4. `app/core/store.js` `clearDemo()` left dangling `confirmedCaseId` pointers on user `intakeDrafts` pointing to cleared demo cases — fixed.
  5. `app/views/settings.js` omitted `tempoSchedules` (and `dependencies`) from storage footprint counts and `entityCountLabel` — fixed.
  6. `README.md` carried stale Session 42 counts (`89` modules, `565` tests, `1.7 MB` bundle) — updated to verified Session 45 counts (`97` modules, `636` tests across `45` suites, `2.0 MB` bundle).
  7. `app/core/domain/automation.js` omitted Session 44's `TEMPO_RULES` from `AUTOMATION_RULES` — unified with both `TEMPO_RULES` and `RESILIENCE_RULES` (`57` rules total).
  8. `app/core/domain/intake.js` defined a duplicate `onboarding: 3` object key that overwrote itself — fixed and extended with `resilience` routing cues.
  9. `app/core/schema.js` `normalizeSettings()` omitted all seven Session 44 `tempo*` settings, silently resetting `tempoAutoPropagate: false` and custom guardrails back to defaults on every reload/import — fixed alongside new `resilience*` settings.

### Shipped in Session 45

- **Pure domain & post-commit engine (`app/core/domain/resilience.js`):** Simchi-Levi `TTS`/`TTR`/`REI` survival shortfalls, multi-tier Nth-party choke-point detection (EU DORA Art. 29), Avelino minimal hitting-set Bus Factor with an unverified-backup epistemic firewall, per-currency `HHI`, Williamson supplier hold-up scoring, redundancy payback ROI, split-conformal drill TTR calibration (`n >= 5`), zero-write `simulateDisruptionScenario` cross-checked against `buildCapacityModel`, `RES-01..07` signals, deterministic `buildResilienceBrief`, and `RULE-RES-01..06`.
- **Atomic multi-stage cross-module propagation (`app/core/domain/{postCommit,decisionTempo,cases}.js`):** `resilienceRule` runs before `decisionTempoRule`, and `decisionTempo.js` prices `dependency-shortfall` terms across `decides -> dependency` links so a critical survival shortfall (`RULE-RES-03`) opens a DACI continuity decision **and** `RULE-DLY-03` atomically prices and proposes its Cost-of-Delay / EVSI timebox in the same store write.
- **Schema v29, store, demo, CSV #29 & cross-domain spine:** `app/core/schema.js` (`SCHEMA_VERSION = 29`, `dependencies`, `MIGRATIONS[28]`), `app/core/{store,demo,csv}.js` (5 interconnected 3-tier demo dependencies, CSV scope #29 `resilience` with CWE-1236 formula neutralization), `app/core/domain/{health,insights,prep,people,intake,automation}.js`, and 12 validated actions in `app/actions.js` (with DAG cycle rejection).
- **UI, CSS, entry HTML & standalone bundle:** `app/views/resilience.js` (5-tab `#/resilience` terminal + `#/resilience/:id` dossier with zero-URL hand-crafted SVG matrix & cascade DAG), `app/ui/resilience-modals.js` (4 dialogs), `app/views/{today,prep,person,settings}.js`, `app/ui/modals.js`, `app/styles.css`, `index.html`, and rebuilt `LeadOS-standalone.html`.
- **Tests & living docs:** `tests/app/resilience.test.mjs`, expanded `tests/app/access-audit.test.mjs`, `docs/adr/0012-operational-resilience-continuity-terminal.md`, `ROADMAP.md`, `RESEARCH.md` (§53), and `README.md`.

### Bugs caught and fixed during Session 45 self-testing

1. **`simulateDisruptionScenario` capacity lookup shape mismatch:** `buildCapacityModel().perPerson` exposes `row.personId` and `row.utilisation` (`0..1+` ratio), whereas initial code read `row.person.id` and `row.utilisationPct`. Caught immediately by `access-audit.test.mjs` on `#/resilience?tab=stress` and fixed.
2. **`evaluateDrillCalibration` conformal argument shape:** `conformalBand` from `forecastIntegrity.js` expects `{ ratio }[]` objects and `{ coverage: 0.8 }`, whereas initial code passed raw `number[]` ratios. Caught by `resilience.test.mjs` at $n = 5$ paired drills and fixed.

### Verification & Git / PR sync

- **Canonical verification (`npm run verify:canonical`):** ESLint `0` errors/warnings; `check:boundary` OK (`97` app ES modules, `45` test suites, `0` leaks); `check:docs` OK; **636/636 automated tests passing across 45 suites (`0` failures)**.
- **Standalone verification (`npm run verify:standalone`):** `LeadOS-standalone.html` rebuilt (`97` source modules, Schema v29, `0` external URLs/fetches) and **7/7 standalone tests passing**.
- **`[UNVERIFIED]`:** Real graphical browser rendering of the new SVG charts, spoken screen-reader output (NVDA/JAWS/VoiceOver), correlated multi-vendor probabilistic copulas beyond deterministic scenario shocks, and field testing with live teams.
- **Git & Pull Request sync:** Committed `a7baebe` on active branch `arena/7e13870e-leados`, pushed to `origin` (`https://github.com/shahramclaude/Leados.git`), and opened Pull Request [#45](https://github.com/shahramclaude/Leados/pull/45) (`arena/7e13870e-leados` → `main`).



## Session 46 — 2026-10-27 — Coalition & Incentive War Room (Schema v30, `RULE-PWR-01..06`, `PWR-01..06`, CSV #30)

### Repository identity & blunt baseline audit

- Verified `origin` = `https://github.com/shahramclaude/Leados.git` (fetch + push) before any
  change; active branch `main` at HEAD `da0df5c` (Session 45). Quarantined `src/**` and root
  `.tsx` trees remain untouched per ADR-0007 (`[UNVERIFIED]`).
- **Environment note (honest):** the sandbox shipped Node 20.20.2, but the canonical tooling
  targets Node ≥22 (`node --test` glob expansion, `node:fs.globSync`) and Node ≥22.15
  (`zlib.createZstdDecompress` used by `undici`). I downloaded Node 24.22.1 to `/tmp` and ran
  every verification with it. Baseline re-run clean: `npm run verify:canonical` **636/636** across
  44→45 suites, `npm run verify:standalone` **7/7**. This is a tooling workaround, not a repo
  defect.
- **Blunt current-state gap:** LeadOS had stakeholder registers, negotiations, decisions and a
  rich event-driven spine, but **no computational political economy** — no exact Banzhaf/
  Shapley-Shubik voting-power indices, no minimum winning coalitions or Tsebelis veto players,
  no 2×2 Nash equilibria or price of anarchy, no mechanism-design incentive-alignment transfer,
  no robustness-scored recommendations, and no influence script grounded in the analysis. The
  2026 competitive hunt (RESEARCH §54) confirmed no leadership/OKR/coaching tool combines these.

### Shipped in Session 46

- **Pure engine (`app/core/domain/power.js`, ~950 lines):** exact Banzhaf (2ⁿ) & Shapley-Shubik
  (n!) power indices, minimum winning coalitions, veto/dictator/dummy detection, stance-aware
  coalition feasibility, Banzhaf-HHI; 2×2 pure/mixed Nash, dominant strategies, Pareto frontier,
  price of anarchy / coordination loss; mechanism-design minimal incentive-alignment transfer
  with a feasibility bound; equilibrium-robustness confidence scoring; deterministic SBI/DESC
  influence script and board brief; `analyzePowerGame`, `buildPowerReport`, `powerSignals`,
  `POWER_RULES`, `powerRule`.
- **Atomic cross-module propagation:** `powerRule` (registered in `DEFAULT_POST_COMMIT_RULES`
  before `decisionTempoRule`; `decisionTempoRule` now also triggers on `power.*`) fans one
  registered/reanalysed game into typed graph links, a derived verdict snapshot, **one** DACI
  coalition-strategy decision, **one** blameless alignment delegation, **one** 1:1 estimate-
  verification talking point and audit events — idempotently, with a `powerAutoPropagate` pause +
  explicit force reanalysis.
- **Schema v30 & spine:** `powerGames` collection, `power` graph entity type, `MIGRATIONS[29]`,
  `normalizePowerGames` repairs, four `power*` settings, `entityIdSetsForLinks` + `clearDemo`
  parity, `reconstructStateAt` rewind, 9 API actions, CSV scope #30 (counts only, no titles/
  names), `PWR-01..06` signals, `Coalition & power` domain, Today card, nav badge, Settings
  posture row, 12 pinned test-version/count updates.
- **UI, CSS & distribution:** `app/views/power.js` (5-tab `#/power` terminal + `#/power/:id`
  dossier, two hand-crafted SVG charts, inline add/edit & settle dialogs, board-pack download),
  `app/styles.css`, `index.html` build meta, `LeadOS-standalone.html` rebuilt (2,110,281 bytes,
  99 modules, schema v30).
- **Docs & tests:** `tests/app/power.test.mjs` (30 tests), `docs/adr/0013-*.md`, RESEARCH §54,
  ROADMAP, README, CHANGELOG, `access-audit.test.mjs` route coverage.

### Bugs found and fixed during self-testing (real product defects, not fixtures)

1. **Broad propagation trigger → alert fatigue / regression.** An early `powerRule` reacted to
   `decision.*`/`delegation.*`/`case.*`/`stakeholder.*` events; because a game's math is fully
   inline, those writes changed nothing but re-added 1:1 talking points during unrelated flows
   (broke `decision-growth-prep.test.mjs`: Jordan's talking points 2→5). Narrowed the trigger to
   `power.*`/`person.archived/restored`/declared/force and scoped the entity-creating rules to
   the acting game via an `entityScope`.
2. **axe `empty-table-header` on `#/power`.** The Overview action column had an empty `<th>`;
   labelled it "Action" (also fixed the table-caption a11y test).
3. **Robustness test fixture had no real indifference.** Replaced with a game that puts the
   equilibrium exactly on a best-response boundary.
4. **Schema-bump maintenance.** Bumped `SCHEMA_VERSION` 29→30, appended `'29 → 30'` to 22
   migration-chain pins, 2 `.at(-1)` pins, ~36 version pins, `CSV_EXPORTS.length` 29→30 (×5),
   `AUTOMATION_RULES.length` 57→63 (×4), and made the standalone module-count assertion
   version-agnostic (`9[0-9]` → `[0-9]+`) so 99 modules no longer breaks it.

### Verification

- **Canonical (`npm run verify:canonical`, Node 24.22.1):** ESLint 0 errors; `check:boundary` OK
  (99 app ES modules, 46 test suites, 0 leaks); docs-link check OK; **666/666 automated tests
  across 46 suites, 0 failures** (30 new power tests).
- **Standalone (`npm run verify:standalone`):** rebuilt 2,110,281 bytes / 99 modules / schema
  v30 / 0 external resources, **7/7 tests**.
- **Self-traced cross-module example (tested, not prose):** `addPowerGame` for a blocked +
  misaligned + no-pure-NE situation produced exactly one `[RULE-PWR-02:…]` DACI decision (visible
  to `buildTempoReport`), one `[RULE-PWR-03:…]` blameless delegation + matching owner 1:1 talking
  point, ≥5 typed graph links (power→stakeholder/case/decision/delegation, person→power), a
  derived verdict snapshot and `automation.propagated` audit events — idempotent across repeated
  reanalysis, silent when paused, runnable-by-force when paused.
- **[UNVERIFIED]:** real graphical-browser rendering of the SVG charts, spoken screen-reader
  output (NVDA/JAWS/VoiceOver), general-sum N-player / multi-option EVSI solving, correlated
  equilibria, and empirical calibration of verdicts against realised outcomes (needs n≥5 settled
  games). All payoffs/weights are labelled as the leader's estimates; robustness/confidence bands
  are management conventions, not statistical guarantees.

### Repository synchronization — **FAILED (push blocked); nothing is lost**

**Actual result, reported honestly:** the implementation was committed locally on branch
`arena/c1813791-leados` (one local commit, 56 files, +3814/−110; this documentation-only
sync-failure note is amended into that same commit), but
**`git push -u origin arena/c1813791-leados` FAILED** with
`fatal: could not read Username for 'https://github.com': terminal prompts disabled`. This
sandbox has **no GitHub credentials, no credential helper, no `GITHUB_TOKEN`/`gh` CLI, no SSH
key, and no GitHub connector** (connector lookup returns `unsupported`). The remote identity is
still correct (`https://github.com/shahramclaude/Leados.git`); the failure is authentication,
not a mismatch. **No push and no PR were performed — this is [UNVERIFIED] as an upstream sync.**
Do not assume the branch exists on the remote.

**Nothing is silently lost.** All work is in the local commit on `arena/c1813791-leados` in this
workspace's `.git`, and a portable bundle `exports/LeadOS-session46.bundle` was written that can
be fetched/pushed from any machine that has credentials. To complete the sync (run from a clone
with push access):

```sh
git fetch /home/user/Leados/exports/LeadOS-session46.bundle arena/c1813791-leados
git push https://github.com/shahramclaude/Leados.git FETCH_HEAD:refs/heads/arena/c1813791-leados
# then open a PR arena/c1813791-leados -> main, or:
# https://github.com/shahramclaude/Leados/pull/new/arena/c1813791-leados
```

Changed files (56) in the local commit, so nothing is lost if sync is retried later:
`AI-SESSION-LOG.md`, `CHANGELOG.md`, `LeadOS-standalone.html`, `README.md`, `RESEARCH.md`,
`ROADMAP.md`, `app/actions.js`, `app/core/csv.js`, `app/core/demo.js`,
`app/core/domain/automation.js`, `app/core/domain/cases.js`, `app/core/domain/decisionTempo.js`,
`app/core/domain/health.js`, `app/core/domain/insights.js`, `app/core/domain/postCommit.js`,
`app/core/domain/power.js` *(new)*, `app/core/schema.js`, `app/core/store.js`, `app/main.js`,
`app/styles.css`, `app/views/power.js` *(new)*, `app/views/settings.js`, `app/views/today.js`,
`docs/adr/0013-coalition-incentive-war-room.md` *(new)*, `index.html`,
`tests/app/access-audit.test.mjs`, `tests/app/calibration.test.mjs`,
`tests/app/capacity-flow.test.mjs`, `tests/app/case-calibration.test.mjs`,
`tests/app/cases-automation.test.mjs`, `tests/app/changes-spc.test.mjs`,
`tests/app/core.test.mjs`, `tests/app/csv.test.mjs`, `tests/app/decision-growth-prep.test.mjs`,
`tests/app/decision-tempo.test.mjs`, `tests/app/execution-loops.test.mjs`,
`tests/app/finance.test.mjs`, `tests/app/followthrough.test.mjs`,
`tests/app/forecast-integrity.test.mjs`, `tests/app/growth-ledger.test.mjs`,
`tests/app/hiring.test.mjs`, `tests/app/intake.test.mjs`, `tests/app/negotiation.test.mjs`,
`tests/app/ownership.test.mjs`, `tests/app/power.test.mjs` *(new)*, `tests/app/prep.test.mjs`,
`tests/app/reconcile.test.mjs`, `tests/app/resilience.test.mjs`, `tests/app/retention.test.mjs`,
`tests/app/reviews.test.mjs`, `tests/app/scale.test.mjs`,
`tests/app/simulation-montecarlo.test.mjs`, `tests/app/stakeholders.test.mjs`,
`tests/app/standalone.test.mjs`, `tests/app/transitions.test.mjs`, `tests/app/trends.test.mjs`.


### Session 46 — remote sync completed (2026-10-27 10:26 UTC)

**Verified outcome:** branch `arena/c1813791-leados` was pushed to
`https://github.com/shahramclaude/Leados.git` and `git ls-remote` returned
`556341932bf8f19d7d76d33d53d9001dd5e64dc0`, matching local `HEAD`. Pull request [#46](https://github.com/shahramclaude/Leados/pull/46) is open against `main`.
The earlier `FAILED (push blocked)` entry above remains as accurate append-only history of the
initial unauthenticated attempts; it is superseded by this confirmed sync. Authentication was
performed by the repo owner via GitHub OAuth device flow (GitHub CLI public OAuth app, `repo`
scope). No merge was performed.

## Session 47 — 2026-10-27 — Robust Strategy Lab

**Identity:** origin verified as `https://github.com/shahramclaude/Leados.git` before
inspection; clean branch `arena/da198230-leados`, starting commit `a0d2b7a`.
**Audit scope:** targeted canonical audit only. All 3,782 tracked files personally
read [UNVERIFIED / not completed]; legacy builds not verified. See
`docs/AUDIT-2026-10-27-session-47.md`. Incremental evolution, no rebuild or new runtime dependency.

**Shipped:** exact independent payoff-box Nash guarantees; fixed-transfer interval
and feasibility break point; Savage pure-strategy minimax regret / Wald maximin;
fixed-electorate opposition shocks; sixth War Room tab with editable uncertainty;
stress-aware influence scripts and board briefs; derived verdict, PWR-07 insights;
extended RULE-PWR-02/04 decision + typed-link + blameless owner-coaching fan-out.
No probability inferred from confidence; no money, ratings or external actions.
Optional stressRadius is an additive schema-v30 field; missing → null, invalid
imports disable testing with a warning. Existing app versions can discard this
new optional field. Fixed omitted-string crashes in power-game API assembly.

**Concrete propagation:** nominal target [8,4], rival deviation [-2,6], leader
deviation [2,1], fourth cell [0,0], uncertainty ±2: required transfer >=6 but
leader capacity <=2. Saving creates exactly one RULE-PWR-02 DACI strategy decision,
typed link and RULE-PWR-04 owner verification prompt; PWR-07 surfaces the risk.
Repeated reanalysis creates no duplicate decision. Existing post-commit dependency
ordering remains sequential within one transaction; fan-out is not CPU parallelism.

**Research:** RESEARCH §55 adds Cloverpop/DMDU comparison, refreshed Valence,
Lattice/Peakon/BetterUp/Workday inventory and source limitations. No claim of market
uniqueness. New roadmap: correlated uncertainty + mixed-policy optimisation,
evidence-driven adaptive signposts, explicit transferable-utility safeguards.

**Verification:** canonical gate completed with **672/672 tests** passing; lint,
100-module/47-suite boundary check and internal documentation links passed.
After final small edits and the added UI edit/clear test, **44/44 targeted tests**
passed (power, powerStress, standalone), and lint/boundary/links passed again.
Independent corner oracle covers 40,960 cases; six-tab JSDOM/axe, persistence,
validation, pause, idempotency and actual edit/clear UI interaction verified.
Standalone rebuilt (100 source modules; 2,119,732 bytes). Graphical rendering,
contrast, screen-reader speech, Firefox/Safari and legacy build [UNVERIFIED].

**Sync:** implementation commit/push pending at this log entry; actual result will
be appended immediately after the operation. Changed files: README.md, ROADMAP.md,
RESEARCH.md, AI-SESSION-LOG.md, index.html, LeadOS-standalone.html, app/actions.js,
app/core/schema.js, app/core/domain/power.js, app/core/domain/powerStress.js,
app/views/power.js, tests/app/power.test.mjs, tests/app/powerStress.test.mjs,
docs/AUDIT-2026-10-27-session-47.md.

**Confirmed sync result:** implementation commit `148af62` successfully pushed to
`origin/arena/da198230-leados` at `https://github.com/shahramclaude/Leados.git`;
Git reported `[new branch] arena/da198230-leados -> arena/da198230-leados`, exit 0.
This follow-up log commit records the observed result, not an assumed deployment.
No PR opened or merged; main is unchanged.

## Session 48 — 2026-10-27 — Influence Network Intelligence (surveillance-free ONA)

**Identity:** origin verified as `https://github.com/shahramclaude/Leados.git` before
inspection; clean branch `arena/b2cc0d19-leados`, starting commit `6479b1a`
(`Merge pull request #47`). `git ls-remote` for this branch returned no match at
session start — it did not exist on the remote (must be created with `git push -u`).
**Audit scope:** targeted canonical audit; 3,785 tracked files, entire-repository
personal read [UNVERIFIED / not completed], legacy Next/TypeScript trees not
exhaustively verified. See `docs/AUDIT-2026-10-27-session-48.md`. Incremental
evolution, no rebuild, no new runtime dependency, no backend. `npm install` was
needed only because the gitignored `node_modules/` was absent from the snapshot
(438 packages; baseline gate clean at 673/673).

**Fresh competitive hunt (RESEARCH §56):** 2026 people-analytics / decision-
intelligence sources first used this session — SAS Intelligent Decisioning
(IDC MarketScape 2026-09-01, hybrid deterministic rules + predictive/prescriptive
+ GenAI in one governed flow with data-to-decision lineage & model cards),
Palantir/Visier Vee/Workday Illuminate/One Model/ChartHop (Knowlee guide,
Workhuman, Windmill comparison), PeoplePilot State of People Analytics 2026
(manager-effectiveness 70% wanted / ~20% deployed), AIHR/PlotStudio/Pecan/
Neuroscale/BTE/ViewpointAnalysis rigor sources, EU AI Act feature-contribution
explainability. **Gap:** ONA is either communications-surveillance based
(Windmill/Viva/Worklytics) or cloud/enterprise-priced ($250K–multi-million);
none is free, instant, local-first and derived only from the leader's own
records. No paid competitor was trialled hands-on (secondary sources only).

**Shipped:** a pure ONA engine (`app/core/domain/orgNetwork.js`) + a five-tab
`#/network` terminal. Newman bipartite co-affiliation projection over existing
collections + typed links (confidential conflict/pulse excluded); a tunable
relative strong-tie backbone (default 50% — raw co-affiliation was a complete
graph on the demo and hid all structure); Freeman/Brandes degree · betweenness ·
closeness, weighted PageRank, Burt structural-hole constraint, Watts–Strogatz
clustering, Tarjan articulation points & bridges, Latora–Marchiori efficiency;
a deterministic node-removal structural key-person stress test fused with the
Session 45 continuity Bus Factor (verified-backup stewards); a deterministic
force-directed SVG map (accessible name + legend + table), centrality tables,
brokers/holes, an interactive remove-a-person simulation, and a board pack.
`RULE-ORG-01..05` registered on the ADR-0008 spine (before decisionTempoRule),
plus `ORG-01..05` signals (insights + Today triage + nav badge), two additive
settings (`networkTiePct`, `networkAutoPropagate`) — **no Schema bump**: a derived
lens needs no new collection/migration. CSV scope #31 exports counts and
dimensionless scores only, keyed by opaque `node_index`, no names/free text.
New ADR-0014, RESEARCH §56, ROADMAP head, README section, CHANGELOG, audit doc.
Rejected: attrition prediction, sentiment inference, comms telemetry, employee
ranking, behaviour prediction. Below 2 active people → unmeasurable, not zero.

**Concrete propagation (verified, demo workspace):** `rescanNetwork()` → exactly
one `RULE-ORG-03` DACI org-design decision (4 options), one `RULE-ORG-02`
blameless cross-training delegation (Jordan Alvarez, broker/articulation point),
6 `RULE-ORG-*` typed links (4 `person↔person`, 1 develops→delegation, 1
decides→decision), 3 blameless 1:1 talking points (Jordan ×2, isolated Samuel ×1),
and 9 audited `automation.propagated` events — all in ONE store transaction.
A second scan is a no-op (`changed:false`, no duplicate artifacts); widening tie
focus to 0% clears all resolved ORG prompts while employee-authored topics
survive; pausing `networkAutoPropagate` blocks a declared `rules:['network']`
event but an explicit human scan still runs. The org-design decision is an
ordinary DACI record consumed by the decisions / Decision Tempo modules on their
own triggers — no fabricated money-at-stake, no second code path. Trigger is
narrow (power-style): unrelated case/person/decision writes never re-add talking
points. Fan-out is multi-target in one transaction, not CPU parallelism.

**Verification:** `npm test` → **698/698 tests pass, 0 fail** across 48 suites
(673 baseline + 25 new `org-network.test.mjs`), zero regressions from settings /
CSV-count / rule-catalog-count / spine changes. Exact graph oracle on path/star/
complete/triple graphs (Brandes 2/3, Freeman 4/9 & 1, PageRank → 1, Burt 1/k,
Tarjan bridges, efficiency 0.75, node-removal loss 1); purity; deterministic
layout; idempotency; pause; self-cleaning; settings/normalization; CSV no leaked
names; JSDOM+axe across all 5 tabs + empty state + Today card; access-audit
routes extended. ESLint 0; boundary 0 leaks (102 app modules / 48 suites);
docs links + standalone verified in the final gate (see confirmed result below).
Graphical rendering beyond JSDOM/axe, contrast, screen-reader speech,
Firefox/Safari and legacy build [UNVERIFIED].

**Sync:** implementation commit/push pending at this log entry; actual result
will be appended immediately after the operation. Changed files: README.md,
ROADMAP.md, RESEARCH.md, AI-SESSION-LOG.md, CHANGELOG.md, index.html,
LeadOS-standalone.html, app/actions.js, app/core/schema.js, app/core/csv.js,
app/core/domain/orgNetwork.js, app/core/domain/postCommit.js,
app/core/domain/insights.js, app/core/domain/automation.js, app/main.js,
app/views/network.js, app/views/today.js, app/views/settings.js, app/styles.css,
tests/app/org-network.test.mjs, tests/app/access-audit.test.mjs, 7 test files
with CSV_EXPORTS.length pins and 5 with AUTOMATION_RULES.length pins,
docs/adr/0014-influence-network-intelligence.md,
docs/AUDIT-2026-10-27-session-48.md.

**Confirmed sync result:** implementation commit `09ca29f` (`09ca29f6d8721970a5dfea1feeeb1a75dd047b6a`)
was pushed to `origin/arena/b2cc0d19-leados` at
`https://github.com/shahramclaude/Leados.git`. `git push -u` reported
`* [new branch] arena/b2cc0d19-leados -> arena/b2cc0d19-leados`, exit 0, and
`git ls-remote origin arena/b2cc0d19-leados` returns `09ca29f6…` matching local
HEAD. This follow-up log entry records the observed result, not an assumed
deployment. No PR opened or merged; main is unchanged.

## Session 49 — 2026-10-27 — Impact Ledger (pre-registered intervention evaluation, Schema v31)

**Identity:** origin verified as `https://github.com/shahramclaude/Leados.git`
before inspection; branch `arena/9fa6872c-leados`, starting commit `4253563`
(merge of PR #48). Baseline gate at session start: **698/698** across 48 suites,
0 lint errors, 0 boundary leaks, docs links green.

**Audit scope:** targeted canonical audit of `app/core/domain/*`, `app/views/*`,
`app/ui/*`, `app/actions.js`, `app/core/schema.js`, `app/core/store.js`,
`app/core/csv.js` and the DAILY-DRIVER rules in `scripts/`. Incremental
evolution; no rebuild, no new runtime dependency, no backend, no network call.
Legacy `src/` tree not re-audited [UNVERIFIED].

**Fresh competitive hunt (RESEARCH §57):** 2026 sources read this session —
practitioner maturity roadmaps that stop at "pilot a predictive model" and
mention quasi-experimental validation only as advice (MIHCM, Jan 2026); a July
2026 *IJRSI* review whose closing research agenda is literally *"causal evidence
rather than correlational snapshots"*; the CIPD evidence-based-HR guidance
stating the three conditions for a causal claim and noting that only an RCT or
before-after design supplies the third; and the 2025–26 meta-analytic evidence on
how big leadership effects actually are — leader-targeted stress management
**g ≈ 0.13–0.18**, work-ability interventions **0.12**, engagement **g ≈ 0.29**,
coaching **g ≈ 0.59 with acknowledged publication bias**. **Gap:** every HR
platform ships dashboards and attrition predictions; none ships pre-registration,
a counterfactual, a minimum detectable effect, or a placebo test. The
incrementality rigour that marketing has had for a decade
(geo-holdout/synthetic control) simply does not exist for a leader's own
interventions.

**Shipped:** `#/impact`, five tabs over two new pure modules.
`app/core/domain/vitals.js` reconstructs twelve weekly metrics from dated fields
already on the records, with three test-enforced honesty rules (no zero for an
unobserved bucket, no interpolated close dates, no series before a metric's
coverage frontier). `app/core/domain/impact.js` implements a segmented
interrupted time series with Newey–West HAC errors, `designPower` (pre-
intervention MDE from the metric's own I-MR noise), in-time and Abadie-style
in-space placebo inference with explicit attainable-p resolution, a
breakdown-trend fragility bound, verdict grading, calibration (direction
accuracy, Brier, realised÷declared effect ratio) and a deterministic brief.
Unobserved periods are **skipped, not zero-filled**. Schema **v31** adds
`impactStudies` with `normalizeImpactStudies` and a 30→31 migration; four
settings (`impactAlpha`, `impactBaselineWeeks`, `impactWindowWeeks`,
`impactAutoPropagate`). `RULE-IMP-01..06` are registered on the ADR-0008 spine
**before** `decisionTempoRule`; `IMP-01..06` feed insights (new `'Impact'`
domain), the Today triage card and the nav badge; CSV scope **#32** exports
counts and verdicts only. New ADR-0015, RESEARCH §57, ROADMAP head, README
section, CHANGELOG entry, 56 new tests.

**The pre-registration firewall (the part worth arguing about).** `declaredOn`
is stamped by the action and never accepted as input, so the grade is derived
rather than claimed: a hypothesis recorded on or before the intervention date is
*confirmatory*; anything later is *retrospective* and permanently ineligible as
confirmation, however good the news. Once the window closes, predictive edits are
refused with an explanatory error; once scored, the evaluation is frozen and both
the UI and `buildImpactReport` read the frozen copy. A study that a leader scores
and then re-scores by nudging the window would be worthless, so the action
refuses it.

**Concrete propagation (measured, demo workspace @ 2026-10-27):**
`lockImpactStudy('impact-demo-1')` → verdict **supported** (level shift 0.618
per-person notes, MDE 0.244) → **+1 DACI decision** ("Scale or protect: Weekly
feedback ritual", 4 options), **+2 typed links**
(`impact→decides→decision`, `replication→replicates→original`), **+6 audited
events**, and one proposed replication study — all in one transaction.
`lockImpactStudy('impact-demo-2')`, the *same* intervention measured on feedback
latency, → verdict **not-supported** (+2.99 days worse, MDE 1.11) → a
stop/redesign decision and no replication. `scanImpact()` immediately afterwards
→ `changed:false`, no duplicates. Pausing `impactAutoPropagate` suppresses the
automatic fan-out while an explicit scan still runs.

**Statistical honesty worth recording.** The demo's own numbers made the case
for the power planner: with 8 pre and 4 post weeks, feedback cadence has an MDE
of ≈ 0.91 per-person notes per unit of the metric, and the demo's declared effect
was 0.30 — i.e. the design could not have seen the effect it predicted, and said
so in the declare dialog before the study began. Separately, substituting a zero
for one unobserved period biased a noiseless step from **5.00 to 5.29** and
inflated the standard error from **0 to 0.51**; that measurement is now a test.

**Verification:** `npm test` → **754/754** pass, 0 fail, 49 suites (~325 s).
`node --test tests/app/impact.test.mjs` → 56/56. `npm run lint` clean.
`npm run check:boundary` → 107 app ES modules, 49 test suites, 0 quarantined-tree
or network leaks. `npm run check:links` → 123 internal links across 117 markdown
files resolve. `npm run build:standalone` → 2,294,284 bytes, 107 modules, Schema
v31. Three pre-existing demo-fixture assertions were updated rather than
weakened: migration-chain arrays now end `30 → 31` (22 sites) and last-applied
assertions moved to `30 → 31` (2 sites); thirteen files' `schemaVersion`
literals moved 30 → 31; the demo feedback-latency assertions became property
assertions because the demo now carries a real 22-week feedback history.

**Known gaps, stated plainly.** Demo vitals: six of twelve metrics are
reconstructable (delegation-cycle, delegation-throughput, decision-latency,
case-cycle, pulse-index and negotiation-cycle fall below the six-period floor
because the demo's own records for those are sparse — the UI lists them rather
than hiding them). The donor composite is intentionally equal-weight and
unfitted, so it is a weak counterfactual compared with a fitted synthetic
control; the limitation is printed next to every placebo distribution. No RCT
support, no staggered-adoption estimator, and no sibling-team control group yet —
all three are on the roadmap, none is claimed.

---

## Session 50 — 2026-10-27 — Stakeholder Comms Outbox (RULE-COMMS-01..04, Schema v32)

**Identity:** origin verified as `https://github.com/shahramclaude/Leados.git`; branch
`arena/ea60ecf3-leados`; starting commit `9ad3569` (merge of PR #49). Baseline at session
start: the first `npm test` failed 40 of 143 with `ERR_MODULE_NOT_FOUND: jsdom` because
`node_modules` was absent. After `npm ci`, the baseline was **754/754** across 49 suites.

**Audit (blunt).** The Session 49 Next list was stale: items 4 (natural-language intake) and 5
(decision-delay simulation) shipped in Sessions 43 and 44. `index.html` build metadata said
"schema 30 / Session 48" while the code was at v31. `store.lastPropagations` is read in 10 places
in `actions.js` and assigned nowhere, so those responses always carry `[]`; this is pre-existing
and was not fixed here. A blank FMEA rating is stored as 5 (`addCase`'s `parseRating` default),
so "unrated" is not representable. `updateCase` accepts any status, including resolved, which
bypasses `resolveCase`. The `stakeholder` brief comms path existed (`logCaseStakeholderComms`)
but nothing consumed it.

**Feature chosen (grep-verified gap: 0 hits for draft-message / outbox).** Deterministic,
template-based stakeholder communication drafts, generated by the post-commit rules and held
for human approval. Nothing is sent. Drafts are content-addressed (superseded, not duplicated),
typed-linked to the case, and closure is owed only to stakeholders who were actually briefed.

**What was built**
- `app/core/domain/comms.js` (new): pure engine, catalog `COMMS_RULES`, audience selection,
  facts, deterministic rendering with explicit "[to confirm — …]" gaps and a readiness fraction,
  canonical basis fingerprints, `commsRule` dispatcher, `commsSignals`.
- `app/core/domain/postCommit.js`: `commsRule` registered before `decisionTempoRule`.
- `app/core/domain/cases.js`: entity type `comms`, relation `communicates`, resolver.
- `app/core/domain/automation.js`: `COMMS_RULES` in the shared catalog (74 → 78);
  `cadenceDaysOffset` exported for reuse.
- `app/core/schema.js`: `SCHEMA_VERSION` 32, `commsDrafts` collection, `normalizeCommsDrafts`
  (repairs unknown status, drops orphans and empty bodies, refuses "sent" without a date),
  migration `31 → 32`.
- `app/actions.js`: `approveCommsDraft`, `editCommsDraft`, `markCommsDraftSent`,
  `dismissCommsDraft`, with validation through `ctx.api`.
- `app/views/comms.js` (new): four tabs (Approve, Ready to send, Sent, History), readiness
  meters, gap listing, accessible dialogs. Wired in `app/main.js` (nav, route, title, badge).
- `app/core/domain/insights.js`: COMMS-01..03 merged into Signals; "Comms" domain.
- `app/core/demo.js`: outbox seeded by the real rule, not hand-written.
- `tests/app/comms.test.mjs` (new, 22 tests). Pins updated for v32 and the 78-rule catalog,
  and two cross-module expectations updated for the new `comms` link (`cases-automation`).
- `docs/adr/0016-stakeholder-comms-outbox.md` (new), `docs/adr/INDEX.md`, `index.html` meta,
  `README.md`, `ROADMAP.md`, `RESEARCH.md` §58, `CHANGELOG.md`, `LeadOS-standalone.html` rebuilt.

**Verification performed**
- `npm test`: **776/776** across 50 suites (was 754). `npm run verify:canonical` (lint, boundary,
  docs links, full tests) exits 0.
- `npm run lint` clean on touched modules; `check:boundary` OK (109 modules, 50 suites);
  `check:links` OK (128 links); `build:standalone` + `verify:standalone` 7/7.
- Store-level smoke run (`/tmp`, not committed) confirmed the cascade, idempotence, supersession
  and the closure-after-touch-after-approval path before tests were written.

**Known, stated gaps (not smoothed over)**
- FMEA 5/5/5 default cannot be told apart from a deliberate rating; the readiness check cannot flag it.
- Sent-by-touch uses logged dates (`lastCommsOn >= draft.createdOn`); a same-day touch is treated
  as the send. This is a convention, not evidence of delivery.
- Status transitions are material, so busy cases re-draft often. No per-workspace pause switch yet.
- Outbox is excluded from CSV export. Competitor claims in RESEARCH §58 come from search snippets
  and are `[UNVERIFIED]` against hands-on trials. Real-browser and mobile validation of the outbox
  is `[UNVERIFIED]`; JSDOM + axe is structural evidence only.
- `store.lastPropagations` pre-existing defect left in place (out of scope, documented).


## 2026-10-27 — Automation Control Room & post-commit savepoints

### Identity and sync audit
- Before inspection or changes: origin verified as `https://github.com/shahramclaude/Leados.git`, branch `arena/445def00-leados`, clean working tree.
- Subsequent `git fetch origin` succeeded; `HEAD...origin/main` was `0 0` before this work was committed.
- No branch switch, framework replacement, runtime dependency, schema migration or outbound app call.

### Blunt current-state assessment and scope
- Canonical application is `index.html` + `app/**`; root React/Next/TypeScript code is a separate legacy surface. Rebuilding would discard substantial functioning domain logic.
- Personally inspected the canonical shell/routes, store transaction path, shared case graph and entity resolver, post-commit registry, comms rule lifecycle, domain module entry points, API patterns, representative tests, serving/build scripts and repository architecture inventory.
- **Not every source file was personally read in full.** Complete legacy-source audit and every existing domain formula remain [UNVERIFIED] this session. Boundary scanning and regression coverage do not constitute that personal audit.
- Verified defect: catch-and-continue previously preserved a throwing post-commit rule's partial writes and success audit events. Fixed with isolated JSON savepoints and buffered publication.
- Existing depth is substantial, but automation observability was fragmented. No shared manager-facing graph trail, rehearsal or link diagnostics existed on the canonical navigation surface inspected.
- Existing action-level automation remains outside the new savepoints; historical replay, causal inference, automatic repair and large-workspace async execution are not claimed as shipped.

### Shipped
- `#/assurance`: operational evidence explorer with BFS shortest trails, explicit reverse traversal, per-hop originating rules, relationship provenance, dangling endpoint / unknown relation / duplicate diagnostics, retained rule-failure count and downloadable assurance brief (copy fallback if download unavailable).
- Disposable production-registry case replay with row deltas, per-rule savepoint traces, collision-checked preview IDs, redacted event categories and zero source mutation.
- Confirmed live refresh via validated API and the actual store. It recomputes current facts rather than applying preview state; does not send communications or rerun source-action case-opening rules.
- Per-rule rollback of candidate writes, deletions, buffered warnings and false success logs on exception; named failure audit and continuation from the last successful state. Earlier successful rules and source mutation survive.
- Privacy exclusions before graph resolution; no arbitrary failure-log summaries in the control room or exported brief. No generic relationship is represented as a causal dependency.
- README, index metadata, ROADMAP, RESEARCH, ADR-0010 and regenerated portable standalone artifact updated.

### Concrete cross-module verification
- A real store/API case with a high-power stakeholder creates communication drafts and `communicates` typed links. Removing the derived drafts in a test fixture, previewing and refreshing reconstructs them. Repeated refresh converges without duplicate drafts.
- A throwing injected rule attempts to add a goal and append a false success log. Neither persists or survives reload; a later rule successfully creates its decision, and one named failure is logged.
- Demo replay reports actual delegation / dependency / tempo / link changes. Fifteen local runs measured median ~29 ms and max ~39 ms; graph projection ~4 ms over 45 linked demo records. These are developer-machine demo measurements, not large-workspace guarantees.

### Competitive benchmark and new backlog
- Fresh vendor-excerpt hunt: Aera Decision Intelligence Network, Orgvue October-2026 auditable/reversible WebMCP control points, Culture Amp AI Coach's human-rating boundary, Betterworks' manager-verified skills inference. URLs and caveats recorded in RESEARCH.md.
- Chased explainable, rehearsable decision networks, not another flat management score. No uniqueness, AI equivalence or hands-on competitor benchmark claim.
- Next: source-action registry unification, frozen-input historical replay, worker-backed rehearsal and preconditioned human-reviewed repair.

### Verification and publication
- First full existing suite: **776/776 passed** (no failures, skips or cancellations).
- Focused assurance suite: **9/9 passed**, including actual store persistence/reload, rollback/continuation, graph paths and privacy, deterministic sandbox, real propagation and UI interaction. Axe reports zero violations with colour contrast disabled (JSDOM has no layout engine).
- Standalone distribution suite: **7/7 passed**; rebuilt artifact has 111 canonical modules and schema v32.
- ESLint, canonical boundary gate, documentation links and `git diff --check` passed during development. Final combined gate running before commit; outcome to be recorded below.
- Preview server bound to `0.0.0.0:5173`; shell returned HTTP 200. Full real-browser visual/contrast inspection and large-workspace interaction latency are [UNVERIFIED].
- Publication pending at this entry. Changed deliverables: `app/core/domain/postCommit.js`, `app/core/domain/assurance.js`, `app/views/assurance.js`, `app/actions.js`, `app/main.js`, `tests/app/assurance.test.mjs`, `index.html`, `LeadOS-standalone.html`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `docs/adr/0010-automation-assurance-savepoints.md`, `AI-SESSION-LOG.md`.

Final combined verification: `npm run verify:canonical` exited **0**; **785/785 tests passed**,
zero failures/skips/cancellations, plus ESLint, boundary and docs-link gates. Latest focused
Control Room rerun also passed **9/9**, including cancel/confirm gating of the refresh action.
Latest portable artifact verification passed **7/7**. Commit and push attempted next.
