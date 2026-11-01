# LeadOS — current program state

**Snapshot:** 2026-11-01 (Session 109, Schema v77 — additive `76 → 77`). Session 109 adds the Measurement Reliability Terminal (`#/reliability`, [ADR-0069](docs/adr/0069-measurement-reliability-terminal.md)): every completed review becomes one observation of a people × cycle design, an exact balanced two-way random-effects ANOVA gives τ² and pools cycle + residual as occasion error, a one-way ICC(1) with a Satterthwaite interval and an F test of τ² = 0 is printed beside Spearman–Brown reliability of the mean of k ratings, each person carries a credibility-weighted reading n/(n + K) whose regression to the mean is stated as the expected NEXT observation, separation is a posterior test that keeps people in the same tier unless the evidence separates them (membership alphabetical, on screen only, never a score or rank), a decision study converts the refusal into MDE and the observations/months a defensible one-point call would cost, and instruments that should describe the same people are tested for convergence with a composite refused unless every testable pair agrees; frozen readings store counts and coefficients and never a person, grading lapses an empty window instead of crediting it, and `RULE-REL-01..05` capture, escalate, verify and reconcile on the shared spine while no rating is ever rewritten and no adverse action is ever taken (CSV scope #67). Earlier snapshot text follows: Session 108, Schema v76 — additive `75 → 76`. Session 108 adds the Counterfactual Policy Terminal (`#/counterfactual`, [ADR-0068](docs/adr/0068-counterfactual-policy-terminal.md)): four families of dated decision points harvested from records the workspace already keeps, five named policies raced under self-normalised IPS (headline) with DM/IPS/doubly-robust cross-checks whose spread is the fragility diagnostic, Manski (1990) worst-case bounds that refuse to extrapolate an unidentified policy, caliper-matched pairs on pre-treatment covariates only with ASMD balance reported, exact McNemar under a Rosenbaum bound with the design sensitivity Γ* solved by bisection, a Hoeffding confidence sequence that survives continuous monitoring, `RULE-CFP-01..04` escalating at most one governed policy ruling and one blameless process task per ISO week, freeze-once evaluations that lapse when a window closes empty, and aggregate-only CSV scope #66. Earlier snapshot text follows: Session 107, Schema v75 — additive `74 → 75`. Session 107 adds the Outcome Attribution & Loop Settlement Terminal (`#/attribution`, [ADR-0067](docs/adr/0067-outcome-attribution-loop-settlement.md)): an $O(V+E)$ multi-channel loop grading and attribution engine across adopted Action Bundles (v74), adopted Response Plans (v73), and standalone Case Control Loops, implementing Lipke (2003) Earned Schedule, Goldratt (1997) Critical-Chain Fever Charts, Pressman–Wildavsky (1973) leader-vs-delegate clearance separation, Argyris/Fixsen/Holmström 2×2 thesis-vs-execution attribution (with explicit team exoneration and confounding refusal), Brinson–Fachler (1985) 3-way additive economic variance, Savage ex-post policy regret, prospective Brier/Wilson calibration (`settlements`), `RULE-STL-01..05` on the shared post-commit spine, and aggregate-only CSV scope #65. Sessions 101–106 added the Authority Covariate Preview ([ADR-0063](docs/adr/0063-authority-covariate-model-preview.md)), Confidence Transport (v72, [ADR-0064](docs/adr/0064-confidence-transport.md)), Response Studio (v73, [ADR-0065](docs/adr/0065-response-studio.md)), Action Bundles (v74, [ADR-0066](docs/adr/0066-action-bundles.md)), and cross-currency valuation/capacity dimensional guards. Earlier snapshot text follows: Session 100, Schema v71 — additive `70 → 71`. Session 99 added the Signal Integrity Board (v70) and Session 100 the Borrowed Evidence Engine (v71): a Beta-binomial hierarchy, fitted by full Bayes on a deterministic grid, that prices every small sample (signal families, assumption criticality classes, delegation authority classes) with the evidence it shares, prints how much of each number is the unit's own and when its own record takes over, fires the outside view when a premise is registered, and grades every borrowed claim it acts on against the unit's own record. Earlier snapshot text follows: Session 98, Schema v69 — additive `68 → 69`. Sessions 85–93 shipped Signal Path (v59), War Games (v60), Coupled Load (v61), Performance Recovery (v62), Delivery Survival (v63), Cost of Waiting (v64), Leadership Parity (v65), Evidence synthesis (v66) and Decision Consequences (v67); Session 94 added the competing-risk drift decomposition, Session 95 the two-axis multi-landmark transport read model, Session 96 the case-mix overlap guard, Session 97 the Deferral Option Terminal (v68 — the first surface that prices the *flexibility to wait*), and Session 98 the Deferral Portfolio (v69) — the book-level read: correlation discovered from the premise graph, ρ declared and PSD-enforced, a daily-grid correlated Monte Carlo whose members each follow their own lattice policy, Tasche component contributions that partition the tail exactly, premise stress in excess percentage points, and identity-free frozen forecasts graded by Brier. This file describes the repository that is present now, not a speculative product brief.

## Canonical product

- **Runtime:** `index.html` → native browser modules in `app/**`; a local-first, zero-build application with a separately generated single-file offline build. Records stay in the browser unless the user exports them. There is no application backend or telemetry path in the canonical app.
- **Architecture:** `ARCHITECTURE.md` is the current map. `src/**` and other quarantined trees are legacy/non-canonical; their implementation and old architecture claims are not treated as current behavior.
- **Verification:** `npm run verify:canonical` runs ESLint, the canonical boundary check, internal documentation-link checking and app tests. `npm run verify:standalone` builds the single-file artifact and runs its portability tests.

## Current data and automation

- **Borrowed Evidence Engine (Session 100, ADR-0062; Schema v71).** `app/core/domain/credibility.js`
  is a pure read model: three evidence adapters (signal verdicts and early-warning triage → actionable
  precision per family; settled premise outcomes → hold rate per criticality class; delegations →
  on-time delivery per authority class, overdue-open counted late, not-yet-due censored), a two-pass
  (33² → 41²) grid over (logit μ, log M) under the BDA3 hyperprior, exact mixture probabilities
  below each floor, Edgeworth-corrected normal CDFs for concentrated Betas, χ²/I², leave-one-out
  influence, graduation dates and exact what-if/break-even reweighting. Fits are memoised on the counts.
  `credibilityRules.js` runs `RULE-CRE-01..03` between the integrity rule and Decision Tempo; every
  write is marker-idempotent per unit per ISO week; frames (`credibilityFrames`) freeze both the
  borrowed and the own-data Jeffreys forecast and are graded once by Brier. `credibilityDeclarations`
  holds the leader's exchangeability rulings, obeyed for 90 days. CSV scope #61; Insights bucket
  `Credibility` (CRE-01..05); graph node `credibilityframe`; relations `borrows-evidence`,
  `outside-view`, `governs-pooling`. The Signal Integrity Board's inventory shows each thin family's
  borrowed precision.


- **Attention Market (Session 82, ADR-0047; Schema v57).** `app/core/domain/attentionMarket.js`
  solves the leader's week as a multiple-choice knapsack over every obligation the workspace can
  price — open cases with a three-point cost estimate, funded work with effort and value, active
  negotiations above the leader's own BATNA, critical dependencies with a measured daily impact,
  overspent budgets and priced decision frames — under **two** ceilings: the leader's declared hours
  and a delegate pool. Each obligation is one group of mutually exclusive modes (`do`, `delegate`,
  `drop`); success probability is an empirical-Bayes share of this workspace's own closed records,
  one pseudo-observation, a 50% prior below four observations. Groups are pruned to their upper
  convex hull; small markets are closed exactly by branch and bound (optimal, gap exactly 0) and
  larger ones fall back to Dyer's relaxation with a Lagrangian dual minimised by golden-section
  search, printing the gap to a bound it can prove. **The price of the next hour is a finite
  difference** — the same market re-solved with one more hour — never a fractional-relaxation rate.
  `RULE-ATT-01..04` run on the shared spine: typed `allocates`/`forgoes` edges, one owned dated
  delegation per named hand-off (no delegate is ever invented), exactly ONE DACI decision carrying
  the whole forgone list with its price, and an attribution decision plus an owned re-planning task
  when a reviewed plan misses. Every write is marker-idempotent. Committing freezes the budget, the
  bought set, the forgone set and each item's probability; the review re-reads each bought record,
  excludes items that have not moved (a plan is not wrong for being young) and scores the frozen
  probabilities with a Brier term over settled items only. The hours are the one input that cannot be
  derived: `effortDays` and `capacityDays` are TEAM effort, so the module applies a declared,
  printed leader share (default 10%) and allows a per-row override. CSV scope #49 is counts and codes
  only; the `Attention market` Insights bucket carries `ATT-S1..S5`; `forgoes` is a new typed relation
  and `attention` a new graph node. No delegation is offered automatically below the measurement
  floor, because on an uninformative prior a hand-off looks strictly better than doing the work.

- **Sequential investigation planner (Session 81, ADR-0046; no schema change).** `app/core/domain/sequentialInvestigation.js` is a read model that solves the order of declared investigations exactly by backward induction (up to three stages and six tests), conditions the belief by Bayes' rule after each settled test, and refuses explicitly when inputs cannot support a plan. `RULE-SEQ-01..03` write one advisory note, one revisable commit decision and one owned next-test task, all marker-idempotent. Conditional independence of tests is assumed and stated, not checked.
- **Schema v54.** The additive `53 → 54` migration adds empty `voiDecisions` and `voiStudies` collections and seven clamped conventions: no decision frame, no state, no payoff, no probability and no investigation is invented for an existing workspace, because a frame pre-filled with someone else's beliefs would answer a question the leader never asked. **Schema v53.** The additive `52 → 53` migration adds an empty `orgDesigns` collection and five clamped structural settings: no design, no move and no prediction is invented for an existing workspace, because a reorg inferred from the current manager column would invent the rationale and the claim. **Schema v52.** The additive `51 → 52` migration adds an empty `transitionPrograms` collection and eight clamped transition settings: no programme, no candidate, no target and no salary is invented for an existing workspace, because a reduction that arrives pre-filled is a plan someone else already made. **Schema v51.** The additive `50 → 51` migration adds empty `compBands` and `meritCycles` collections: no band, no cycle and no salary is invented for an existing workspace, because a band derived from current pay is a mirror and a cycled budget entered after the fact is a rationalisation. Schema v50's additive `49 → 50` migration still adds an empty `fidelityPlans`, Schema v49's `48 → 49` still initializes Impact `executionSnapshot` values to `null`, and Schema v48's still adds an empty `propagationLineage`.
- **Typed relationships.** `app/core/domain/cases.js` is the shared registry for allowed link types, relations, collection owners and destination routes. Destination views accept focused deep links, including encoded IDs, without writing the linked record.
- **Event-driven propagation.** `app/core/domain/postCommit.js` runs synchronous rule effects using savepoints. Successful changed effects can append a bounded, content-free lineage transaction; failed rules continue to use the separate `propagationReceipts` path. Every registered rule declares its purpose and writes in `app/core/domain/propagationContracts.js`, and the contracts test fails when an unregistered rule joins the chain.
- **Lineage bounds:** at most 250 transactions; 32 rule steps; and 48 targets, new typed edges and emitted event references per transaction. It stores identifiers and type/provenance fields, not titles, notes, score inputs or record bodies. IDs are still workspace data and are not claimed to be anonymous.
- **Privacy/lifecycle:** conflicts and anonymous pulse responses are excluded; candidate-referenced transactions are omitted from redacted exports; `clearDemo` keeps history while scrubbing references to removed records. CSV scope #43 is counts/types-only; a full JSON backup preserves the bounded ledger.

## Current cross-module slice (Session 97, Schema v68): the Deferral Option

- **`app/core/domain/deferralOption.js`** — pure engine. One American call per open priced decision, solved by Cox–Ross–Rubinstein backward induction (`americanCommitOption`: 20–400 steps, exercise at every node, up to 200 in the UI) and validated against the Black–Scholes–Merton European price as an anchor only (`europeanCallCRR` must converge to 10.4506 at the pinned reference). Money is one currency per frame. `V` comes from `decisionValueTerms` (Decision Tempo); `K` from budget lines pointed at the decision (`committedCostFor`), with reversible calls pinned to `K = 0`; carry is the workspace's own 12-week erosion price and is charged as a cash outflow, never as drift; σ is `1.4826 × MAD(log(realised ÷ assessed))` over settled case-exposure and delivered-effort ratios, root-time annualised from the printed median horizon, withheld below the observation and σ floors, and a declared σ is accepted with `sigmaSource: 'declared'`. Break-even carry and break-even σ are solved by bisection on the same tree. Verdicts: `commit-now`, `wait`, `indifferent` (materiality floor), `act-or-drop`, `withheld`.
- **Persistence** — `deferralFrames` (cap 40) stores the stake, commitment cost, carry, σ and its source, the lattice output and exactly one prospective claim, `predictedCommitByDeadlinePct`; no title, question, rationale, person or note. `normalizeDeferralFrames` is fail-closed (a frame without a currency, stake, σ, recognisable verdict or with a duplicate id is dropped; a claimed grade without an outcome returns to frozen). Grading is one-shot, after `reviewOn`, and needs a *dated* decision; Brier skill waits for five grades.
- **`app/core/domain/deferralOptionRules.js`** — `RULE-DRO-01..03` on the shared post-commit spine, marker-idempotent: typed `defers-decision` link plus one owned boundary watch for `wait`/`indifferent`; scan reconciliation with ≤3 grading tasks and exactly one governed decision per ISO week for expired windows; one blameless process task on Brier ≥ 0.25. Registered in `propagationContracts.js` and ordered before decision tempo.
- **Graph and surfaces** — `optionframe` typed node, `defers-decision` relation, resolver `#/deferral?panel=frozen&frame=<id>`; `Deferral options` Insights bucket (DRO-01 due, DRO-02 boundary crossed, DRO-03 window expired, DRO-04 lost to base rate); nav item with badge, eight route aliases; CSV scope **#58** aggregate-only with means and money blank below five frames; `app/views/deferralOption.js` (overview / boundary / frozen / method) and `app/ui/deferral-modals.js` (freeze with a live preview).
- **Not claimed** — risk-neutral pricing (no replicating portfolio), a market price, EVSI (never summed with the premium), learning-by-waiting, jumps or stochastic volatility, or any person-level inference. (Portfolio correlation between calls was out of scope in Session 97 and shipped in Session 98 below.)

## Current cross-module slice (Session 98, Schema v69): the Deferral Portfolio — reading the book

- **`app/core/domain/deferralPortfolio.js`** — pure engine. Per currency, the priced open calls (stake-ranked, convention cap 6, max 8) with the exact Σ premium and Σ stake; coupling from the premise graph (`sharedPremisePairs`: `premise.decisionId` + `rests-on`/`tests` links, open decisions only, canonicalised unordered pairs); ρ **declared** per pair (a sharing pair without a declaration refuses the joint tail and names the pair; strangers take ρ = 0 by printed convention; out-of-range ρ dropped, never clamped); the matrix factored by Cholesky and a non-PSD set **refused, never projected**. `simulatePortfolio` is a common-random-numbers Monte Carlo (mulberry32, Box–Muller) on a daily grid (`deferralPortfolioGridDays`, 1–7): every member follows its **own** frozen lattice policy (boundary tabulated once per member), pays its own carry and lapses at its own deadline; the quoted expected total is always the exact lattice sum and the MC mean is printed only as its grid error with the cause named. Tail: VaR/CVaR at a convention level, **Tasche contributions partitioning CVaR exactly**, HHI on premium and contribution, top contribution share, the diversification credit as `CVaR(book) − Σ standalone` (subadditivity stated; a small negative measured credit is named as simulation noise), P(all lapse) / P(any commit), and per-premise stress: joint lapse under ρ vs independence, the excess in pp, and the premise's premium share.
- **Persistence** — `deferralPortfolioReadings` (cap 20; identity-free: ids, aggregates, one probability `predictedAnyCommitPct`, the worst joint-lapse excess; one freeze per currency per day), `correlationDeclarations` (cap 80; unordered-pair dedupe, latest wins), `deferralPortfolioMarkers`. Grading is one-shot after the window from recorded `decidedOn` dates (undated ⇒ ungradable; all members deleted ⇒ ungradable); Brier against the frozen claim; skill withheld below five grades; premise movement **appends** challenge notes, never rewrites.
- **`app/core/domain/deferralPortfolioRules.js`** — `RULE-DPO-01..04` on the shared spine (registered after `deferralRule`, contract published): freeze maps the reading to every member call (`aggregates-deferral`) and stressed premise (`stresses-premise`) plus one concentration-watch task past the convention; the explicit scan reconciles stale edges, opens ≤3 grading tasks and turns an expired window with open members into ONE governed decision per ISO week; a graded surprise (Brier ≥ 0.25) opens one blameless process task; a premise breach opens one re-price decision per premise per week. `deferralPortfolioAutoPropagate = false` pauses automation, never an explicit scan.
- **Graph and surfaces** — `portfolioreading` typed node with resolver `#/deferral?panel=portfolio&reading=<id>` (the panel focuses that record); `Deferral portfolio` Insights bucket (DPO-01 due, DPO-02 concentration, DPO-03 joint lapse, DPO-04 expired, DPO-05 below base rate) whose signals read **frozen records, not live renders** — the nav badge never runs the simulation; six route aliases; CSV scope **#59** per-currency aggregates, BLANK below five readings; `app/views/deferralPortfolioPanel.js` (fifth tab) and `app/ui/deferral-portfolio-modals.js` (declare ρ, freeze with preview). The demo seeds a coupled book (two top-priced calls `tests`-linked to the load-bearing premise — a relation attention-market does not read as sharing — plus one declared ρ = 0.45) and no pre-frozen forecast.
- **Not claimed** — a market price or risk-neutral measure; tail dependence beyond the Gaussian correlation; time-varying or derived ρ (deriving it from co-movement would be an invented fact); an MC mean as the expected total; any person-level inference. Real-browser/AT walkthroughs, the usefulness of the 60%/10pp conventions, and whether declared ρ survives contact with leaders remain **[UNVERIFIED]**.

## Current cross-module slice (Session 95, Schema v67 unchanged): transport, decomposed

The Session-94 decomposition now runs at three landmarks and is read as two
transport axes. `driftCohortsAt(items, key, today, τ)` generalizes the fixed
cohorts (recent started [τ, τ+60) days ago, prior [τ+60, τ+120), follow-up
capped at τ; τ=30 byte-identical to Session 94, deep-equality pinned), and one
shared landmark decomposition serves the day-30 verdict and the 14/60 profile
flanks. The profile carries its own fixed 24-test Holm family — three families
per scan (drift 6, day-30 12, profile 24), each controlled within itself;
joint and repeated-look control is not claimed. The cross-landmark pattern is
named as a shape (flat, early-only, mid-only, late-only, multi-landmark,
sustained, crossing, not-assessed). `classTransport` combines a **timing** axis
(any-exit log-rank; carries still-open and waiting-cost outputs) with a
**completion** axis (day-30 verdict; carries completion probabilities and the
completion median): favorable shifts read as conservative, never as failures,
and untested classes are `not-assessed`, never "stable". Consumers are
axis-aware: `#/wait` row confidence caps at low only on a timing failure and
names the unquotable framing otherwise; `#/consequences` banners timing failure
and stamps both axes into frozen readings; `SURV-11` fires only completion-only.
`RULE-SURV-08` challenges frozen evidence on `survival.scan`: survival readings
gain an appended challenge note (their frozen probabilities are never
rewritten), and wait-exposure certificates gain one owned re-freeze task only
on timing failure — the arithmetic they freeze. This is a descriptive stability
audit of a reference class, explicitly **not** causal transportability, and it
adjusts no number. CSV #53 gained eleven transport/profile columns (blank where
refused). See [ADR-0058](docs/adr/0058-transport-decomposed.md) and
[RESEARCH.md §95](RESEARCH.md). **Not claimed:** case-mix/positivity adjustment,
sequential control across scans or families, Gray's curve-wide test, or any
causal reading of an axis failure.

