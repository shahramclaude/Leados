# Changelog

## 2026-10-27 — Outcome-scored premise sensor calibration (Schema v36)

- Added a human-authored, append-only held/failed/inconclusive outcome ledger for assumption premises.
- Added sensor reliability diagnostics: Brier score, forecast-vs-realized calibration gap, 50%-threshold accuracy, and PSI forecast-mix shift; metrics are withheld below five settled premises and PSI below ten per cohort.
- Added `RULE-PREM-05` typed lineage from outcomes to premises and linked decisions, opaque CSV scope #36, point-in-time outcome filtering, and demo-clear pointer repair.
- No automatic truth labels, no automatic likelihood-ratio tuning, no new runtime dependency or network path.
- Verification results: see the Session 54 entry in `AI-SESSION-LOG.md`.


All notable changes to LEADOS are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and this project
uses [Semantic Versioning](https://semver.org/).

**Honesty note (Part 19):** this changelog was curated retroactively. The repository snapshot
used to write it contains no prior git history, no prior tags, and none of the stale status
reports referenced by earlier planning documents (`APP-STATUS-REPORT.txt`,
`APP-CAPABILITY-REPORT.md`, etc.) — see `docs/CONSISTENCY-SWEEP.md` for the full accounting. This
file therefore starts at the first version that can be verified against real code:
**v0.1.0**. No entries describe work that cannot be pointed at a file.

## [Unreleased]

### Added — Session 53: Premise Sentinel / Assumption Ledger (`#/premises`, Schema v35)
- New local-first decision-continuity terminal: pre-register load-bearing assumptions
  with a DACI decision anchor, signpost owner, falsification signpost, Cromwell-clamped
  prior (5–95%), leader-owned watch/breach thresholds, evidence half-life, review date
  and typed evidence sources. Register/evidence/review dialogs preview belief impact and
  validate every input; retirement and reaffirmation are dated human acts.
- Bayesian log-odds evidence engine: dated, directional likelihood ratios decay by
  `2^(-age/halfLife)` (5% floor), produce a posterior with confidence and information
  gain in bits, and show Wald-style SPRT support/challenge boundaries. Priors and LRs
  are transparent conventions; the UI explicitly refuses to call heterogeneous
  leadership evidence a formal significance test.
- Eight declarative sensors (`PREMISE_SENSORS`) over rated FMEA cases, stakeholder veto
  stances, TTS/TTR continuity gaps, budget encumbrance, settled PERT actuals, forecast
  optimism, reviewed decision outcomes and cognitive-load bands. A two-hop typed graph
  scope finds linked records automatically; unrated/unpriced/missing-actual inputs emit
  no fabricated evidence; conflicts and anonymous pulses are never read.
- `RULE-PREM-01..04` on the ADR-0008 post-commit spine: typed scope assembly,
  append-only keyed evidence sensing, one atomic four-option DACI re-decision on a fresh
  breach (hedge / pause / reverse / buy information), one owner verification delegation,
  one blameless 1:1 prompt, value-context-inheriting typed links, and self-clearing
  overdue signpost review prompts. A breach declares `decisionTempo` on the same event,
  so `RULE-DLY-03` prices the re-decision when typed value links exist. Marker and
  review-cycle idempotency prevent duplicate decisions; nothing is auto-reversed.
- `PREM-01..05` signals merged into Insights, a Today triage card, nav attention badge,
  deterministic board brief, CSV scope #35 (opaque premise codes, no titles/notes/names
  or source free text), four-tab UI with evidence/exposure labs and policy tab, plus
  accessible keyboard-operable dialogs.
- Additive Schema v34 → v35 migration: `premises` collection, five validated settings,
  `premise` link entity type, `tests`/`revisits` relations, normalizer repairs for
  corrupt priors/refs/future dates, point-in-time rewind and `clearDemo()` pointer
  scrubbing. Automation catalog 86 → 90; CSV scopes 34 → 35; 118 canonical app modules.
- Demo ships two engine-produced premises over real continuity dependencies: one on
  watch and one supported, with typed links and dated sensor observations but no forced
  breach decision. ADR-0019, RESEARCH §61, ROADMAP Session 53, 26 new tests.

### Added — Session 52: Cognitive Load & Attention Governor (`#/load`, Schema v34)
- New `#/load` terminal measuring the person-side constraint entirely from records the
  leader already keeps (portfolio commitments, roster/reporting graph, dependency
  stewardships, onboarding plans) — no calendar, message, keystroke or meeting telemetry,
  no persisted rating, everything recomputed live.
- Per-role saturation index with four transparent, exported component weights:
  intrinsic utilization of ramp-adjusted reserve-discounted supply (0.40), WIP switching
  vs the shared Kanban convention (0.25), extraneous coordination from strong-tie degree,
  1.5× direct reports and weighted stewardships (0.20), and open delegations/cases (0.15);
  five bands (headroom/managed/elevated/saturated/overloaded) with a leader-owned
  saturation threshold (default 80). Team panel adds Brooks n(n−1)/2 channels, network
  density and the single Goldratt system constraint.
- Seeded Beta-PERT Monte Carlo overload probability per person against their own horizon
  supply; commitments without measured triples are counted as unquantified and excluded
  from every draw rather than sampled as zero.
- Per-person Little's Law and Kingman expected-wait queueing from recorded completions:
  counts-only below two completions, provisional at 2–4, learned at five; an unstable
  ρ≥1 state reports no finite wait instead of fabricating one.
- Germane-load protection: ramping team members (active onboarding/transition plan,
  supply factor below one) are flagged but never scored down.
