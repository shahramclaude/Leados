# ROADMAP

Living document. Status is per capability, not per file. Every "Done" line was verified
by an automated test or a measured run in the session that claimed it; anything else is
marked `[UNVERIFIED]` and is not counted as done.

## Session 54 — 2026-10-27: Premise Sensor Calibration Loop (Schema v36, RULE-PREM-05)

**Shipped:** `#/premises?tab=calibration` closes the assumption-sensing feedback loop with a dated, append-only, human-assessed outcome ledger (`held`, `failed`, `inconclusive`). Only one conclusive label is allowed per premise; historical premises stay unlabelled. `RULE-PREM-05` atomically links the outcome node to its premise (`validates`) and source decision (`revisits`) on the generalized post-commit spine. A pure read model scores sensor evidence against the later assessment using Brier score, mean implied probability vs. held rate, calibration gap and 50%-threshold directional accuracy. It counts one sample per sensor/premise, collapses repeated records from one typed source to the latest state before settlement, and excludes evidence recorded after the outcome. Performance stays counts-only below five outcomes; PSI forecast-mix shift requires ten earlier and ten recent outcomes split only at distinct settlement dates. No likelihood ratio is auto-tuned.

Also shipped: outcome capture dialog; validated append-only API; additive v35→v36 schema migration; typed graph entity/relation; point-in-time outcome filtering; demo-clear foreign-key repair; opaque CSV scope #36; calibration tab and action integration; standalone HTML rebuilt at schema v36; ADR-0020.