## Current cross-module slice (Session 94, Schema v67 unchanged): drift decomposition

`calendarDrift` tests time to any exit; `driftDecomposition` (same fixed cohorts,
same equal 30-day follow-up) attributes the shift to its two competing causes.
`kaplanMeier` now emits both Aalen–Johansen incidences, so `S + F_complete +
F_abandon = 1` at every step and the day-30 still-open change decomposes exactly
(residual computed, not asserted). Each cause is landmark-tested across cohorts
(Wald on the incidence difference, delta-method variances; Fisher exact at the
0/1 boundary only for verified fully-observed cohorts), Holm-controlled over the
fixed 6-class × 2-cause family, refused below five pooled cause events. Nine
verdicts; `substitution` (completions replaced by abandonments at unchanged exit
speed) fires `SURV-10` precisely where every any-exit view stays silent.
`RULE-SURV-07` makes the week's single drift decision component-framed — intake
review with recent abandonments as exhibits, or completion review — with
two-way precedence against `RULE-SURV-06`, plus a positive-deviance capture task
on significant improvement. Session 94 also **corrected the cumulative-incidence
variance shipped in Session 89** (a mis-transcription: wrong denominators,
missing cross term, final-F referencing; 0.0048/0.0344 where the provable value
is 0.012) to the three-term delta-method form, exact at the multinomial anchor
and pinned by test; Session 89's bands inherit the correction, frozen readings
store probabilities and are untouched. See
[ADR-0057](docs/adr/0057-drift-decomposition-competing-risks.md) and
[RESEARCH.md §94](RESEARCH.md). **Not claimed:** causality for any verdict,
case-mix adjustment, sequential control across repeated scans, or Gray's
curve-wide test (integrated Pepe–Mori difference is descriptive only).