- `RULE-LOAD-01..04` on the generalized post-commit spine (portfolio/delegation/dependency/
  person-archive/scan triggers): one idempotent four-option DACI load-shedding decision
  with typed `involves`/`decides` links, priced by Decision Tempo in the same transaction;
  self-clearing WIP-limit and commitment-size talking points (mutually exclusive);
  manager-routed ramp-protection prompt. Markers make repeated scans converge; the
  `loadAutoPropagate` pause blocks event fan-out while an explicit human scan always runs.
- Signals `LOAD-01..05` merged into Insights under "Load & attention"; deterministic board
  brief; CSV scope #34 with opaque deterministic `load_person_n` codes (no names, roles or
  free text); automation catalog 82 → 86; nav attention badge and route aliases
  (`cognitive-load`, `saturation`).
- Additive Schema v33 → v34 migration installing exactly four validated policy settings
  (`loadSaturationPct`, `loadOverloadProbPct`, `loadThroughputWindowWeeks`,
  `loadAutoPropagate`); no new collections and no backfilled ratings. New actions
  `setLoadPolicy` and `scanLoad`.
- Demo ships the Governor already run on real records behind a visible threshold policy
  (70%): one ramping team member saturated at index 76 with P(overload)=1, one
  engine-opened shed decision, WIP and germane talking points. ADR-0018, RESEARCH §60.

### Added — Session 51: Allocation Governor (`#/allocation`, Schema v33)
- Explore-vs-exploit terminal over the operating-plan portfolio: Nagji & Tuff ambition
  horizons (`core | adjacent | exploratory`, absent = honestly unclassified, never inferred),
  per-currency UCB1 arms learned from settled delivery actuals (robust MAD-scaled exploration
  bonus; counts-only below n=5; settled-without-actuals excluded as an evidence debt, never
  scored zero; currencies never mixed), hindsight-regret diagnostic, current funded mix and
  funded-flow exploration-starvation gauge (March 1991) against a leader-owned floor.
- `RULE-ALLOC-01..04` on the post-commit spine: a floor breach opens exactly one DACI
  rebalancing decision (priced by Decision Tempo in the same transaction) with typed
  `decides`/`funds` links; funded bets queue a learning-checkpoint 1:1 prompt; deliveries
  without actuals open one evidence-closure delegation; funded-unclassified work queues a
  self-clearing classification prompt. Pause switch (`allocationAutoPropagate`) from day one.
- Signals `ALLOC-01..05`; CSV scope #33 (arm aggregates only — no titles or names);
  deterministic board brief download; capacity dialog gains the horizon selector; demo
  ships the Governor already run (one engine-generated decision, counts-only arms).
- Schema v32 → v33 migration is additive (`portfolio.horizon`, allocation policy settings).
  Decision: ADR-0017.