**Benchmark chased:** current market materials show adjacent pieces, not the full feedback loop in one leader-owned surface: Culture Amp's People Science-backed AI Coach drafts manager reviews and conversation scripts while leaving decisions with the manager [1](https://www.cultureamp.com/platform/perform); Dataiku's 2026 Decision Intelligence overview describes outcome-fed rule/model recalibration [2](https://www.dataiku.com/blog/decision-intelligence-platforms); Metaculus scores forecasts after outcome resolution and emphasizes calibration over many resolved questions [3](https://www.metaculus.com/faq/) [4](https://www.metaculus.com/notebooks/22486/22486/a-primer-on-the-metaculus-scoring-rule/). LeadOS adapts proper scoring to typed operational evidence without making employee ratings or allowing a sensor to grade itself. Product pages/search excerpts reviewed; hands-on comparison remains **[UNVERIFIED]**. Frameworks: Brier proper scoring, calibration gap/reliability, PSI distribution shift; all caveats visible.

**Cross-module links:** human outcome → premise node (`validates`) → decision context (`revisits`); `premise.outcome` event → `RULE-PREM-05` via shared post-commit registry; outcome plus pre-settlement typed evidence → per-sensor read model; premise outcomes → point-in-time/health reconstruction; CSV #36 exports opaque premise IDs and numeric telemetry only. Existing breach chain still runs premise sensing → DACI re-decision/delegation/1:1 → Decision Tempo.

**Verification:** 31/31 `tests/app/premises.test.mjs` pass, including hand-checked Brier and calibration gap, one-source/multiple-observation collapse, prevention of post-outcome leakage, counts-only floor, date-separated PSI cohorts (same-day boundary refusal), corrupt/orphan/duplicate outcome normalization, migration, immutable human action, typed cross-module links, opaque CSV, demo-clear, as-of reconstruction, UI+axe and outcome-dialog interaction. Full `npm run verify:canonical` exit 0: ESLint clean; boundary 119 app ES modules / 54 suites / 0 quarantined-tree or network leaks; 142 internal documentation links; **856/856 canonical tests pass**. `npm run verify:standalone`: **7/7 pass**; artifact 2,529,823 bytes, 119 modules, schema v36, SHA-256 `192d3065eec1db27bd70a90b4fc68f51efa7f2ab37d1d710f99e66b672a4cf01`.

**Known limits:** implied probabilities are derived from declared LR using a neutral prior solely to score directional strength; this does not calibrate the LR itself. Outcomes are leader-assessed, may be selectively recorded, and cross-sensor/incidence correlation remains unresolved. PSI describes input forecast-mix shift, not model degradation or causal change. No real-browser/screen-reader session or vendor hands-on trial this session (**[UNVERIFIED]**).

**Deliberately rejected:** automatic LR tuning on sparse local outcomes (dependence and false confidence); LLM/sentiment truth labels (privacy and governance); cross-person sensor rankings (risk of repurposing into employee ratings).

**Next priorities (Top 3):**
1. **Correlated-evidence clustering:** detect distinct sensors and records describing one incident; avoid pseudo-replication while retaining conflict labels.
2. **Uncertainty-aware LR calibration proposals:** only after adequate settled cohorts, show a shrinkage proposal with time-separated backtest and leader approval; no auto-write.
3. **Assumption-aware scenario tails:** let fragile premise uncertainty widen seeded P80/P90 delivery and cash-risk scenarios without treating belief as actuarial frequency.

---

## Session 55 — 2026-10-28: Assumption-Aware Scenario Tails + Correlated-Evidence Clustering (TAIL-01..03, CSV #37, Schema v36 derived)

**Shipped:** `#/premises?tab=tails`. New pure engine `app/core/domain/premiseTails.js` couples every evidenced, non-retired premise through the Sentinel's two-hop typed graph to measured committed portfolio work, then runs a **paired seeded Monte Carlo** (Law & Kelton Common Random Numbers: identical Beta-PERT draws with/without premise failure) reporting baseline vs coupled P50/P80/P90 + overload risk. **Leave-one-out attribution** (hold one premise true, same seed) ranks which assumption owns the tail. Failure shocks are labelled conventions (+60% load-bearing/+40% major/+25% monitor effort on failure, ×3 cap/item). **Correlated-evidence clustering** groups observations by typed source (`sourceType:sourceId`); one source carrying >50% of discounted weight is flagged pseudo-replicated (TAIL-03) — the posterior is surfaced, never silently rewritten. TAIL-01 (P90 widening ≥15%), TAIL-02 (single dominant assumption) and TAIL-03 merge into Insights; a deterministic tail brief downloads from the tab; CSV scope #37 exports opaque codes/numerics only. **No schema change (v36), no migration, no dependency, no network.**

**Benchmark chased:** practitioner scenario-simulation guidance asks exactly for this — find the runs that miss, identify which assumptions drive the misses, rerun with each assumption held at its most likely value and rank by odds moved [3](https://profmarkprice.substack.com/p/stop-planning-for-one-future); Monte Carlo guidance stresses tails outside distributional assumptions need explicit stress, not wider normals [1](https://www.farseer.com/blog/what-is-monte-carlo-analysis-and-how-does-it-work/) [2](https://stackrundown.com/advanced-scenario-modeling-with-ai/); forecast-aggregation research shows summing log-odds over correlated signals double-counts shared information [1](https://arxiv.org/html/2604.24517v1). No surveyed tool couples a live assumption ledger's posterior into a paired delivery-tail simulation with per-assumption attribution. Vendor/practitioner claims are search excerpts, **[UNVERIFIED] by hands-on trial**. Frameworks: Dewar ABP, Law & Kelton CRN, Beta-PERT, leave-one-out/Shapley-lite attribution, pseudo-replication (Hurlbert) via source clustering.

**Cross-module links:** premise →(two-hop typed graph)→ portfolio items (simulation coupling); premises → Insights (TAIL-01..03); tails → CSV #37; Assumption Ledger tab + downloadable brief reuse the same derived report. Existing chain untouched: premise breach → DACI re-decision/delegation/1:1 → Decision Tempo.

**Verification:** `tests/app/premise-tails.test.mjs` 8/8 (hand-checked 43.75% posterior → 56.25% failure stress; seeded determinism; coupled P90 ≥ baseline; unmeasured exclusion; cluster math; signals+Insights; CSV opacity; JSDOM+axe tails tab). Full gate **864/864** (856 baseline + 8; 11 hardcoded CSV-scope counts updated 36→37), standalone 7/7 rebuilt (SHA b336c2c016b1de15…). Real-browser/spoken-SR **[UNVERIFIED]**.

**Known limits:** shocks/LR-derived failure weights are conventions, not calibrated loss rates; LOO reruns share the seed but failure-draw consumption shifts the stream (attribution is paired in effort draws, approximate in failure draws); demo premises have no portfolio scope link, so demo shows the honest exclusion state.

**Deliberately rejected:** actuarial failure frequencies from sparse local outcomes; silently de-duplicating the posterior; LLM-estimated shocks.

**Next priorities (Top 3):**
1. **Uncertainty-aware LR calibration proposals** (adequate settled cohorts, shrinkage + time-separated backtest, leader-approved, no auto-write).
2. **Cash-tail coupling:** premise failure shocks on Finance runway/budget Monte Carlo, currencies never summed.
3. **Assumption-held-true scenario levers:** one-click "hold premise true / force failure" levers inside `#/scenarios` comparison + Pareto frontier.

---



## Session 53 — 2026-10-27: Premise Sentinel / Assumption Ledger (RULE-PREM-01..04, Schema v35)

**Shipped:** `#/premises`. A first-class, local-first **decision-continuity ledger**:
pre-register a load-bearing assumption with a DACI decision anchor, signpost owner,
falsification signpost, Cromwell-clamped prior (5–95%), watch/breach thresholds,
evidence half-life and typed evidence sources. An eight-sensor declarative registry
reads dated facts from cases, stakeholders, dependencies, budgets, portfolio actuals,
forecast challenges, reviewed decision outcomes and cognitive-load bands; a two-hop
typed graph walk scopes evidence automatically. Bayesian log-odds, half-life-discounted
likelihood ratios, Wald-style SPRT support/challenge boundaries and KL information gain
produce a confidence-labelled posterior. A fresh breach declares `decisionTempo` on the
same generalized event and atomically opens exactly one four-option DACI re-decision
(hedge / pause / reverse / buy information), one owner verification delegation, one
blameless 1:1 prompt, typed links (including inherited priced context), audit events,
`PREM-01..05` signals, a Today card, a nav badge, an opaque CSV scope #35, a board
brief and a review-cycle-governed human reaffirmation path. Pausing governance never
pauses sensing; an explicit scan always runs. Schema v34 → v35 is additive with
normalization, rewind and `clearDemo()` pointer repair.

**Benchmark chased:** 2026 Gartner/IDC decision-intelligence platforms model, execute,
monitor and govern closed-loop decisions [2](https://www.gartner.com/en/documents/7363830) [3](https://www.sas.com/content/dam/sasdam/documents/2026-09/idc-marketscape-worldwide-decision-intelligence-platforms-2026-vendor-assessment.pdf); assumption-ledger proposals ask for
premise, dated evidence, owner, invalidation signal and predefined response [1](https://www.business-powerhouse.com/ai-agents-need-an-assumption-ledger-before-strategy-moves-at-machine-speed); continuous-assurance research asks for drift/calibration
thresholds, human review and rollback [1](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1870819/full); OKR/strategy tools flag at-risk goals and automate QBR
briefs [12](https://www.okrstool.com/blog/best-okr-software). No surveyed product combined
a local-first assumption ledger with deterministic, typed, cross-module re-decision
automation. Vendor claims are search excerpts, **[UNVERIFIED] by hands-on trial**.
Named theory: Dewar et al. RAND ABP, Bayes/Good weight of evidence, Wald SPRT,
Kullback–Leibler, Mitchell/Russo/Pennington prospective hindsight, Kahneman/Klein
pre-mortem, Reinertsen CD3 via Decision Tempo, AIAG-VDA FMEA, Simchi-Levi TTS/TTR.

**Cross-module links:** decision → premise (`depends-on`), premise → decision (`tests`),
original → re-decision (`revisits`), owner → decision (`involves`), premise → delegation
(`tracks-followup`), case/budget/portfolio value edges inherited by the re-decision,
`RULE-PREM-03` → `RULE-DLY-03` through the `event.rules` declaration on the ADR-0008
spine; PREM signals merge into Insights; Today triage card and nav badge use the same
derived report; CSV #35 exports belief telemetry only; health/trends rewind removes
future premises and observations.

**Verification:** `tests/app/premises.test.mjs` adds 26 tests including hand-checked
43.75% posterior math, half-life 0.5 discount, Wald boundaries, two-hop scope,
unrated-FMEA refusal, corrupt normalization, rewind, clearDemo, one priced atomic
cascade (`RULE-PREM-02` + `RULE-PREM-03` + `RULE-DLY-03`), idempotency, pause/explicit
scan, human review cycles, stale-prompt self-clear, signals, CSV opacity, brief, demo
and JSDOM+axe across all four tabs plus the register dialog. Full canonical gate:
**851/851 pass, 0 fail** (825 baseline + 26 new), `npm run verify:canonical` exit 0
(ESLint clean; boundary 118 app modules / 54 suites / 0 leaks; 140 doc links);
`npm run verify:standalone` 7/7 and `LeadOS-standalone.html` rebuilt at schema v35
(118 inlined modules, 2,514,002 bytes).

**Known limits:** LRs, half-life, thresholds and SPRT boundaries are transparent
conventions, not calibrated probabilities; leadership evidence is not IID; indicative
exposure is not a cash forecast; a premise with no scoped evidence is `unobserved`;
large-workspace real-browser performance and spoken screen-reader output remain
**[UNVERIFIED]**.

**Next priorities (Top 3):**
1. **Sensor LR calibration ledger:** score reviewed premises against realised outcomes,
   report per-sensor reliability and Brier/PSI drift with counts-only floors, then let
   leaders tune LRs from their own evidence instead of conventions.
2. **Clustered evidence / contradiction handling:** detect multiple sensors describing
   the same incident, avoid double-counting correlated evidence, and preserve
   contradictory facts as classified conflicts rather than averaging them away.
3. **Assumption-aware scenario simulation:** feed premise posteriors and breach
   probabilities into `#/scenarios` and `#/capacity` seeded Monte Carlo so a fragile
   assumption widens P80/P90 delivery and cash tail risk before the breach fires.

---

## Session 52 — 2026-10-27: Cognitive Load & Attention Governor (RULE-LOAD-01..04, Schema v34)

**Shipped:** `#/load`. The person-side constraint finally has a terminal next to the
work-side planners. A fully derived per-role saturation index blends intrinsic utilization
(0.40), WIP switching (0.25), extraneous coordination (0.20: strong-tie degree, reports,
stewardships) and open commitments (0.15) into five bands with a leader-owned saturation
threshold (default 80); a seeded Beta-PERT Monte Carlo gives a reproducible per-person
overload probability against ramp-adjusted supply (unmeasured commitments counted, never
sampled as zero); per-person Little's Law and Kingman expected wait use recorded completions
with counts-only/provisional/high evidence floors and an explicit unstable state at ρ≥1;
germane (learning) load is flagged and protected rather than scored. Four event-driven rules
on the generalized spine: one four-option DACI load-shedding decision with typed links
(priced by Decision Tempo in the same transaction), self-clearing WIP and commitment-size
talking points, and a manager-routed ramp-protection prompt — all marker-idempotent,
pauseable, with an explicit human scan that always runs. CSV scope #34 emits opaque person
codes only. ADR-0018, RESEARCH §60.

**Benchmark chased:** the 2026 market offers hour-booking heatmaps (Toggl 2.0, Float,
Asana), predictive scheduling (Teamwork AI Smart Scheduler, Runn), utilization suites
(Productive, Visier/One Model) and surveillance-derived collaboration analytics (Viva
Insights). None separates intrinsic/extraneous/germane load, models per-person queueing
damage, or runs deterministic on-device governance over the leader's own records
[UNVERIFIED against hands-on trials — search excerpts only]. Frameworks: Sweller cognitive
load, Skelton & Pais Team Topologies (2nd ed. 2025), Little, Kingman (1961), Anderson Kanban,
Brooks's Law, Goldratt TOC; Reinertsen CD3 reused via the existing tempo engine.

**Cross-module links:** person/portfolio → DACI decision (`involves`/`decides`,
RULE-LOAD-01); person 1:1 talking points (RULE-LOAD-02/03/04, routed to in-roster manager
for ramp protection); portfolio/delegation/dependency/person events trigger the rule through
the ADR-0008 prefix/exact trigger set; LOAD-01..05 into Signals/Insights; coordination
reuses the Influence Network projection; supply reuses Capacity's `personSupply` and
onboarding ramps; nav attention badge from the live report.

**Verification:** full gate **825/825** (802 baseline + 23 new in
`tests/app/load.test.mjs`, including hand-checked Kingman math, real-store cascades,
self-clear/idempotence/pause, marker normalization survival, CSV opacity and JSDOM+axe over
all four tabs). A mid-session Capacity regression (CAP-02 silenced when demo additions
pushed team ρ≥1.0) was caught by the existing suite and fixed by removing fabricated demo
work in favour of a visible threshold policy — no test was weakened.

**Known limits:** weights/thresholds/c=1 are transparent conventions, not validated team
constants; throughput is item-count based (effort-weighted flow deferred); coordination
needs ≥2 affiliated people; workspaces without recorded completions stay honestly
counts-only; no real-browser/screen-reader verification this session [UNVERIFIED].

## Session 51 — 2026-10-27: Allocation Governor (RULE-ALLOC-01..04, Schema v33)

**Shipped:** `#/allocation`. The operating plan now learns where the next person-day should
go. Every portfolio item carries an ambition horizon (core / adjacent / exploratory, or
honestly unclassified); settled delivery actuals teach per-currency UCB1 arms what each horizon
returns per person-day; the exploratory share of recently funded classified effort is measured
against a leader-owned floor, and a breach opens exactly one DACI rebalancing decision. Funded
bets get learning-checkpoint prompts, deliveries without actuals get an evidence-closure
delegation, unclassified funded work gets a self-clearing classification prompt. CSV scope #33,
ALLOC-01..05 signals, deterministic board brief, pause switch from day one. ADR-0017,
RESEARCH §59.

**Also fixed (verified defects from the Session 50 audit):** blank FMEA ratings persist as
`null` through `addCase`, `updateCase` and the normalizer — "Rating needed" replaces the
fabricated 5/5/5 RPN in list, detail and dialog (closes Next #4; historical stored ratings
untouched). `store.lastPropagations` is now assigned after every committed mutation, so the
ten action results that read it report real propagations (closes Next #5d).

**Benchmark chased:** the October-2026 market ships copilots, attrition prediction and
narrative dashboards; nobody ships a learning allocation governor over a single leader's own
settled evidence [UNVERIFIED against hands-on trials]. See RESEARCH §59 — March (1991),
Nagji & Tuff (2012), Auer et al. (2002), plus fresh vendor findings (Visier Vee, Workday
Illuminate/Skills Ontology, Phenom+Included agentic people analytics, Dot/ThoughtSpot
decision-intelligence surfaces, EU AI Act audit-trail pressure).

**Cross-module links:** portfolio → DACI decision (`decides`, RULE-ALLOC-01; priced by
Decision Tempo in the same transaction because the Governor runs before it on the spine);
decision → candidate bets (`funds`); portfolio → evidence-closure delegation
(`tracks-followup`, RULE-ALLOC-03); owner 1:1 talking points (RULE-ALLOC-02/04); capacity
dialog horizon selector; ALLOC-01..05 into Signals; comms readiness now able to flag
genuinely unrated cases.

**Verification:** full canonical gate and test counts recorded in AI-SESSION-LOG (Session 51).
17 new tests in `tests/app/allocation.test.mjs` including an independently recomputed UCB
value, store-level cascades, schema/FMEA repairs and a DOM/axe pass over all four tabs.

**Known limits:** rewards assume within-currency comparability over time (no inflation or
risk adjustment); a single huge settlement can dominate a small arm (median shown beside the
mean); the 10% floor is a strategy-research convention, not a validated team constant; case
automation cascades still use `computeFmea` defaults internally for unrated cases (v33
removed the storage coercion and the visible claim; teaching every case rule to reason about
unknown priority is deliberately separate — see Next #4 below).

## 2026-10-27 — Automation assurance & transactional rehearsal

**Implemented:** `#/assurance`, shortest relationship evidence trails (BFS), rule provenance,
privacy-filtered link diagnostics, downloadable assurance brief, sandbox case-event replay with
per-rule savepoint trace, explicit live refresh, and isolated post-commit rollback with buffered
success logs. Nine focused regressions include real-store fan-out and injected rule failure.
No new network calls, dependencies or persisted entities.

**New competitive gap:** Aera's Decision Intelligence Network and Orgvue's October 2026
WebMCP announcement make visible, auditable control points a stronger benchmark than another
flat scorecard (fresh links in RESEARCH.md). LeadOS now exposes the actual rules and relationship
trail and allows rehearsal, but does not claim their AI, integration or planning capabilities.

**Next, ambitious:**
1. Move source-action case propagation into the same savepoint registry; preview the *complete*
   intake cascade, including impact/capacity rules, rather than only post-commit effects.
2. Version event payloads and frozen rule inputs for reproducible historical counterfactuals;
   today's replay deliberately uses current state, not a fictitious historical snapshot.
3. Worker-backed large-workspace rehearsal and an opt-in human-reviewed repair plan with
   preconditions/optimistic concurrency, never automatic deletion of evidence.

**Deliberately rejected:** causal blast-radius scores over arbitrary relationship edges — a
`coaches` or `funds` edge does not establish a failure dependency. Also rejected automatic graph
repair and sending drafts: neither is justified by reachability or sandbox success.

**Scope honesty:** savepoint copying is synchronous and proportional to workspace size for each
rule; very large-workspace interaction latency is [UNVERIFIED]. Historical failure counts are not
an unresolved-incident metric. Complete personal review of every legacy source file was not
finished; the canonical boundary was inspected and tested rather than pretending otherwise.

## Session 50 — 2026-10-27: Stakeholder Comms Outbox (RULE-COMMS-01..04, Schema v32)

**Shipped:** `#/comms`. Case events now produce stakeholder status briefs and closure notes as
**drafts for human approval**. Nothing is sent by the app. Each draft is built from facts recorded
on the case, carries explicit "to confirm" gaps, and is typed-linked to its case. Drafts are
superseded, never duplicated, when facts change. Closure is owed only to stakeholders who were
actually briefed.

**Audit findings (verified in the repo this session):** the previous Next list was stale (intake
and decision-delay simulation had shipped in Sessions 43/44); `index.html` build metadata
said schema 30; `store.lastPropagations` is read but never assigned (pre-existing, unfixed); FMEA
blank ratings are stored as 5; `updateCase` can resolve a case without the closure path.

**Benchmark chased:** AI status-report tools (Asana Status Reporter, Atlassian Rovo, Microsoft
Planner Agent) draft updates from live project data [UNVERIFIED against hands-on trials]. Incident
guidance says closures should be communicated to people previously informed (ITIL 4 practice
guide). The gap LeadOS closes is the ledger that connects them: who was briefed, and what that
obliges. See RESEARCH §58.

**Cross-module links:** case → comms draft (`communicates`); `RULE-COMMS-04` closes the outbox
loop from a logged stakeholder touch (`case.stakeholder.comms`); marking a brief sent moves the
stakeholder's `lastCommsOn`/`nextCommsOn`, so `RULE-STAKE-01` cadence reflects what happened;
closure follows `resolveCase` and plain status edits alike; COMMS-01..03 signals feed Signals.

**Verification:** 776/776 across 50 suites (from 754); `verify:canonical` exit 0; standalone
rebuild and `verify:standalone` 7/7; lint, boundary and docs-link gates green. JSDOM + axe for the
outbox: 4 tabs, axe-clean.

**Known limits:** FMEA 5/5/5 default cannot be distinguished from a deliberate rating; sent-by-touch
is a same-day convention, not proof of delivery; no pause switch; no CSV export; real-browser and
mobile validation `[UNVERIFIED]`.

**Next:** see the Next list below (items 4 and 5 were added this session).

---

## Session 49 — 2026-10-27: the Impact Ledger (pre-registered evaluation of the leader's own interventions, Schema v31)

**Shipped:** `#/impact`, a five-tab ledger in which a leader writes down what
they expect an intervention to do **before** they know, and the app then decides
whether the record can answer the question at all.

- **Reconstruction without telemetry** (`app/core/domain/vitals.js`): twelve
  weekly metrics rebuilt from dated fields already on the records
  (`delegatedOn`/`completedOn`, `observedOn`/`date`, `openedOn`/`resolvedOn`,
  `decidedOn`, 1:1 `date`+`mood`, pulse responses, recognition dates). A bucket
  with no observation is `null`, never `0`; a closed record with no close date is
  excluded and counted, never interpolated; a metric whose log does not reach
  back far enough is trimmed at its **coverage frontier**, and a metric with no
  records of that kind at all returns an empty series with a reason instead of
  twenty-two confident zeroes.
- **Pre-registration enforced by the schema** (`app/core/domain/impact.js`,
  Schema v31 `impactStudies`): `declaredOn` is stamped by the action and never
  supplied by the caller, so the grade is *derived* — declared on or before the
  intervention date makes a study **confirmatory**, anything later makes it
  **retrospective** and permanently ineligible as confirmation. Predictive
  fields cannot be edited once the window closes; scoring freezes the evaluation
  and the report reads the frozen copy, never a live recomputation.
- **Inference that can fail**: segmented ITS with Newey–West HAC errors;
  unobserved periods **skipped rather than zero-filled** (zero-filling a
  noiseless step biased 5.00 to 5.29 and inflated SE from 0 to 0.51); a
  minimum detectable effect in the metric's own units (below it → *underpowered*,
  never "no effect"); Abadie-style in-space placebo inference with its finest
  attainable p reported and refused as a gate when it cannot reach α; in-time
  placebo distributions over fake interruption dates; and a
  Rambachan–Roth-style breakdown trend stating how much drift would erase the
  estimate.
- **A pre-intervention power planner** (`designPower`) using the metric's own
  I-MR noise and the design matrix implied by the chosen pre/post weeks — run
  live inside the declare dialog, so a leader is told *before* collecting that
  their intended effect is below their instrument's resolution.
- **Five tabs:** Vitals (series + CUSUM change-point prompts), Studies (the
  ledger), Evaluation (counterfactual, every gate, fragility bound, both placebo
  charts), Design & power (MDE grid by pre/post weeks, target-effect comparison),
  Calibration & brief (direction accuracy, Brier score, effect-size realism,
  deterministic Markdown brief, verdict glossary).
- **Atomic propagation** `RULE-IMP-01..06` on the ADR-0008 spine before
  `decisionTempoRule`: typed `evaluates`/`replicates` links and a refreshed
  derived snapshot (01), one 4-option DACI scale/stop decision for a
  *confirmatory* decisive result (02), up to two blameless mechanism-framed 1:1
  talking points when a people-facing intervention is contradicted (03), exactly
  one proposed replication of a supported confirmatory study (04), effect-size
  calibration findings (05) and pre-trend explanations (06). `IMP-01..06`
  signals feed insights, the Today triage card and the nav badge. CSV scope #32
  exports counts and verdicts only — no titles, hypotheses or notes.

**Verification:** **754/754 tests** across 49 suites (56 new in
`tests/app/impact.test.mjs`), 0 lint errors, 0 boundary leaks (107 app modules),
docs links green, `LeadOS-standalone.html` rebuilt (Schema v31). Measured
propagation trace: locking the demo's supported study produced exactly one DACI
decision, two typed links and six audited events in one transaction; a second
scan was a no-op; locking the contradicted study on the *same* intervention
opened a stop/redesign decision instead. See RESEARCH §57 and ADR-0015.

**Next (new research-derived opportunities):**
1. **Intervention portfolio accounting**: aggregate the ledger into an
   expected-value-of-information view — which next study is worth running, given
   what is already known and what a wrong decision would cost (carried from the
   Session 49 research on small leadership effect sizes: g ≈ 0.13–0.29 means most
   studies are underpowered, so *which* study to run is the scarce decision).
2. **Longitudinal network drift**: versioned, append-only network snapshots so
   fragmentation and brokerage trends become auditable (carried from Session 48).
3. **Adaptive signposts**: link verified new evidence to a reviewed
   strategy-switch threshold, preserving opening assumptions (carried from
   Session 47).
4. **Sibling-cohort controls**: when the workspace contains several teams, use
   untreated teams as a contemporaneous comparison group inside the same
   estimator, replacing the donor-composite counterfactual with an actual
   control series where one exists.

**Rejected:** backdating a declaration to manufacture a confirmatory grade,
re-scoring a locked study, moving the window after seeing the outcome, fitted
synthetic-control weights (an equal-weight composite is shipped deliberately),
and any language claiming causation. A retrospective study is still evaluated —
it simply can never count as confirmation.

---

## Session 48 — 2026-10-27: influence & collaboration network intelligence (surveillance-free ONA)

**Shipped:** a pure, deterministic ONA engine (`app/core/domain/orgNetwork.js`)
and a five-tab Influence Network terminal (`#/network`) derived entirely from
the leader's own typed records — no email/chat/calendar telemetry, no employee
ratings. Newman bipartite co-affiliation projection with a leader-configurable
relative strong-tie backbone; Freeman/Brandes degree, betweenness & closeness
centrality; weighted PageRank influence; Burt structural-hole constraint;
Watts–Strogatz clustering; Tarjan articulation points & bridges; Latora–
Marchiori efficiency plus a deterministic **node-removal structural key-person
stress test** fused with the Session 45 continuity Bus Factor (verified-backup
stewardship). A deterministic SVG network map, positions/centrality table,
brokers & holes view, interactive remove-a-person simulation, and a board pack.
`RULE-ORG-01..05` fan ONE analysis, atomically and idempotently, into typed
graph links, a blameless cross-training delegation, a DACI org-design decision,
1:1 talking points and `ORG-01..05` signals (insights + Today + nav badge), with
pause semantics and self-cleaning stale prompts. CSV scope #31 exports counts
and dimensionless scores only, no names/free text. **Additive on Schema v30** —
a derived lens needs no new record collection or migration; two settings
(`networkTiePct`, `networkAutoPropagate`) are handled by `normalizeSettings`.

**Verification:** exact graph-math oracle (path/star/complete/triple graphs),
purity, idempotent atomic fan-out, pause, self-cleaning, CSV data-minimisation,
and JSDOM+axe across all five tabs + empty state. Full gate: **698/698 tests**
across 48 suites, 0 lint errors, 0 boundary leaks (102 app modules), docs links,
and `LeadOS-standalone.html` rebuilt. See AI-SESSION-LOG.md / RESEARCH §56.

**Next (new research-derived opportunities):**
1. Longitudinal **network drift**: versioned, append-only network snapshots so
   fragmentation / brokerage-concentration trends are auditable over time
   (would justify the next Schema migration).
2. Correlated uncertainty sets & robust mixed-strategy optimisation, with
   adversarial witness scenarios and evidence-backed uncertainty elicitation
   (carried over from Session 47).
3. Adaptive signposts: link verified new evidence to a reviewed strategy-switch
   threshold; preserve opening assumptions and require approval before changing
   commitments. Explicit transferable-utility safeguards remain on the backlog.

**Rejected:** predictive attrition/turnover probability, sentiment inference,
communications surveillance, scoring/ranking people, inferring ties from job
titles, or claiming centralities predict behaviour. Below 2 active people the
network is reported as unmeasurable, never a fabricated zero.

---

## Session 47 — 2026-10-27: robust decisions, not confident point estimates

**Shipped:** payoff-box Nash guarantees, robust conditional-transfer interval and
break point, pure-strategy Savage minimax regret/Wald maximin comparison, fixed-quota
single-opposition stress tests, PWR-07 insights, stress-aware scripts/board briefs,
and automatic DACI/typed-link/owner-coaching propagation through the existing spine.
Verification: exact 256-corner oracle across 40 matrices × four targets, persistence,
idempotency, pause, validation, six-tab DOM/axe checks. Full-suite results in session log.

**Next (new research-derived opportunities):**
1. Correlated uncertainty sets and robust mixed-strategy optimisation, with adversarial
   witness scenarios and evidence-backed uncertainty elicitation.
2. Adaptive signposts: link verified new evidence to a reviewed strategy-switch threshold;
   preserve opening assumptions and require approval before changing commitments.
3. Explicit transferability checks: elicit stakeholder utility separately from money,
   and refuse interpersonal utility aggregation without declared conversion assumptions.

**Rejected:** scenario pass fractions as “success probabilities” (no probability model);
inferring a numerical error bound from high/medium/low confidence (false precision);
automatically offering concessions or changing employee ratings (unsafe scope).

Historical milestones below retain their original verification dates.

Last updated: 2026-10-27 (session 52: shipped the **Cognitive Load & Attention Governor** (`#/load`, Schema v34) — derived per-role saturation index (utilization/WIP/coordination/commitments, weights 0.40/0.25/0.20/0.15), seeded Beta-PERT overload Monte Carlo with unmeasured-never-zero, per-person Little/Kingman queueing with counts-only/provisional/high floors and an unstable rho>=1 state, Brooks channel density and one Goldratt system constraint, germane ramp protection, four event-driven rules (`RULE-LOAD-01..04`) opening one four-option DACI shed decision with typed links and self-clearing talking points, `LOAD-01..05` signals, opaque CSV scope #34, additive v33->v34 migration (four policy settings, zero new collections), ADR-0018 and RESEARCH section 60; `npm test`: **825/825 passed** (23 new). Earlier update note preserved below; session 46: shipped the **Coalition & Incentive War Room** (`#/power`, Schema v30) — exact Banzhaf/Shapley-Shubik voting-power indices, minimum winning coalitions & Tsebelis veto players, 2x2 pure/mixed Nash equilibria with price of anarchy, mechanism-design minimal incentive-alignment transfers, equilibrium-robustness confidence scoring, deterministic SBI/DESC influence scripts, six atomic post-commit rules (`RULE-PWR-01..06`) fanning one game into a DACI decision, a blameless delegation, a 1:1 talking point, typed links and decision-tempo, `PWR-01..06` signals, CSV scope #30, v29->v30 additive migration, ADR-0013 and RESEARCH §54, 666/666 tests across 46 suites; session 45: shipped the **Operational Resilience, Dependency & Continuity Terminal** — Simchi-Levi Time-to-Survive / Time-to-Recover / Risk Exposure Index (`TTS`/`TTR`/`REI`), multi-tier Nth-party common-mode cascade topology (EU DORA Art. 29), Avelino minimal hitting-set Bus Factor with an unverified-backup epistemic firewall, Herfindahl-Hirschman concentration (`HHI`) per currency, Williamson supplier hold-up & redundancy ROI economics, split-conformal continuity-drill calibration (counts-only below n=5), a zero-write Counterfactual Disruption & Departure Stress Lab cross-checked against Capacity allocations, a six-rule post-commit continuity engine (`RULE-RES-01..06`) that chains atomically into Session 44's `RULE-DLY-03` Decision Tempo engine in the same transaction, `RES-01..07` signals, CSV scope #29, Schema v28→v29 migration, 8 audited cross-module defect fixes, ADR-0012 and RESEARCH §53. `npm test`: **636/636 passed** across 45 suites, 0 lint errors, 0 boundary leaks (97 app modules); `LeadOS-standalone.html` rebuilt at schema v29. Session 44 shipped the Decision Tempo & Timing Terminal, Schema v28, ADR-0011, RESEARCH §52; Session 43 shipped the Natural-Language Intake Terminal, Schema v27, ADR-0010, RESEARCH §51).

Session 23 note: cross-domain Operational Cases, typed Cross-Module Relationship Graph, and event-driven parallel rules engine across FMEA, 3-point PERT ROI, 5-Whys systemic barriers, Mendelow stakeholder coalitions, Decisions, Delegations, Goals and blameless 1:1 coaching; Schema v15; 17 CSV scopes; 322 automated tests across 25 files).

---

## Done — and verified this session

| Capability | Where | Verified by |
|---|---|---|
| Operational Resilience, Dependency & Continuity engine: Simchi-Levi `TTS`/`TTR`/`REI`, multi-tier Nth-party choke points (EU DORA Art. 29), and multi-currency financial blast exposure | `app/core/domain/resilience.js` `analyzeDependencyNetwork`, `deriveDependencyImpact` | `resilience.test.mjs` (3-tier cascade, warm-standby cap, REI in [0,1], multi-currency separation, unpriced non-invention) |
| Avelino minimal hitting-set Bus Factor with epistemic verification firewall (unverified trainees/backups never raise Bus Factor) | `evaluateStewardship`, `computeTeamBusFactor`, `verifyDependencySteward` | `resilience.test.mjs` (trainee exclusion, explicit verification uplift, archive drop, historical rewind) |
| Supplier concentration (`HHI` per currency), Williamson hold-up leverage scoring, redundancy ROI, and split-conformal drill TTR calibration (counts-only below n=5) | `computeHhi`, `computeConcentrationMetrics`, `evaluateHoldUpRisk`, `evaluateRedundancyEconomics`, `evaluateDrillCalibration` | `resilience.test.mjs` (exact HHI arithmetic, hold-up score, conformal refusal at n=4 and activation at n=5) |
| Zero-write Counterfactual Disruption & Departure Stress Lab cross-checked against live Capacity utilisation | `simulateDisruptionScenario`, `app/views/resilience.js` | `resilience.test.mjs` + `access-audit.test.mjs` (zero revision/event mutation, overloaded backup contention warning, goal stall) |
| Six post-commit continuity rules (`RULE-RES-01..06`) chaining atomically into Session 44 Decision Tempo (`RULE-DLY-03`) in the same transaction | `resilienceRule`, `app/core/domain/postCommit.js`, `app/core/domain/decisionTempo.js` | `resilience.test.mjs` (derived impact sync, blameless cross-train delegation + 1:1 prompt, DACI decision + atomic tempo timebox, negotiation hold-up note, breached-drill goal at-risk + case) |
| `#/resilience` five-tab terminal & `#/resilience/:id` dossier, Today triage card, 1:1 Prep continuity prompts, Person stewardship card, CSV scope #29, and Schema v29 migration | `app/views/resilience.js`, `app/ui/resilience-modals.js`, `app/core/schema.js`, `app/core/csv.js` | `resilience.test.mjs` + `access-audit.test.mjs` (all 5 tabs + detail + modals axe-clean, heading/table/control audits, CWE-1236 CSV guard, v28→v29 migration) |
| Per-decision cost of delay with four Reinertsen delay profiles, capped at the value at stake, and CD3 ranking | `app/core/domain/decisionTempo.js` `delayCostAt`/`derivedRatePerWeek`/`decisionCd3` | `decision-tempo.test.mjs` (profile arithmetic, cap, rate derivation, ranking) |
| Closed-form preposterior EVSI (Raiffa–Schlaifer) with optimal decision date, information horizon, switch probability and EVPI bound | `expectedValueOfInformation`, `posteriorMeanSpread`, `evaluateDecisionTiming` | `decision-tempo.test.mjs` (EVSI(0)=0, monotone, ≤ EVPI, faster half-life pays sooner, verdicts) |
| Value at stake derived from typed graph links (case PERT exposure, budget commitments, portfolio value, negotiated stakes) with currencies never summed and unpriced labelled honestly | `decisionValueTerms` | `decision-tempo.test.mjs` (multi-currency separation, no invented money, capacity days) |
| Measured decision latency: `decidedOn` stamp, split-conformal class band with finite-sample coverage, counts-only below n=5, legacy records stay unmeasured | `decisionLatencySamples`, `latencyBand`, `latencyByDecisionType`, schema `normalizeDecidedOn` | `decision-tempo.test.mjs` (band arithmetic at n=5, impossible/future stamps excluded, rewind) |
| Five post-commit tempo rules inside the store transaction: settle-and-measure, overdue→one owned blameless delegation, priced-and-untimed→one *proposed* timebox, >20% linked-value drift→derived refresh, class p80 breach→one DACI tempo-policy decision | `decisionTempoRule`, `app/core/domain/postCommit.js`, `app/actions.js` | `decision-tempo.test.mjs` (idempotency across repeated scans, human inputs never overwritten, pause switch, malformed-record tolerance) |
| `#/tempo` five-tab terminal with SVG delay curve, scenario table, timebox ledger, calibration and deterministic board pack | `app/views/tempo.js`, `app/ui/tempo-modals.js`, `app/main.js` | `decision-tempo.test.mjs` (all five tabs axe-clean on the demo workspace, arm dialog writes once, nav badge and Today card) |
| One live timebox per decision enforced at import; duplicates demoted to `abandoned` with a written reason, never deleted | `app/core/schema.js` `normalizeTempoSchedules` | `decision-tempo.test.mjs` (commitment outranks a proposal, settled history untouched) |
| `DLY-01..06` signals, Today card, nav badge, decision-card tempo line and CSV scope #28 with no titles or names | `app/core/domain/insights.js`, `app/views/today.js`, `app/views/decisions.js`, `app/core/csv.js` | `decision-tempo.test.mjs` (each signal fires on its evidence, pipeline free of titles/names, empty workspace silent) |
| One self-contained offline HTML file that double-clicks from any PC | `LeadOS-standalone.html`, `scripts/build-standalone.mjs`, `package.json` | `standalone.test.mjs` (1.7 MB inline artifact, no external script/link/module/fetch, arbitrary `--out` filename, canonical `index.html` protected) |
| `file://` boot, hash routing, standalone storage-key separation and no-network guarantee | `app/main.js`, `app/core/store.js`, `scripts/build-standalone.mjs` | `standalone.test.mjs` (JSDOM file origin, Today/Settings/Forecast Integrity render, zero `fetch`/WebSocket attempts, zero axe violations) |
| Portable-copy UX and honest data-migration guidance | `app/views/settings.js`, standalone banner, `scripts/serve.mjs` | `standalone.test.mjs` (Settings copy text, Export JSON guidance, server exposes only the deliberate artifact) |
| Rebuildable, fingerprinted distribution with build-time-only `esbuild` | `scripts/build-standalone.mjs`, `docs/adr/0009-single-file-offline-distribution.md` | `standalone.test.mjs` (89 source modules meta, source sha256, refusal to overwrite `index.html`) |
| Accessible empty states (valid heading order) | `app/ui/components.js`, `app/ui/dom.js`, `app/styles.css` | `standalone.test.mjs` (axe-core `heading-order` fixed) + full canonical suite |
| Unified cross-ledger prediction atoms over decisions, plan effort, case exposure/days/spend, budget commitments and negotiated value | `app/core/domain/forecastIntegrity.js` `FORECAST_ADAPTERS`, `buildForecastAtoms` | `forecast-integrity.test.mjs` (registry coverage, segmentation, probability/magnitude separation, conflict/pulse exclusion) |
| Distribution-free conformal outside-view bands with finite-sample coverage bound; counts-only below n=5; zero actuals remain representable | `conformalBand`, `bandForForecast`, `forecastIntegrityReport` | `forecast-integrity.test.mjs` (k=⌈(n+1)(1−α)⌉ quantile, low/high factors, zero actual, insufficient evidence) |
| Exact two-sided sign test + Brier/Murphy scoring + interval-coverage diagnostics + board brief | `ratioSignTest`, `probabilitySummary`, `intervalCoverage`, `boardBrief` | `forecast-integrity.test.mjs` (exact p=0.0625 at n=5, tie handling, Brier 0.28, deterministic brief) |
| Generalized post-commit rules hook (ADR-0008): one atomic transaction fans out to challenges, typed graph edges, DACI decisions, measurement-recovery delegation, audit events and insights | `app/core/domain/postCommit.js`, `app/core/store.js`, `forecastIntegrityRule` | `forecast-integrity.test.mjs` (budget settlement → budget + portfolio challenges, 2 DACI decisions, `forecasts`/`decides` links, events, idempotency, pause/resume, rule-error audit) |
| Reviewable outside-view challenges that never rewrite source estimates; accept/adapt/dismiss with written rationale | `app/actions.js`, `app/ui/forecast-modals.js`, `app/views/forecasts.js`, `app/core/schema.js` | `forecast-integrity.test.mjs` (validation, append-only history, source immutability, response dialog + axe) |
| `FI-01..05` signals, Today triage card, nav badge and `#/forecasts` five-tab terminal | `app/core/domain/insights.js`, `app/views/today.js`, `app/main.js`, `app/views/forecasts.js` | `forecast-integrity.test.mjs` (signals fire on evidence, demo silent, every tab axe-clean, board brief rendered) |
| Schema v26 additive migration, normalizer repair, 26th formula-safe CSV scope, clearDemo/rewind parity | `schema.js`, `csv.js`, `store.js`, `health.js` | `forecast-integrity.test.mjs` (v25→v26, dangling-source drop, CSV row types + CWE-1236, demo/user separation, approximate-fidelity note) |
| Zero-build app that boots and routes | `index.html`, `app/main.js` | `tests/app/app.test.mjs` (boot, all routes, unknown route) |
| Versioned store, migrations, quarantine on corruption | `app/core/store.js`, `app/core/schema.js` | core tests; corrupt-blob integration test |
| Append-oriented event log with cap | `core/store.js` | integration test (audit event written on each action) |
| Person roster: add, validate, XSS-safe, archive/restore | `views/people.js`, `actions.js` | integration tests (validation, `<script>` in a name rendered as text) |
| 1:1 logging incl. moved/skipped as signals | `domain/oneonone.js` | domain + integration tests |
| Agenda generated from the record, with reasons | `domain/oneonone.js` `suggestAgenda` | domain test + person-page test |
| SBI feedback with live quality coaching | `domain/feedback.js` | integration test (quality meter, rejection of empty behaviour) |
| Feedback balance and follow-ups | `domain/feedback.js` | domain tests, rules `FB-03`–`FB-05` |
| Observation-to-conversation feedback latency with unknown excluded and editable dates | `domain/feedback.js`, `views/feedback.js`, `ui/modals.js` | pure date-pair tests, `FB-06`, real-dialog capture/correction and latency-filter tests |
| Goals with computed progress, pace and check-ins | `domain/goals.js` | integration test (check-in moves progress) |
| Tri-state goal co-authorship and explicit `GOAL-06` | `domain/goals.js`, `domain/insights.js`, `ui/modals.js` | migration/action/signal tests; edit preserves goal id, key results and history |
| Outcome delegation with owner, authority, support, due date, check-ins, completion and return-to-leader | `domain/delegations.js`, `views/delegations.js`, `actions.js` | pure health tests; validated action/reload/audit tests; real-dialog create → blocked check-in → edit → complete flow |
| Today queue for blocked, overdue, undated and stale delegated outcomes; direct check-in/completion actions | `domain/delegations.js`, `ui/delegation-checkins.js`, `views/today.js` | `tests/app/delegation-queue.test.mjs` (priority, closed-item exclusion, cancel/no-write, audited check-in/completion, reload, archived owner and axe scans) |
| Delegation follow-through in Signals, 1:1 agendas, person pages and review evidence | `domain/insights.js`, `domain/oneonone.js`, `domain/reviews.js` | `DEL-01`…`DEL-03`, agenda reason, dated outcome valence and focused source-route tests |
| Goal with no key results reported as unmeasured | `domain/goals.js` | integration test `KR-less goal` |
| GROW plans scored stage by stage | `domain/growth.js` | domain tests |
| Competency coverage | `domain/growth.js` | growth view render test |
| Evidence-gated succession readiness | `domain/readiness.js` | integration test (unsupported "ready now" flagged) |
| Pulse reporting floor (default 5, supported minimum 3), same complete cohort for means/trends, whole-vector unanimous suppression and independent comment floor | `domain/pulse.js`, `core/schema.js`, `ui/modals.js` | domain + integration tests; 10 pulse-safety regressions; this is not an anonymity guarantee |
| Pulse windows on calendar days (no double-counting) | `domain/pulse.js` | domain test on window boundaries |
| Decision log (DACI, reversibility, options, rationale, review) | `domain/decisions.js` | integration test (log → decide → review) |
| Recognition ledger + drought detection | `domain/insights.js` `REC-01` | view + insights tests |
| 51 named signal rules with severity, evidence, one action (including count-only `CFL-01`…`CFL-04`, cross-domain `CASE-01`…`CASE-04`, and settlement calibration `NEG-09`) | `domain/insights.js` | domain tests (determinism, shape, urgency), including `FB-06`, `GOAL-06`, `DEL-01`…`DEL-03`, `CONV-06`, `CONV-07`, `GROW-06`, `GROW-07`, `CASE-01`…`CASE-04`, and `NEG-09` |
| Repetition collapsed above 3 people, names preserved | `domain/insights.js` `rollUpFindings` | domain + integration tests (24-person roster) |
| Actionable 30-60-90 phase conversations on Today, oldest-first with four-item preview and full queue | `domain/onboarding.js`, `ui/onboarding-checkins.js`, `views/today.js` | `onboarding-queue.test.mjs` (12 regressions); Chromium desktop/mobile lifecycle and five zero-violation axe scans |
| Complete check-in queue, person/plan scope, exact completed-plan links and explicit stale-link recovery | `views/onboarding.js` | Node/JSDOM lifecycle, filter, special-character/XSS tests + Chromium navigation/reload |
| Mobile full-plan toolbar and Settings backup/export labels fit 390px viewport | `styles.css` | `scripts/app-onboarding-smoke.mjs` + repaired `scripts/app-browser-smoke.mjs` overflow assertions |
| Today: health, next actions, due 1:1s, pulse prompt | `views/today.js` | full-demo render test |
| Health score: 5 dimensions, null-safe weighting, approximate historical comparison | `domain/health.js` | domain tests + demo baseline |
| Export / import / reset / demo, with demo protection | `core/store.js`, `views/settings.js` | integration tests (round-trip, demo refusal) |
| Evidence-linked performance-review packets with self-reflection and manager assessment | `domain/reviews.js`, `views/reviews.js`, `actions.js` | domain tests + real-dialog create → reflect → assess → complete → export/import test |
| Explicit completed-review → GROW/Goal follow-through (Schema v13): editable focus prefill, same-person source validation, links in both directions and CSV; no records on completion and no copied-as-agreed next steps | `core/schema.js`, `actions.js`, `ui/modals.js`, `views/reviews.js`, `views/goals.js`, `views/growth.js`, `core/csv.js` | `reviews.test.mjs` migration/ownership/CSV tests + `app.test.mjs` real-dialog GROW and goal flows; no browser/AT claim |
| Explicit manager-owned follow-ups after recorded Day 30/60/90 check-ins (Schema v14): stable check-in ID + plan/phase/date source, dated user-authored action, shared ledger/Today ownership, real-1:1 done/carry/drop reconciliation, source-preserving carry and CSV; no blocker copy, synthetic meeting, or performance-review evidence | `core/schema.js`, `core/domain/oneonone.js`, `actions.js`, `ui/modals.js`, `views/onboarding.js`, `views/oneonones.js`, `core/csv.js` | `onboarding.test.mjs` modal/board/1:1 flow + `reconcile.test.mjs` validation, carry, completion, CSV, review-evidence exclusion and snapshot rewind; `scripts/app-manager-support-smoke.mjs` Chromium 153 desktop/mobile lifecycle, 8 zero-violation axe scans, keyboard dialog and overflow checks; screen-reader/AT and comprehension **[UNVERIFIED]** |
| Review calibration warnings for thin/recency-skewed/one-sided evidence and unsupported ratings | `domain/reviews.js` `calibrateReview` | deterministic `CAL-01`…`CAL-07` tests; completion confirmation exposes warnings |
| Frozen completion snapshots, reopen/refresh audit history, source drill-down, print/PDF | `actions.js`, `views/reviews.js` | lifecycle tests; all six source routes incl. delegation and completed goal/plan; print-dialog wiring test |
| Schema v2 review, v3 latency/authorship/delegation, v4 conflict and v5 dated-snapshot migrations, with dynamic demo protection/cleanup | `core/schema.js`, `core/store.js`, `actions.js` | additive v1→v2→v3→v4→v5 migration, null preservation for pre-v5 records, reload/import and real/demo preservation tests |
| Key-result dialog targets its source goal; development-plan edit preserves the plan | `ui/modals.js`, `actions.js` | UI regression tests for both flows |
| Development overdue calculations use the injected clock | `domain/growth.js` and callers | regression test with 2019 and 2026 clocks |
| Accessibility: skip link, dialog keyboard/focus behaviour, live errors, visible disabled controls, non-color chart stroke/shape coding, HTML data tables, and inline validation errors associated with their controls | `ui/dom.js`, `ui/charts.js`, `ui/conflict-modals.js`, `styles.css` | jsdom + Chromium regression asserts `aria-invalid`, preserves field-help `aria-describedby`, adds/removes inline error ID as validity changes; axe scans remain zero for selected screens. Real screen-reader validation and whether announcements are duplicated **[UNVERIFIED]** |
| Dialogs cannot survive a route change | `app/main.js` | integration test |
| Roster search that does not steal focus | `views/people.js` | integration test |
| Conflict listening → explicit agreement → owned results → verified follow-up → resolution, with support handoff/reopening/version history | `domain/conflicts.js`, `conflict-actions.js`, `ui/conflict-modals.js`, `views/conflicts.js` | 29 conflict tests |
| Conflict content isolated from health/talent/reviews/agendas/person timelines/routine CSVs; general reminders are counts only, including roster-free workspaces | `domain/insights.js`, `views/today.js`, `core/csv.js` | privacy regression assertions across views, timelines and all routine CSV scopes |
| Unsupported/future schemas refused on import and protected on load, original export preserved even after failed replacement; CSV export refused when `writeBlockReason` active | `core/store.js`, `actions.js`, `core/csv.js` | 5 storage-safety tests + CSV future-schema/QuotaExceeded tests |
| Static-server canonical asset allowlist, private-file/symlink/traversal denial and read-only HTTP methods | `scripts/serve.mjs` | 4 actual-HTTP server regression tests + Session 5 live HTTP module checks |
| Goal/delegation tabs use real filter keys; Settings fallback export Close works | affected views | jsdom filter checks; fallback-dialog regression |
| Longitudinal trends across all 5 health dimensions, composite health, feedback latency and delegation follow-through (8w / 12w / 6m) with survivorship-bias fix, matched-dimension deltas and `exact`/`approximate` disclosures | `domain/health.js`, `domain/trends.js`, `ui/charts.js`, `views/health.js`, `views/today.js` | `tests/app/trends.test.mjs` (survivorship bias, Simpson's/coverage-shift guard, pre-history null guard, UI switching, `axe-core`) |
| Scoped, unknown-preserving, OWASP CWE-1236 formula-safe CSV exports across 17 tables (including `cases`, `caseLinks`, `readiness` and `recognition.visibility`) with pulse anonymity/comment floors and confidential conflict confirmation | `core/csv.js`, `core/store.js`, `views/settings.js` | `tests/app/csv.test.mjs` + `tests/app/cases-automation.test.mjs` + `tests/app/execution-loops.test.mjs` (12 formula vectors incl. full-width Unicode & whitespace, negative numbers, RFC 4180 round-trip, pulse suppression, QuotaExceeded, `axe-core`) |
| Optional passphrase encryption of the browser copy: 600k-round PBKDF2 derivation, AES-256-GCM envelope with AAD-bound KDF parameters, verified plaintext→encrypted migration, lock/unlock/change passphrase/disable | `core/crypto.js`, `core/store.js`, `views/vault.js`, `ui/vault-dialogs.js` | `tests/app/encryption.test.mjs` (20 tests: no plaintext in storage, wrong-passphrase refusal, tamper/AAD, iteration-floor DoS guard, quota-failure rollback, no-crypto detection) |
| A locked workspace cannot be written to, quarantined, exported empty or reset accidentally | `core/store.js`, `views/vault.js` | encryption tests (all write paths, ciphertext byte-identity, export returns the untouched file, typed DELETE required to erase) |
| Encrypted backups and import in both directions, with the storage mode disclosed | `core/store.js`, `views/settings.js`, `ui/vault-dialogs.js` | encryption tests (restore into plain/locked/unlocked states, wrong passphrase changes nothing, downgrade message asserted) |
| Lock screen is the only thing rendered while locked, keyboard-usable and axe-clean | `views/vault.js`, `main.js`, `styles.css` | jsdom tests (no records leaked into the screen, error live region, show-passphrase toggle, `axe-core` 0 violations) |
| A stored backup envelope is refused rather than normalised into an empty workspace | `core/store.js`, `views/vault.js` | encryption tests (refused unlock, untouched file, working restore path) |
| Idle auto-lock: warn, then lock an unlocked encrypted workspace after inactivity, with a non-destructive "keep working" warning and a one-minute grace; the lock is logged to the event log | `app/core/idle.js`, `app/main.js`, `app/core/schema.js`, `app/actions.js`, `app/ui/modals.js` | `tests/app/idle.test.mjs` (activity reset, warn → lock transitions, tab restored from background) |
| Printable 1:1 prep sheet: employee topics, generated agenda with reasons, grouped open commitments (1:1 actions, onboarding checkpoints, feedback follow-ups, development actions, delegation checkpoints), what happened since you last spoke, outcomes at risk and a notes area; confidential conflict records and anonymous pulse answers excluded by construction | `app/core/domain/prep.js`, `app/views/prep.js`, `app/main.js`, `app/views/person.js`, `app/ui/modals.js`, `app/core/schema.js`, `app/actions.js`, `app/core/demo.js` | `tests/app/prep.test.mjs` (assembly, overdue ordering, privacy regression, missing-person route on populated roster, persistence/repair, route render, print flow, axe-core) |
| Onboarding 30-60-90 milestone tracker (Schema v6): explicit role clarity, peer buddy, stakeholder introductions (`met`/`metOn`), scoped early win, 30/60/90 checkpoints, dated Day 30/60/90 check-in conversations, Day 90 completion gate, `ONB-02`…`ONB-05` signals, person-page & prep-sheet integration, and formula-safe `onboarding` CSV export | `app/core/domain/onboarding.js`, `app/views/onboarding.js`, `app/core/schema.js`, `app/actions.js`, `app/ui/modals.js`, `app/core/domain/insights.js`, `app/core/csv.js` | `tests/app/onboarding.test.mjs` (v1→v6 migration, repair invariants, chronology & Day 90 gates, agenda/prep/timeline/CSV integration, real-dialog UI workflow, `axe-core` 0 violations) |
| Session 9 audit bug fixes: populated-roster `#/prep/<unknown>` guard, `idleLockMinutes = 0` dialog validation, measured/invalid CSV feedback latency, public recognition `shared` badge & `?person=` filter, password/search input styling, DACI CSV labels and encryption-aware storage notices | `views/prep.js`, `ui/modals.js`, `core/csv.js`, `views/recognition.js`, `views/settings.js`, `views/conflicts.js`, `views/health.js`, `styles.css` | regression assertions in `tests/app/prep.test.mjs`, `tests/app/csv.test.mjs`, `tests/app/onboarding.test.mjs` |
| 1:1 follow-through ledger (Schema v7): every open promise from an earlier meeting gets an explicit outcome — done in this conversation, still open, carried forward with a new date, or dropped with a reason; the original is linked to its successor, carry depth and "first agreed" are derived rather than stored, and a broken/backward/cyclic link reopens the promise with a warning instead of losing it | `app/core/domain/oneonone.js`, `app/core/schema.js`, `app/actions.js`, `app/core/domain/prep.js`, `app/core/csv.js` | `tests/app/reconcile.test.mjs` (v6→v7 migration, repair, cycle break, depth, atomic write, write-path rejections, historical rewind, CSV/prep parity) |
| Follow-through surfaces: reconciliation panel inside the 1:1 dialog, "Commitments that keep moving" board card, carried markers on person pages and the prep sheet, `CONV-06` at two carries, and a "promises closed in a 1:1" win | `app/ui/modals.js`, `app/views/oneonones.js`, `app/views/person.js`, `app/views/prep.js`, `app/core/domain/insights.js`, `app/styles.css` | jsdom dialog carry → close flow, person/prep render assertions, `axe-core` 0 violations on board, prep and dialog |
| Commitment ownership (Schema v8): every 1:1 action records `them` / `leader` / `shared`, or `null` when nobody said; `null` is surfaced as a gap rather than defaulted; a carried promise keeps its owner; reassignment is an audited action that refuses closed and already-carried promises; unrecognised values are cleared with a warning | `app/core/schema.js`, `app/core/domain/oneonone.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/oneonones.js` | `tests/app/ownership.test.mjs` (v7→v8 migration, write-path rejection, carry inheritance, reassignment rules, export/import persistence) |
| The leader's own half of the ledger: private "What you owe" card on Today, "I owe" stat and inline owner column on the 1:1 board, owner markers on person pages and the prep sheet, `CONV-07` per person when the leader is late (with `CONV-05` narrowed to team-owned promises so one fact is signalled once), and a truthful `owner` column in the actions export | `app/views/today.js`, `app/views/oneonones.js`, `app/views/person.js`, `app/views/prep.js`, `app/core/domain/prep.js`, `app/core/domain/insights.js`, `app/core/csv.js`, `app/styles.css` | jsdom board select (including the `is-mine` marker and the closed-promise case), Today card → Done flow, dialog capture, `axe-core` 0 violations; CSV and prep assertions |
| Development-commitment ledger (Schema v9): every GROW commitment can be closed in a review, carried forward with a new date (keeping the original as history and the first-agreed date derived from the chain), or dropped with a mandatory reason; dropped is never counted as done | `app/core/schema.js`, `app/core/domain/growth.js`, `app/actions.js` | `tests/app/growth-ledger.test.mjs` (v8→v9 migration, chain repair incl. orphan/back-reference/cycle, carry + drop validation, live-only progress, review application) |
| Development reviews as records, not date edits: dated conversation notes, per-commitment decisions, the agreed next review, and `reviewDeferrals`/`reviewMovedOn` when a date is pushed without holding one | `app/core/schema.js`, `app/actions.js`, `app/core/domain/growth.js`, `app/ui/modals.js`, `app/views/growth.js` | `tests/app/growth-ledger.test.mjs` (review write path, rejection of empty/future/impossible reviews, deferral counting and reset, dialog capture) |
| Growth follow-through signals and surfaces: `GROW-06` at two carries, `GROW-07` at two deferrals, carried badges and overdue dates on `#/growth` and person pages, an expandable closed/moved record, a "Hold review" entry point, and ledger-aware `actions` / `growthPlans` CSV scopes plus snapshot rewind | `app/core/domain/insights.js`, `app/core/domain/health.js`, `app/views/growth.js`, `app/views/person.js`, `app/views/today.js`, `app/core/csv.js`, `app/styles.css` | jsdom render + dialog tests, `axe-core` 0 violations on `#/growth`, `#/people/<id>`, `#/today`, `#/settings` and the review dialog; CSV and `reconstructStateAt` assertions |
| Internal role-transition 30-60-90 plans (Schema v10): every plan records `kind` (`new-hire` / `role-transition`) and a `label` naming the new scope; v9 plans migrate honestly as `new-hire` with no invented label; a transition requires its label, cannot be anchored before the person joined, and defaults to the day the new role starts — `person.startDate`, tenure and every tenure-derived signal are never rewritten | `app/core/schema.js`, `app/core/domain/onboarding.js`, `app/actions.js` | `tests/app/transitions.test.mjs` (v9→v10 migration incl. relabelled-file preservation and source-immutability, kind repair warnings, label-required and pre-join rejections with zero writes, cross-kind one-active-plan refusal, reclassification preserving checkpoints/check-ins/history) |
| Transition scaffolding that matches how internal moves actually fail: 6 starter checkpoints (old-role handover inventory, written scope/authority delta, first early win in the new seat, 60-day old-habits calibration, end-to-end ownership, reset goals/GROW to the new level); the plan dialog defaults a tenured person to a transition anchored today and stops auto-filling the date once the leader picks one | `app/core/domain/onboarding.js` `defaultTransitionCheckpoints`, `app/ui/modals.js`, `app/views/onboarding.js` | jsdom dialog tests (kind default, date re-anchor on plan-type change, manual date never overwritten, label-less submit writes nothing), `axe-core` 0 violations on `#/onboarding` |
| Kind-aware surfaces end to end: `ONB-03`–`ONB-05` name the transition (joiner-only `ONB-01`/`ONB-02` stay tenure-based, and a transition plan does not silence a new joiner's `ONB-02`), kind badge + label + per-kind counts on `#/onboarding`, "Role transition (30-60-90)" card on person pages, transition wording in generated 1:1 agendas and prep-sheet commitments, transition entries in the person timeline, and `plan_kind`/`plan_label` (formula-safe) in the `onboarding` and `actions` CSV scopes | `app/core/domain/insights.js`, `oneonone.js`, `prep.js`, `people.js`, `app/core/csv.js`, `app/views/person.js`, `app/main.js` | signal wording + Day 90 gate + completion/timeline/wins assertions, CSV kind/label + formula-escape assertions, demo fixture (Mei at transition day 12 with 260 days' tenure and zero ONB signals); full suite green |
| Operational conflict-redacted JSON exports (Session 14): plain or encrypted restorable backups that omit confidential conflict records and their event-log traces, declare counts-only omissions inside the wrapper, warn on import, and block overwriting readable local conflict records without explicit confirmation | `app/core/store.js`, `app/views/settings.js`, `app/ui/vault-dialogs.js`, `app/views/vault.js`, `app/main.js` | `tests/app/redacted-export.test.mjs` (12 tests: byte-identical live state, `redacted-replacement` guard, encrypted operational backup, `axe-core` 0 violations) |
| Review-due queue on Today (Session 15): `dueGrowthReviews` surfaces overdue, due-within-7-days and unscheduled GROW plans directly on `#/today` with deferral counts and an inline *Hold review* button that opens `openGrowthReviewDialog` in place while deduplicating *Loose ends* | `app/core/domain/growth.js`, `app/views/today.js`, `app/ui/modals.js` | `tests/app/execution-loops.test.mjs` (ordering, exclusion of >7d scheduled & archived plans, direct review settlement on `#/today`, `axe-core` 0 violations) |
| Succession → role-transition handoff & readiness stretch notes (Schema v11, Session 15): optional `readiness[].notes`, pre-populated `openReadinessDialog`, and `transitionHandoff` wiring *Start transition* / *Open 30-60-90 plan* across `#/readiness` and `#/people/:id` into `openOnboardingPlanDialog` with seat label and read-only readiness context — never fabricating `roleClarity` or rewriting `person.role`/`person.startDate` | `app/core/schema.js`, `app/core/domain/readiness.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/readiness.js`, `app/views/person.js` | `tests/app/execution-loops.test.mjs` (v10→v11 migration, handoff prefill, `Edit rating` pre-population, roster immutability, `axe-core` 0 violations) |
| Return-to-work ("re-boarding") 30-60-90 plans (Schema v11, Session 15): `'reboarding'` in `ONBOARDING_KINDS`, 6 re-entry checkpoints centred on context catch-up and 4-week load pacing, optional non-medical context label with explicit privacy guidance, and full `ONB-03`–`ONB-05` / 1:1 agenda / prep sheet / timeline / CSV / redacted-JSON parity | `app/core/schema.js`, `app/core/domain/onboarding.js`, `app/actions.js`, `app/core/domain/insights.js`, `oneonone.js`, `prep.js`, `people.js`, `app/core/csv.js`, `app/ui/modals.js`, `app/views/onboarding.js`, `app/views/person.js` | `tests/app/execution-loops.test.mjs` (pre-join date rejection, tenure preservation, new-joiner `ONB-02` non-silencing, signal/agenda/prep/timeline/CSV/redacted-JSON assertions, `axe-core` 0 violations) |
| Session 15 audit bug fixes: fixed `#/people/:id` `ReferenceError` on GROW *Carry*/*Drop* buttons, mounted interactive `.agenda-picks` inside `openOneOnOneDialog`, fixed `buildForm` `boxLabel` & `span: 2` & single-checkbox-`<label>` accessibility, excluded retired/dropped GROW items from `suggestAgenda`, added `30-60-90 plans` label in Settings, added `.stack-sm`/`.kv-row` CSS utilities, and added `readiness` CSV + `recognition.visibility` CSV | `app/views/person.js`, `app/ui/modals.js`, `app/ui/dom.js`, `app/core/domain/oneonone.js`, `app/views/settings.js`, `app/core/csv.js`, `app/styles.css` | `tests/app/execution-loops.test.mjs` + `tests/app/csv.test.mjs` + programmatic ESLint `no-undef` scan (0 errors across 82 files) |
| Decision review-due queue on Today, decision lifecycle & DACI repairs (Schema v12, Session 16): `reviewsDue` and `dueDecisionReviews` exclude undecided calls (`Boolean(d.chosen)`), `#/today` surfaces overdue and due-within-7-days decision reviews with inline *Review outcome*, `#/decisions` honours `?decision=<id>` focus (`DEC-01`) and unifies `?filter=review` with `dueQueue`, `updateDecision` + *Edit* dialog resolves missing approvers (`DEC-03`) without losing option pros/cons, `reviewDecision` validates `reviewedOn` chronology and rewinds cleanly in `reconstructStateAt`, and `#/people/<id>` renders token-matched DACI involvement | `app/core/schema.js`, `app/core/domain/decisions.js`, `app/core/domain/health.js`, `app/core/domain/insights.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/decisions.js`, `app/views/today.js`, `app/views/person.js` | `tests/app/decision-growth-prep.test.mjs` (undecided exclusion, chronology/state guards, snapshot rewind, DACI token matching, `#/today` inline review, `?decision=` focus, `DEC-03` edit, `axe-core` 0 violations) |
| Stretch delegation ↔ GROW development handoff (Schema v12, Session 16): explicit `delegationId` on `growthPlans[].will[]` (repaired on dangling/cross-person links, preserved across carries, rewound in `reconstructStateAt`, exported in `actions`/`delegations`/`growthPlans` CSVs), one-click *Add to GROW* / *Start GROW plan* handoffs from `#/delegations`, bidirectional status links across `#/delegations`, `#/growth`, `#/people/<id>` and `openGrowthReviewDialog`, and explicit coaching-reflection prompts when a linked delegation completes or returns (never silently auto-closing `will.done`) | `app/core/schema.js`, `app/core/domain/growth.js`, `app/core/domain/health.js`, `app/core/csv.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/delegations.js`, `app/views/growth.js`, `app/views/person.js` | `tests/app/decision-growth-prep.test.mjs` (v11→v12 migration & repair, ownership/duplicate guards, carry preservation, non-silent completion reflection, CSV & snapshot rewind, `axe-core` 0 violations) |
| 1:1 prep-sheet & employee-topic carry-through into `Log a 1:1` (Session 16): checkable *Their topics* and *Suggested agenda* on `#/prep/<id>` pass exact selections into `openOneOnOneDialog`, `#/people/<id>` surfaces waiting `talkingPoints` and *Use this agenda*, `buildMeetingAgendaCandidates` preserves true agenda `source` provenance (`'their-topic'`, `'delegation'`, `'onboarding'`, etc.), and `logOneOnOne` clears covered employee `talkingPoints` only when `status === 'held'` | `app/core/domain/oneonone.js`, `app/actions.js`, `app/ui/modals.js`, `app/views/prep.js`, `app/views/person.js`, `app/styles.css` | `tests/app/decision-growth-prep.test.mjs` + `tests/app/prep.test.mjs` (selective topic clearing, `skipped`/`moved` protection, provenance preservation, `axe-core` 0 violations) |
| Cross-domain Operational Cases & Event-Driven Parallel Cross-Module Propagation Engine (Schema v15, Session 23): AIAG-VDA FMEA RPN + Action Priority + residual verification, 3-point Beta-PERT financial & capacity exposure with risk-adjusted mitigation ROI, Toyota 5-Whys & Swiss-Cheese systemic barriers with individual-blame warnings, Mendelow Power × Interest stakeholder coalition matrix & briefing cadences, typed Cross-Module Relationship Graph (`state.links` with strict `conflict`/`pulse` privacy walls), 7 deterministic rules (`RULE-STAKE-01`, `RULE-DEC-01`, `RULE-DEL-01`, `RULE-GOAL-01`, `RULE-COACH-01`, `RULE-SYNC-DEL-01`, `RULE-ESC-01`) propagating in parallel across Decisions, Delegations, Goals, People/1:1 Prep, Today, and Insights (`CASE-01`…`CASE-04`), upstream *Escalate to case* handoffs, `#/cases` & `#/cases/:id` views, live propagation preview in `openCaseDialog`, and `cases` + `caseLinks` CSV scopes | `app/core/domain/cases.js`, `app/core/domain/automation.js`, `app/core/schema.js`, `app/actions.js`, `app/ui/case-modals.js`, `app/views/cases.js`, `app/views/{today,decisions,delegations,goals,person,prep,insights,settings}.js`, `app/core/csv.js`, `app/styles.css` | `tests/app/cases-automation.test.mjs` (FMEA/PERT/Mendelow/5-Whys math, 5-way parallel propagation, idempotency, delegation→monitoring loop, resolution propagation, upstream escalation, v14→v15 migration, privacy wall, snapshot rewind, CSV formula safety, JSDOM + `axe-core` 0 violations across `#/cases`, `#/cases/:id`, modals & connected views); real-browser layout/AT on `#/cases` **[UNVERIFIED]** |
| Capacity, Flow & Portfolio Allocation (Schema v16, Sessions 24–25): explicit capacity supply from focused hours with transition ramp and operational reserve; Little's Law WIP/cycle-time and Kingman queue-delay multiplier; three-point PERT effort/value, value-density allocation, P50/P80/P90 forecast; `RULE-CAP-01` case→capacity reserve, `RULE-CAP-02` infeasibility→one DACI trade-off decision, `RULE-CAP-03` funding→goal risk, and `RULE-CAP-04` explicitly linked delegation completion→portfolio delivery/date/audit (no double-entry; returned work is not treated as delivered; **Sync rules** idempotently repairs prior completed links); `CAP-01`–`CAP-05` signals and `portfolio` CSV | `app/core/domain/capacity.js`, `app/core/domain/automation.js`, `app/core/schema.js`, `app/actions.js`, `app/views/capacity.js`, `app/ui/capacity-modals.js`, `app/views/today.js`, `app/main.js`, `app/core/demo.js`, `app/core/csv.js`, `app/core/domain/insights.js`, `app/core/domain/health.js`, `app/styles.css` | `tests/app/capacity-flow.test.mjs` (19 tests including RULE-CAP-04 end-to-end: active linked plan consumes capacity; completion marks delivered using the recorded date, preserves graph edge, appends one audit event, frees committed capacity, and blocks new plan items sourced from a closed delegation; JSDOM `#/capacity` and axe checks). Real-browser rendering on `#/capacity` remains **[UNVERIFIED]** |
| Selection & hiring (Schema v17, Session 26): requisition with written competencies, interviewer list and optional three-point interviewer-effort estimate; candidate evidence weighted by method validity (Sackett et al. 2022: structured interview .42, job-knowledge .40, work sample .33, cognitive .31, unstructured .19, years .07) combined in log-odds with correlated-evidence discounting (same competency × different rater ×0.5, same rater ×0.25), neutrality at 3/5, rater-disagreement surfacing, a falsification ("what would change my mind") count, competency coverage + offer convention (weight ≥ 0.50, ≥ 2 methods, all required competencies), funnel/conversion, cycle-time floor at two hires, cost of vacancy only from a recorded daily figure, process parity without protected attributes, and decision gates that require an acknowledged, recorded evidence gap; `RULE-HIRE-01` requisition → committed `hiring` capacity item (refresh / release / complete), `RULE-HIRE-02` accepted offer → roster record + new-hire 30-60-90 plan + typed links (`candidate → requisition`, `requisition → person`, `person → onboarding`) + reserve completion, `RULE-HIRE-03` stalled role → exactly one operational case through the shared escalation path (FMEA/PERT/stakeholders/DACI/delegation fan-out), `HIRE-02`…`HIRE-07` signals, and a sensitive `hiring` CSV scope | `app/core/domain/hiring.js`, `app/core/schema.js`, `app/core/domain/automation.js`, `app/core/domain/cases.js`, `app/core/domain/capacity.js`, `app/actions.js`, `app/views/hiring.js`, `app/ui/hiring-modals.js`, `app/views/today.js`, `app/views/settings.js`, `app/ui/modals.js`, `app/main.js`, `app/core/demo.js`, `app/core/store.js`, `app/core/csv.js`, `app/core/domain/insights.js`, `app/styles.css` | `tests/app/hiring.test.mjs` (27 tests: evidence maths incl. the falsification test crossing the decision line, coverage/offer gate, parity, cycle-time floor, v16→v17 migration and repairs, action validation, RULE-HIRE-01/02/03 end to end incl. "a stalled role raises exactly one case across repeated syncs", signals, CSV formula safety, JSDOM + `axe-core` 0 violations on `#/hiring`, `#/hiring/:id` and the dialog); real-browser/AT validation **[UNVERIFIED]** |
| Candidate data minimisation (Schema v18, Session 27): `retentionReview` reporting (never deleting) candidate records past a configurable window; `#/hiring` Data-minimisation card with per-record, named, confirmed deletion that also removes evidence and graph edges; `HIRE-08` signal with window, oldest age, exemption count and severity escalation past 2× the window; "keep in touch" exemptions surfaced rather than silently applied; unknown-age records never guessed; invalid window values fall back to the default instead of silently disabling the reminder | `app/core/domain/hiring.js`, `app/core/schema.js`, `app/core/domain/insights.js`, `app/views/hiring.js`, `app/views/settings.js`, `app/ui/modals.js`, `app/core/demo.js` | `tests/app/retention.test.mjs` (23 tests: window/boundary/anchors/exemptions/undated/missing-role/no-mutation, `hiringSummary` + `HIRE-08` wiring and severity, v17→v18 migration, settings clamping, action-level deletion with audit trail, roster-protected record, UI card/exemption/switched-off state, confirm-before-delete) |
| Large-workspace validation (Session 27): 120 people / 240 goals / 300 cases / 180 funded items / 40 roles / 320 candidates / 900 typed edges — record preservation, edge referential integrity, no duplicate or invented edges, idempotent re-normalization, derived analyses that still add up, all 19 CSV scopes, and a 300-role × 5,000-candidate stress ratio; timings printed per run | `tests/app/scale.test.mjs`, `app/core/domain/hiring.js`, `app/core/csv.js` | 5 tests; measured 35 ms normalize, 42 ms insights, ≤50 ms per CSV scope, 110 ms at the stress ratio |
| Structural accessibility audit (Session 27): axe-core zero violations across the three newest modules, detail screens and an open dialog; one `h1` per screen with no skipped heading levels; accessible name on every interactive control; captioned tables with `scope`d headers; landmarks and skip link; dialog focus trap and restoration; live-region announcements | `tests/app/access-audit.test.mjs`, `app/ui/components.js`, `app/views/capacity.js`, `app/ui/dom.js` | 12 tests. Real screen-reader/browser behaviour remains **[UNVERIFIED]** — see `docs/VALIDATION-2026-10-25-session-27.md` |
| Dependency remediation (Session 27): `next` 16.2.6 → 16.4.3, `postcss` → 8.5.31, `eslint-config-next` → 16.4.3, `drizzle-kit` → 0.31.11 | `package.json`, `package-lock.json` | `npm audit --omit=dev` → **0 vulnerabilities** (was 1 critical, 2 high). Four moderate remain in a dev-only `drizzle-kit → esbuild 0.18.20` chain; the offered fix is a breaking downgrade, declined and documented. The legacy Next app does not build and never did in this history (verified against both dependency sets), so deployment is moot |
| Shewhart/Wheeler XmR Statistical Process Control (Session 28): `computeXmR` (`X̄ ± 2.66 mR̄`, `URL = 3.267 mR̄`, `σ_within = mR̄ / 1.128`, Western Electric Rules `WE-1`..`WE-4`, physical `minBound`/`maxBound` clamping, zero interpolation across gaps) and `compareBaselineShift` (verified before/after baseline shift vs routine noise), wired into `#/health` longitudinal trends, `SPC-01` signal, `#/changes/:id` process metrics, and accessible SVG `xmrChart` with expandable X & mR data tables | `app/core/domain/spc.js`, `app/core/domain/trends.js`, `app/core/domain/insights.js`, `app/ui/charts.js`, `app/views/health.js`, `app/views/changes.js` | `tests/app/changes-spc.test.mjs` + `tests/app/access-audit.test.mjs` (exact Wheeler math, sample floor, gap non-interpolation, WE-1..3 polarity, baseline shift verification, zero axe-core / table / heading violations); real-browser/AT rendering **[UNVERIFIED]** |
| Organizational Design, Team Topologies & Change Execution (Schema v19, Session 28): Kotter 8-Step track & foundational-skip warnings, Lewin Force-Field driving/restraining equilibrium & high-tension stalemate diagnosis, Conway/Team Topologies + Sweller Cognitive Load + Brooks `N(N-1)/2` inter-team channels, Galbraith 5-Point Star + Holmström–Milgrom incentive-mismatch check, Mendelow + Tsebelis veto-player coalitions, PERT transition effort & J-Curve payback economics; `RULE-CHG-01`..`05` parallel propagation across Capacity, DACI Decisions, 30-60-90 Role Transitions, 1:1 Prep, Coalition Schedules & OKRs + vertical `RULE-CAP-02` trade-off cascade; bidirectional Case ↔ Change escalation; `CHG-01`..`05` signals; `changes` CSV scope (#20); and 5 cross-module audit fixes (`normalizePortfolio` ordering, `previewCasePropagations` `{ now }`, `reconstructStateAt` hiring/change rewind, `confirmDialog` in capacity modals, `changeReviewDays` setting) | `app/core/domain/changes.js`, `app/core/domain/automation.js`, `app/core/schema.js`, `app/actions.js`, `app/ui/change-modals.js`, `app/views/changes.js`, `app/views/{today,cases,person,prep,settings}.js`, `app/core/{csv,demo}.js`, `app/core/domain/{cases,capacity,health,oneonone,people,prep,insights}.js` | `tests/app/changes-spc.test.mjs` + `tests/app/access-audit.test.mjs` + `tests/app/scale.test.mjs` (parallel + vertical propagation, idempotency, circular guard, privacy wall, v18→v19 migration, 20 CSV scopes at scale, JSDOM UI & axe-core 0 violations) |
| Seeded Monte Carlo Portfolio, Critical-Chain Bottleneck & Coupled J-Curve Simulation (Schema v20, Session 29): Mulberry32 PRNG + Marsaglia–Tsang Gamma / Vose Beta-PERT (`simulation.js`), Savage *Flaw of Averages* `overloadProbability` & Goldratt *Critical Chain* owner-constrained `P50`/`P80`/`P90` delivery dates vs. fungible team dates, coupled Satir J-curve valley depth & payback quantiles, `RULE-CAP-05` goal tail-risk check-ins + Flaw-of-Averages DACI trade-off decisions, `SIM-01`/`SIM-02` signals, and accessible SVG `monteCarloHistogramChart` & `jCurveFanChart` with expandable data tables | `app/core/domain/simulation.js`, `app/core/domain/automation.js`, `app/core/domain/insights.js`, `app/core/schema.js`, `app/ui/charts.js`, `app/ui/modals.js`, `app/views/capacity.js`, `app/views/changes.js`, `app/views/settings.js` | `tests/app/simulation-montecarlo.test.mjs` + `tests/app/access-audit.test.mjs` (PRNG reproducibility, Beta-PERT moments, Savage trap, Critical-Chain slip, coupled J-curve, `RULE-CAP-05` idempotence, SVG/table accessibility) |
| Pre-Export Candidate Retention (`HIRE-08`) & Contextual-Integrity Disclosure + Optional Redactions (Schema v20, Session 29): `inspectExportGovernance` scanning overdue candidates, disabled retention windows, conflict records, and `skeptical`/`resistant`/`opposing` stakeholder & veto-player stances; accessible pre-export disclosure modal (`openExportDisclosureDialog`) on Settings JSON/backup & Hiring/Cases/Changes CSV exports; live-state-preserving `pruneOverdueCandidates` & `redactStakeholderStances` redactions; private-content-free `export.disclosed` audit event; and `store.clearDemo()` `changes` fix | `app/core/domain/export-governance.js`, `app/ui/export-dialogs.js`, `app/ui/vault-dialogs.js`, `app/core/store.js`, `app/core/csv.js`, `app/actions.js`, `app/views/settings.js`, `app/views/hiring.js` | `tests/app/export-disclosure.test.mjs` + `tests/app/access-audit.test.mjs` (governance findings, JSON/CSV redactions without live mutation, `clearDemo()` change preservation, Settings/Hiring UI flows, Escape focus restoration) |
| ADR-0007 Legacy-Tree Quarantine Boundary Gate (Session 29): formal archive-in-place quarantine disposition of `src/**`, root `.tsx`/`.ts`, `deprecated/`, and `public/index.html`, enforced by `scripts/check-canonical-boundary.mjs` and `npm run verify:canonical` | `docs/adr/0007-legacy-next-tree-disposition.md`, `docs/adr/INDEX.md`, `scripts/check-canonical-boundary.mjs`, `eslint.config.mjs`, `package.json` | `tests/app/canonical-boundary.test.mjs` + `npm run verify:canonical` (73 canonical ES modules & 34 test suites verified with 0 quarantined-tree or network leaks) |
| Real Headless Chromium `143.0.7499.0` WCAG 2.1 AA, Accessibility-Tree & 320px/390px/1440px Reflow Pass (Session 29): audited 11 routes + 4 live modals against `scripts/serve.mjs`, discovering and fixing 7 real contrast (`.row-muted`, `.nav-count`, `.tab-count`), label-in-name (`wcag21a`), flex-reflow (`.card-head`/`.card-actions`), and float-formatting defects | `app/styles.css`, `app/ui/onboarding-checkins.js`, `app/views/hiring.js`, `app/views/capacity.js`, `docs/VALIDATION-2026-10-25-session-29.md` | Live Chromium `143.0.7499.0` pass: **0 `axe-core` WCAG 2.1 AA violations**, **0 horizontal overflows** across `1440×1000`, `390×844` & `320×800`, 4/4 modal keyboard traps verified; spoken screen readers, Firefox/Safari & human comprehension remain **[UNVERIFIED]** |
| Non-Persisted Counterfactual Scenario Sandboxing, Pareto Frontier Dominance, Brooks's Law Onboarding Drag & One-at-a-Time Tornado Sensitivity Analysis (Schema v20, Session 30): `projectScenarioState`, `evaluateScenario`, `compareScenarios`, `computeParetoFrontier`, `buildSuggestedScenarios`, and `computeSensitivityTornado` over `structuredClone` with Common Random Numbers (`seed`), multi-ledger risk-adjusted net value & Samuelson marginal shadow pricing, Brooks's Law mentoring drag vs Watkins 30-60-90 ramp crossover, accessible SVG `tornadoChart`, `#/scenarios` interactive sandbox with query-preset cross-links from `#/capacity`, `#/decisions`, `#/cases`, `#/changes`, and `#/hiring`, `RULE-SCN-01` (#21) DACI governance & atomic cross-module commitment (`recordScenarioDecision`, `commitScenarioLevers`), `SCN-01` signal, `sensitivity` CSV scope (#21), and 7 audited cross-module bug fixes (`documentTitle`, `cases[].stakeholders[].keyMessage` redaction, `RULE-CAP-05` threshold text, `reconstructStateAt` candidate rewind, `personOptions`/`goalOptions` sentinels, `openSettingsDialog` fields/minima, and `personSupply` future `startDate` proration) | `app/core/domain/scenarios.js`, `app/core/domain/automation.js`, `app/core/domain/insights.js`, `app/core/domain/capacity.js`, `app/core/domain/export-governance.js`, `app/core/domain/health.js`, `app/core/store.js`, `app/core/csv.js`, `app/actions.js`, `app/ui/charts.js`, `app/ui/modals.js`, `app/ui/options.js`, `app/views/scenarios.js`, `app/views/{capacity,decisions,cases,changes,hiring}.js`, `app/main.js`, `app/styles.css` | `tests/app/scenarios-sensitivity.test.mjs` + `tests/app/access-audit.test.mjs` + `tests/app/scale.test.mjs` (zero-mutation sandbox isolation, CRN determinism, Brooks's Law crossover, Pareto dominance, Tornado OAT ranking, `RULE-SCN-01` cascades, all 7 bug-fix regressions, interactive modal commit, `axe-core` 0 violations in JSDOM, live HTTP `serve.mjs` module checks); graphical browser rendering of `#/scenarios`, spoken screen readers & field comprehension **[UNVERIFIED]** |
| Forecast Calibration & Reference-Class Learning Loop (Schema v21, Session 31): Cromwell-clamped decision forecasts captured at decide time (scenario decisions auto-derive theirs from CRN overload odds) and scored at outcome review with Brier (1950), Murphy (1973) decomposition + accessible reliability diagram; anti-hindsight forecast freeze after review; `RULE-FCT-01` funding-time PERT forecast snapshots (immutable under later estimate edits, cleared on un-funding); delivery actuals captured in a new Deliver dialog (never pre-filled) or backfilled via `recordPortfolioActuals`; actual/estimate ratio distribution, interval-coverage honesty, schedule adherence, and Flyvbjerg (2006) median/P80 reference-class uplifts annotated on the Capacity delivery forecast; `RULE-FCT-02` one-shot DACI governance decision at n≥5 & median ≥1.25×; signals `FCT-01`…`FCT-04`; `calibration` CSV scope (#22) + `decisions` Brier columns; verdicts refuse below n=5; plus 1 audited pre-existing defect fixed (scenario commitment wrote non-canonical `'wanted'` decisions / `'decision'` sourceType to live state that the sandbox never evaluated — now canonicalised at the view lever and commitment boundary) | `app/core/domain/calibration.js`, `app/core/schema.js`, `app/core/domain/automation.js`, `app/core/domain/insights.js`, `app/actions.js`, `app/ui/charts.js`, `app/ui/modals.js`, `app/ui/capacity-modals.js`, `app/views/decisions.js`, `app/views/capacity.js`, `app/views/scenarios.js`, `app/core/csv.js`, `app/core/demo.js`, `app/styles.css` | `tests/app/calibration.test.mjs` (12 tests: hand-pinned Brier/Murphy/curve maths, hindsight freeze, snapshot lifecycle, actuals validation/backfill, ratio/interval/uplift stats, `RULE-FCT-02` single-shot + worst-overrun link, signal firing + demo silence, scenario auto-forecast, v20→v21 null-preserving migration, CSV + CWE-1236, JSDOM card/dialog + axe 0); graphical browser rendering, spoken AT & field behaviour change **[UNVERIFIED]** |
| Case-Cost Calibration Ledger (Schema v22, Session 32): resolution-time settled actuals (materialisation, realised exposure, mitigation spend, diverted days — each independently nullable, never pre-filled from estimates) scored against the opening forecast frozen by `RULE-FCT-03` at first quantification; FAIR (Freund & Jones, 2015) frequency leg (FMEA-implied probability vs materialisation, Brier-scored) and magnitude leg (realised vs PERT exposure with interval coverage) scored separately; spend and diverted-days discipline legs (the latter finally scoring `RULE-CAP-01` capacity reserves, excluded from the Session 31 effort ledger by design); actuarial loss-development aggregate over complete single-currency settlements; `RULE-FCT-04` one-shot DACI governance at n≥5 & median ≥1.25× linked to the worst under-assessment; `FCT-05`…`FCT-07` signals; `#/cases` case-cost card + accessible `caseRatioChart` + settled-actuals detail panel; resolve-dialog capture + `recordCaseActuals` backfill; `cases` CSV settlement columns + `case-exposure`/`case-occurrence`/`case-missing-actuals` rows in `calibration` CSV; plus 2 audited pre-existing defects fixed (`updateCase` closed-status path leaked the `RULE-CAP-01` reserve and skipped the goal check-in; `reopenCase` left stale `resolutionNotes` diverging from reload) and `reconstructStateAt` now rewinds settled actuals/post-cutoff snapshots | `app/core/schema.js`, `app/core/domain/calibration.js`, `app/core/domain/automation.js`, `app/core/domain/insights.js`, `app/core/domain/health.js`, `app/actions.js`, `app/ui/case-modals.js`, `app/ui/charts.js`, `app/views/cases.js`, `app/views/decisions.js`, `app/core/csv.js`, `app/core/demo.js` | `tests/app/case-calibration.test.mjs` (10 tests: hand-pinned FAIR-leg/aggregate maths, snapshot vs resolution-estimate sources, freeze semantics, capture/backfill/validation/reopen-voiding, both defect regressions, `RULE-FCT-04` single-shot + worst-case link, signals + demo silence at 1.1939× "collecting evidence", actuals rewind, v21→v22 migration + repair, CSV + CWE-1236, JSDOM card/dialogs + axe 0); graphical browser rendering, spoken AT & field behaviour change **[UNVERIFIED]** |
| Calibrated case-capacity reserves (Session 33): `RULE-CAP-06` uses settled actual/forecast diverted-days, only after n≥5 and median ≥1.25×; median uplift normally / P80 for high-priority; updates every open case reserve atomically, re-runs deterministic trade-off + Monte Carlo tail-risk, previews in the Case dialog; source estimate and forecast snapshot stay immutable; no schema change | `app/core/domain/calibration.js`, `app/core/domain/automation.js`, `app/actions.js`, `app/ui/case-modals.js` (preview extension) | `tests/app/case-calibration.test.mjs`: four-case no-uplift, fifth settlement updates open reserve, forecast freeze unchanged, P80 priority, live preview and catalog; local-only evidence, small sample floor and field performance remain **[UNVERIFIED]** |
| Negotiated-versus-realised settlement calibration (Session 38): fourth derived prediction ledger; only explicit positive signed values paired with explicit realised values; cohorts never mix currencies or issue direction; incomplete settled records remain in a follow-up list; counts only below n=5; at n≥5 a 20% median directional shortfall raises `NEG-09` for review, not cause attribution; `RULE-NEG-07` idempotently refreshes the derived cohort with `RULE-NEG-06`; prior-cohort preparation context excludes the current agreement; `calibration` CSV exports scored pairs, count-only cohort summaries and missing-actual rows; no FX, inferred actuals or automatic target changes | `app/core/domain/calibration.js`, `app/core/domain/automation.js`, `app/core/domain/insights.js`, `app/actions.js`, `app/views/{decisions,negotiation}.js`, `app/core/csv.js` | `tests/app/calibration.test.mjs` (currency/direction separation, n=4 withholding, inclusive 20% trigger, `NEG-09`, CSV, JSDOM + axe) + `tests/app/negotiation.test.mjs` (real settlement propagation, idempotent audit, prep context); final canonical verification recorded below |
| Case closeout → 1:1 learning lifecycle (Session 34): `RULE-COACH-02` changes the exact tagged case-generated support topic to a blameless systemic-learning prompt at resolution and restores support on reopen; employee-authored topics stay intact and no content enters performance-review evidence | `app/core/domain/automation.js`, `app/actions.js` | `tests/app/cases-automation.test.mjs`: create → resolution → reopen, idempotency, case reference, owner topic preservation and audit propagation; legacy untagged prompts remain unmodified (and ambiguous legacy entries are not rewritten) |
| Budget envelopes & financial commitments (Schema v24, Session 39): encumbrance lifecycle `planned → committed → spent/released`; forecast-at-completion vs ceiling with planned lines as pipeline exposure; missing actuals/unpriced commitments label the forecast understated (never zero-filled or copied from committed); one currency per envelope; `RULE-FIN-01` breach → exactly one open DACI trade-off; `RULE-FIN-02` typed `funds` edges + neutral goal check-ins + reverse `actualsDueOn` stamping from case resolution / negotiation settlement / portfolio delivery; `RULE-FIN-03` + fifth calibration ledger (pooled dimensionless actual÷committed ratios, counts-only below n=5, median ≥1.20× → `FIN-04` review prompt, calibrated forecast shown beside — never instead of — the recorded one); `FIN-01..05` incl. Liebman & Mahoney anti use-it-or-lose-it period-end guard; `finance` CSV scope (#24); conflicts/pulses forbidden as budget sources | `app/core/domain/finance.js`, `app/core/domain/{automation,calibration,cases,insights,health}.js`, `app/core/{schema,csv,store,demo}.js`, `app/actions.js`, `app/ui/finance-modals.js`, `app/views/{finance,today,decisions,settings}.js`, `app/main.js` | `tests/app/finance.test.mjs` (FAC boundaries, breach→DACI idempotence, funds/neutral goal telemetry, completion→actuals-due→calibration trace, FIN signals, CSV CWE-1236, rewind, JSDOM + axe) |
| Stakeholder Influence Register (Schema v25, Session 40): first-class linkable political record with all seven Mitchell-Agle-Wood (1997) salience classes incl. evidence-confidence-adjusted score, canonical Mendelow power×interest 5×5 matrix and cadence, Tsebelis veto heuristic (≤25 points per gate, +5/+8 cohesion penalties, feasible/contested/blocked bands, per-analysis confidence), union-find alliance blocs with power-weighted stance centroids plus directional opposition/influence edges and hidden-influencer detection; strict reconciliation of embedded case/change/negotiation stubs (exact name/person match only, coverage % and unmapped hygiene); `RULE-STK-01` idempotent `involves` edges, `RULE-STK-02` exactly-one DACI alignment decision per adverse-veto initiative, `RULE-STK-03` blameless 1:1 stance-shift topics (internal high-salience only), `RULE-STK-04` read-side cadence watch; signals `STK-01..07`; register/matrix/network/detail routes + three dialogs with live readouts and dry-run propagation preview; Today triage; `stakeholders` CSV scope (#25, 32 columns, CWE-1236-safe) with contextual-integrity stance/note redaction; additive 24→25 migration; `clearDemo` and rewind fidelity parity; 12-record demo that stays automation-silent | `app/core/domain/stakeholders.js`, `app/core/{schema,csv,store,demo}.js`, `app/core/domain/{automation,insights,cases,health,export-governance}.js`, `app/actions.js`, `app/ui/stakeholder-modals.js`, `app/views/stakeholders.js`, `app/views/today.js`, `app/main.js`, `app/styles.css` | `tests/app/stakeholders.test.mjs` (39 tests: salience/Mendelow/veto math incl. band edges and cohesion, bloc graph, strict reconciliation, normalizer repairs, migration, CRUD + cross-module propagation idempotency, cadence proposals, archive/delete cascade, dry-run preview, CSV 32 cols + scrubbing, rewind, clearDemo, JSDOM + axe 0); graphical browser/AT validation **[UNVERIFIED]** |
| 536 automated tests across 40 suites | `tests/app/**` | `npm test` — latest canonical run recorded in AI-SESSION-LOG.md Session 40 |

Baseline measured on the demo workspace (`2026-10-25T10:00:00Z`, session 24): **44 findings
across 31 rule ids** (including `CAP-01` at 86% utilisation, `CAP-02` queue-delay ≈7.1×, and
`CAP-03` for 13.34 undecided person-days across 2 items); capacity supply **72.8 person-days**,
operational reserve **14.56**, allocatable **58.24**, committed **50.09** (19.92 reserved for
incidents/scaffolding + 30.17 funded), slack **8.15**, per-person bottleneck Mei Lin Chen at
184% of her allocatable share, funded-scope P50 2026-11-09 / P80 2026-11-10, 2 delivered plan
items in the 8-week window (observed cycle time 40 days). Session 23 figures follow:
health **55.1 (C)**, 30-day matched trend **+8.3** (`previous: 46.8`, `fidelity: approximate`), pulse **n=5**, overall
**2.55/5**, safety **2.8**, workload **2.0**; **41 findings across 28 rule ids (including `CASE-02`, `CASE-03`, `CASE-04` across 2 demo operational cases and 7 cross-module links; `DEC-02` active on the 4-day-overdue warehouse-metrics decision review),
4 wins**, **2 overdue development reviews**, **1 overdue decision review**, and **2 High Action Priority operational cases** surfaced directly on `#/today`. Follow-through: **2 open promises**, 1 of them carried forward once, **2 completed
with the confirming 1:1 recorded**, 0 dropped; no promise has yet survived two conversations,
so `CONV-06` does not fire on the demo (it is covered by its own test). Ownership: **1 promise
owned by the leader** (overdue, carried once, so `CONV-07` fires once at severity 3 and
`CONV-05` stays silent), **1 owned by the report**, **0 shared**, **0 unrecorded**. Feedback
latency: **5 measured, 2.6d average, 1 beyond convention** (4 given-direction samples at 3.0d
plus 1 received); goals: **3 co-authored, 2 explicitly leader-set**; delegations: **2 active,
1 blocked/overdue, 1 check-in due, 1 completed, 1 returned** (with Mei's active stretch delegation
linked to her GROW commitment); onboarding & transitions:
**2 active 30-60-90 plans** — Samuel Okafor (new-hire, Day 38, 1 pending stakeholder
introduction and overdue Day 30 check-in/checkpoint surfacing `ONB-01`, `ONB-03` and `ONB-04`)
and Mei Lin Chen (role-transition, "Billing platform tech lead", Day 12 of the new scope at
260 days' tenure, no scaffolding gaps, no `ONB` signal). No conflict cases are fabricated in
the demo. The stricter comment policy releases **0 comments**. All routes render without errors
in JSDOM.

**Correction (session 13).** The previous version of this paragraph (health 54.5 (D), trend
+7.7 `exact`, 35/22/12/3) does **not** reproduce on the session-12 tree at the stated clock:
session 13 measured the untouched pre-session tree and got the numbers above. The stale
figures were most likely recorded mid-session-12, before that session's final demo/ledger
edits landed. Identical pre/post health aggregates (`55.1 (C)`, `+8.3`) also confirm zero
unintended health drift across sessions 13–16.

---

## Session 24 gap decision

The audit found one genuine hole rather than a missing framework: every existing module recorded
*intent* (goals, delegations, cases, onboarding) and none answered whether the team could deliver
it. Capability maturity models (CMMI), OKR tooling and portfolio tools all assume this layer
exists. Session 24 therefore built the operating-plan layer and — more importantly — wired it into
the existing rules engine so capacity is maintained by the same event-driven propagation as
everything else (RULE-CAP-01/02/03). Session 25 extended this same engine with RULE-CAP-04:
explicit delegation-to-portfolio source links now close the plan item on verified delegation
completion, retaining the completion date and append-only automation history. No estimate is
inferred, returned work is not counted as delivered, and no new schema version, runtime
dependency, backend, network call or account was introduced.

## Session 26 gap decision and next priorities

The audit found one class of high-leverage decision the product did not model at all: who to hire.
Every other module assumed the team's composition as given, so the operating plan could reserve
capacity for work but not for the interview effort that changes who is available, and the review
module could assess performance but not the evidence that predicted it. Session 26 added Selection
& hiring as a first-class module and wired it into the same event engine (RULE-HIRE-01..03) rather
than a new code path: opening a role now commits capacity, accepting an offer now creates the
roster record and the 30-60-90 plan, and a stalled role now becomes a full operational case with the
existing FMEA/PERT/stakeholder/decision/delegation fan-out.

Two research corrections happened *inside* this session and are worth recording because they changed
the product, not just the prose. First, the initial implementation used Schmidt & Hunter's (1998)
validity table with work samples at .51 and unstructured interviews at .18 — the second figure was
simply wrong (unstructured is .38 in 1998, and .18 is years of experience). Second, retrieving the
current literature showed that table has been superseded: Sackett et al. (2022) revised the
estimates downward and reordered them, making structured interviews the strongest single method and
demoting work samples from .54 to .33. The coefficients, the band floor and one UI claim ("a work
sample is the highest-validity signal") were all corrected. Nothing in the evidence maths depends on
which table is used — the weights are inputs — but the product's advice now matches the current
evidence rather than a 1998 table that most hiring advice still repeats.

Next, ordered by impact:

1. Validate the hiring screens in real desktop/mobile browsers plus screen-reader and manager
   comprehension checks; then run one real hiring round against the app and compare the evidence
   weighting with the decision the manager would have made unaided. No field validation exists.
2. Audit and remediate critical/high dependencies and deployment posture in the non-canonical
   Next/PostCSS/Sharp tree before any such deployment; its current state is **[UNVERIFIED]**.
3. Large-workspace and real-practice validation for capacity, cases and hiring together; and a
   deliberate decision on whether candidate records need a retention/erasure prompt on a timer
   (currently deletion is manual, which is honest but easy to forget).

## Session 27 outcome and next priorities

Three carried-over priorities were worked. One was completed, one was completed-with-a-correction, and
one is **blocked by the environment** and is reported as blocked rather than approximated:

1. **Real-browser / screen-reader / manager-comprehension validation — BLOCKED.** Playwright's browser
   CDN and Google's are outside the network allowlist, and the in-package Chromium build
   (`@sparticuz/chromium`) cannot start without `libnspr4`/`libnss3`, which needs root and a Debian
   mirror that is also blocked. No screen reader can run here either (NVDA/JAWS need Windows,
   VoiceOver macOS, Orca a GTK/AT-SPI stack and audio). A real hiring round needs a real manager.
   In place of a browser, a structural audit was written that tests what axe does not — heading
   outline, accessible names, table semantics, focus trap/restoration, live regions — and it found
   four real defects, including destructive confirmations that deleted records *before* the user
   answered. Comprehension and spoken reading order remain unmeasured, and are the roadmap's first
   item: run the checklist in `docs/VALIDATION-2026-10-25-session-27.md` in a real browser with a
   human, then watch three managers use `#/hiring` with a candidate in front of them.
2. **Dependency audit — DONE, with a correction to the framing.** `npm audit --omit=dev` went from one
   critical + two high to zero (Next 16.4.3, PostCSS 8.5.31, drizzle-kit 0.31.11). But the audit was
   never the real obstacle to deployment: the legacy Next app **does not build** (missing
   `toolEffects` export, 6,977 TypeScript errors, root `App.tsx` importing modules that do not exist),
   verified as pre-existing against both dependency sets. The honest statement is "no production
   vulnerabilities in the installed tree, and nothing there to deploy". Four moderate advisories remain
   in a dev-only esbuild chain whose fix is a breaking downgrade of the migration CLI; declined.
3. **Large-workspace validation and retention — DONE.** A 120-person/300-case/40-role/320-candidate
   workspace with 900 edges normalizes in ~35 ms and exports in under a second; a 300 × 5,000 stress
   ratio exposed a quadratic scan in `hiringSummary` and the hiring CSV export, now indexed. The
   retention decision is made and shipped as **Schema v18**: prompt, never delete on a timer, with
   exemptions visible and unknown ages reported as unknown.

Next, in order:

1. Real-browser + assistive-technology pass on the three newest modules (the checklist exists; it
   needs a browser and a human), then manager comprehension testing on `#/hiring`.
2. Decide the fate of the non-canonical Next tree: repair the build (a large, separate effort against
   6,977 errors), or delete it and keep `src/**` as a documented archive. Leaving a tree that cannot
   build in the repository is a standing invitation to assume it works.
3. Retention follow-through: an export-time note when a workspace still contains records past the
   window (so the prompt is not the only place the obligation appears), and a decision about whether
   `keepInTouch` records should ever expire on their own.
4. Field validation of the hiring evidence model: one real round, with the manager's unaided decision
   recorded first, then compared.

## Session 28 outcome and next priorities

Two structural gaps across management, operations, systems engineering, organizational economics,
political science, and statistical process control were closed in **Schema v19**:

1. **Separating signal from noise in operational & health time series (`spc.js`).** Previously,
   week-to-week deltas on `#/health` could look alarming even when fluctuations sat squarely inside
   routine common-cause variation, and leaders had no rigorous way to verify whether a process or
   boundary change actually improved an operating metric. LeadOS now computes Shewhart/Wheeler
   Individual & Moving Range (`XmR`) natural process limits (`X̄ ± 2.66 mR̄`, `URL = 3.267 mR̄`),
   evaluates Western Electric Rules `WE-1`..`WE-4`, refuses to interpolate across missing windows,
   and verifies baseline-vs-post shifts (`compareBaselineShift`).
2. **Closing the gap between systemic diagnosis (`#/cases`) and team/charter redesign (`#/changes`).**
   Every previous module treated team boundaries, interaction modes, and reporting charters as fixed
   background facts. `#/changes` synthesizes Conway's Law / Team Topologies, Sweller Cognitive Load,
   Brooks's Law (`N(N-1)/2` inter-team channels), Galbraith's 5-Point Star + Holmström–Milgrom
   incentive checks, Kotter's 8-Step progression, Lewin Force-Field equilibrium, and Mendelow +
   Tsebelis veto-player coalitions — wired into the event-driven rules engine (`RULE-CHG-01`..`05`)
   with vertical capacity cascade into `RULE-CAP-02` and bidirectional escalation with `#/cases`.
3. **Five pre-existing cross-module defects audited and fixed:** `normalizePortfolio` running before
   `normalizeRequisitions` (which silently wiped `sourceType: 'requisition'` to `'manual'` on reload),
   `previewCasePropagations` omitting `{ now }` on `buildCapacityModel`, `reconstructStateAt` omitting
   `requisitions` and `candidates` during historical rewind, `capacity-modals.js` using blocking
   `window.confirm` instead of accessible `confirmDialog`, and `settings.js` exposing `changeReviewDays`.

## Session 29 outcome and next priorities

All four Session 28 carry-over priorities were completed in **Schema v20**:

1. **Real-browser WCAG 2.1 AA, ARIA tree & 320px/390px/1440px reflow audit (`docs/VALIDATION-2026-10-25-session-29.md`) — DONE in Chromium `143.0.7499.0` (spoken AT still `[UNVERIFIED]`).**
   Extracted `@sparticuz/chromium`'s bundled `al2023` shared libraries into ephemeral `/tmp` scratch and
   ran Headless Chromium `143.0.7499.0` across 11 routes (`#/today`, `#/insights`, `#/cases`, `#/cases/:id`,
   `#/changes`, `#/changes/:id`, `#/capacity`, `#/hiring`, `#/hiring/:id`, `#/settings`) and 4 modals.
   Uncovered and fixed **7 real browser-only defects** (`.row-muted` opacity contrast, active `.nav-count`
   and `.tab-count` contrast, 2 WCAG 2.5.3 `label-content-name-mismatch` labels, `.card-head`/`.card-actions`
   390px/320px overflow, and float precision in `#/capacity` ARIA bar text), plus a `store.clearDemo()`
   omission on `state.changes`. Post-fix audit: **0 `axe-core` violations, 0 overflows, 0 console/page errors**.
2. **Pre-export candidate retention (`HIRE-08`) & contextual-integrity disclosure (`export-governance.js`, `export-dialogs.js`) — DONE.**
   JSON, operational, encrypted-backup, and sensitive CSV (`hiring`, `cases`, `changes`) exports now surface
   overdue candidate records, disabled retention windows, conflict cases, and candid `skeptical`/`resistant`/
   `opposing` stakeholder or veto-player stances before download, offering non-destructive export-only
   redactions (`pruneOverdueCandidates`, `redactStakeholderStances`, `redactConflicts`) and logging a
   private-content-free `export.disclosed` event.
3. **Seeded Monte Carlo portfolio, Critical-Chain bottleneck & coupled J-curve simulation (`simulation.js`, `RULE-CAP-05`, `SIM-01`/`SIM-02`) — DONE.**
   Reproducible Mulberry32 + Marsaglia–Tsang Beta-PERT simulation exposes Sam Savage's *Flaw of Averages*
   and Goldratt's *Critical Chain* owner contention (`+11` calendar-day P80 slip on the demo workspace despite
   99.1% mean fit) and couples portfolio congestion into active organizational change J-curve payback quantiles.
4. **Legacy `src/**` / root `.tsx` disposition — DONE via [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md).**
   Quarantined in place as a frozen historical archive (preserving `eslint-config-next`'s transitive
   `axe-core` dependency without mass-deletion churn) and enforced by `scripts/check-canonical-boundary.mjs`
   inside `npm run verify:canonical`.

Next, ordered by impact:

1. **Spoken screen-reader & cross-engine validation** (VoiceOver on macOS/iOS, NVDA on Windows, Orca on
   Linux desktop; Firefox Gecko & Safari WebKit; print/PDF pagination on `#/prep/:id` and `#/reviews`) —
   remains **[UNVERIFIED]** in headless container.
2. **Field validation with real engineering managers** across hiring rounds, portfolio trade-offs, and
   team-boundary changes to test whether weighted validity, Monte Carlo tail-risk alerts, and XmR charts
   improve unaided judgement — **[UNVERIFIED]**.
3. **Scenario sandboxing ("what-if" non-persisted portfolio & topology scratchpad)** allowing a leader to
   compare two candidate funding/staffing mixes side-by-side against Monte Carlo P80 dates before writing
   to the live workspace.

## Session 30 outcome and next priorities

Session 29's #3 roadmap priority — non-persisted counterfactual scenario sandboxing — shipped in
Session 30 without schema bloat (`SCHEMA_VERSION = 20` preserved), paired with One-at-a-Time Tornado
sensitivity analysis, Brooks's Law onboarding drag physics, `RULE-SCN-01` parallel commitment, and 7
audited cross-module bug fixes (`RESEARCH.md` §40):

1. **Zero-mutation What-If Scenario Sandbox & Pareto Frontier Matrix (`scenarios.js`, `#/scenarios`) — DONE.**
   Evaluates Baseline alongside interactive sandbox levers and context-aware presets over `structuredClone`
   using Law & Kelton Common Random Numbers (`seed`), classifying Pareto-optimal vs. dominated trade-offs
   across overload probability, owner-constrained P80 completion, and multi-ledger risk-adjusted net value,
   and modelling Brooks's Law tenured-team mentoring drag against Watkins 30-60-90 ramp supply.
2. **One-at-a-Time (OAT) Tornado Sensitivity & `RULE-SCN-01` Governance Loop — DONE.**
   Ranks workspace commitments, reserves, and double-loop operating parameters by total P80 schedule swing
   (`tornadoChart` + `sensitivity` CSV #21), surfaces `SCN-01` when the live plan is Pareto-dominated, and
   separates non-destructive DACI logging (`recordScenarioDecision`) from atomic workspace execution
   (`commitScenarioLevers`, cascading `RULE-CAP-01`, `RULE-CAP-03`, `RULE-CAP-05`, and `RULE-CHG-01`..`05`).
3. **Seven pre-existing cross-module defects audited and fixed — DONE.**
   Fixed `documentTitle` route coverage (`capacity`, `scenarios`, `changes`, `change`, dynamic `hiring-detail`),
   `cases[].stakeholders[].keyMessage` governance detection & JSON/CSV redaction, `RULE-CAP-05` catalog
   threshold wording (`≥ 50%`), `reconstructStateAt` candidate rewind, `personOptions`/`goalOptions`
   sentinels & filters, `openSettingsDialog` missing simulation/change fields & zero-allowed minima, and
   `personSupply` proration (`inHorizonShare`) for future `person.startDate > today`.

Next, ordered by impact:

1. **Real graphical browser (`1440px`/`390px`/`320px`) & spoken screen-reader validation on `#/scenarios`**
   (VoiceOver, NVDA, Orca; Firefox Gecko & Safari WebKit; print/PDF pagination on `#/prep/:id` and
   `#/reviews`) — `#/scenarios` passed JSDOM + `axe-core` and live HTTP `serve.mjs` checks, while graphical
   browser rendering and spoken AT remain **[UNVERIFIED]**.
2. **Post-decision forecast calibration ("Brier / P80 calibration feedback loop")** comparing recorded
   DACI/scenario predicted P80 dates and risk-adjusted net values against actual completion dates and
   post-review outcomes on `#/decisions` to surface systematic estimation optimism.
3. **Field validation with real engineering managers** across hiring rounds, portfolio What-If trade-offs,
   and team-boundary changes to measure whether validity weights, Common-Random-Numbers scenarios, and XmR
   charts improve unaided decisions — **[UNVERIFIED]**.

## Session 31 outcome and next priorities

Session 30's #2 roadmap priority — post-decision forecast calibration — shipped in Session 31 as
**Schema v21** (`RESEARCH.md` §41). Until now the product predicted everywhere (PERT triples, Monte Carlo
P80s, CRN scenario odds, DACI calls) and scored nowhere; decisions recorded outcomes without a stated
probability, and delivered work recorded a date without actual effort. Session 31 makes every prediction
class scoreable and scores it:

1. **Decision-forecast calibration (`calibration.js`, `#/decisions`) — DONE.**
   Cromwell-clamped (5–95%) forecasts captured at decide time (base-rate hint shown in the dialog;
   scenario decisions auto-derive theirs from CRN overload odds so Session 30's prose predictions became
   structured and scoreable), Brier (1950) scoring with Murphy (1973) decomposition and a reliability
   quintile diagram, climatology skill, and an anti-hindsight freeze enforced in `updateDecision` /
   `decideDecision` once the outcome is reviewed.
2. **Estimate calibration & reference-class uplifts (`RULE-FCT-01`/`RULE-FCT-02`, `FCT-01`…`FCT-04`) — DONE.**
   Funding freezes an immutable PERT snapshot; a new Deliver dialog captures actual effort/value (never
   pre-filled), with `recordPortfolioActuals` for backfill; ratio distribution, interval-coverage honesty,
   and schedule adherence drive verdicts (n≥5), Flyvbjerg median/P80 uplifts annotate `#/capacity`'s
   delivery forecast, and systematic optimism (median ≥1.25×) opens exactly one DACI governance decision
   linked to the worst overrun. Demo state honestly reports "collecting evidence" (Brier 0.04, n=2).
3. **One pre-existing cross-module defect audited and fixed — DONE.**
   Session 30's scenario commitment wrote the non-canonical lever value `'wanted'` verbatim into live
   portfolio records (the sandbox projection silently ignored it, so the committed scenario diverged from
   the evaluated one until a reload repaired it) and created hypothetical items with a non-canonical
   `'decision'` source type. The view lever now emits `'undecided'`, the commitment boundary canonicalises
   legacy specs, and scenario-committed funding changes participate in `RULE-FCT-01` like any other
   commitment.

Next, ordered by impact:

1. **Real graphical browser (`1440px`/`390px`/`320px`) & spoken screen-reader validation on `#/scenarios`
   and the Session 31 calibration card/dialogs** (VoiceOver, NVDA, Orca; Firefox Gecko & Safari WebKit;
   print/PDF pagination on `#/prep/:id` and `#/reviews`) — both passed JSDOM + `axe-core` and live HTTP
   checks, while graphical rendering and spoken AT remain **[UNVERIFIED]**.
2. **Case-cost calibration ledger**: resolution-time actuals for operational cases (`financial` PERT vs
   settled mitigation spend / realised exposure) scored like portfolio estimates, completing the third
   prediction ledger (RESEARCH §41.7).
3. **Field validation with real engineering managers**, now including whether Brier feedback and
   reference-class uplifts measurably improve forecast accuracy over a quarter — **[UNVERIFIED]**.

## Session 32 outcome and next priorities

Session 31's #2 roadmap priority — the case-cost calibration ledger — shipped in Session 32 as
**Schema v22** (`RESEARCH.md` §42), completing the third and final prediction ledger. Every
quantitative prediction the product makes is now scoreable and scored: decision probabilities
(Session 31), funded-work estimates (Session 31), and operational-risk assessments (Session 32).

1. **Case-cost calibration (`calibration.js`, `#/cases`) — DONE.**
   Settled actuals (materialisation, realised exposure, mitigation spend, diverted days — four
   independent legs, each nullable, never pre-filled) captured in the Resolve dialog or backfilled
   via `recordCaseActuals`, scored against the opening forecast frozen by `RULE-FCT-03` at first
   quantification (pre-v22 history falls back to the labelled `resolution-estimate`). FAIR
   frequency × magnitude legs scored separately (occurrence Brier; exposure ratios + interval
   coverage on materialised cases only), spend/diverted-days discipline legs (the latter finally
   scoring `RULE-CAP-01` reserves), and an actuarial loss-development aggregate over complete
   settlements. `RULE-FCT-04` opens exactly one DACI governance decision at n≥5 & median ≥1.25×,
   linked to the worst under-assessment; `FCT-05`…`FCT-07` surface reserve adequacy, occurrence
   gaps and unscored settlements; the demo reports "collecting evidence" (1 settlement, 1.1939×).
2. **Two pre-existing cross-module defects audited and fixed — DONE.**
   Closing a case via the Edit dialog leaked its `RULE-CAP-01` capacity reserve as open forever
   and skipped the `RULE-GOAL-01` resolution check-in (`propagateCaseEvent` ignores closed cases
   and was the only path `updateCase` ran) — the edit path now runs `propagateCaseResolution`
   identically to `resolveCase`. `reopenCase` left stale `resolutionNotes` in live state that
   schema reload would blank; both reopen paths now clear notes + actuals in step with the schema.
   `reconstructStateAt` also rewinds settled actuals and post-cutoff snapshots so point-in-time
   reads never see a future settlement.

With all three ledgers live, the remaining gaps are verification & field-evidence gaps, not
feature gaps. Next, ordered by impact:

1. **Real graphical browser (`1440px`/`390px`/`320px`) & spoken screen-reader validation** now
   spanning `#/scenarios`, the Session 31 calibration card and the Session 32 case-cost card/chart
   + dialogs (VoiceOver/NVDA/Orca; Firefox & Safari; print/PDF pagination) — all passed JSDOM +
   `axe-core` and live HTTP checks; graphical rendering and spoken AT remain **[UNVERIFIED]**.
2. **Field validation with real engineering managers**, now three-ledger: whether Brier feedback,
   reference-class uplifts and development-factor governance measurably improve forecasting
   accuracy over a quarter — **[UNVERIFIED]**.
3. **Ledger cross-pollination — SHIPPED in Session 33 (`RULE-CAP-06`)**: five or more settled
   diverted-days with median actual/forecast ≥1.25× now calibrate reserve-only capacity triples
   (median normally, P80 for high-priority cases), visible in `previewCasePropagations`; settlement
   refreshes all open case reserves atomically and re-runs capacity trade-off + Monte Carlo tail-risk
   evaluation. The manager-entered estimate and immutable forecast baseline are not changed. Five
   is a conservative product threshold, not a claim of statistical validity; field validation
   remains **[UNVERIFIED]**.

## Session 33 outcome — 2026-10-26: learn from capacity settlements

The top remaining product gap after the three forecast ledgers was that case-cost settlement learning
never changed the operating plan. Session 33 shipped a typed `RULE-CAP-06` bridge without schema
bloat: it measures *diverted-days actuals against the frozen capacity forecast*, not financial-loss
ratios, and only applies after at least five scored observations and a median ratio of 1.25× or more.
The median becomes the normal reserve multiplier; high Action Priority cases use the empirical P80.
Case PERT inputs and the immutable opening snapshot remain untouched, so the ledger continues to score
the original manager belief rather than its own later correction.

A settlement captured during `resolveCase` or `recordCaseActuals` recalculates all open case reserves
within the same store transaction, then invokes the existing `RULE-CAP-02` and `RULE-CAP-05` logic.
The Case dialog's propagation preview exposes the sample count, selected quantile, adjusted and raw
person-days. This follows the local-first operating model; no third-party API or runtime dependency
was added. Atlassian Jira Plans / Advanced Roadmaps documents scenario-specific capacity planning
and work assignment ([capacity planning](https://support.atlassian.com/jira-software-cloud/docs/manage-capacity-in-advanced-roadmaps/),
[scenario planning](https://confluence.atlassian.com/jirasoftwareserver102/scenarios-in-advanced-roadmaps-1473872949.html));
LeadOS adapts the useful pattern of forecasting capacity before commitment but intentionally keeps
case risk, dated actuals, audit provenance, manager-owned estimates, and local cross-module actions
inside one connected record graph rather than mirroring issue-planning mechanics.

**Verification:** `npm run verify:canonical` passed lint, canonical-boundary gate, 88 internal
Markdown links, and 457 tests across 37 suites. Four historical actual-diverted-days examples do not
apply a multiplier; settlement five refreshes an open reserve to median/P80 and leaves the opening
forecast unchanged; preview text and catalog rule are asserted. The five-observation minimum,
median/P80 choice, and 25% trigger are product policies—not universally validated statistical rules.
Real manager calibration benefit and graphical screen-reader rendering remain **[UNVERIFIED]**.

## Next (ordered by value, not by ease)

1. **Real-browser validation of the standalone file across operating systems.** Open
   `LeadOS-standalone.html` from `file://` in current Chrome, Edge, Firefox and Safari on Windows,
   macOS and Linux; verify `localStorage` persistence, JSON import/export, Blob downloads, Web
   Crypto availability, printing and spoken screen-reader output. JSDOM proves boot and structure,
   not browser storage policy; all of this remains **[UNVERIFIED]**.
2. **Real-browser/mobile and assistive-technology validation of the Forecast Integrity Terminal.**
   Validate the conformal-band visual, five-tab navigation, board-brief copy/download and challenge
   response dialog in Chromium at desktop/mobile widths with spoken screen-reader output. JSDOM +
   axe-core is structural evidence only; comprehension of "coverage bound", "exchangeability" and
   "low-confidence pooled prior" by first-time managers remains **[UNVERIFIED]**.
3. **Conformal drift and exchangeability research.** The 80% band is marginal and assumes future
   errors are exchangeable with settled ones. Investigate weighted / rolling-origin conformal
   variants and an explicit process-change detector, then field-validate n=5, 1.25×/0.80× and
   p≤0.10 guardrails on consented workspaces. They are transparent conventions, not validated
   constants; all remain **[UNVERIFIED]**.
4. **Teach the case cascade about unknown priority.** Session 51 made "unrated" representable
   and visible, but automation that keys on action priority still reads `computeFmea`'s
   arithmetic defaults for unrated cases. Decide explicitly what an unrated case may and may
   not trigger (suggested: it may draft comms with a "risk not yet rated" gap — already true —
   but must not escalate on a defaulted priority), then make the rules say so. Verified-by: a
   test that an unrated case produces no priority-driven escalation.
5. **Comms outbox hardening.** (a) Decide the CSV scope for drafts, with the data-minimisation
   trade-off stated. (b) Add a per-workspace pause switch that mirrors `allocationAutoPropagate`.
   (c) Add a property test that every number and date in a generated draft traces to a field on
   the case, which turns "never invents a fact" from a design claim into a checked invariant.
6. **Allocation Governor, second pass.** (a) Time-decayed arm learning (discounted UCB) once a
   workspace has enough settled history for "the environment moved" to be measurable rather
   than assumed. (b) Effort-quantile rewards (median-of-ratios vs ratio-of-sums) reported side
   by side so one giant settlement cannot silently own an arm. (c) A Today-queue entry when a
   rebalancing decision goes stale. All **[UNVERIFIED]** until field use shows the failure mode.
7. **Legacy dependency remediation and large-workspace verification.** Audit the frozen
   Next/PostCSS/Sharp chain before any legacy deployment, then measure the O(records) post-commit
   scan on 1,000+ prediction atoms. Neither claim is made today; both remain **[UNVERIFIED]**.
8. **Cognitive Load Governor, second pass.** (a) Effort-weighted throughput (weighted Little/
   Kingman inputs) beside the current item-count flow, once workspaces carry enough dated
   completions to choose the weighting from evidence rather than invention. (b) Correlation-aware
   Monte Carlo for blocked portfolios (the dependency topology already exists; the per-person
   draws currently assume PERT independence). (c) A Today-queue entry when a RULE-LOAD-01
   shed decision goes stale, mirroring the Allocation Governor's planned stale-decision card.
   (d) Field-validate the 0.40/0.25/0.20/0.15 weights, the 80% threshold and Kingman c=1 on
   consented workspaces; until then they remain labelled conventions, **[UNVERIFIED]** as
   constants. (e) Time-decayed queue windows beyond the fixed 4–26 week setting.

*(Shipped in Session 51 and removed from this list: the FMEA default-rating gap (blank ratings
persist as null; verified by the test this item specified) and the `store.lastPropagations`
defect (wired, not deleted — action results now carry real propagations).)*

*(Shipped in Session 52: per-workspace pause switches now exist for the Load Governor as
`loadAutoPropagate`; the per-workspace pause pattern requested for the comms outbox in item 5(b)
remains open specifically for comms — the Load implementation is the reference pattern.)*

*(The 1:1 follow-through ledger shipped in Session 10, the GROW ledger in Session 12,
role-transition 30-60-90 plans in Session 13, conflict-redacted operational exports in Session 14,
Today's development-review queue + succession-to-transition handoff + return-to-work `reboarding`
plans in Session 15, and Today's decision-review queue + delegation-to-GROW handoff + 1:1
prep-sheet carry-through in Session 16, actionable phase check-ins + mobile overflow repairs in Session 17, actionable delegation check-ins in Session 18, explicit performance-review → GROW/Goal handoff in Session 19, and manager-owned Day 30/60/90 check-in follow-up in Session 20, with selected headless-Chromium lifecycle/keyboard validation in Session 21 and field-linked inline validation errors in Session 22 — see the Done table above.)*

## Later / deliberately deferred

| Item | Why deferred |
|---|---|
| Legacy dependency remediation | Fresh production audit has 1 critical / 2 high findings in Next/PostCSS/Sharp. Not imported by the static app; upgrade and validate before any legacy deployment, rather than treating canonical tests as clearance. |
| Large-workspace performance, cross-browser/assistive-technology and print verification | Session 17 re-ran both Chromium smoke scripts at selected desktop/mobile states; these broader behaviours remain [UNVERIFIED]. |
| Multi-user, org hierarchy, shared workspaces | Requires a backend, accounts and an honest privacy story. The current invariant is "no network, no server", and breaking it needs an ADR, not a sprint. |
| Upward / 360° feedback | Needs multiple raters to mean anything (see `RESEARCH.md` §10). |
| Notifications, email or calendar sync | A browser tab cannot schedule work; promising reminders it cannot deliver would be a silent failure. |
| Mobile app | The responsive web app is the mobile app until there is a reason otherwise. |
| AI/LLM assistance for drafting feedback | Needs network calls and would put unreviewed text in front of a person's record; the SBI coach is deterministic and auditable. Revisit only with a local model and a clear provenance marker. |
| Sentiment analysis of pulse comments | Unverifiable inference; violates the no-fabrication invariant. |
| Gamification (streaks, badges) | Rewards logging rather than leading; the scores already carry the incentive risk. |
| Storing candidate protected characteristics to compute adverse-impact ratios | The 4/5 rule needs race/sex/disability data that a local, single-manager browser tool has no lawful basis or safe storage for. The app checks *process* parity (same competencies assessed for everyone) instead, which is auditable without collecting special-category data. |
| A "culture fit" score | Unfalsifiable, reliably a similarity-to-measure, and the most common route by which structured processes collapse back into affinity bias. |
| Auto-rejecting candidates below an evidence threshold | A model that removes people from consideration without a human decision is not decision support. The app flags gaps and requires a recorded rationale and acknowledgement; the person still decides. |
| Deriving the cost of vacancy from a salary band or revenue assumption | Would invent the most persuasive number on the screen. Only a daily figure the leader records is used; otherwise the delay is shown as unpriced. |
| Parsing résumés or importing candidate data from a file | Adds an unverifiable inference step (and a data-protection surface) to the one place where evidence quality is the product. Evidence is recorded by the person who observed it, with the method named. |
| Treating "years of experience" as a scored competency | It is in the table at .07 precisely to show how little it carries; making it a required competency would quietly rebuild CV screening into the rubric. |

---

## Rejected, with the reason recorded

| Idea | Reason |
|---|---|
| Repairing the legacy React/Next trees into the product | They are non-canonical and were not executed in the latest session; current runtime claims apply only to the zero-build app. Replacing the canonical architecture would require a fresh audit and ADR, not an assumed repair path. |
| Promoting several competing entry points | One canonical entry and test suite avoid contradictory product claims. Historical trees stay as evidence, not additional supported products. |
| Soft-deleting demo data silently | Replacing a leader's real records with fabricated ones is the worst possible failure mode; the store refuses without explicit confirmation. |
| Showing a pulse average under the anonymity floor | Makes individual answers recoverable by subtraction. Suppression is shown as a state, with the count, so it never looks like a broken chart. |
| Scoring missing data as zero | Turns "no evidence yet" into "failing". Unmeasurable dimensions are excluded and the weights renormalise. |
| Inferring missing observation dates or goal authorship | An unknown observation date is not instant feedback, and unknown authorship is not proof the leader set the goal. Both remain explicitly unknown until recorded. |
| A universal seven-day latency or check-in “best practice” score | The research supports timeliness and follow-through, not one validated cutoff for every team. Seven days is a configurable convention, shown as such. |
| A hard validation block on vague feedback | People stop logging. The app coaches instead, and keeps the note. |
| Trend lines with a single data point | Implies knowledge that does not exist; the UI says "not enough history" instead. |
| Self-assessment quizzes (leadership style, personality) | Not falsifiable against records, and they invite the leader to substitute a label for observation. |
| A numeric "leadership score" for the leader | Would turn a diagnostic tool into a grade, and the grade would be gamed. Team health is measured; the leader is shown their behaviour, not a mark. |
| A numeric "onboarding score" or culture-fit rating on new joiners | Conflates missing manager scaffolding (no buddy, unclear scope) with employee capability, and unfalsifiable culture-fit labels invite bias. |
| HR / IT administrative orientation checklists (laptop, payroll, tax forms) | Administrative compliance belongs in HRIS/IT tooling; mixing paperwork into a leadership workspace crowds out role clarity, introductions and coaching. |
| Auto-importing onboarding check-in blockers into performance reviews | Punishes candour in the first 90 days when psychological safety to name confusion matters most. |
| Defaulting every new 1:1 action's owner to the report (or to the leader) | The most common product default and the least honest: most promises are the report's, so a wrong default is invisible, and the leader's own half of the ledger disappears. LeadOS records "not decided yet" and counts the gap. |
| A free-text owner name on a 1:1 commitment | A 1:1 has exactly two participants; free text invents a roster the app cannot verify and makes "who owes it" unanswerable. |
| Retroactively reassigning a closed or carried promise | Rewrites who was responsible after the fact. Reassignment is an explicit, logged action on the live copy only. |
| Automatic carry-forward of every unfinished 1:1 action | Makes a repeating commitment invisible and removes the one moment where a leader could re-scope or drop it. 15Five and Lattice both default to this; LeadOS asks, and keeps the decision. |
| Deleting a dropped commitment | The decision to stop is evidence. Keeping the reason supports "what did we choose not to do?" and stops the same promise being re-made blindly. |
| A commitment completion-rate score per person | The data is manager-entered and incomplete; a percentage would reward under-recording and read as a performance rating. Counts, dates and reasons only. |
| Resetting `person.startDate` to start a transition plan | Falsifies tenure and every tenure-derived behaviour (new-joiner detection, `ONB-01`/`ONB-02`, "years on the team"). The plan carries its own anchor; the roster record is history. |
| Inferring a role transition from a role/title edit | Only the leader knows a move actually happened — auto-creating plans from edits would fire on typo fixes and title normalisation. A transition is recorded deliberately, like every other record. |
| A separate `state.transitions` collection | One 30-60-90 record with a `kind` keeps the one-active-plan-per-person invariant, the Day 90 gate, signals and exports in a single code path. A second silo would duplicate all of it to answer the same "first 90 days in the role" question. |
| Storing a `leaveReason` / medical field on `reboarding` plans | Invites special-category health or personal leave data (GDPR Art. 9) into a local browser tool that needs only operational catch-up and load-pacing scaffolding. |
| Auto-copying readiness notes or warnings into `roleClarity` on succession handoff | Past readiness notes are evaluation gaps, not agreed 90-day scope and decision authority; auto-copying fabricates `roleClarity` and silences `ONB-03` before expectations are written. |
| Auto-updating `person.role` when starting a role-transition plan from `#/readiness` | A transition plan may cover an acting seat or phased handover before a title change; roster edits remain deliberate. |
| Auto-closing a GROW `will` commitment when its linked delegation completes | Completing a deliverable is operational execution; capability growth requires an explicit coaching reflection on what was learned before closing the GROW commitment. |
| Treating undecided decisions with past `reviewOn` dates as overdue outcome reviews (`DEC-02`) | An unmade decision needs a call (`DEC-01`), not an outcome review; mixing the two lets `reviewDecision` run before any option is chosen. |
| Automatically clearing all `person.talkingPoints` whenever any 1:1 is logged | Wipes topics the conversation ran out of time to cover — or wipes topics on a `skipped`/`moved` 1:1. Only checked employee topics in a `held` 1:1 are cleared. |
| Auto-computing organizational "change readiness" or "resistance scores" per employee | Labels healthy technical skepticism as personal resistance, punishes candour during reorganizations, and violates psychological safety; LeadOS models structural force-field barriers and role clarity instead. |
| Interpolating missing weeks in Shewhart XmR control charts | Fabricates artificial low moving ranges (`mR`) that narrow natural process limits (`X̄ ± 2.66 mR̄`) and trigger false special-cause alarms. |
| Unseeded `Math.random()` Monte Carlo draws in `#/capacity` and `#/changes` | Produces jittery P80 dates and flaking `RULE-CAP-05` / test assertions on every re-render; Mulberry32 seeded PRNG keeps simulation 100% deterministic for a given workspace state and seed. |
| User-entered task-by-task correlation matrices (Gaussian/t-copulas) in portfolio simulation | Requires $O(N^2)$ unobservable correlation inputs that managers guess poorly, creating false precision; coupled capacity congestion + owner-level Critical-Chain contention captures the primary structural dependency directly from recorded ownership. |
| Silently auto-deleting overdue candidate records (`HIRE-08`) on timer or during export | Destroys local evidence without informed human review; LeadOS surfaces overdue records at export time and offers opt-in export-copy pruning while leaving live deletion explicit and audited. |
| Mass-deleting quarantined legacy trees & stripping `eslint-config-next` without offline replacement | Would create a multi-hundred-file churn diff and sever the offline transitive `axe-core` dependency in restricted sandboxes; ADR-0007 freezes and gates the boundary with zero churn (`check:boundary`). |
| Auto-updating `person.role` or archiving team members when a `#/changes` record is activated | Structural proposals and phased transitions often precede formal HR title changes; LeadOS scaffolds 30-60-90 role-transition plans (`RULE-CHG-03`) while keeping roster mutations explicit. |
| Using Student's t-test or p-values on 4–8 operational observations to declare a change "statistically significant" | Small auto-correlated operational series violate i.i.d. parametric assumptions; Wheeler's XmR process-behaviour limits (`X̄ ± 2.66 mR̄`) are purpose-built for short sequential operational series. |
| Automatically rewriting a recorded forecast from the reference class | Destroys the immutable evidence that calibration is scored from and turns a learning loop into silent data loss. LeadOS stores the outside view in a separate reviewable challenge. |
| Counting unverified "backup" or "trainee" stewards toward Bus Factor | Paper backups hide single points of failure; Bus Factor only rises when independent operation is explicitly verified (`verifiedOn`) or proven in a drill. |
| Auto-marking a backup steward as verified when a cross-training delegation completes (`RULE-RES-06`) | Completing a task is not proof of independent recovery capability; human verification stays explicit so continuity metrics are never fabricated. |
| Treating Bus-Factor-1 SPOF concentration as an individual performance rating | Being a sole steward is an org-design vulnerability, not an employee fault; `RULE-RES-02` frames cross-training blamelessly around focus and vacation protection. |
| Summing multi-currency vendor spend into a single global HHI or single-currency REI | Offline FX assumptions would invent numbers; HHI and REI are computed strictly per currency cohort. |
| Cloud git-commit or Slack-scraping ingestion for Bus Factor | Violates LeadOS's zero-network local-first invariant and conflates line-of-code volume with operational runbook/vendor continuity. |
| Pooling money, days and probabilities into one "confidence score" | Incommensurable units and proper scoring rules; probabilities use Brier/Murphy, magnitudes use dimensionless ratios, amounts stay currency-segmented, and the pooled mixed-quantity prior is explicitly low confidence. |
| Assuming normal/log-normal forecast errors to draw a ±1.28σ band | Operational overruns are heavy-tailed and n is small. A distribution-free conformal band with a finite-sample coverage bound is honest about the exchangeability assumption instead. |
| Claiming conditional coverage for every team, vendor or person | Distribution-free conditional coverage is impossible in general with these data. The guarantee is marginal; the UI says so and keeps counts-only guardrails below n=5. |
| Sending workspace forecasts to a cloud LLM for "AI predictions" | Violates the local-first invariant and would introduce unverifiable outside data into a manager's private record. Every number in the terminal is derived from that workspace's own outcomes. |
| Keeping `<script type="module">` in the portable copy and relying on a browser flag | `file://` module imports are CORS-blocked by design; `--allow-file-access-from-files` is insecure and still needs the whole folder. The standalone build uses one classic inline script. |
| Saving records back into the standalone HTML file from the browser | File-write APIs are browser-specific and permissioned; silent loss is worse than an explicit Export JSON / Import JSON flow. |
| Sharing one storage key between the served app and the portable file | A local file and an HTTP origin can collide in the same browser; the standalone build uses `leados.standalone.v1`. |
| Claiming `file://` always has `localStorage` and Web Crypto | Browser policies differ for opaque origins. The app degrades to in-memory with a visible warning and honestly disables encryption when Web Crypto is unavailable. |

---

## Known gaps I am not pretending are closed

- Pulse anonymity and independent respondents cannot be guaranteed by a local single-manager workspace. Partial/unanimous/thin-comment windows now suppress more conservatively; that intentional loss of visible data is a safety tradeoff, not a chart regression.
- Conflict confirmations are manager-entered, not employee signatures or independent testimony. Handoff sends nothing. The browser copy can now be encrypted, but CSV and plain-text JSON exports stay unencrypted by design, so a downloaded backup is as protected as its folder. No real-manager conflict-practice validation has been performed.
- The operational copy's `redactions` marker is a declaration, not a proof: JSON can be hand-edited, and a file stripped of conflict records without the marker is indistinguishable from an honestly conflict-free workspace, so the import guard cannot fire for it (documented in `RESEARCH.md` §24). "Conflict-free" also does not mean "safe to share with anyone" — 1:1 notes, feedback and reviews are still in the operational copy.
- Historical health checkpoints are `exact` when backed by dated records and Schema v5
  snapshots, and explicitly labelled `approximate` when pre-v5 or in-place stage edits lack
  dated history. Fresh workspaces continue to show `pre-history` / "not enough history" rather
  than inventing past scores. Real-Chromium pixel/mobile verification of the new Session 5
  trend and CSV surfaces remains `[UNVERIFIED]` in a live browser binary until run outside
  this container.
- Commitment ownership is manager-entered and private to this browser. There is no employee view,
  so the leader cannot be held to "What you owe" by the person waiting on it, and an unrecorded
  owner is a gap the app reports rather than a fact it knows.
- The development ledger is manager-entered too. A review recorded here is the leader's account of a
  conversation, not a signed record from the report; a commitment the report considers dropped can
  still be shown as "still open" if the leader says so. Carry depth and review counts are facts about
  the record, not evidence that capability changed, and `GROW-06`/`GROW-07` are diagnostic.
- A role-transition plan is the leader's account of a move. It cannot verify that the old role was
  actually handed over, it does not update the person's role/title/level (that stays a separate,
  deliberate roster edit), and — like onboarding — there is no employee view of it. The label is
  free text the leader typed, not an org-chart fact.
- Development review dates have no reminder mechanism (a browser tab cannot schedule work). The app
  shows what is overdue when it is opened; it cannot make a review happen.
- "Weekly meaningful feedback" is the evidence-backed cadence; the default feedback target is
  21 days because it is achievable. The 7-day latency and delegation-check-in values are
  configurable team conventions, not validated universal cutoffs.
- Review packets cannot recover history that was never logged. Current goal/development
  values and delegation status/authority are explicitly capture-time; there is no employee
  account or direct submission workflow, and calibration heuristics are not a validated
  fairness instrument.
- Encryption protects the stored browser copy and encrypted backups only. It does not protect an
  unlocked tab during active use, cannot recover a forgotten passphrase, and needs a secure
  context (https or localhost). An unlocked tab now auto-locks after a configurable inactivity
  window (default 30 minutes) with a warning first; see the Done table. Real-browser WebCrypto
  behaviour is `[UNVERIFIED]` here:
  Node's `webcrypto` was injected into jsdom.
- Rehearsal against real usage is absent: every number in this file comes from the demo
  workspace and the test suite, not from a manager's actual quarter. Real-browser visual
  inspection of print output remains `[UNVERIFIED]`; delegation mobile overflow/filter checks now run in Chromium, but exhaustive visual/interaction review remains `[UNVERIFIED]`. Source links and workflows are covered in jsdom, with HTTP module loading checked separately.


## Session 17 research refresh and gap decision

Fresh pinned Sourcegraph/Lattice-workflow documentation and Frappe HR onboarding source were
reviewed (see `RESEARCH.md` §27). They reinforce anchored milestone prompts and explicit
conversation evidence, not another schema or task-completion percentage. The previous #1
item shipped without a migration, new runtime dependency, backend or network request.
The twelve new regressions and two Chromium scripts pass; the legacy architecture/runtime
and full line-by-line source verification remain **[UNVERIFIED]**. The browser scripts also
exposed two existing mobile overflow cases and stale conflict-checkbox test selectors;
those are now repaired and reproducibly checked.

## Session 18 research refresh and gap decision

CCL first-time-manager research and Gallup delegation findings (scoped and linked in
`RESEARCH.md` §28) support help without micromanagement, but do not validate a numeric owner
score or universal check-in interval. The verified product gap was direct Today access to
existing blocked, overdue, undated and stale delegation signals. This shipped by reusing the
current health logic, dialog, attention route and event—not a new schema or task database.
The four added regressions and full 309-test suite pass. Source inventory is not manual
line-by-line review; legacy implementations and live-browser behavior of this addition remain
**[UNVERIFIED]**.

## Session 23 research refresh and cross-domain architectural increment

Cross-domain synthesis across Engineering (AIAG-VDA FMEA Action Priority & Reason Swiss-Cheese
barriers), Mathematics/Statistics (3-point Beta-PERT), Finance/Economics (risk-adjusted expected
value, mitigation ROI & opportunity cost), MBA/Operations (DACI trade-off governance), Political
Science (Mendelow Power × Interest stakeholder coalitions), Production/Lean (Toyota 5-Whys &
closed-loop mitigation verification), and Leadership (Edmondson blameless 1:1 air-cover) shipped in
Schema v15 (`RESEARCH.md` §33, `docs/AUDIT-2026-10-25-session-23.md`). All **322 automated tests
across 25 test files** pass (`0` failures, `0` axe-core violations in JSDOM), and `scripts/serve.mjs`
serves all 60 canonical ES modules with zero warnings. Real graphical browser rendering on `#/cases`,
assistive-technology screen-reader evaluation, and human comprehension studies remain
**[UNVERIFIED]** until run with an installed browser/screen-reader binary.

## Session 25 gap decision and next priorities

The cross-module gap was a stale linked portfolio item after explicit delegation completion. Closed
that vertical loop with `RULE-CAP-04` inside the existing event-driven engine; no schema migration
was warranted because provenance, typed links, status/date and audit machinery already exist. See
`RESEARCH.md` §35 and `docs/AUDIT-2026-10-25-session-25.md` for the code trace and limits.

Next, ordered by impact:

1. Validate the capacity/case screens and delegation → plan lifecycle in real desktop/mobile
   browsers, plus screen-reader and manager comprehension checks. Current JSDOM/axe coverage is not
   that evidence; these remain **[UNVERIFIED]**.
2. Audit and remediate critical/high dependencies and deployment posture in the non-canonical
   Next/PostCSS/Sharp tree before any such deployment; its current state is **[UNVERIFIED]**.
3. Exercise capacity forecasts and lifecycle propagation on large, representative workspaces and
   real manager-entered estimates; distinguish observed operating practice from planning
   conventions. No production-scale performance or field validation is claimed.

## Session 34 outcome — 2026-10-26: operational case closeout → 1:1 learning

`RULE-COACH-02` closes a verified vertical gap: the case engine already queued active support in 1:1 prep, but resolution left that prompt stale and reopen could not restore it. Generated prompts now carry a stable case reference; resolution rewrites only that exact generated prompt into a blameless learning question, and reopen restores or queues active support. Employee-written topics, review evidence, confidential conflict records and anonymous pulse data are unchanged. No migration/dependency added. Google SRE postmortem guidance and its action-item follow-up pattern inform the design; references and rejection rationale are in `RESEARCH.md` §44.

Focused `cases-automation.test.mjs`: 7/7 passed, including case create → resolution → reopen, unique case reference, idempotency and employee-topic preservation. Complete `npm test`: **457/457 passed**. ESLint, canonical-boundary and documentation-link gates passed. `npm run verify:canonical` itself exceeded the shell's 180-second command limit during the test phase; the same gates were run separately and the complete test run passed in 186 seconds. Real-browser screen-reader output, manager comprehension, and field effectiveness remain **[UNVERIFIED]**.

### Next priorities

1. Real-browser mobile/desktop, keyboard and screen-reader review of the recently extended case and 1:1 lifecycle; current JSDOM/axe coverage is not AT certification.
2. Consent-based field evaluation of the coaching prompt, alongside capacity calibration policy review; no behavior change or local threshold is treated as validated by this implementation.
3. Audit legacy-tree dependencies before any legacy deployment and perform broader workspace performance checks; the historical React/Next tree was not line-reviewed or built in this session.

## Session 35 outcome — 2026-10-26: Negotiation Workbench (Schema v23)

The workspace modelled operational risk, decisions and capacity, but the bargaining that precedes
many of those records — vendor renewals, internal resource trade-offs, scope/deadline deals — had no
home. Session 35 shipped the **Negotiation Workbench** at `#/negotiations` on named frameworks, not
prose: Fisher & Ury (1981) BATNA discipline with a weighted preparation checklist (BATNA and a real
walk-away price count twice), Raiffa (1982) reservation-price geometry that computes the ZOPA,
midpoint and reservation gap per measurable issue and reports *incomplete* honestly rather than
coercing a missing estimate to zero, and Lax & Sebenius (1986) package options plus agreement-term
ownership. Three event-driven rules joined the catalog (now 30): `RULE-NEG-01` fans goal/coaching
edges and a pursue-agreement-vs-BATNA DACI mandate out in parallel for high-stakes work;
`RULE-NEG-02` turns owned agreed terms into tracked delegations while ownerless terms remain visible
ownership gaps; `RULE-NEG-03` converts an impasse into exactly one operational escalation case
through the standard FMEA/DACI path, idempotently. Six insight signals (`NEG-01`..`06`), a Today
triage card, the 23rd formula-safe CSV scope, and a deliberately healthy three-record demo (zero NEG
findings by construction) complete the vertical. The additive `22 → 23` migration only guarantees an
empty `negotiations` collection; normalization repairs rather than rejects dirty records. Four
self-caught defects were fixed in-session: `finiteNumber(null)` fabricating zero reservation prices,
impasses missing from the attention rollup, singular/plural route drift (`#/negotiation` vs the
router's `#/negotiations`), and two axe-core accessible-name defects in the new dialogs. Full
accounting: `docs/AUDIT-2026-10-26-session-35.md`.

**Verification:** `npm run verify:canonical` gates run clean — ESLint 0 problems, canonical boundary
(79 app modules / 38 test suites, zero leaks), 88 docs links resolve, and `npm test` reports
**475/475 passing** (18 new tests in `tests/app/negotiation.test.mjs`, including a JSDOM + axe-core
list/detail/dialog workflow and a full cross-module propagation trace through the real action API).
One full-run flake on the pre-existing `case-calibration` JSDOM UI test passed in isolation and on
rerun; the root cause of the intermittent timing is **[UNVERIFIED]**. Real-browser rendering,
screen-reader output, touch behaviour and manager comprehension remain **[UNVERIFIED]** — no browser
engine or assistive technology runs in this container.

## Session 36 outcome — 2026-10-26: agreement execution feedback

Shipped RULE-NEG-04 (31-rule catalog): completed/returned negotiated delegations append
agreement delivery history and neutral goal check-ins in the existing transaction.
The agreement terms table now displays observed delivery and links to delegations.
NEG-07 raises recovery attention for returned current terms, including closed agreements.
Fixed normalization dropping sourceNegotiationId/sourceTermId; no dependencies or schema
version change. Obsolete terms do not trigger new delivery telemetry or recovery findings.

Verification: 20 negotiation tests pass; lint, boundary and link gates pass. Full serial
run 476/477 passed; pre-existing case-calibration UI route assertion failed in full runs,
then all 11 case-calibration tests passed in isolation. Full clean run **not claimed**.

Next by impact:
1. Stabilize asynchronous case-calibration UI test; real-browser/keyboard/AT delivery review.
2. Explicit returned-term recovery/redelegation preserving term lineage and prior owners.
3. Evidence-backed financial settlement and representative-workspace performance checks.
Full source-by-source legacy audit, old stripped provenance reconstruction and field impact
remain **[UNVERIFIED]**; this session performed focused canonical tracing, not an entire
repository line review. See RESEARCH.md Session 36 for benchmark and rejected shortcuts.

## Session 37 outcome — 2026-10-26: returned-commitment recovery lineage (`RULE-NEG-05`), ex-post agreement settlement governance (`RULE-NEG-06`, `NEG-08`), and store/rewind/test determinism

Closed all three Session 36 roadmap items plus two audited store/rewind gaps:

1. **Returned-Commitment & Negotiated-Term Recovery Lineage (`RULE-NEG-05`)**:
   - Added additive lineage fields on `delegations[]` (`priorDelegationId`, `supersededByDelegationId`, `recoveredOn`, `recoveryNote`) with cycle-safe normalization (`repairDelegationRecoveryChains`) and lineage derivation (`deriveDelegationLineage` in `app/core/domain/delegations.js`) plus `priorOwners` on `negotiations[].agreedTerms[]`.
   - Shipped `redelegateReturnedOutcome(delegationId, data)` and `recoverNegotiationTerm(negotiationId, termId, data)` in `app/actions.js`, wired to `openRedelegateDialog` (`app/ui/modals.js`, `#/delegations`) and `openRecoverNegotiationTermDialog` (`app/ui/negotiation-modals.js`, `#/negotiations/:id`).
   - `RULE-NEG-05` (`propagateReturnedDelegationRecovery` in `app/core/domain/automation.js`) keeps the returned delegation immutable in history (`status: 'returned'`, `returnedOn`, `returnReason`, `supersededByDelegationId`, `recoveredOn`), links the active successor delegation (`priorDelegationId`), appends the prior owner/return reason to `term.priorOwners`, syncs `term.ownerId` and `term.dueOn`, inherits `tracks-followup` and `mitigates` graph links, queues a blameless 1:1 handover talking point on the new owner with the prior return reason and countermeasure, and clears `NEG-07` once an active recovery delegation is in flight.
2. **Ex-Post Agreement Settlement & BATNA-Breach Governance (`RULE-NEG-06`, `NEG-08`)**:
   - Added structured optional `settlement` (`settledOn`, `realisedValue`, `counterpartyDelivered`, `note`) on `agreed` negotiations and per-term `settledValue` on `agreedTerms[]`, normalized without ever pre-filling or fabricating realised values from signed estimates, and voided automatically on `reopenNegotiation`.
   - Built pure `evaluateNegotiationSettlement(record)` in `app/core/domain/negotiation.js` computing direction-aware Perold (1988) implementation shortfall, term-by-term variance, and unit-honest Raiffa (1982) walk-away BATNA breach (`sameUnitDealBatna`).
   - Shipped `recordNegotiationSettlement(negotiationId, data)` in `app/actions.js` and `openNegotiationSettlementDialog` + the *Agreement settlement & realization* card on `#/negotiations/:id`.
   - `RULE-NEG-06` (`propagateNegotiationSettlement` in `app/core/domain/automation.js`, bringing `AUTOMATION_RULES` to 33 rules) cascades settlement actuals to linked goal check-ins and opens/updates a linked DACI settlement review decision when the settlement breaches the walk-away BATNA, suffers counterparty non-delivery, or experiences material implementation shortfall. `NEG-08` surfaces both completed high-stakes agreements awaiting settlement and adverse settled outcomes requiring governance action.
   - Extended `delegations` and `negotiations` CSV exports (`app/core/csv.js`) with additive lineage and settlement columns.
3. **Store, Rewind, Scale & Test Determinism Hardening**:
   - Fixed `store.clearDemo()` (`app/core/store.js`) to scrub dangling demo person, goal, case, delegation, and source references on retained user `negotiations` and include `negotiation` in `remainingByType`.
   - Fixed `reconstructStateAt()` (`app/core/domain/health.js`) to rewind `negotiations` (post-cutoff agreements and settlements) and delegation recovery lineage (`supersededByDelegationId`, `recoveredOn`) as of `asOfDay`.
   - Replaced asynchronous `window.location.hash` + timer flushes in `tests/app/case-calibration.test.mjs` and `tests/app/calibration.test.mjs` with synchronous `app.navigate(...)` and `app.destroy?.()` teardown, and expanded `tests/app/scale.test.mjs` to exercise `delegations` (including returned → recovered chains), `negotiations` (including settled agreements), and `changes` at scale.

**Verification:** `npm run verify:canonical` passes **483/483 tests across 38 suites (`0 fail`)**, `0` ESLint errors, `0` boundary leaks, and `88/88` internal markdown links. Graphical browser rendering of the Session 35–37 Negotiation Workbench views, spoken screen-reader output, and field comprehension remain **[UNVERIFIED]**.

### Next priorities

1. Execute real-Chromium desktop/mobile (`1440px`, `390px`, `320px`) and keyboard/screen-reader validation across `#/negotiations`, `#/negotiations/:id`, and `#/delegations` recovery/settlement dialogs (currently verified in JSDOM + `axe-core`; graphical browser rendering and spoken AT output remain **[UNVERIFIED]**).
2. Feed settled negotiation realisations into the reference-class calibration overview (`#/decisions` / `calibration` CSV) once ≥5 settled agreements accumulate, keeping small-sample honesty (`n < 5` refuses verdict).
3. Audit legacy-tree dependencies before any non-canonical build/deployment; the quarantined legacy tree remains frozen per ADR-0007 and **[UNVERIFIED]**.

## Session 38 outcome — 2026-10-26: negotiated-versus-realised settlement calibration (`RULE-NEG-07`, `NEG-09`)

The Session 37 settlement record now participates in the outside-view learning loop as the fourth
calibration ledger. `negotiationSettlementPairs()` reads only an agreed record with an explicit
positive signed `stakesValue` and explicit `settlement.realisedValue`; it uses the existing
settlement evaluator's direction-adjusted variance, segments strictly by currency and issue
direction, and never converts FX. Settled records missing a comparable pair remain visible in a
reasoned actuals follow-up queue. Cohorts below n=5 show counts only; n≥5 enables descriptive
median/P80 statistics, and median shortfall ≥20% raises `NEG-09` for review—not a causal claim,
forecast guarantee, or person-performance score.

`RULE-NEG-07` runs in the `recordNegotiationSettlement()` transaction next to `RULE-NEG-06` and
returns a typed, idempotent calibration propagation. The Decisions calibration card shows cohorts
and the missing-value queue; the negotiation detail/prep view shows *prior* comparable outcomes,
excludes the current deal from its own cohort, and never rewrites targets or BATNA. The existing
`calibration` CSV gains explicit settlement-pair, cohort-summary and missing-actual rows. No schema
migration, dependency, backend, inferred value or automatic recalibration was introduced.

**Research/gap analysis:** Section 46 of `RESEARCH.md` records Flyvbjerg's outside-view rationale,
Perold implementation shortfall, Williamson/Hart ex-post contract governance, PDCA, the product
patterns checked in Oracle EPM, Coupa and Suplari, and why commercial claims are not independent
evidence. The unresolved limitation is now explicit: LeadOS records manager-entered financial
actuals but does not reconcile them with invoices, usage, a negotiated baseline or the general
ledger. Real-world usefulness of n=5/P80 and the 20% review guardrail remains **[UNVERIFIED]**.

**Verification:** `npm run verify:canonical` passed end-to-end: 485/485 tests across 38 suites,
0 ESLint errors, 0 canonical-boundary leaks (79 app ES modules checked), and 89/89 internal
Markdown links across 108 Markdown files. The first full run caught one stale catalog-count
assertion (33→34 after adding `RULE-NEG-07`); the test expectation was corrected and the complete
canonical command then passed. JSDOM/axe UI checks passed; graphical desktop/mobile rendering,
spoken assistive-technology output and field comprehension remain **[UNVERIFIED]**.

### Next priorities

1. Run a focused real-Chromium desktop/mobile and keyboard/assistive-technology review of the
   new Decisions and negotiation-prep readouts; JSDOM/axe is not graphical-browser or AT proof.
2. Validate settlement actuals with consenting users and finance-approved baselines; do not claim
   invoice-level savings until transaction-source evidence exists.
3. Review whether n=5, empirical P80 and the 20% trigger are useful in a representative workspace;
   keep them labelled as operational heuristics until independently validated.
4. Continue the focused canonical gap audit; the quarantined React/Next/Drizzle/Vite tree remains
   frozen under ADR-0007 and its current build/security status is **[UNVERIFIED]**.

## Session 39 outcome — 2026-10-26: Budget & Financial Commitments (Schema v24, `RULE-FIN-01..03`, `FIN-01..05`)

LeadOS gains its finance leg. A **budget envelope** is an approved ceiling (one currency, one
period, one owner) holding commitment lines in the public-sector **encumbrance lifecycle**:
`planned` (intention) → `committed` (budget authority reserved) → `spent` (recorded actual) or
`released` (authority returned). Control is exercised on **forecast at completion** — recorded
actuals + open encumbrances — against the ceiling, with planned lines shown separately as
pipeline exposure. A missing actual or unpriced commitment makes the forecast *labelled
understated* rather than silently zero-filled; a blank ceiling means tracking-only, and a
ceiling is never presented as a spend target (Liebman & Mahoney, 2017, year-end waste).

Cross-module propagation (§3 mandate): `RULE-FIN-01` turns a forecast breach into **exactly
one open DACI trade-off** (release largest encumbrances / request named increase / accept
explicitly), linked `budget →decides→ decision`; `RULE-FIN-02` maintains typed `funds` graph
edges and neutral idempotent goal funding check-ins, and in reverse stamps `actualsDueOn` when
the funded case resolves, negotiation settles or portfolio work is delivered; `RULE-FIN-03`
feeds recorded actuals into the **fifth calibration ledger** (counts-only below n=5; pooled
actual÷committed ratios — dimensionless, so cross-currency pooling needs no FX; median ≥1.20×
raises FIN-04 as a review prompt). Ships with signals FIN-01..05, Today triage, `#/finance`
routes, dialogs whose actual field is never pre-filled, `finance` CSV scope (#24), calibration
CSV commitment rows, Settings watch-% convention (default 80), `clearDemo`/`reconstructStateAt`
parity and a healthy demo envelope generating zero FIN findings. Conflicts and pulse surveys
can never be budget sources. Research and rejected shortcuts: RESEARCH.md §47.

**Verification:** final numbers are recorded in Session 39 of `AI-SESSION-LOG.md`
(`npm run verify:canonical`, lint + ADR-0007 boundary + docs links + tests). Amounts remain
leader-entered evidence, never reconciled to invoices or a general ledger; real-browser
rendering, spoken screen-reader output and field usefulness of the 80%/1.20× guardrails remain
**[UNVERIFIED]**.

### Next priorities

1. Real-Chromium desktop/mobile + keyboard/AT review of the Finance, Decisions and
   negotiation-prep readouts; JSDOM/axe is not graphical-browser or AT proof.
2. Stakeholder influence register (Mendelow + Tsebelis veto players) as a first-class,
   linkable record — cases, changes and negotiations still carry lightweight embedded
   stakeholder stubs; keep stance fields export-governed from day one.
3. Cross-ledger calibration synthesis: one guard-railed "promises vs outcomes" readout across
   decisions, cases, settlements, hires and budget commitments, counts-only under the same n
   floors — descriptive planning-fallacy exposure, never a person score.
4. Validate the budget watch-% and commitment-overrun guardrails on a representative
   workspace; keep them labelled as operational heuristics until independently validated.

## Session 40 outcome — 2026-10-26: Stakeholder Influence Register (Schema v25, `RULE-STK-01..04`, `STK-01..07`)

LeadOS gains a first-class political layer that closes the long-standing gap where cases,
changes and negotiations each carried lightweight embedded stakeholder stubs with no
persistent, portfolio-wide register. A register record holds power/interest/legitimacy/
urgency ratings (1–5), stance, veto gate + basis, evidence confidence, communication
cadence, contact plan, alliance edges and append-only stance/contact history. Four named
frameworks drive pure derivation: **Mendelow (1981)** quadrants and cadence, **Mitchell,
Agle & Wood (1997)** seven salience classes with confidence-adjusted scoring, **Tsebelis
(1995, 2002)** veto-player difficulty bands with cohesion penalties, and a union-find
**coalition network** (bloc leaning, hidden influencers, weighted-degree centrality).

Cross-module propagation (§3 mandate), all idempotent and inside existing store
transactions: `RULE-STK-01` strictly reconciles embedded stubs to the register (exact
normalized name or person link — a near-miss stays an unmapped hygiene count, never a
guessed edge); `RULE-STK-02` opens exactly one DACI alignment decision (redesign /
principled alignment / documented escalation) when an open initiative faces an adverse
recorded veto gate, with the initiative-specific embedded stance overriding the register
default without rewriting it; `RULE-STK-03` turns an adverse shift of a person-linked
high-salience stakeholder into one managed blameless 1:1 talking point; `RULE-STK-04` is
a pure read-side cadence/urgency/evidence watch feeding STK-03/06/07 and Today. Ships
with a 32-column formula-safe CSV whose contextual-integrity redaction neutralizes
stances, veto bases and private notes with a scrub count, an additive v24→v25 migration
that invents no actors, `clearDemo` edge trimming and point-in-time rewind with an
explicit approximate-fidelity note. The 12-record demo reconciles at 100% coverage and
emits zero fabricated automation events; only the read-side STK-01 insight fires.
Research, the 2026 SRM competitive audit and rejected shortcuts: RESEARCH.md §48.

**Verification:** `npm test` **536/536 across 40 suites** (39 new stakeholder tests,
including axe-core 0-violation JSDOM scans of every tab, the dossier and both write
dialogs); ESLint 0 errors; ADR-0007 boundary OK (85 app ES modules, 40 test suites);
91/91 internal Markdown links. Real-Chromium graphical rendering, spoken assistive
technology and field validation of the veto band edges (33/66), confidence factors
(0.85/0.7) and cohesion penalties (+5/+8) remain **[UNVERIFIED]** operational heuristics.

### Next priorities

1. Real-Chromium desktop/mobile + keyboard/AT review of the register matrix, network tab
   and dialogs; JSDOM/axe is not graphical-browser or spoken-AT proof.
2. Cross-ledger calibration synthesis: one guard-railed "promises vs outcomes" readout
   across decisions, cases, settlements, hires and budget commitments, counts-only under
   the existing n=5 floors — descriptive planning-fallacy exposure, never a person score.
3. Initiative-level stance history view: show the embedded per-initiative stance overrides
   against the register default over time, so a stakeholder who is supportive overall but
   blocking one change is legible at a glance on the dossier.
4. Field-validate the veto band edges, confidence factors and cadence defaults on a
   representative workspace; keep them labelled heuristics until independently validated.

---

## Session 41 outcome — 2026-10-26: Forecast Integrity Terminal (Schema v26, `RULE-FCI-01..04`, `FI-01..05`)

The highest-leverage gap after Session 40 was not another form. LeadOS already kept five
calibration ledgers, but each one was a rear-view mirror: a leader about to make a *new*
promise could not see all prior promises, a confidence-labelled range, or an automatic
challenge when the team's own history proved systematic optimism. Session 41 closes that
loop with a unified prediction-atom model and a distribution-free outside view.

**Shipped:** `forecastIntegrity.js` (adapter registry over seven forecast sources; Brier/
Murphy probability scoring; exact sign tests; conformal bands with finite-sample coverage
bounds; class segmentation by quantity, currency and direction; board brief); a generalized
post-commit rules hook in `store.js` / `postCommit.js` ([ADR-0008](docs/adr/0008-post-commit-rules-hook.md));
four new automation rules (`RULE-FCI-01..04`); a first-class `forecastChallenges`
collection with append-only response history; `#/forecasts` five-tab terminal; challenge
response dialog; `FI-01..05` insights; Today triage card; nav badge; `forecasts` CSV scope
#26; additive v25→v26 migration; normalizer repair; `clearDemo` and point-in-time rewind
parity; 22 new tests.

**Cross-module proof:** recording the fifth 1.5× budget actual in a single transaction creates
one class-specific challenge on an open budget commitment **and** one low-confidence
mixed-quantity challenge on an open portfolio estimate, one DACI re-baseline decision per
class, typed `forecasts` / `decides` graph links, `automation.propagated` audit events and
read-side signals — with both source estimates unchanged. A second scan creates nothing.
Pausing automatic propagation stops outcome-driven writes; an explicit scan still works.

**Verification:** `npm run verify:canonical` → **558/558 tests across 41 suites**, 0 ESLint
errors, 0 canonical-boundary leaks (89 app ES modules / 41 suites), 97 internal Markdown
links across 109 files. JSDOM + axe-core: zero violations on all five tabs and the response
dialog. Real-Chromium rendering, spoken screen-reader output, manager comprehension,
exchangeability after process changes and field validity of n=5 / 1.25× / 80% guardrails
remain **[UNVERIFIED]**.

**Next priorities:** real-browser/AT validation of the terminal; conformal drift research
(weighted/rolling-origin variants and process-change detection); natural-language case
intake with confidence-scored auto-routing; decision-delay scenario simulation with
auto-generated board packs; large-workspace measurement of the O(records) post-commit scan.

---

## Session 42 outcome — 2026-10-26: one independent offline HTML file

The owner asked for an "independence HTML file" that can be copied to another PC and run
locally. The canonical zero-build app was portable in spirit but not in practice: 89 ES
modules and a stylesheet still needed a folder and an HTTP server because `file://` module
imports are CORS-blocked. Session 42 closes that gap without changing the runtime
architecture.

**Shipped:** `LeadOS-standalone.html` (1.7 MB, all JS/CSS inlined, no external resources);
`scripts/build-standalone.mjs` (esbuild IIFE bundle, source fingerprint, hard no-network /
no-module / no-external-asset invariants, `--out` support, `index.html` overwrite guard);
`build:standalone` / `verify:standalone` npm scripts; distinct `leados.standalone.v1`
storage key; `connect-src 'none'` CSP; portability banner; Settings portable-copy card with
download link or export/import guidance; static-server allowlist for the one artifact;
ADR-0009; `RESEARCH.md` §50; 7 new tests. Also fixed a real `emptyState` heading-order
accessibility defect found by axe-core in the standalone boot path.

**Verified:** the committed HTML boots from a `file://` URL with an arbitrary filename in
JSDOM, renders Today, Settings and Forecast Integrity, uses hash routing, makes zero
`fetch`/WebSocket attempts, has zero axe-core violations, and exposes the honest
"app travels, data does not" guidance. The build regenerates to any path and refuses to
overwrite canonical `index.html`. `npm run verify:canonical`: **565/565 tests across 42
suites**, 0 ESLint errors, 0 boundary leaks (89 app modules / 42 suites), 105 internal
Markdown links across 110 files.

**Still [UNVERIFIED]:** real Chrome/Edge/Firefox/Safari `file://` storage policies, Web
Crypto availability, Blob downloads, printing, spoken screen readers, cross-OS copy, and
manager comprehension of the data-export step. The standalone file is a build artifact;
regenerate it after canonical source changes.

**Next priorities:** cross-browser/OS standalone validation; portable encrypted backup UX
where Web Crypto is available; natural-language case intake; decision-delay simulation;
large-workspace post-commit scan measurement.

---

## Session 43 outcome — 2026-10-26: Natural-Language Intake Terminal (Schema v27)

The roadmap's twice-named next priority — natural-language case intake with
confidence-scored auto-routing — shipped as a full on-device triage terminal rather than
another form. A free-form situation note is classified across fourteen leadership-
operations categories by a deterministic weighted-evidence engine (NegEx negation
windowing, softmax temperature scaling with uniform-prior shrinkage), with completeness,
ambiguity and stakes checks matching the 2026 human-in-the-loop triage state of practice.
Entity extraction covers roster people (ambiguity never auto-resolved), money in US/EU/Danish
formats with currency-assumption flags, durations, person-days, percentages, recurrence and
severity markers — every suggestion carrying sentence and character-offset evidence.

**Shipped:** `app/core/domain/intake.js` (pure engine, RULE-INTAKE-01..07, engine version
stamp), `app/views/intake.js` (`#/intake` terminal with composer, evidence-explained
analysis, live propagation preview, drafts queue and calibration card), `intakeDrafts`
ledger with additive v26→v27 migration and normalization repairs, five new API actions
(`analyzeIntake`, `saveIntakeDraft`, `reanalyzeIntakeDraft`, `confirmIntakeDraft`,
`markIntakeDraftRouted`, dismiss/delete), human-confirmed routing through the existing
`addCase` event-driven propagation engine, RULE-INTAKE-04 conflict privacy wall,
RULE-INTAKE-05 mandatory stakes review, RULE-INTAKE-06 stale-draft signal on Today/Signals,
RULE-INTAKE-07 human-agreement calibration ledger (counts-only below n=5), data-minimized
`intakeCalibration` CSV scope #27 with no free text, demo triage queue, ADR-0010, RESEARCH
§51 with the 2026 competitive hunt, and 35 new tests.

**Verified:** 600/600 canonical tests across 43 suites, 0 ESLint errors, 0 canonical-boundary
leaks (91 app modules), docs links resolve, standalone artifact rebuilt at 91 modules/schema
v27, JSDOM + axe clean on the full analyze→review→confirm→ledger workflow, live static server
returns 200 for all new assets.

**Still [UNVERIFIED]:** real-browser graphical rendering and screen-reader output, novel
phrasing/sarcasm beyond the lexicon, languages other than English (Danish number/currency
conventions are handled but Danish vocabulary is not), and empirical calibration of the
confidence bands until real workspaces accumulate n≥5 confirmations per band.

**Next priorities:** decision-delay scenario simulation ("what happens if I wait two
weeks?") with conformal bands and an auto-generated board pack; anomaly detection on
pulse/sentiment trends beyond Shewhart XmR; large-workspace performance measurement of the
O(records) post-commit and triage scans; multilingual (Danish) intake lexicon once demand is
observed; empirical confidence-band recalibration from the RULE-INTAKE-07 ledger.

---

## Session 44 outcome — 2026-10-26: Decision Tempo & Timing Terminal (Schema v28)

The roadmap's twice-named next priority — decision-delay simulation ("what happens if I wait
two weeks?") with conformal bands and an auto-generated board pack — shipped as a full
economic terminal rather than a scenario slider. Every open decision is now a priced, timed
position: what a week of delay costs at its recorded delay profile, what a week of waiting
buys in expected information value, the horizon where those two curves cross, and how late
this workspace's own decisions of that class actually run.

**Shipped:** `app/core/domain/decisionTempo.js` (pure engine, ~1,500 lines: Reinertsen delay
profiles with a value-at-stake cap, closed-form preposterior EVSI with EVSI ≤ EVPI by
construction, switch probability, CD3 ranking, McKinsey decision taxonomy with per-class
guardrails, value-at-stake assembled from typed graph links, measured-latency conformal
bands, five post-commit rules, six read-side signals, deterministic board brief, report memo),
`app/views/tempo.js` (`#/tempo` five-tab terminal: cost-of-delay queue, timing lab with a
hand-drawn SVG delay curve and scenario table, timebox ledger, calibration, board pack),
`app/ui/tempo-modals.js` (arm/edit dialog with a live engine preview and a written abandon
path), Schema v28 `tempoSchedules` ledger plus a `decidedOn` measurement stamp on decisions,
additive v27→v28 migration, normalisation repairs including the one-live-timebox-per-decision
invariant, seven new API actions plus `tempoReport`/`tempoScheduleDraft`, `RULE-DLY-01..05`
registered in the post-commit hook with a one-click pause, `DLY-01..06` signals in Insights,
a Today card and nav badge, a Tempo line on every open decision card in `#/decisions`,
data-minimised CSV scope #28, point-in-time rewind and clearDemo parity, demo workspace with
all four timebox states and five measured latencies, ADR-0011, RESEARCH §52 with the 2026
competitive hunt, and 29 new tests.

**Verified:** 629/629 canonical tests across 44 suites, 0 failures; 0 ESLint errors; 0
canonical-boundary leaks (94 app modules); docs links resolve; JSDOM + axe clean on all five
tabs, the arm dialog, the ledger, the nav badge and the Today card; standalone artifact
rebuilt at 94 modules / schema v28.

**Domains added to the graph:** `tempo` as a first-class entity type with the `timeboxes`
relation, so a decision → timebox → delegation chain is walkable in both directions and
resolves to a working route.

**Still [UNVERIFIED]:** real-browser graphical rendering, screen-reader output, the
normal/normal preposterior on skewed or heavy-tailed payoffs, multi-option decisions beyond
leading-vs-runner-up, and empirical calibration of the timing verdicts (no workspace has yet
recorded enough settled decisions to compare predicted vs realised value of waiting).

**Next priorities:** value-of-waiting forecast calibration (did gather-first decisions
actually change the answer? score EVSI predictions against realised outcomes); multi-option
EVSI via Monte Carlo preposterior with seeded reproducibility; org-wide decision-load
forecasting (how many calls per week the leader can actually absorb); Danish-language tempo
copy; large-workspace measurement of the tempo scan on 500+ decisions with 2,000+ links.

---

## Session 45 outcome — 2026-10-27: Operational Resilience, Dependency & Continuity Terminal (Schema v29)

Leaders routinely track risks in prose while remaining blind to the structural topology connecting human single points of failure, internal services, and sub-tier suppliers. Session 45 ships a local-first Enterprise Resilience Decision System (`#/resilience` & `#/resilience/:id`) synthesizing Simchi-Levi supply-chain resilience (`TTS`/`TTR`/`REI`), Avelino minimal hitting-set Bus Factor, Herfindahl-Hirschman concentration (`HHI`), Williamson transaction-cost hold-up, EU DORA Art. 11/26/29 continuity & Nth-party choke-point visibility, and split-conformal drill calibration.

**Shipped:** `app/core/domain/resilience.js` (~2,560 lines), `app/views/resilience.js` (`#/resilience` five-tab terminal: Overview with SVG `TTS`-vs-`TTR` matrix, Multi-Tier Cascade Topology with SVG DAG, Zero-Write Counterfactual Disruption & Departure Stress Lab cross-checked against Capacity allocations, Bus Factor & Per-Currency HHI / Williamson Hold-Up Audit, and Continuity Drills + Split-Conformal Calibration + Board Pack, plus `#/resilience/:id` dossier), `app/ui/resilience-modals.js` (four accessible dialogs), Schema v29 `dependencies` collection + `MIGRATIONS[28]`, 12 resilience API actions with DAG cycle prevention, `RULE-RES-01..06` chaining atomically into Session 44's `RULE-DLY-03` Decision Tempo engine in the same write, `RES-01..07` signals, Today triage card, 1:1 Prep continuity prompts, Person dossier stewardship card, CSV scope #29, 5 interconnected 3-tier demo dependencies, 8 audited cross-module defect fixes (including `normalizeSettings` wiping `tempo*`, `clearDemo()` scrubbing, `documentTitle` missing routes, and `AUTOMATION_RULES` unification), ADR-0012, RESEARCH §53, and `tests/app/resilience.test.mjs`.

**Verified:** 636/636 canonical tests across 45 suites (0 failures), 7/7 standalone tests, 0 ESLint errors, 0 canonical-boundary leaks (97 app modules), `axe-core` + structural screen-reader/table/heading checks clean across all 5 `#/resilience` tabs, `#/resilience/:id`, and modals; `LeadOS-standalone.html` rebuilt at 2,016,513 bytes (97 modules, schema v29).

**Domains added to the graph:** `dependency` as a first-class entity type with `depends-on`, `stewards`, and `continuity-tests` relations, completing a live multi-stage propagation chain across People, Delegations, Goals, Capacity, Budgets, Negotiations, Stakeholders, Operational Cases, Decisions, and Decision Tempo.

**Still [UNVERIFIED]:** real-browser graphical rendering of the SVG topology/matrix views, spoken assistive-technology output, correlated simultaneous multi-vendor failure distributions beyond deterministic scenario shocks, and field validation with live engineering managers.

**Next priorities (Top 3):**
1. **Value-of-Waiting & Continuity Drill Outcome Calibration Loop:** Score Session 44 `gather-first` EVSI decisions and Session 45 redundancy investments (`mitigationCost`) against realized post-implementation incident reductions (`#/forecasts`).
2. **Coupled Monte Carlo Disruption × Portfolio Delivery Simulation:** Feed empirical continuity-drill conformal TTR bands and `annualFailureProb` shocks directly into `#/capacity` and `#/scenarios` seeded Monte Carlo schedules so unbuffered SPOFs widen P80 delivery tail risk automatically.
3. **Org-Wide Cognitive & Decision-Load Pacing:** Combine `computeTeamBusFactor` stewardship concentration, active WIP (`#/capacity`), and open `CD3` decision queues (`#/tempo`) to flag manager/tech-lead cognitive saturation before burnout or review bottlenecks hit.


---

## Session 46 outcome — 2026-10-27: Coalition & Incentive War Room (Schema v30)

The roadmap's "org-wide cognitive & decision-load pacing" and "coupled simulation" items remain
queued; this session instead chased the sharper, ahead-of-market gap surfaced by the 2026
competitive hunt (RESEARCH §54): **no leadership tool does computational political economy**.
Decision-intelligence platforms reason over data; ONA tools map collaboration; AI coaches write
LLM role-play; exact power indices and mechanism design live only in academia. LeadOS is now the
first to fuse them into one local-first, deterministic terminal and to propagate the analysis
atomically across modules.

**Shipped (Done — verified this session):**

| Capability | Where | Verified by |
|---|---|---|
| Exact Banzhaf (2ⁿ) & Shapley-Shubik (n!) power indices, MWC, veto/dictator/dummy detection | `computeBanzhafIndices`, `computeShapleyShubik`, `minimumWinningCoalitions`, `analyzeVotingPower` | `power.test.mjs` (textbook [4,3,2,1]→5/3/3/1 swings, 24 permutations, veto at w≥total−q+1, dummy at unanimity) |
| 2×2 pure & mixed Nash equilibria, dominant strategies, Pareto, price of anarchy, coordination loss | `solveNormalForm` | `power.test.mjs` (Prisoner's Dilemma, matching pennies p=q=0.5, pure coordination) |
| Mechanism-design minimal alignment transfer + feasibility bound | `incentiveAlignment` | `power.test.mjs` (PD infeasible, feasible case cost=3/headroom=8, already-equilibrium cost 0) |
| Equilibrium robustness + weaker-of confidence scoring | `equilibriumRobustness`, `powerConfidence` | `power.test.mjs` (PD 0.2/medium, weak-NE boundary, confidence lattice) |
| Verdicts, deterministic influence script & board brief | `analyzePowerGame`, `buildInfluenceScript`, `buildPowerBrief` | `power.test.mjs` (severity ranking, determinism, no invented facts) |
| Atomic cross-module propagation `RULE-PWR-01..06` (decision + delegation + 1:1 topic + links + derived + tempo chaining) | `powerRule`, `postCommit.js`, `decisionTempo.js` | `power.test.mjs` (one `addPowerGame` → 1 DACI decision, 1 delegation, 1 talking point, ≥5 links, audit events, idempotent across reanalysis, pause+force) |
| Schema v30 migration, normalization repairs, rewind, clearDemo, CSV #30, `PWR-01..06` signals, Today card, nav badge, 5-tab UI + detail + dialogs | `schema.js`, `store.js`, `health.js`, `csv.js`, `insights.js`, `views/power.js`, `styles.css`, `main.js` | `power.test.mjs` + `access-audit.test.mjs` (v29→v30, malformed repairs, rewind, data-minimised CSV, JSDOM+axe across all tabs/detail/dialog) |

**Bugs found & fixed during self-testing (real product defects, not fixtures):**
1. A broad `powerRule` trigger re-added 1:1 talking points on unrelated `decision.*`/`delegation.*`
   writes (regression in `decision-growth-prep.test.mjs`). Narrowed the trigger to `power.*`/
   `person.archived/restored`/force and scoped entity creation to the acting game — the
   anti-alert-fatigue posture.
2. An empty action-column `<th>` on the Overview table produced an axe `empty-table-header`
   violation; labelled it "Action".
3. Standard schema-bump pins (SCHEMA_VERSION, migration chains, CSV/rule-catalogue counts)
   updated across the suite rather than leaving stale assertions.

**Still [UNVERIFIED]:** real-browser graphical SVG rendering, spoken assistive-technology output,
general-sum N-player / multi-option EVSI solving, and empirical calibration of verdicts against
realised outcomes until workspaces accumulate n≥5 settled games (the RULE-PWR-05 ledger records
the raw material but does not yet score it).

**Next priorities (Top 3):**
1. **Value-of-Waiting & War-Room Outcome Calibration Loop:** score Session 44 `gather-first`
   EVSI decisions, Session 45 redundancy investments and Session 46 `RULE-PWR-05` realised
   outcomes against post-implementation results (`#/forecasts`), with conformal bands and
   counts-only below n=5.
2. **N-Player General-Sum & Bayesian Game Solver:** extend the 2×2 to N players / incomplete
   information (Bayesian Nash, correlated equilibrium) with seeded Monte Carlo, sensitivity and
   a general mechanism-design (VCG/Clarke) transfer engine.
3. **Coupled Monte Carlo Disruption × Portfolio Delivery Simulation:** feed continuity-drill
   conformal TTR bands and `annualFailureProb` shocks into `#/capacity` / `#/scenarios` so
   unbuffered SPOFs widen P80 delivery tail risk automatically (carried from Session 45).


## 2026-10-28 — Automation assurance and decision intelligence

- **Implemented:** case-rule sandbox compares added/removed relationship types and graph integrity counts before/after, without revealing record identities or claiming causal spread.
- **Planned:** assumption-explicit causal graphs and falsification workflows tied to decision outcomes; counterfactual timing stress tests with observed follow-up and calibration.
- **Planned:** full action-level rehearsal and durable transaction isolation across tabs, including encrypted workspaces; current rehearsal only covers post-commit rules.
- **Rejected:** opaque individual attrition prediction from sparse local records — neither privacy nor calibration can be justified.