## Current cross-module slice (Schema v67): the Consequence Lab

`#/consequences` reads an open decision through the real typed graph and the existing
`#/survival`/`#/wait` data. It shows direct and two-hop operational neighbours with
literal edge directions; a graph path is association, not causality. People, candidates,
conflicts and pulses never relay. Premise-watch, continuity shortfall and coupled open
call counts come from the live records. The root's weekly price is the same
`decisionValueTerms`-derived or declared price as in Cost of Waiting. The critical
mathematical distinction is **conditional restricted mean outstanding time**:
`∫₀ʰ S(age+t)/S(age) dt`. The older endpoint-only wait number is a lower bound on
this area; full-period waiting is the upper bound. The terminal prints all three,
per currency, for +1/+2/+4 weeks and refuses too few exits, too few at-risk items,
missing dates and unobserved tail. Related work is priced separately as a conditional
full-block ceiling, never as an incremental causal loss.

`consequenceReadings` freeze a still-open probability and aggregate adjacency/cost
before the horizon, then grade once from the original decision's dated outcome with
Brier; skill against the local base rate is withheld below five grades. No title,
prose, name, stakeholder stance or metric body is copied into the frozen reading.
`RULE-CSQ-01..05` on the post-commit spine write bounded typed source/context edges,
one leader-owned premise verification task, at most one coordination DACI decision
per root/week above the root price threshold, due grading work and a process-learning
task on a material miss. An explicit scan always runs; a pause suppresses automatic
learning work. CSV scope #57 is aggregate-only, blank below five within each horizon×
currency bucket; Insights and Today share CSQ-01..04. Demo cleanup removes ungraded
readings whose demo decision is gone, keeps graded history but excludes orphans
from calibration. See [ADR-0056](docs/adr/0056-decision-consequence-lab.md) and
[RESEARCH.md §93](RESEARCH.md). **Not claimed:** any graph path is causal, a
conditional ceiling is a forecast, survival classes are exchangeable, or a
frozen timing grade is a judgement about the leader.