### Fixed — Session 51
- FMEA ratings: a blank rating now persists as `null` ("not rated yet") through `addCase`,
  `updateCase` and the normalizer instead of a silent 5; case list/detail and the case dialog
  show "Rating needed" / "Not rated yet" instead of a fabricated RPN. Historical stored
  ratings are untouched. (Closes the Session 50 known limitation below and ROADMAP Next #4.)
- `store.lastPropagations` is now actually assigned after every committed mutation, so the
  ten action results that read it report real cross-module propagations instead of `[]`.
  (ROADMAP Next #5d.)

### Added — Session 50: Stakeholder Comms Outbox (`#/comms`, Schema v32)
- `RULE-COMMS-01..04` on the post-commit spine: status-brief drafts for key and opposing
  stakeholders from recorded case facts; closure notes owed only to briefed stakeholders;
  reopen withdraws closure notes; a logged stakeholder touch marks the matching draft sent.
- Human gates: approval with unconfirmed facts needs an explicit acknowledgement; editing an
  approved text withdraws approval; dismissal requires a reason; sent is terminal.
- Typed links: new entity type `comms` and relation `communicates` on the shared graph.
- Signals `COMMS-01..03` merged into the Signals feed; demo workspace ships a populated outbox.
- Schema v31 → v32 migration is additive (`commsDrafts: []`). Decision: ADR-0016.

### Known limitations — Session 50
- FMEA ratings default to 5 at case creation, so an unrated case cannot be distinguished from a 5/5/5 rating.
- Drafts are excluded from CSV export; they are included in the full JSON backup.


### Added
- **Impact Ledger — pre-registered, placebo-checked evaluation of your own
  interventions (`#/impact`, Session 49, Schema v31).** Every other surface in
  LeadOS (and in the market) answers "is it up?"; this one answers "did *I* do
  that?" — and refuses to answer when the record cannot support it.
  - `app/core/domain/vitals.js`: twelve weekly vitals reconstructed from dated
    fields already on the records, with three honesty rules enforced by tests —
    an unobserved bucket is `null` never `0`; a closed-but-undated record is
    excluded and counted, never interpolated; a metric is trimmed at its
    coverage frontier so a young log cannot render imaginary zeroes, and a
    metric with no records at all returns an empty series with a reason.
  - `app/core/domain/impact.js`: segmented interrupted time series with
    Newey–West HAC errors; unobserved periods **skipped rather than
    zero-filled**; minimum detectable effect in the metric's own units;
    Abadie-style in-space placebo inference that reports its finest attainable
    p and refuses to gate when it cannot reach α; in-time placebo
    distributions; a Rambachan–Roth-style breakdown trend; and
    `designPower`, a pre-intervention power planner driven by the metric's own
    I-MR noise and run live inside the declare dialog.
  - **Pre-registration as a constraint, not a promise**: `declaredOn` is
    stamped by the action, so `declaredOn ≤ windowStart` derives a
    *confirmatory* grade and anything later derives *retrospective*.
    Predictive fields are refused after the window closes; scoring freezes the
    evaluation, and the report always reads the frozen copy.
  - Five tabs — Vitals (with tabular CUSUM change-point prompts), Studies,
    Evaluation (counterfactual, gates, fragility, both placebo charts), Design &
    power (MDE grid and target comparison), Calibration & brief (direction
    accuracy, Brier score, effect-size realism, deterministic Markdown brief).
  - `RULE-IMP-01..06` on the shared spine before `decisionTempoRule`: typed
    `evaluates`/`replicates` links, one 4-option DACI scale/stop decision for a
    confirmatory decisive result, blameless mechanism-framed talking points for
    a contradicted people-facing intervention, exactly one proposed replication
    of a supported study, plus calibration and pre-trend findings. `IMP-01..06`
    signals feed insights, the Today triage card and the nav badge. CSV scope
    #32 exports counts and verdicts only.
  - New ADR-0015 and RESEARCH §57; 56 new tests; full gate **754/754**, 49
    suites, 107 app modules, Schema v31, standalone rebuilt.
  - Deliberately excluded: causal-claim language, fitted synthetic-control
    weights, backdated declarations, rescoring a locked study, and any use of
    the ledger to rate people rather than interventions.
- **Influence Network Intelligence (`#/network`, Session 48, additive on Schema v30).**
  A surveillance-free Organizational Network Analysis terminal derived entirely from the
  leader's own typed records — no communications telemetry, no employee ratings. A pure
  engine (`app/core/domain/orgNetwork.js`) implements Newman bipartite co-affiliation
  projection with a tunable relative strong-tie backbone, Freeman/Brandes degree ·
  betweenness · closeness centrality, weighted PageRank influence, Burt structural-hole
  constraint, Watts–Strogatz clustering, Tarjan articulation points & bridges, and
  Latora–Marchiori efficiency with a deterministic node-removal structural key-person
  stress test fused with the Operational Resilience Bus Factor (verified-backup
  stewards). Five tabs: a deterministic accessible SVG network map, centrality tables,
  brokers & holes, an interactive remove-a-person simulation, and a follow-through +
  board-ready brief. Five atomic post-commit rules (`RULE-ORG-01..05`) fan one analysis
  into typed person↔person links, a blameless cross-training delegation, a DACI
  org-design decision, blameless 1:1 talking points and `ORG-01..05` signals (insights,
  Today triage and nav badge), with idempotent markers, pause semantics and
  self-cleaning prompts. Two additive settings (`networkTiePct`, `networkAutoPropagate`)
  need no record migration. CSV scope #31 exports counts and dimensionless scores only,
  no names or free text. New ADR-0014 and RESEARCH §56; 25 new tests; full gate
  698/698. Deliberately excluded: predictive attrition, sentiment inference, employee
  ranking and any claim that centralities predict behaviour.
- **Coalition & Incentive War Room (`#/power`, Schema v30).** A pure computational
  political-economy engine (`app/core/domain/power.js`) fusing exact Banzhaf / Shapley-Shubik
  voting-power indices, minimum winning coalitions, Tsebelis veto players and dummy/dictator
  detection with 2×2 pure & mixed Nash equilibria, dominant strategies, Pareto frontier and price
  of anarchy; mechanism-design minimal incentive-alignment transfers with a feasibility bound;
  equilibrium-robustness confidence scoring; and deterministic SBI/DESC influence scripts and
  board-ready briefs. Six atomic post-commit rules (`RULE-PWR-01..06`) propagate one game into a
  DACI decision, a blameless alignment delegation, a 1:1 estimate-verification talking point,
  typed graph links and derived telemetry — chained into Decision Tempo in the same transaction —
  with `PWR-01..06` signals, a Today card, a nav badge, CSV scope #30 (no titles/names), Schema
  v29→v30 additive migration, point-in-time rewind and clearDemo parity. See ADR-0013 and
  RESEARCH §54. Canonical suite 666/666 across 46 suites; standalone rebuilt at 99 modules /
  schema v30.
- **Decision Tempo & Timing Terminal (`#/tempo`, Schema v28).** Every open decision becomes a
  priced, timed position. `app/core/domain/decisionTempo.js` prices delay with Reinertsen's
  four delay profiles (cost of delay ÷ duration, capped at the value at stake), prices the
  *option to wait* with a closed-form preposterior EVSI (Raiffa–Schlaifer: EVSI is zero at
  t = 0, monotone in time and never exceeds EVPI), and returns the horizon that maximises
  expected information value minus carrying and evidence cost with a verdict
  (`gather-first` / `decide-now` / `unpriced` / `needs-economics`) and a switch probability.
  Value at stake is assembled from typed graph links — PERT case exposure, encumbered budget
  lines, portfolio value, negotiated stakes — split by currency and never summed across
  them; a decision with nothing linked is labelled unpriced rather than priced at zero.
  Decisions now record `decidedOn` (the moment of the call) so latency is measured, never
  inferred: the class band is a split-conformal order statistic with its finite-sample
  coverage bound, counts-only below n = 5, and legacy decided records stay unmeasured.
  Five post-commit rules run inside the existing atomic transaction — settle and measure
  (DLY-01), overdue → exactly one owned blameless delegation to the recorded approver
  (DLY-02), priced-and-untimed → one *proposed* timebox that a human must arm (DLY-03),
  >20% linked-value drift → derived-value refresh that never overwrites recorded human
  inputs (DLY-04), and class p80 breach → one DACI tempo-policy decision with four real
  options (DLY-05); `DLY-01..06` signals, a Today card, a nav badge, a tempo line on every
  open decision card, a deterministic board brief, a data-minimised CSV scope #28 with no
  titles or names, a one-click pause, point-in-time rewind and clearDemo parity. Additive
  v27→v28 migration; [ADR-0011](docs/adr/0011-decision-tempo-terminal.md); RESEARCH §52.

- **Natural-Language Intake Terminal (`#/intake`, Schema v27).** An on-device triage
  engine (`app/core/domain/intake.js`) turns a free-form situation note into a
  confidence-scored, fully-evidenced routing plan: fourteen weighted-evidence categories
  with NegEx-style negation windowing, temperature-scaled softmax probabilities with
  uniform-prior shrinkage, completeness/ambiguity/stakes uncertainty controls, and entity
  extraction for roster people (ambiguity never auto-resolved), money (US/EU/Danish
  formats with currency-assumption flags), durations, person-days, percentages, recurrence
  and severity markers. Human-confirmed routing creates the operational case through the
  existing event-driven propagation engine — no parallel write path. RULE-INTAKE-04 keeps
  conflict language behind the confidential privacy wall, RULE-INTAKE-05 forces human
  review on safety/legal stakes, RULE-INTAKE-06 surfaces stale drafts on Today/Signals, and
  RULE-INTAKE-07 records human agreement (not claimed accuracy) in a calibration ledger,
  counts-only below n=5. Additive v26→v27 migration; data-minimized `intakeCalibration` CSV
  scope with no free text; demo triage queue; [ADR-0010](docs/adr/0010-on-device-nl-intake-triage.md).
- **One-file offline distribution: `LeadOS-standalone.html`.** A 1.7 MB self-contained HTML
  copy of the entire app — all 89 canonical JavaScript modules and CSS inlined, no server,
  install, folder, CDN, `node_modules`, network call or runtime dependency. Double-click it
  from any `file://` path. Generated by `npm run build:standalone` / `scripts/build-standalone.mjs`
  with an esbuild IIFE bundle, source fingerprint and hard no-external-resource invariants
  ([ADR-0009](docs/adr/0009-single-file-offline-distribution.md)).
- **Portable-copy UX and data honesty.** Distinct `leados.standalone.v1` browser-storage key,
  `connect-src 'none'` CSP, standalone banner, Settings "Portable offline copy" card with a
  download link in served mode and Export/Import JSON guidance in standalone mode. The app
  travels in the file; records do not — export before moving PCs. Browsers that block
  `localStorage` or Web Crypto for local files get an honest warning instead of a false
  persistence claim.
- **Standalone verification.** `verify:standalone` script and 7 new tests covering inline
  artifact structure, arbitrary output filename, `index.html` overwrite protection, `file://`
  boot, hash routing, zero network attempts, zero axe violations and storage-key separation.
  Also fixed an `emptyState` heading-order accessibility defect. Full suite: **565/565 across
  42 suites**.
- **Forecast Integrity Terminal (Schema v26), at `#/forecasts`.** One typed prediction-atom
  ledger over seven forecast sources; Brier/Murphy probability scoring; exact two-sided sign
  tests; distribution-free conformal outside-view bands with finite-sample coverage bounds;
  counts-only guardrails below n=5; currency/quantity/direction segmentation; interval-coverage
  diagnostics; a deterministic board-ready brief; and a five-tab terminal with overview,
  ledgers/gaps, reference classes, challenges and brief.
- **Generalized post-commit rules hook ([ADR-0008](docs/adr/0008-post-commit-rules-hook.md)).**
  `store.update` now runs pure domain rules after the source mutation and audit event, inside
  the same atomic write. Four new rules `RULE-FCI-01..04` fan a settled outcome into
  idempotent outside-view challenges, typed `forecasts` graph edges, DACI re-baseline
  decisions, a blameless measurement-recovery delegation, `FI-01..05` signals, Today triage,
  nav badge and audit events. A pause stops outcome-driven writes; an explicit scan still works.
- **Reviewable forecast challenges.** A new `forecastChallenges` collection stores the recorded
  estimate, reference-class central estimate, conformal band, evidence count, confidence and
  append-only response history. Leaders accept, adapt or dismiss with a written reason; source
  forecasts are never rewritten. Additive v25→v26 migration, repair-not-reject normalization,
  `clearDemo`/point-in-time rewind parity, 29-column formula-safe `forecasts` CSV scope (#26),
  and 22 new tests. Full suite: **558/558 across 41 suites**; 0 lint errors, 0 boundary leaks.
- **Stakeholder Influence Register (Schema v25), at `#/stakeholders`.** A first-class, portfolio-wide
  political record on top of the lightweight embedded stubs cases, changes and negotiations already
  carry. Four named frameworks ship as executable logic rather than prose: Mendelow (1981) power ×
  interest quadrants in an interactive 5×5 matrix with cadence guidance, Mitchell-Agle-Wood (1997)
  all seven salience classes with a confidence-adjusted score (high ×1.0 / medium ×0.85 / low ×0.7),
  Tsebelis (1995, 2002) veto-player change-difficulty bands (each gate ≤25 points from stance distance
  × power; cohesive opposition +5, unified blocker front +8; feasible ≤33 / contested ≤66 / blocked
  ≤100, with per-analysis confidence and an explicit "not a spatial model" label), and a union-find
  coalition network computing alliance-bloc leaning, directional opposition/influence edges,
  weighted-degree centrality and hidden influencers (low power, high out-influence).
- **Four event-driven automation rules (`RULE-STK-01..04`), 41 rules total.** RULE-STK-01 reconciles
  embedded stubs against the register under strict exact-name/person matching (near-misses become
  STK-02 hygiene counts, never guessed edges) and maintains idempotent `involves` graph edges;
  RULE-STK-02 opens exactly one linked DACI alignment decision (redesign / principled persuasion /
  documented escalation) in the same transaction when an open initiative faces an adverse veto gate,
  with per-initiative embedded stance overrides honored without rewriting the register; RULE-STK-03
  converts an adverse stance shift on a person-linked high-salience record into one managed,
  blameless 1:1 talking point; RULE-STK-04 is a write-free cadence/urgency/evidence watch feeding
  signals `STK-01..07`, Today triage and nav badges.
- **Register UX and governance.** Register/edit dialog with live salience/Mendelow/veto readouts,
  dynamic alliance editor and a dry-run cross-module propagation preview that writes nothing;
  append-only stance and contact dialogs (cadence-proposed next contact never overwrites a later
  plan); dossier with salience rationale, Mendelow guidance, per-initiative veto difficulty,
  involvement pills, coalition position and timeline history; archive vs. scoped-delete cascade;
  Today triage card; 32-column formula-safe `stakeholders` CSV scope (25th) with
  contextual-integrity redaction of stances, veto bases and influence notes plus a scrub count;
  additive v24→v25 migration; normalizer repairs with warnings; `clearDemo`/point-in-time rewind
  parity with an explicit approximate-fidelity note; 12-record demo at 100% reconciliation coverage
  that emits zero fabricated automation events. 39 new tests; full suite 536/536.
- **Negotiation Workbench (Schema v23), at `#/negotiations`.** A full negotiation-analysis module
  built on named frameworks rather than prose: Fisher & Ury (1981) BATNA discipline with a weighted
  preparation checklist (BATNA and a real walk-away price count twice), Raiffa (1982) reservation-price
  geometry that computes the ZOPA, midpoint and reservation gap per measurable issue (and reports
  *incomplete* honestly instead of treating a missing estimate as zero), and Lax & Sebenius (1986)
  package options and agreement-term ownership. Three event-driven automation rules — `RULE-NEG-01`
  (goal/coaching edges plus a pursue-agreement-vs-BATNA DACI mandate for high-stakes work),
  `RULE-NEG-02` (owned agreed terms become tracked delegations; ownerless terms stay visible as
  ownership gaps, never silent assignments) and `RULE-NEG-03` (an impasse raises exactly one
  operational escalation case through the standard FMEA/DACI fan-out, idempotently) — join six new
  insight signals `NEG-01`..`06`, a Today triage card, a purpose-limited formula-safe CSV scope
  (the 23rd), and a three-record demo workspace that stays silent on every NEG rule by design.
  18 new tests cover engine math, validation, the full cross-module propagation graph, insight
  firing/silence, CSV round-trips, v22→v23 additive migration and repair semantics, and a
  JSDOM + axe-clean list/detail/dialog workflow. A latent engine defect was fixed along the way:
  `finiteNumber(null)` previously coerced a missing reservation price to `0`, manufacturing fake
  ZOPA gaps after normalization.
- **Candidate retention review (Schema v18).** `settings.candidateRetentionDays` (default 180, `0`
  disables) drives a new `retentionReview` that lists candidate records past the window on `#/hiring`
  and raises signal `HIRE-08`. It is a *reminder*: nothing is deleted automatically, a candidate still
  in play on an open role is never flagged, a record marked "keep in touch" is listed as an exemption
  rather than silently skipped, a record with no dates is reported as unknown age, and deletion stays
  an explicit, audited action that also removes the evidence and graph edges.
- **Structural accessibility audit** (`tests/app/access-audit.test.mjs`, 12 tests): one `h1` per
  screen with no skipped heading levels, an accessible name on every interactive control (glyph-only
  buttons rejected), captioned tables with `scope`d headers and no empty header cells, landmark
  structure and skip link, dialog focus trap and restoration, and live-region announcements — on top
  of axe-core reporting zero violations across the three newest modules and their detail screens.
- **Large-workspace validation** (`tests/app/scale.test.mjs`, 5 tests): a 120-person / 240-goal /
  300-case / 180-item / 40-role / 320-candidate workspace with 900 typed edges is normalized,
  analysed, exported through all 19 CSV scopes, and rendered; every edge resolves at both ends and a
  second normalization is a no-op. Measured timings are printed so a regression is a number, not just
  a failure.
- An optional `caption` on the shared `table()` component, rendered as a visually hidden `<caption>`
  so a screen-reader user hears what a table is for before hearing its headers.

### Changed
- **Dependencies:** `next` 16.2.6 → **16.4.3**, `postcss` 8.5.8 → **8.5.31**, `eslint-config-next`
  16.2.6 → 16.4.3, `drizzle-kit` 0.31.10 → 0.31.11. `npm audit --omit=dev` goes from *1 critical,
  2 high* to **0 vulnerabilities** (11 Next advisories, including unauthenticated RCE in the Image
  Optimization API, plus PostCSS and sharp/libvips chains). The four remaining moderate advisories are
  a dev-only `drizzle-kit → esbuild 0.18.20` chain whose advisory is about a development server this
  repository never runs; the offered fix is a breaking downgrade of the migration CLI, so it was
  declined and documented instead of applied by force.
- `confirmDialog` now returns a promise and supports both call shapes (see Fixed).
- `openModal` restores focus to `main#view` when the trigger was re-rendered away, instead of dropping
  focus on `<body>`.

### Fixed
- **Destructive confirmations did not wait for an answer.** `confirmDialog` was callback-based, but
  cases, capacity and hiring used `await confirmDialog(...)` and treated the result as a boolean. The
  returned modal handle is truthy, so the record was deleted the instant the button was clicked,
  leaving a confirmation dialog on screen that could no longer change anything — and in the cases
  module the dialog had *no text*, because the caller passed `body:` while the primitive rendered
  `message:`. The promise now resolves only when the dialog closes (`true` on confirm, `false` on
  cancel, Escape, the close button or a backdrop click), `onConfirm` still fires for the
  callback-shaped callers, and `message ?? body` is rendered.
- **Two uncaptioned tables in `#/capacity`** (funding decisions, target-risk forecast) had no
  accessible name; both now carry a caption, and the shared helper supports one.
- **A typo could switch the retention reminder off.** A negative or non-numeric
  `candidateRetentionDays` was clamped to `0`, which means "off"; it now falls back to the default,
  because the safe failure direction for a privacy reminder is on.
- **O(roles × candidates) scans** in `hiringSummary` and the `hiring` CSV scope — the full candidate
  list was filtered inside the per-role loop, which is 1.5 M comparisons at 300 roles × 5,000
  candidates and ran on every render of `#/hiring`, `#/today` and the signals panel. Both now index
  candidates by role once.
- Focus lost to `<body>` after closing a dialog whose trigger a re-render had replaced.

## [Session 26] Selection & hiring (Schema v17)

### Added
- **Selection & hiring (Schema v17).** A new module at `#/hiring` treats hiring as a measurement
  problem with a decision at the end, not a pipeline with a score. A **requisition** records what the
  role must be able to do, who will interview, and (optionally) the three-point interview effort it
  consumes. A **candidate** record holds the evidence collected and the decision — and no protected
  characteristics.
  - Evidence is weighted by the method used, using Sackett et al.'s (2022) re-analysis of the
    personnel-selection meta-analyses (structured interviews `.42`, job-knowledge tests `.40`, work
    samples `.33`, cognitive ability `.31`, unstructured conversations `.19`, years of experience
    `.07`). Weights are combined in log-odds and converted back once.
  - Correlated evidence is discounted rather than double-counted: a repeat rating of the same
    competency by a different interviewer counts ×0.5, by the same interviewer ×0.25. A 3/5 rating is
    genuinely neutral. Rater disagreement of 3+ points on a competency is surfaced with an
    instruction instead of being averaged away.
  - Every assessment carries a **falsification test** ("how many strong contrary observations would
    cross the 50% line") and is labelled decision support, never a prediction. The offer gate is an
    explicit *convention* (evidence weight ≥ 0.50, ≥ 2 methods, all required competencies covered),
    and proceeding without it requires a recorded acknowledgement.
  - Funnel with conversion rates, a cycle-time figure withheld below two completed hires, and a cost
    of vacancy reported only from a daily figure the leader recorded — otherwise the delay is shown
    as unpriced rather than derived from a salary band.
  - **Process fairness without special-category data**: the same competencies assessed for everyone
    who reached the same stage, with uneven coverage reported as a finding.
- **Cross-module automation (`RULE-HIRE-01`..`03`), inside the existing event engine.**
  `RULE-HIRE-01` registers a requisition's recorded interview effort as a committed `hiring` capacity
  item, refreshes it in place, completes it as delivered when the seat is filled and releases it when
  the role is held or cancelled. `RULE-HIRE-02` turns an accepted offer into a roster record, a
  new-hire 30-60-90 plan with standard checkpoints, three typed graph edges
  (`candidate → requisition`, `requisition → person`, `person → onboarding`) and a completed
  interview reserve — in one transaction. `RULE-HIRE-03` escalates a role that has not moved for
  `hiringStallDays` (default 30) through the shared escalation path, so the resulting operational case
  arrives with FMEA, financial PERT fields, a stakeholder coalition, a DACI decision and an
  accountable delegation already attached; it fires at most once per role, even if that case is later
  closed.
- Signals `HIRE-02`–`HIRE-07` (stalled roles, target-date slippage, roles with no competencies,
  interview effort missing from the plan, final-round decisions short on evidence, uneven process
  coverage), a `#/today` hiring card, three hiring conventions in Settings, and a `hiring` CSV scope
  flagged sensitive because it contains named candidate data.
- Demo workspace now includes two live roles, one filled role, four candidates with real evidence
  (including one deliberately thin and one rejected with a written rationale), and the capacity
  reserve the rules engine would have created.

### Fixed
- Two new tables rendered an empty header cell, which `axe-core` reports as `empty-table-header`;
  both now carry a screen-reader label.

### Notes
- The first draft of this module used Schmidt & Hunter's (1998) validity table and had the
  unstructured-interview figure wrong (`.18`, which is years of experience; the 1998 value is `.38`).
  Retrieving the current literature then showed that table has been superseded: Sackett et al. (2022)
  revised every estimate downward and reordered them. The coefficients, the evidence floor and one
  UI claim ("a work sample is the highest-validity signal") were all corrected before release. See
  `RESEARCH.md` §36.

### Added
- **Team capacity, flow and portfolio allocation (Schema v16).** The app can now answer the
  question every other module assumed away: *can the people I have actually deliver what is
  committed, and what has to give?* `#/capacity` shows supply built from focused hours with a
  transition ramp and an explicit operational reserve, demand separated into **committed**,
  **requested-but-undecided** and **unestimated** work, a utilisation band (slack / healthy /
  elevated / overloaded / infeasible) with the slack or deficit in person-days, and the named
  bottleneck. Flow is modelled, not guessed: **Little's Law** gives WIP, throughput and cycle time
  from delivered items only, and the app refuses to state a rate below two completions; **Kingman's
  diffusion approximation** turns current utilisation into a queue-delay multiplier so the cost of
  over-committing is visible before it is paid. Each plan item carries a three-point PERT effort and
  value, so the view ranks by **value density**, marks the marginal funding boundary, proposes the
  lowest-value-density items to release, and forecasts a cumulative P50/P80/P90 date range with
  per-target risk instead of one false-precision date.
- **Capacity is maintained by the rules engine, not by hand.** `RULE-CAP-01` gives an Operational
  Case a committed capacity reserve the moment it is registered, refreshes it when the estimate
  changes, releases it on resolution, reinstates it on reopen and removes it on delete — so diverted
  person-days are real records, not a number in a card. `RULE-CAP-02` opens exactly one trade-off
  decision when the plan exceeds 100% utilisation, with the numbers and concrete options including
  the cheapest item to defer by name. `RULE-CAP-03` records a check-in on a goal when the work
  funding it is deferred or cut (and the follow-up when it is re-funded), while funding *new* work
  writes nothing. Five new signals (`CAP-01`..`CAP-05`) cover over-commitment, queue delay, an
  undecided backlog, unestimated work, and a plan whose targets are already unreachable.
- **Operating surface.** `#/capacity` (nav badge, Today attention card), add/edit work dialog,
  a DACI trade-off dialog and a release-with-reason dialog; per-person load bars, an approximate
  utilisation trend reconstructed from item lifespans, the active-rule card, capacity settings, and
  a new `portfolio` CSV export scope (18 total) that is formula-injection safe.

### Changed
- Schema **v16**: adds `state.portfolio` plus four planning conventions. The v15→v16 migration
  creates an empty ledger and **invents no effort or value**; open cases with recorded capacity days
  still count as implicit reserves at read time.
- `deleteCase` now also removes the case's capacity reserve; `reopenCase` reinstates it.
- README, ROADMAP, RESEARCH (§34), FEATURES and the session-24 audit document record the new layer
  and its honest limits (manager-entered estimates, an approximate trend, no real-browser
  verification in this container).

### Added in earlier sessions (Sessions 1–23)
- **Internal role-transition 30-60-90 plans (Schema v10).** A 30-60-90 plan now records what kind of
  transition it is — `new-hire` or `role-transition` — and, for transitions, a required label naming the
  new scope ("Team Lead · Platform"). A tenured person promoted or moved into a new role gets the same
  scaffolding as a joiner (role clarity, peer buddy, stakeholder introductions, early win, Day 30/60/90
  check-ins and the Day 90 completion gate), but with transition-specific starter checkpoints: agree the
  old-role **handover inventory**, write down how the new role differs, deliver a first early win *in the
  new seat*, and hold an explicit 60-day **old-habits calibration**. The plan is anchored to the day the
  new role starts and can never precede the day the person joined; `person.startDate` and tenure are never
  rewritten, so joiner-only signals (`ONB-01`, `ONB-02`) stay truthful while `ONB-03`–`ONB-05` name the
  transition. The plan dialog defaults a tenured person to a transition anchored to today; `#/onboarding`
  becomes *"Onboarding & transitions"* with per-kind counts and badges; person pages, 1:1 agendas, prep
  sheets, timelines and the `onboarding`/`actions` CSV scopes all carry the kind (formula-safe
  `plan_kind`/`plan_label` columns). Pre-v10 plans migrate as `new-hire` with no invented label, and an
  existing plan can be reclassified in place without losing checkpoints, check-ins or history.
- **Development-commitment ledger (Schema v9).** A GROW "will" action is no longer a checkbox with a
  date. Each commitment can be closed in a review, **carried forward** with a new date (the original
  stays as history and the successor keeps the first-agreed date, so "carried 2× since 14 Sep" is
  derived from the chain rather than stored), or **dropped with a mandatory reason**. Dropped is never
  counted as done and leaves the completion denominator, so moving a date cannot read as progress.
  A corrupted chain — orphaned successor, missing back-reference, cycle — is repaired by reopening the
  promise with a warning instead of losing it.
- **Development reviews as records, not edits.** *Hold review* captures the date, what was actually
  discussed, the outcome for every live commitment (done / still open / carried / dropped) and the next
  date agreed. Pushing `reviewOn` without holding a review increments `reviewDeferrals` and stamps
  `reviewMovedOn` instead of silently rescheduling; holding one resets both and sets the plan date to
  the agreed next review.
- **Two new signals.** `GROW-06` fires when one commitment has been carried two or more times (the GROW
  equivalent of `CONV-06`), and `GROW-07` fires when a review date has been moved twice without a review
  being held. Both name the person, carry the dates as evidence and one action.
- **Follow-through surfaces.** `#/growth` gains live commitments with carry badges, overdue dates,
  per-commitment **Carry** / **Drop** buttons, an expandable record of closed and moved commitments, a
  review log with what each review settled, and **Hold review**; person pages show carried work and where
  the review stands; Today's loose ends name the person whose review is overdue and flag commitments
  carried twice. The `actions` CSV adds `state`, `carried_forward_count` and `first_agreed_on` to GROW
  rows, and the `growthPlans` scope adds `will_open`, `will_carried`, `will_dropped`, `reviews_held`,
  `last_reviewed_on` and `review_deferrals`.
- **Dated snapshots rewind the development ledger too.** A commitment completed, dropped or carried
  after a snapshot date is shown as it was at that date, a successor agreed later is withheld, and a
  review recorded later is excluded with `reviewOn` left `null` and the growth dimension marked
  `approximate` rather than reconstructed.
- **Demo.** Mei's plan now exercises every state: one commitment carried twice and still open, one
  carried once and late, one closed in a review, one dropped with a reason, and a review date moved
  twice since the last review was held.

- **Commitment ownership (Schema v8).** Every 1:1 action now records who owes it — `them`,
  `leader` or `shared` — or stays explicitly unrecorded, which the board counts rather than
  guessing. A promise carried into a later 1:1 keeps its owner; reassigning one is a separate,
  audited action (`oneonone.action.owner`) that refuses closed promises and already-carried
  originals. The actions CSV carries a truthful `owner` column (blank when unrecorded, absent for
  GROW commitments) and the printable prep sheet marks who owes each promise.
- **A private "What you owe" list.** Today gains a card listing the leader's own open promises with
  a one-click Done and a 1:1 shortcut; the 1:1 board gains an "I owe" stat and an inline owner
  select (accented when the promise is the leader's). Signal `CONV-07` fires per person when the
  leader is late on a promise they own, at severity 3 — or 4 when one person is waiting on more
  than one.
- **1:1 follow-through ledger (Schema v7).** Logging a 1:1 now opens with the previous meeting's
  open promises and records an explicit outcome for each: done in this conversation, still open,
  carried forward with a new date, or dropped with a reason. The original action keeps a link to
  its successor, carry depth and "first agreed" are derived from the chain, and a broken, backward
  or cyclic link reopens the promise with a warning instead of losing it. Visible in the 1:1
  dialog, the 1:1 board (`#/oneonones` — follow-through stats, "Up next", "Commitments that keep
  moving", carried badges and a per-meeting ledger), the person page, the printable prep sheet and
  the `actions` / `oneOnOnes` CSV exports. Adds signal `CONV-06` (a promise carried at least twice)
  and a "N promises closed in a 1:1" win.
- Canonical zero-build leadership workspace with roster, 1:1s, SBI feedback, goals, GROW,
  anonymous pulse, decisions, recognition, succession, health and traceable signals.
- Feedback observation dates, configurable observation-to-conversation latency, `FB-06`, and
  date correction that leaves missing values explicitly unmeasured.
- Tri-state goal co-authorship with editable co-authored/leader-set/unknown context and explicit `GOAL-06`.
- Outcome delegation with decision authority, support, due dates, dated check-ins, completion,
  return-to-leader history, `DEL-01`…`DEL-03`, 1:1 agenda integration and a dedicated route.
- Evidence-linked performance-review packets with employee reflection, manager assessment,
  optional anchored ratings, calibration warnings, source drill-down and print/save-PDF.
  Packets now include feedback latency, goal authorship and dated delegation outcomes.
- Schema v2/v3 migrations, review/delegation export/import, frozen completion snapshots and audit events.
- 113 canonical domain, persistence and jsdom UI integration tests (`npm test`).

### Changed
- `CONV-05` now reports only commitments the team owes. Overdue promises the leader owns are
  reported by `CONV-07`, so one overdue record no longer produces two findings.
- CSV exports no longer carry a fabricated `owner` column for GROW, feedback and onboarding
  commitments: the app never recorded an owner there. The
  one-on-ones export reports `carried_in` / `carried_out` instead of the ambiguous
  `carried_forward`, and the actions export adds `state`, `carried_forward_count`,
  `first_agreed_on` and `confirmed_in_meeting`.
- Historical health snapshots rewind completions, drops and carry links together, so a trend can
  no longer show a promise as closed before the meeting that closed it.

### Fixed
- Key-result dialogs now write to the goal that opened them and missing goals fail explicitly.
- Development-plan editing preserves plan identity, options and commitments.
- Development overdue counts use the injected clock for deterministic results.
- Goal authorship editing preserves goal identity, key results and check-ins; missing goals fail explicitly.
- Delegation chronology is validated before writes, and later same-day check-ins correctly supersede
  an earlier blocked state without erasing the overdue fact.
- Demo cleanup removes delegations attached to fabricated people while preserving real-person work.
- The 1:1 board's promise table had an unlabelled action column (axe `empty-table-header`); it is
  now labelled "Actions".
- A hand-edited or future-version `owner` value is cleared and reported
  (`1:1s: cleared N unrecognised commitment owner(s)`) instead of being coerced into a plausible
  owner.

### Security
- Anonymous pulse answers and upward feedback about the manager are excluded from review
  evidence. Review source routes are normalized to local fragments on import.
- Legacy Next.js/PostCSS/Sharp advisories remain documented; the canonical app does not load
  that dependency chain and no forced major legacy upgrade was applied.

## [0.1.0] - 2026-01-01

First documented, verifiable release.

### Added
- `leads` and `score_events` tables (`src/db/schema.ts`).
- Rule-based lead scoring, `rule-v1` (`src/lib/scoring.ts`): additive, fully explainable, no ML.
- Lead API: create/list/filter (`src/app/api/leads/route.ts`), get/update/delete by id
  (`src/app/api/leads/[id]/route.ts`), force rescoring (`src/app/api/leads/[id]/score/route.ts`).
- Dashboard at `/` to add leads, view scores with breakdown tooltip, and record a
  qualify/disqualify/contacted/converted decision (`src/app/page.tsx`,
  `src/components/LeadBoard.tsx`).
- Health check endpoint reporting DB connectivity and app version
  (`src/app/api/health/route.ts`).
- Seed script with four sample leads for onboarding (`scripts/seed.ts`, `npm run seed`).
- Full Diátaxis documentation set under `docs/` (tutorial, how-to guides, reference, explanation),
  tied together by `docs/INDEX.md`.
- Release engineering: `docs/RELEASING.md`, `docs/ROLLBACK.md`,
  `.github/workflows/release.yml`, `.github/workflows/ci.yml`.
- Deployment: single canonical Docker path, `Dockerfile`, `deploy-production.sh`,
  `docs/DEPLOYMENT.md`.
- Governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/adr/` with ADR-0001 and ADR-0002,
  `docs/MAINTAINER-RUNBOOK.md`.
- Dependency-free docs link checker (`scripts/check-docs-links.mjs`), wired into
  `npm run verify` and CI.

### Changed
- Renamed the project from the scaffold name "Arena Next.js PostgreSQL Starter" to **LEADOS**
  across `package.json`, `src/app/layout.tsx`, `src/app/page.tsx`, and an internal global variable
  in `src/db/index.ts`. See `docs/CONSISTENCY-SWEEP.md` item C-1.
- `/api/health` now also reports `service` and `version` fields, not just `ok`.

### Known gaps (tracked, not hidden)
- No authentication/authorization anywhere in the app.
- No multi-tenancy; single shared table for all leads.
- No automated tests, coverage, or mutation-testing reports.
- No realtime transport; the dashboard only refetches after actions it took itself.
- No fairness-auditing tooling, because there is no learned model to audit.