## Current cross-module slice (Schema v66): evidence synthesis

`#/evidence` pools pre-registered, scored ITS level shifts within intervention×
outcome cells using DerSimonian–Laird random effects with the wider of the z and
Hartung–Knapp intervals, flags overlapping source windows, refuses below the
pooling/heterogeneity floors, prices another pre-registered trial by EVSI/EVPI,
and freezes aggregate-only reviews that are graded later by coverage **and**
accuracy. `RULE-EBM-01..05` fan pooled backfires and replication needs into
practice decisions, owned study tasks and typed links to open cases. Schema
`65→66` added `evidenceReviews` and `evidenceMarkers`, CSV #56 and an Insights
bucket. See [ADR-0055](docs/adr/0055-evidence-terminal.md). Overlap magnitude
remains unquantified and no study is a causal proof.

## Current cross-module slice (Schema v62): performance recovery

`app/core/domain/performanceSchema.js` defines a concern: the declared expectation with its
source and the date it was communicated, the observed gap and impact, dated observations
(SBI-quality scored), conversations (two-way or notice), support actions, the seven tri-state
Mager–Pipe answers, a plan with objectives/measures/a review date/a frozen 5–95% probability,
and one scored outcome. `app/core/domain/performance.js` is a pure read model: the evidence
audit measures *answerability* (window, distinct dates, specificity at the feedback module's
0–4 floor, stale count) rather than volume; six Leventhal/Colquitt rules (notice, accuracy,
consistency, voice, bias suppression, support) plus a named diagnosis gate a formal plan;
`costOfInaction` prices declared inputs and returns **unpriced, not zero**; calibration is
Brier-scored and withheld below five resolved plans.

The constraints are enforced in the command layer, not the copy. A plan cannot be adopted
while a gate stands unless the leader writes an override of at least 40 characters, stored
verbatim and displayed beside the plan for the life of the record. Review is single-scoring,
cannot be backdated before adoption or dated in the future. A concern with a plan cannot be
deleted into silence. There is no field for a rating, potential score, nine-box cell, ranking,
sentiment reading or exit recommendation, and the app cannot terminate, demote, dock pay or
change a role. `RULE-PERF-01..05` write support work only — owned tasks, blameless 1:1 prompts,
one decision per adoption and one per not-met review about the *process*, and typed
`concern→person` / `decision→concern` edges. CSV scope #52 leaves as codes and counts with no
label, name, observation text, conversation note, support note or override text.

## Current cross-module slice (Schema v63): delivery survival

`app/core/domain/survival.js` is a pure read model over records the workspace already
keeps. `harvestWorkItems` reads six source collections into one item shape — funded portfolio
work, operational cases, hiring requisitions, org-change programmes, delegations and decisions
— carrying start, end, exit type, censoring date, elapsed days, the *recorded* owner and, where
the workspace recorded both in the same unit, declared versus actual effort. An item with no
start date is counted as undated rather than assumed. Every statistic is recomputed on read, so
no stored number can drift from the records that produced it.

The estimators are named and separate: Kaplan–Meier product-limit survival over all exits with
Greenwood variance and a log–log band (open items stay in the risk set instead of being dropped,
which is the survivorship bias every cycle-time average in the category carries); the
**Aalen–Johansen** cumulative incidence of completion with the Aalen variance, so abandonment is a
competing exit and the page can print the naive complement beside the corrected incidence and say
why they differ; Nelson–Aalen hazard over declared elapsed-time buckets with a Katz log-rate
ratio; Mantel–Cox log-rank on one degree of freedom with the exact tail; conditional completion
over a forward window given survival to the item's age; `medianExit`, which returns *not reached*
rather than the maximum; and `agePercentile` — the share of past exits that took less time than
this item already has — printed as a percentile, never as a probability, because a rank among
past exits has no horizon in it.

A frozen reading is a falsifiable commitment: per-item probabilities, the at-risk counts they
were conditioned on, the curve digest and a review date. It is graded once, afterwards, with
Brier's rule **against the class's own base rate**, and the skill score is withheld below five
settled items. `freezeSurvivalReading` refuses an empty prediction set, a past review date and a
horizon outside 1–180 days; `gradeSurvivalReading` scores once; `deleteSurvivalReading` refuses a
graded record. `RULE-SURV-01..05` on the spine write typed `endangers` edges plus one owned task
per doomed item (recorded owner only, maximum five), one repair task when a graded reading lost to
its base rate, exactly one DACI decision per class per week when abandonment reaches the declared
share of exits, one task per returned delegation with no recorded reason, and one grading task per
stale reading. `survAutoPropagate=false` pauses automatic work; an explicit scan always runs.

Schema v63 is additive (`survivalReadings`, `survivalMarkers`, eight clamped `surv*` conventions,
migration `62→63`). An empty reading list is the correct upgrade state: freezing a prediction on
the leader's behalf would be a prediction made after the answer was known. CSV scope #53 exports 22
aggregate columns under opaque class codes with every figure blanked below the evidence floor. The
module states its assumptions — independence of censoring, exchangeability within a class, **no
Fine–Gray subdistribution model** — and it scores no person: every sentence is about a class of
work in a system.

## Current cross-module slice (Schema v64): cost of waiting

`app/core/domain/waitCost.js` is a pure read model that prices the open queue in money. A leader
declares one weekly price per class of work (`waitPrices`, cap 24, fail-closed — a negative or
non-numeric amount is dropped with a warning, never clamped to zero); a decision with linked
committed money is priced *derived* as dominant value at stake ÷ the 12-week erosion window
(linear Reinertsen CD3); everything else without a declared price is **unpriced, never zero**.
Each open item is read against the Session 89 survival curve: P(still open after w more weeks) =
S(age+w)/S(age), refused below the at-risk floor with the count and a reason, and flagged
`beyondEvidence` past the longest observation. Wait-horizon scenarios (1/2/4/8 weeks) print the
probability and a legacy endpoint-only **lower bound** (`price × weeks × probability`),
not the expected time-integrated carrying cost (corrected in Schema v67), per row; totals are
**per currency and never pooled**, and rows are ranked priced-overdue first, where overdue means
past the class's own completion median. Weekly exposure certificates (`waitExposures`, cap 60)
freeze the priced queue, totals, scenarios and a review date, and are navigable from every priced
item through SYSTEM_GENERATED `prices-delay` edges (`exposure` typed node, resolver
`#/wait?panel=certificates&exposure=<id>`). CSV scope #54 exports aggregate per class × currency
rows under opaque codes, with scenario figures blanked below the evidence floor.

`RULE-WAIT-01..05` run on the spine before decision tempo, marker-idempotent per ISO week: a scan
or price event reconciles stale `prices-delay` edges, freezes the weekly certificate, writes ≤40
`exposure→item` links with the price in the edge summary, opens exactly one triage DACI decision
per currency per week above the declared threshold, one owned delegation per top priced-overdue
item (≤ 5, due +3 days, recorded owner only), and one declare-a-price task per unpriced overdue
class (≤ 3, due +7 days, to the leader). `waitAutoPropagate=false` pauses automatic events; an
explicit scan always runs and reconciles (idempotent). Signals WAIT-01..06 land in the
`Cost of waiting` insights bucket. The module prices classes of work, never people, and cannot
reorder, close or reassign anything itself — the triage is a decision the leader makes. Schema
v64 is additive (`63→64`); an empty price/certificate list is the correct upgrade state, because
no price is invented for an existing workspace.

## Current cross-module slice (Schema v65): leadership parity & standard consistency

`app/core/domain/parity.js` is a pure read model that audits the leader's own allocation of
attention, developmental opportunity, promise fulfillment, and standard consistency across active
direct reports from dated records already in the workspace (1:1s, SBI feedback, GROW/stretch
delegations, recognition, succession bench slots, formal performance concerns, and review ratings).
Zero protected characteristics are stored or inferred; no person is scored, ranked, or recommended
for adverse action. Finite-sample Gini, Atkinson ($\varepsilon=0.5$), and additive Theil $T =
T_{\text{between}} + T_{\text{within}}$ entropy decompose leader investment across `role × tenureBand`
cohorts while explicitly shielding early-ramp joiners (`parityRampDays`, default 90d) so elevated
onboarding support never triggers disparity alerts. Leader-owned 1:1 action items are tracked in a
promise ledger with Wilson 95% score intervals, chronic carry rates ($\ge 2$ carries), and overdue
dispersion; open performance concerns are audited against peer delivery baselines for threshold
inversions and longitudinal rating concordance (tie-adjusted Kendall $\tau_b$); and a 14-day
counterfactual planner allocates `parityWeeklyBudgetHours` across high-leverage actions.

Frozen Parity Audits (`parityAudits`, cap 60) record baseline metrics, planned rebalancing steps,
review dates, and an ex-ante probability (5–95%) scored once with Brier's quadratic rule (skill
score withheld below five graded audits). `RULE-PAR-01..05` run on the shared spine before decision
tempo (`parityMarkers`, cap 400): one process-level DACI standard-consistency calibration decision
with typed `audits-consistency` edges (`RULE-PAR-01`), blameless 1:1 cadence/SBI prompts and
leader-owned tasks with `rebalances-attention` edges for post-ramp reports in the coaching fringe
(`RULE-PAR-02`), leader-promise recovery tasks/decisions with `repairs-contract` edges
(`RULE-PAR-03`), overlooked-bench sponsorship prompts (`RULE-PAR-04`), and stale-audit grading work
(`RULE-PAR-05`, `parity` entity type, resolver `#/parity?panel=rebalance&audit=<id>`).
`parityAutoPropagate=false` pauses automatic events while explicit `scanParity` always runs.
Signals `PAR-01..06` surface in the `Leadership parity` insights bucket; Today and Person views
surface due audits and overdue leader commitments; CSV scope #55 exports opaque cohort and channel
aggregates only. Session 91 also repaired five pre-existing cross-module defects across `warGame.js`,
`warGameRules.js`, `views/warGame.js`, `insights.js`, and `performance.js`.

## Current cross-module slice

A committed scorecard can propagate through the existing rule engine into a redesign or calibration decision, owned delegations, a coaching prompt and typed `informs` links. The scorecard remains a frozen source record. The `#/propagation?tab=lineage` view shows successful rule steps and links to the exact typed records. All registered link kinds are tested through resolver/schema round-trips; route-to-view tests exercise selection across the relevant destination screens, including retired scorecards.

The trace records that a rule committed changes. It does **not** prove those changes were effective, establish causality, or support replay. No pre-v48 success history is backfilled.

**Implementation fidelity (v50).** A leader declares an implementation plan *before* delivery: intervention type, an optional exact typed source record, owner, intended population, planned units and a window of at most 364 days. Five stages are scored — reach (0.25), dose (0.30), delivery quality (0.25), maintenance (0.10) and adaptation (0.10). Four are derived from dated typed records with an explicit standard (1:1 holding written notes, SBI-complete feedback, a delegation carrying a dated check-in, a key result that moved); adaptation has no instrument and is attested only, and the UI says so instead of substituting a proxy. Exposure is **multiplicative** (reach × dose × quality), never a weighted mean, and a plan whose evidence covers less than 60% of the model's weight is `insufficient` rather than low — a refusal to grade. The second reading is a dated human attestation; a verdict that contradicts the records requires a written reason and is classified as optimistic, conservative, lenient, strict or mismatched. Across plans that becomes a leader-level calibration statistic with a Wilson 95% interval, withheld below three verdicts.

`RULE-FID-01..05` run on the same spine: typed `measures-delivery` links, a disagreement prompt, one repair decision plus one owned delegation per materially under-delivered settlement, one owned task per plan for overdue checkpoints, and a frozen `implementationSnapshot` when a linked Impact study is scored. That snapshot prints ITT, the Bloom/LATE per-complier estimate and the inflated MDE together, and yields `null` — never `0` — when the evaluation could not fit. `RULE-IMP-02` now reads measured exposure: a contradicted but materially under-delivered study opens *repair delivery or stop on a weak test* instead of a stop decision. The `#/fidelity` page, CSV scope #44 (derived telemetry only) and the `Implementation fidelity` Insights bucket complete the slice.

**Impact execution evidence (v49).** A study may select an exact typed source record. Scoring freezes the count of retained lineage transactions whose root or applied-step event names that exact record from the declared start date through scoring, plus up to 12 trace-navigation references. A real case-created cascade can connect to its downstream decision/delegation/goal/coaching records, while RULE-IMP-01 links the Impact study back to the case. The match is implementation telemetry only: no hit may mean work happened outside LeadOS, triggered no automation or aged out; a hit does not prove delivery, exposure, fidelity, adoption, quality or causal effectiveness. Legacy scored studies show `not-recorded`, not a reconstructed zero.

**Workforce transition (v52).** A programme declares a target headcount, one optional cost ceiling, one comparison dimension, a weighted criteria table and an accountable owner *before* any name is proposed, then names candidates from the active roster. `app/core/domain/transition.js` is a pure read model: exit cost from recorded pay and the declared notice/severance conventions (missing pay is `unpriced` and `null`, never zero), constrained selection by greedy plus swap repair with a printed fractional-relaxation bound and a described gap, a seeded weight ensemble reporting stability shares rather than probabilities, the four-fifths screen applied to the decision with Wilson intervals, a group-size floor, printed coverage of candidates with no group code and a fragility count (how many selections must move at constant headcount before the direction reverses), the cheapest compliant swap set with an explicit infeasibility verdict, continuity exposure where a sole recorded steward of a critical dependency is a hard refusal, a mechanical survivor redistribution with a four-term departure convention frozen at finalization, four priced alternatives compared by Pareto dominance, a backwards-planned gate timeline, Brier calibration and a deterministic brief. `RULE-TRN-01..06` run on the same spine: typed `separates` provenance, exactly one DACI *criteria-and-target* decision plus one owned scoring-grid task when the screen fails — never a pairwise swap of two names — one owned hand-over per materially at-risk leaver with typed edges to the dependencies at stake, at most three blameless survivor prompts, one dated outcome review plus one owned tracking task at finalization, and a resolved prediction on `person.archived`. `decideTransition` refuses an unowned or under-named plan and `finalizeTransitionProgram` refuses an unowned plan or one with no priced exit. CSV scope #46 and the `Workforce transition` Insights bucket are derived telemetry: counts and ratios under positional programme codes, no name, identifier, group code, note or per-person probability. **No protected characteristic is stored**, and the module generates no WARN notice, release packet or severance agreement.

**Merit & pay equity (v51).** A cycle declares a budget (amount or share of payroll), one comparison dimension, an owner and dated pay rows against declared bands. `app/core/domain/comp.js` is a pure read model: compa-ratio and range penetration, band integrity with a refusal to repair a broken range, inversion and external-hire-premium findings, a twofold log-pay Oaxaca–Blinder decomposition over level, tenure and last rating (with an explicit rating-missing term), an interval on the adjusted gap from the group coefficient's own standard error, the four-fifths screen over the decision with Wilson intervals and a reliability floor, a four-term printed retention hazard, replacement cost weighted by the succession bench, three priced policies with regret, a frozen fairness snapshot and a Brier-scored calibration card that refuses to report below five outcomes. **No protected characteristic is stored anywhere**, so the audit runs on a comparison the leader declares (hire origin or reporting line) and prints that an unexplained gap is not proof of discrimination. `RULE-COMP-01..05` run on the same spine: typed `compensates` provenance, exactly one DACI *mechanism* decision plus one owned evidence task when the audit is flagged — never an individual adjustment — one relative-pay task per cycle with `compares-pay-with` links, one dated outcome review, and a resolved prediction when someone is archived. CSV scope #45 and the `Merit & pay equity` Insights bucket are derived telemetry: ratios and counts under opaque cycle codes, no salary, name, note or label. Demo cleanup removes demo cycles and rows and nulls dead pointers while keeping a frozen audit.

## Current cross-module slice (Schema v53): structural design

A leader declares a structural design — a set of proposed reporting lines plus the span band and
coordination hours the reading will use — and the module measures it against today's roster without
writing anything. Span and layers come from the reporting graph; coordination channels are
`n(n−1)/2` per unit with the manager included (Graicunas 1933; Brooks 1975) and are priced from the
latest effective merit cycle, `unpriced` where no pay is recorded. Each manager's decision queue is
Kingman's (1961) diffusion approximation with `λ`, `Ts` and `Cs` measured from that manager's own
completed delegations, cases and goals: `insufficient` below three completions, `null` at ρ ≥ 1.
Candidate designs are compared on four minimised objectives as a **Pareto set, never a weighted
score**, and the counterfactual wait scales measured arrivals by coordination channels — a declared
convention, printed beside every number it produced.

Committing is the only action that changes a reporting line: it validates an owner, a real change, an
acyclic result and active people, applies every move to `people.managerId`, records each previous line
and freezes the prediction (measured and modelled stored separately) in the same transaction.
`RULE-ORD-01..05` then run on the shared spine: typed `structures`/`resizes` provenance, **one** DACI
decision about the mechanism when a unit is still over the band — never a decision that moves one
named report to one named manager — plus one owned scope task, at most three blameless prompts for the
people whose line moved, one dated outcome review, and a scored median absolute percentage error once
the window closes. `revertOrgDesign` restores exactly the recorded line and leaves alone any line that
changed again; a reverted design is history and cannot be re-committed.

CSV scope #47 and the `Structural design` Insights bucket are derived telemetry: counts, ratios and
opaque positional design codes, no name, identifier, label, note, individual pay or individual wait.
Demo cleanup drops moves for removed demo people and keeps a frozen snapshot verbatim.

**Not claimed:** the span band and coordination hours are declared conventions, not validated
instruments; the queue is a single-server approximation and correlated arrivals between managers are
not modelled; the channel-scaling counterfactual is a convention that can be wrong in either
direction, which is what the calibration card exists to contradict; there is no HRIS or market pay
feed. Real-browser and assistive-technology behaviour of `#/orgdesign` remains **[UNVERIFIED]**, as
does the quarantined legacy `src/**` tree.

## Current cross-module slice (Schema v54): information value

A leader declares a decision frame — two to six states of the world whose probabilities sum to exactly
100%, two to five options including doing nothing, and what each option pays in each state — and the
module prices what it is worth to learn something before committing. `app/core/domain/valueOfInformation.js`
enumerates the payoff table exactly: expected value per option, `EVPI = Σ p·max − max Σ p·payoff` as the
ceiling, EVPI as a share of the declared stake, the Savage minimax-regret table beside it, and a near-tie
flag. A blank payoff cell makes that option **unpriced** and EVPI `null` with the count printed — never
zero, because a zero would look like the most persuasive number on the page — and a probability sum that
is not 100 is refused rather than rescaled.

An investigation declares the sensitivity and specificity the leader would defend, the **fee**, and the
**worth of the wait**. Bayes' rule gives the exact posterior per signal, `EVSI = Σ_signal P(signal)·max_o
E[u | signal] − EV*` is priced against the total of both costs, efficiency is reported as a share of the
ceiling, and break-even sensitivity is found by bisection because EVSI is monotone in accuracy
(Blackwell). A test whose sensitivity and specificity sum to 100% is a coin flip and is refused at entry;
when no achievable accuracy pays, the answer is an explicit `null` and the page says it is an answer, not a
missing number. Settling converts the observed signal into the standard diagnostic likelihood ratio
(`LR+ = se/(1−sp)`, `LR− = (1−se)/sp`, clamped at 20) and appends **one dated observation** to the premise
the frame's states cite, in the same transaction as the money result.

The portfolio panel prices concentration rather than covariance: a Herfindahl reading over premises, the
open frames per anchor, and a declared two-point flip stress that reports how many open frames would
change their preferred option and what the swing costs. Deciding freezes EVPI, the per-option expected
values and the declared distribution in the same write; observing what actually happened scores that
frozen distribution (multi-class Brier, log loss) and records the regret actually incurred, withheld below
the resolved-prediction floor. `RULE-VOI-01..05` run on the shared spine and are marker-idempotent: typed
`rests-on`/`informs` provenance, exactly one DACI buy-information decision priced per branch plus one owned
scouting task when EVPI clears a money floor **or** a share of stake (whichever is higher), one premise
observation per settled test, one de-risking decision when a premise anchors too many open frames, and one
dated outcome review per decision. `voiAutoPropagate: false` pauses the automatic side while an explicit
scan still runs; no frame can be decided without an accountable owner, and no investigation can be settled
without a declared signal.

CSV scope #48 and the `Information value` Insights bucket are derived telemetry: counts and ratios under
opaque positional codes, no label, question, premise title, name, currency amount or individual payoff.
Demo cleanup removes demo frames and investigations and nulls dead pointers.

**Not claimed:** EVPI is an upper bound *given the leader's declarations*, so a mis-declared payoff table
produces a confident and wrong ceiling. The declared probabilities carry no elicitation protocol, so an
overconfident prior cannot be detected from inside the module. EVPPI is not built — there is no
parameter-level model to take partial information over. The flip stress is a two-point perturbation, not a
probability and not a covariance; two premises that are correlated in reality are treated as independent
because nothing in the record says otherwise. The cost of waiting is declared, not derived from a discount
rate or a stochastic option to defer. Likelihood ratios assume the declared sensitivity and specificity
hold in this population. Real-browser and assistive-technology behaviour of `#/voi` remains
**[UNVERIFIED]**, as does the quarantined legacy `src/**` tree.

## Current cross-module slice (Schema v56): Leader Probability Calibration

A leader's frozen VOI probability distributions are scored against the realised state they were declared
for, producing a live calibration read under a new "Calibration" tab on the Information Value terminal.

`app/core/domain/leaderCalibration.js` is a pure read model: per-outcome (single-P) samples from every
settled frame are placed into five 20pp bands `[0,20), [20,40), [40,60), [60,80), [80,100]`, a Wilson
(1927) 95% score interval is printed per bin, the multi-class Brier is decomposed into
reliability − resolution + uncertainty (Murphy 1973), a mean absolute reliability gap is computed
across scored bands, a verdict fires when the 80–100 bin overshoots AND the 0–20 bin undershoots by at
least 10pp (classic overconfidence signature) or vice-versa (underconfidence), a PSI cohort split flags
drift between earlier and recent halves at a 10/10 boundary, an advisory Platt/isotonic-style remap is
printed for inspection (never auto-applied), and a per-topic breakdown uses explicit premise tags only.

Cromwell's rule (Dawid 1982) clamps 0%/100% to 5/95. Counts only below 5 settled outcomes; verdict
withheld below 10; per-bin verdict withheld below three samples. Legacy outcomes (pre-v54 frames lacking
a frozen snapshot) are counted but excluded from the verdict.

`RULE-LCAL-01..03` run on the shared spine:
- **LCAL-01** on `voi.scanned` (settle): a marker-idempotent calibration sample entry and an event when
  the verdict floor is crossed.
- **LCAL-02** (drift) is read-side; PSI is re-derived on load.
- **LCAL-03** on `voi.declared`: when the current verdict is overconfident the rule stamps an in-band
  `notes` advisory on the new frame warning that the EVPI ceiling was produced by a distribution the
  leader's own track record discounts. **The rule never auto-adjusts declared probabilities.**

The calibration tab renders verdict, Brier/Murphy decomposition, reliability diagram (visual bins),
advisory remap, per-topic breakdown, PSI cohort drift and a caveats card. Calibration signals
(LCAL-01..04: overconfident, underconfident, drift, first-verdict-ready) are aggregated into the
Signals feed and share the VOI nav badge count. The download brief appends the calibration brief.

CSV scopes, typed link provenance and the bounded lineage remain unchanged; calibration is one more
read-side terminal on the existing propagation spine.

**Not claimed:** The calibration read does not auto-correct inputs, derive topics from prose, score
named individuals, or read conflicts / anonymous pulses. The binning uses five equal-range bands,
not data-dependent bins; at small samples the Wilson interval can be wide. Real-browser and
assistive-technology behaviour of the new Calibration tab remains **[UNVERIFIED]**, as does the
quarantined legacy `src/**` tree.

## Research and decisions

- [ADR-0036](docs/adr/0036-bounded-propagation-lineage-and-typed-links.md) records the bounded lineage and typed-navigation decision.
- [ADR-0037](docs/adr/0037-impact-execution-evidence.md) records the typed Impact snapshot decision and why execution counts are not outcome claims.
- [ADR-0038](docs/adr/0038-implementation-fidelity-ledger.md) records the fidelity-ledger decision: declared denominators, record-derived delivery beside attested judgement, and why the dilution correction is not a causal estimate.
- [ADR-0041](docs/adr/0041-structural-design-terminal.md) records the structural-design decision: a measured structure, a Pareto set instead of a score, a destructive commit that freezes its own prediction, and why the module never moves a named person to a named manager.
- [ADR-0042](docs/adr/0042-information-value-terminal.md) records the information-value decision: EVPI/EVSI enumerated exactly rather than sampled, a total cost of learning that includes the wait, a settled test written into the premise ledger as a likelihood ratio, and why concentration is priced while covariance is refused.
- [ADR-0043](docs/adr/0043-decision-portfolio-sequencing.md) records the decision-portfolio sequencing engine decision.
- [ADR-0044](docs/adr/0044-leader-probability-calibration.md) records the leader probability-calibration decision: Brier/Murphy decomposition, five-band reliability diagram with Wilson intervals, PSI drift, an advisory (never auto-applied) remap and why no probability is ever silently rewritten.
- [ADR-0039](docs/adr/0039-merit-and-pay-equity-terminal.md) records the merit/pay-equity decision: no protected class, a screen rather than a verdict, an interval that matches the sample, and why a fairness flag opens a mechanism decision instead of an individual adjustment.
- `RESEARCH.md` §§74–77 record the 2026-10-29 technical-pattern reviews and public benchmarks. Competitor absence, parity and comparative effectiveness remain **[UNVERIFIED]**.
- [ADR-0053](docs/adr/0053-cost-of-waiting-terminal.md) records the cost-of-waiting decision: declared/derived/unpriced-never-zero prices, the S(age+w)/S(age) wait scenarios, per-currency totals, and why the triage is opened as a decision rather than applied.
- `ROADMAP.md` and `AI-SESSION-LOG.md` record what shipped, verification, limits and next work.

## Known limits

- Real-browser assistive-technology behavior and the quarantined legacy tree are not certified by the automated suite.
- The lineage is deliberately partial, capped and local. No event payload replay, distributed tracing service, hosted sync, application backend or automatic compensation is implemented.
- Direct product feature parity was not established by this technical-pattern review; public repository/readme material is not independent proof of product effectiveness.

## Next ambitious bets

1. **Cross-manager queue coupling:** model a shared arrival stream between two managers whose units
   exchange work, so the terminal can show the coupling it currently has to assume away (Kingman
   single-server approximation assumes independent arrivals across managers today).
2. **Prospective implementation milestones:** let a leader record intended, delivered and verified stages for selected intervention types, with dated owner-evidenced steps—without treating a rule trace as delivery or a proxy for fidelity.
3. **Calibration-driven VOI ceiling discount:** convert the advisory remap into an explicit "discounted
   EVPI" figure (the EVPI ceiling recomputed under the Platt-adjusted distribution), shown beside the
   raw ceiling so the leader can see the magnitude of the correction without it being applied silently.
4. **Crash-safe rule outbox:** explicit versioning, retry/deduplication semantics and kill/restart tests, while keeping the current local synchronous model and human gates honest.
5. **Leader-controlled retention/purge:** policy and UI for the bounded lineage window and its effect on snapshot references, exports and historical completeness.
