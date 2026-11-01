## 2026-11-01 — Session 109: Measurement Reliability Terminal (`#/reliability`, Schema v77, [ADR-0069](docs/adr/0069-measurement-reliability-terminal.md), RULE-REL-01..05, CSV #67)

**Implemented (ahead-of-market: every 2026 vendor ships bias detection on *people*, none publishes a reliability coefficient for the *instrument* — see RESEARCH §94)**
- **The instrument, measured:** every completed review becomes one observation of a people × cycle design. Balanced two-way random-effects ANOVA solved exactly (τ² between-person; cycle + residual pooled as occasion error), one-way ICC(1) with a Satterthwaite interval and an F test of τ² = 0, and the reliability of the **mean of k ratings** by Spearman–Brown printed beside it — a single rating and a four-rating average are different facts. Unbalanced designs use Cochran's n₀ plus a balance ratio; a design too ragged to support a coefficient is refused with a machine-readable reason.
- **Credibility and regression to the mean, per person, without scoring the person:** n/(n + K) with K = occasion error ÷ between-person variance, and the expected **next** observation printed as an expectation, not a verdict (Murphy & DeShon 2000 honesty: systematic rater disagreement is not measurement error).
- **Separation as a posterior test, not a sort:** people share a tier unless the evidence separates them; the finding is the tier count and the number of indistinguishable adjacent pairs; membership is alphabetical and on screen only. No score, rank, leaderboard or potential rating exists anywhere in the module, its exports, its brief or its signals.
- **Decision study — the refusal, priced:** minimum detectable difference at 80% power, observations per person to detect a one-point gap, and the months that costs at the declared cadence (demo: 1.27 pts now, 7 ratings/person and 8.9 months for a one-point call).
- **Convergence across instruments, with a hard refusal:** tie-corrected Spearman plus an exact permutation p across goal attainment, feedback balance and delivery timeliness; high agreement that is underpowered at n = 5 is reported as *uncertified agreement*, not as disagreement, and a composite is refused unless every testable pair converged.
- **Freeze once, grade once, lapse an empty window:** a frozen reading stores design counts and coefficients — never a person — and is graded out of sample; a window that closes with too few new observations lapses instead of being credited.
- **Governed escalation, never action:** `RULE-REL-01..05` on the shared post-commit spine (capture once per completed review; at most one governed DACI decision plus one blameless process task per ISO week when the instrument is below its floor *and* differentiation is being asked of it; a surprise-guard note plus one leader-owned verification task when a rating lands a full point outside the person's band; one monthly blameless method task when instruments do not converge; reconcile). Pauseable via `reliabilityAutoPropagate`; an explicit scan always runs.
- **Wiring:** seven axe-clean panels, twelve route aliases, `REL-01..06` signals, a Measurement reliability Insights bucket, nav badge, identity-free brief (tier sizes only, no person named), aggregate-only CSV scope #67 (blank below every floor, never zero), typed `reliability` node with `qualifies-differentiation` / `tempers-rating` relations, and a demo seed of 20 quarter-adjacent reviews plus a graded-before/after pair of readings.

**Top next targets:**
1. **Two-way mixed ICC(3,1) beside the headline, with a written reason it is not the headline:** a cohort-wide cycle shift is currently pooled as occasion error on purpose; showing the alternative coefficient *and* the sentence explaining why it flatters the instrument is the next level of honesty, and it needs a declared test of the cycle effect.
2. **Rater-side decomposition as the module's second dimension:** one manager is one rater, so today the model cannot separate "this person is hard to rate" from "this manager is consistently severe". A multi-rater design (360 peers, calibration panels) exists only as a refusal; with `reviews` carrying peer input it becomes κ/ICC(2,k) on a second axis.
3. **Reliability budgets wired into the people decisions:** the merit cycle and calibration surfaces should read the frozen reading and refuse a forced distribution that the instrument cannot support — a cross-module consequence, not a report.
4. **Carried forward:** durable local-first outbox and multi-tab lock lease; dated FX scenario ledger; headless Chromium + assistive-technology CI lane.

**Deliberately rejected:** any person score, rank, potential rating or leaderboard (including inside exports and the brief); a composite of instruments that do not converge; rewriting or nudging a rating; treating an absent rating as an average; crediting a lapsed window; Cronbach's α as the headline (wrong question for a single item per cycle, and named insufficient by the 2026 standards review); a two-way mixed model as the headline (it credits the cycle effect); any sentiment, prose or demographic input; any adverse action.

---

## 2026-11-01 — Session 108: Counterfactual Policy Terminal (`#/counterfactual`, Schema v76, [ADR-0068](docs/adr/0068-counterfactual-policy-terminal.md), RULE-CFP-01..04, CSV #66)

**Implemented (ahead-of-market: no 2026 performance-management or people-analytics vendor ships counterfactual policy evaluation on a manager's own decisions — see RESEARCH §93):**
- **Four harvested decision-point families, zero new data entry:** assumption (dated observation before settlement → arm 1), DACI decision (decided inside the declared review window → arm 1), delegation (checkpoint before the due date → arm 1), case (mitigation spend committed before resolution → arm 1). Reward 0 / 0.5 / 1 by each family's own declared rule. Arms are read from the record; nothing is re-armed and nothing is entered for this screen.
- **Off-policy race with a bounded headline:** the recorded behaviour policy is exactly identified (plain mean, no model, no weight, no interval); against it, always-act / always-hold / prequential-best / adaptive-recent are scored by DM, IPS, **self-normalised IPS (Hájek 1971)** as headline and **doubly robust (Robins, Rotnitzky & Zhao 1994)** as cross-check. The **spread across the four** is printed as the fragility diagnostic (>10pp ⇒ fragile, never a finding). Doubly robust moved 8pp under one rarely-taken arm in testing, which is why the bounded estimator leads.
- **Identification before estimation:** Manski (1990/1995) worst-case bounds, assumption-free and family-bounded, bracket every point estimate; missing fraction + effective sample size + per-arm floors decide refusal. A policy the record never took is `refused-unidentifiable`, never extrapolated. On the demo record 3 of 4 alternatives are refused and the terminal says so.
- **Hidden-bias sensitivity as a first-class output:** caliper-matched greedy nearest neighbours on **pre-treatment covariates only**, ASMD balance reported (Stuart 2010), exact two-sided McNemar (1947), Rosenbaum (1987, 2002) worst-case bounds across Γ, design sensitivity **Γ\*** solved by bisection to the overturning value, and a **Hoeffding (1963) confidence sequence** so the race can be watched daily without losing time-uniform coverage (half-width 0.19 at 90 decision points).
- **Governed escalation, never adoption:** `RULE-CFP-01..04` on the shared post-commit spine — prospective capture, outcome resolution, at most one policy-ruling DACI decision *plus* one blameless process task per ISO week, and reconciliation that drops decision points whose source record was deleted. Frozen evaluations grade **once** from strictly later evidence and **lapse** rather than being credited when a window closes empty.
- **Wiring:** six axe-clean panels (race, bounds, sensitivity, families, ledger, method), fourteen route aliases, `CFP-01..06` signals, a Counterfactual policy Insights bucket, nav badge, identity-free board brief, aggregate-only CSV scope #66 (blanks, never zeros), demo seed data, additive `v75 → v76` migration.

**Top next targets:**
1. **Covariate-informed pooling (Beta-binomial regression on one declared covariate):** the terminal currently refuses per-family evaluation below 10 points; a declared, dated covariate would let thin families borrow strength as the Borrowed Evidence Engine does, with the same exchangeability ruling rather than an assumption.
2. **Borrowing-as-a-service registry + adapters:** every "too few to judge" refusal in LeadOS (counterfactual, survival, credibility, parity) should register with one shared registry so a refusal is a first-class object with one repair route, not a dead end per module.
3. **Out-of-sample exchangeability partitions:** hold out a declared recent window for every evaluation race and report the estimator's out-of-sample Brier, not just its in-sample value.
4. **Durable local-first outbox & multi-tab lock lease** (carried forward), **dated FX scenario ledger** (carried forward), **headless Chromium + AT CI lane** (carried forward).

**Deliberately rejected:** adopting a policy on the leader's behalf; re-arming a decision point after the fact; matching on post-treatment covariates (it collapsed overlap to zero and manufactured refusals — tried and reverted); reporting doubly robust as the headline under poor overlap; extrapolating a policy value the record never identified; person-level or per-person policy scoring of any kind; reading `conflicts`, `pulses`, `candidates` or `messages` in the engine.

---

## 2026-11-01 — Session 107: Outcome Attribution & Loop Settlement Terminal (`#/attribution`, Schema v75, [ADR-0067](docs/adr/0067-outcome-attribution-loop-settlement.md), RULE-STL-01..05, CSV #65)

**Implemented (closes Session 104 Target #2 — Bundle & Response Outcome Grading):**
- **$O(V + E)$ zero-re-entry multi-channel loop discovery:** automatically discovers and grades adopted Action Bundles (`bundle:<id>`), adopted Response Plans (`response:<id>`), and standalone multi-channel Case Control Loops (`case:<id>`).
- **Schedule & bottleneck physics:** Lipke (2003) Earned Schedule ($ES, SPI(t), SV(t), IEAC(t)$), Goldratt (1997) Green/Watch/Red Buffer Fever Chart, and Pressman–Wildavsky (1973) leader-vs-delegate clearance-point separation.
- **2×2 Thesis-vs-Execution attribution with explicit refusal:** separates *Validated Win*, *Thesis Falsified — Clean Execution* (Holmström/Kerr exoneration), *Leader-Gated Stall*, *Execution Drift — Untested Thesis* (Fixsen Type-III error guard), and *Confounded — Refused* (when both fidelity and outcome fail without an independent premise verdict).
- **Brinson–Fachler 3-way economic variance & Savage ex-post policy regret:** exact additive decomposition of schedule drift, rate/spend revision, and interaction with strict ISO currency isolation (`mixed-currency-refused`) and encumbrance-vs-actual separation (`encumbrance-only`), plus ex-post branch regret across Response Studio's `contain` / `verify` / `wait` policies.
- **Prospective Brier calibration & generalized spine cascade (`RULE-STL-01..05`):** Cromwell-clamped $[5\%, 95\%]$ forecast freeze, one-shot out-of-sample Brier/Wilson grading on `case.resolved` / `premise.outcome` ($n \ge 5$ skill gate), typed `settles-loop` / `exonerates-delivery` / `flags-bottleneck` links, blameless 1:1 clean-delivery credit prompts, governed double-loop thesis-pivot DACI decisions (priced downstream by Decision Tempo in the same transaction), AAR drafts, leader bottleneck annotations, and Type-III premise guards — while preserving untouched Action Bundle withdrawal.
- **Surface, export & docs reconciliation:** 6-panel `#/attribution` terminal, handoffs on `#/bundles`, `#/responses`, `#/today`, and `#/settings`, aggregate-only CSV scope #65, `STL-01..04` Insights bucket, reconciled stale schema headers in `ARCHITECTURE.md` and `LEADOS-STATE.md`, and rebuilt `LeadOS-standalone.html`.

**Top next targets:**
1. **Durable local-first outbox & multi-tab lock lease:** persist in-flight worker rehearsals and multi-step adoption intents across reloads/tabs with idempotency keys and explicit replay/repair receipts.
2. **Dated, user-declared FX scenario ledger with sensitivity:** allow cross-currency portfolio/loop comparisons only under an explicitly declared, dated FX band with provenance and tornado stress rather than silent spot conversion.
3. **Longitudinal attribution cohort drift:** feed settled loop regimes (`execution-stalled-leader-gated` rate, `thesis-falsified-clean-execution` rate) into Borrowed Evidence (`#/credibility`) and Leadership Parity (`#/parity`) as aggregate unit-level diagnostic priors without individual scoring.
4. **Headless Chromium + assistive-technology CI lane:** complement automated JSDOM/`axe-core` suites with real-browser Playwright + screen-reader smoke checks on both hosted ES modules and `file://` `LeadOS-standalone.html`.

**Deliberately rejected:** individual employee attribution scores or rankings; claiming observational attribution proves randomized causality in confounded loops; implicit cross-currency conversion; treating unspent commitments as actual spend; mutating untouched bundle targets before explicit settlement.

---

## 2026-11-01 — Decision units, next steps

- **Implemented:** mixed-currency capacity allocation and release ranking refusal; rule-created capacity decision discloses the reason; mixed-currency CD3 scope preset withheld; hiring exposure grouped by currency and scenario handoff guarded.
- **Planned:** inspect prior generated trade-offs for stale unsafe options; workspace-wide audit of monetary comparisons and currencies; user-approved dated FX evidence and stress ranges; real-browser keyboard and assistive-technology verification.
- **Deliberately rejected:** implicit 1:1 FX (false precision); automatically rewriting historical decisions (destroys audit context); a new standalone dashboard instead of guarding existing decision paths.
- **Gap:** no universal currency type or FX framework; other ranking/simulation paths and all unreviewed modules **[UNVERIFIED]**.

---

## 2026-11-01 — Session 105: valuation integrity across the case-to-scenario path

**Implemented:** separate case exposure/net value by currency; refuse mixed-currency multi-ledger scenario totals and Pareto comparisons; preserve uncertainty into decision handoff; label sums of individual case/capacity P90s honestly; include recorded numeric vacancy cost. Reuses the existing generalized case rule spine and derives guards from current state rather than creating duplicate ledger entries.

**Next:** (1) audit and harden every mixed-currency financial aggregation and capacity/value-density ranking, including hiring; (2) add explicitly dated, user-approved FX rates with sensitivity and provenance, not silent conversion; (3) model joint case exposure with explicit dependence scenarios and prospective backtesting; (4) durable action-bundle outbox and real-browser/accessibility CI.

**Rejected:** a new disconnected analytics terminal while existing financial outputs could be materially wrong; assumed FX or assumed correlation. Competitor parity/first-in-market claims remain **[UNVERIFIED]**.

---

## 2026-11-01 — Session 104: Action Bundles — reviewable, reversible cross-module execution (Schema v74, [ADR-0066](docs/adr/0066-action-bundles.md), RULE-BND-01..03, CSV #64)

**Implemented (this session):**
- **Closed six-adapter command registry:** decision, delegation, premise, budget commitment, stakeholder comms and coaching; proposals derive only from an existing case, owner, estimate and envelope.
- **Real-command rehearsal:** hosted/standalone background worker replays production APIs and the full rule spine in a disposable store; operational and typed-relationship diffs are reviewable before any live write.
- **Atomic, stale-gated adoption:** revision + input/source fingerprints + day + explicit review; bounded multi-event `sourceEvents` transaction; actual-vs-preview equality; command/rule failure rolls back everything.
- **Guarded compensation:** frozen target fingerprints, untouched-only checks, reverse-order compensators in one transaction; immutable adoption/withdrawal history. Later work protects the entire bundle.
- **Generalized provenance rules:** typed bundle node/edges, one owned review checkpoint, explicit reconciliation scan; pause affects follow-up only.
- **Product wiring:** case/Response Studio handoffs, Today/Signals, Settings toggle, nav badge/routes/title, receipt export, aggregate CSV #64, demo cleanup, additive migration and rebuilt standalone.

**Rejected:** a new disconnected terminal; arbitrary API/eval execution; autonomous choice/send/spend; deleting later human work; claiming a software diff predicts causal benefit; adding a workflow backend that breaks local-first operation.

**Top next targets:**
1. **Durable bundle outbox and retry:** persist pending rehearsal/adoption intent across reloads with idempotency keys and explicit retry/repair receipts (Temporal/Inngest-class durability, still local-first).
2. **Bundle outcome grading:** compare frozen operational intent with later delivered work, settled assumptions and actual spend; feed calibrated error back without rewriting the receipt.
3. **Real-browser/AT CI lane:** worker + file:// standalone + keyboard/screen-reader walkthroughs, plus load budgets as the bundle grows.

---

## 2026-11-01 — Session 103: Response Studio — rehearse cross-module consequences before committing (Schema v73, [ADR-0065](docs/adr/0065-response-studio.md), RULE-RSP-01..04, RSP-01..03, CSV #63)

**Implemented (this session):**
- **Three-policy rehearsal over the real rule graph.** `contain` / `verify` / `wait` replay the existing case and intake commands in disposable stores, returning operational diffs, typed relationships, rule failures and warnings without touching live state.
- **Declared economics.** PERT three-point weekly delay cost, carry cost over a declared window, Savage minimax regret, and a verification break-even threshold. Blank/inverted assumptions refuse; nothing is silently imputed.
- **Atomic, fail-closed adoption.** Revision + source/input fingerprints + branch-failure checks gate one `store.update` that creates the case, routes the intake and freezes an immutable receipt. Ordinary intake confirmation is now atomic too.
- **Generalized follow-up rules.** RULE-RSP-01..04 add typed edges, one owned delegation or DACI fallback, and orphan repair on the shared post-commit spine; `responseAutoPropagate` pauses follow-up only.
- **Off-main-thread execution.** Hosted module worker; standalone reuses the inline ES bundle as a Blob worker. 45s timeout, no synchronous fallback.
- **Privacy-safe telemetry.** CSV scope #63 and identity-free brief export aggregate rows only; schema v73 adds `responsePlans` with a fail-closed normalizer and demo-cleanup scrubbing.

**Top next targets:**
1. **Response outcome grading:** compare the frozen rehearsal against what actually happened after commit, and feed the error back into the leader's assumption ledger without rewriting history.
2. **Cross-module replay contracts for every terminal:** generalize the Response Studio's disposable-store pattern so finance, staffing and stakeholder actions can be rehearsed with the same adoption gate.
3. **Real-browser / AT verification and load budgets:** add a CI browser lane (worker + file:// standalone) and keep the standalone density/size guards honest as modules grow.

---

## 2026-11-01 — Session 102: Confidence transport — your probability words as an instrument, certified out of sample and graded prospectively (Schema v72, [ADR-0064](docs/adr/0064-confidence-transport.md), RULE-CTR-01..04, CFI-01..05, CSV #62)

**Implemented (this session):**
- **Harvest across seven ledgers.** Settled declarations from assumption outcomes, decision reviews, scored impact studies, recovery-plan reviews, graded deferral timing calls, graded monitoring reviews and survival predictions, each oriented so 1 means the declared event happened. Ambiguous outcomes (`mixed`, `partial`, `inconclusive`) are excluded **and counted**; undated and unoriented records are counted too. Sources are declared once in `confidenceRegistry.js`; adding a module that stores a probability means one registry row and one reader, never a special case.
- **Three instruments, raced prequentially (Dawid 1984).** `identity` (the declarations as written), Platt scaling with a Gaussian prior toward identity, and binned isotonic regression by pool-adjacent-violators with a Beta(1,1) pseudo-count per occupied bin. Every test settlement is predicted by a map fitted only on settlements that arrived before it; the last 240 settlements test, after a 12-settlement warm-up.
- **A verdict that can refuse three ways.** `insufficient` below 24 settled forecasts or 16 out-of-sample points (counts printed, no map); `no-gain` when no map clears the material Brier margin with a paired-bootstrap interval above zero; `harmful` when every fitted map is materially worse than the numbers as written; `supported` only when both conditions hold. Simplest-first: the sigmoid wins ties.
- **Murphy decomposition and Wilson intervals** on the same ten-bin partition, printed with every observed rate; the reliability diagram draws declared (hollow) against observed (filled) with the gap that *is* the calibration error, and red above ten points.
- **Never a rewrite.** Every open declaration is printed exactly as written, with the certified reading beside it and the gap in points. Six live readings per module, ranked by disagreement; 15 points flags one.
- **Frozen certificates, graded once.** The map's parameters, the prequential scores at issue, the pace and an expected-resolution count are stored as facts; grading uses only settlements that resolved strictly inside the window, and a window that closed empty *lapses* rather than being credited. Skill is derived on read from the two frozen Brier scores, never stored.
- **Four rules on the shared spine** (RULE-CTR-01..04): certify when supported and nothing is open (typed `recalibrates-belief` edges to the three promises read furthest from), one owned re-read task per source module per ISO week (cap 5 declarations each), grade/lapse/challenge — a transported loss opens one blameless process task and at most one governed decision per week — and edge reconciliation on an explicit scan. Marker-idempotent, inside the caller's transaction, paused by `confidenceAutoPropagate`, and the explicit scan always runs.
- **Schema v72** (additive `71 → 72`): `confidenceCertificates` (cap 40) and `confidenceMarkers` (cap 400), 14 declared conventions with bands, and fail-closed normalisers that drop a certificate claiming a map without its parameters, return a grade without an outcome to frozen, repair a non-monotone stored block list, and refuse a probability outside 1–99%.
- **Six-panel terminal** `#/confidence` (instrument · race · readings · horizon · certificates · method), nav badge, 14 route aliases, a `Confidence` insights bucket (CFI-01..05), CSV scope #62 (aggregate rows only: bands, sources, maps, certificates — no declaration title, id, name or free text, blanks instead of zeros below every floor) and an identity-free brief.

**Cross-module links added/updated:** new `certificate` node type → `confidenceCertificates`, relation `recalibrates-belief` (system-generated; assertable by the engine, never by hand), resolver route `#/confidence?panel=certificates&certificate=`, typed edges to premises, decisions, delegations and the governed decision a lost certificate opens; a published propagation contract for the rule; the `Confidence` insights bucket; CSV scope #62; and the demo's decision journal, which makes calibration, forecast integrity and confidence transport tell one coherent story about one record.

**Ambition benchmark (this session).** The category ships AI that *drafts* (review text, coaching prompts, talking points) and analytics that *rank*. Neither publishes whether the manager's own probability language predicts anything, nor what one of their open decisions means under their measured calibration. The narrow, testable claim here is not "calibration is new" — Brier is from 1950 — it is that **the calibration is measured on the leader's own seven ledgers, raced out of sample against not translating at all, frozen, and then graded prospectively** — and that the declaration survives all three. [UNVERIFIED — search limit: absence of a published vendor capability, not evidence of absence.]

**Deliberately not built:** rewriting declared probabilities (it would make the metric a target and destroy the record); per-person calibration; choosing the map by AIC/BIC; reporting the in-sample fit as a forecast; treating a half-outcome as a coin; applying a horizon-band map that has not cleared its own floors; scoring skill from a single graded window.

**Still [UNVERIFIED]:** whether real leaders' records bend monotonically or per horizon band; whether the demo's synthetic overconfidence resembles a live first-year record; the 24/16/50-Brier-point conventions as useful thresholds; real-browser and assistive-technology walkthroughs of the six panels (JSDOM + axe only); full competitor coverage.

**Next (ambitious, ordered):**
1. Calibrate the map **per horizon band** the moment a band clears its own floors, and grade the band maps separately — the three-band split is computed today but the pooled map carries every band that cannot yet be identified.
2. **Intercept-only versus covariate transport**: does the calibrated reading differ by decision reversibility, by source module, or by who the promise was written for (a declared covariate, never a person score)? Fit both and grade both prospectively.
3. **Two-instrument extremizing** (Satopää et al. 2014; Mellers et al. 2015): once five certificates are graded, test whether pooling the leader's declared number with the certificate's transported reading — on the log-odds scale — beats either alone out of sample.
4. **Calibration debt ledger**: for every open declaration that was flagged and left unchanged, record the resolution and publish the cost of the decision to keep the number.

## 2026-11-01 — Session 101: Covariate model preview on the authority ladder (Schema v71 unchanged; [ADR-0063](docs/adr/0063-authority-covariate-model-preview.md))

**Shipped:** a deterministic, lazy Beta-binomial logistic regression on the delegation authority ladder. The new `#/credibility?panel=covariate` panel shows posterior slope and interval, probability of a positive association, per-class predictions, sample counts, model prior and caveats. Runs only when opened, only when borrowing is permitted, and requires the established three-class/eight-outcome/non-degenerate pool floor, then refuses fewer than three observed levels or no covariate variation. Existing authority-class estimates and all RULE-CRE automation remain unchanged. The supporting suite proves directional behavior on a synthetic monotone fixture, determinism, interval ordering, refusals, real ledger adapter integration, accessible panel rendering and that the model is explicitly not causal or operational.

**Gap selected:** conventional AI management products increasingly draft coaching/reviews or surface analytics, while workforce planning entrants add org-design scenario analysis. LeadOS had a sophisticated cross-ledger borrowing model but no way to ask whether its declared authority boundary itself explained variation. This begins that test without silently changing an existing decision. **[UNVERIFIED]** no claim of category-first or competitor absence.

**Deliberately rejected:** using authority as a causal instrument; per-person regressions; fitting the model on every screen/automation transaction; auto-switching the base model or generating personnel recommendations; interpreting the ordinal axis as a literal equal interval. Reasons: assignment is observational, only four ordered classes exist, and a research candidate must be prospectively graded before it governs action.

**Next (ambitious, ordered):**
1. Persist immutable, intake-time covariates on evidence units and score covariate-vs-intercept-only forecasts prospectively in the existing frozen Brier ledger.
2. Generalize the covariate adapter to premise horizon and operation/case-severity classes only after intake covariates are immutable and missingness is reported.
3. Borrowing-as-a-service adapters for intervention effect, hiring-stage and performance-plan evidence; retain group-specific exchangeability and no person-level units.
4. Governed out-of-sample exchangeability partition proposals; no automatic partitioning.

## 2026-10-31 — Session 100: The Borrowed Evidence Engine — partial pooling for every small sample, graded on whether pooling helped (Schema v71, ADR-0062, RULE-CRE-01..03, CRE-01..05, CSV #61)

**Implemented (this session):**
- Generalized Beta-binomial hierarchy over three evidence groups (signal families · assumption criticality classes · delegation authority classes), full Bayes on a deterministic two-pass grid under the BDA3 hyperprior; credibility weights, 90% intervals (moment-matched, pinned to exact mixture quantiles), exact `P(p < floor)`, regimes from mean posterior Z, χ²/I² heterogeneity, SD-relative leave-one-out influence, graduation dates, exact what-if and break-even counts. Closes Session 99's **Top-1** ("structural prior borrowing across families").
- RULE-CRE-01: re-tune tasks for thin families below the Board's floor on borrowed evidence; outside-view decisions at premise registration; checkpoint tasks for late-running authority classes; auto-frozen frames for every unit acted on. RULE-CRE-02: exchangeability governance with a 90-day ruling. RULE-CRE-03: two-forecaster Brier grading, lapses, process tasks, skill decisions, edge reconciliation.
- Six-panel terminal (`#/credibility`) with an accessible Efron–Morris shrinkage plot; borrowed column on the Signal Integrity Board's inventory; CSV scope #61; demo frames frozen from a 30-day-truncated state and graded from what followed.

**Planned (newly discovered this session, most ambitious first):**
1. **Covariate-informed pooling (Beta-binomial regression)** — let the prior mean depend on a declared covariate (e.g. a premise's horizon, a delegation's size) instead of one pool per group; the grid extends to a third dimension only for the slope. Turns "your load-bearing assumptions hold 36%" into "long-horizon load-bearing assumptions hold 22%".
2. **Borrowing as a cross-module service** — expose `fitHierarchy` as the engine behind every other "too few to judge" refusal (performance-plan outcomes by support type, hiring-loop pass rates by stage, impact-study effects by intervention family) through one registry entry and one adapter each, exactly as the three groups plug in today.
3. **Exchangeability learned from the graded ledger** — once groups have ≥ 6 graded frames, compare partial pooling with no pooling and with a two-cluster split by out-of-sample Brier, and propose (never apply) the better partition as a governed decision.
4. **Repeated-look error budget** (carried from Sessions 95/96/99) and **immutable intake-time covariates** (carried from Session 96).

**Deliberately rejected (one line each):**
- Pooling across groups or a universal prior — different quantities; a pool of unlike things is an average.
- Per-person units — a delegate's on-time rate or an owner's premise hold rate is a performance rating by another name.
- MCMC — non-deterministic and unnecessary for two hyperparameters on a grid.
- Auto-adjusting priors, floors or due dates — the engine opens a decision; the leader decides.
- A composite "evidence quality" score — hides which term is failing.

## 2026-10-31 — Session 97: The Deferral Option — price the flexibility to wait, not only the cost (Schema v68, ADR-0059)

**Blunt gap selected.** Four surfaces price *what waiting costs*: Decision Tempo's carrying rate, the Cost of Waiting queue and its weekly exposure certificates, the Consequence Lab's integrated conditional carrying cost, and Information Value's EVSI. None prices *what the right to wait is worth*, so the product can only ever nag. A leader with an irreversible call, real uncertainty and a modest carry price had no way to learn that holding the call open is an asset with a price, or the stake at which committing becomes the better policy. This session ships a terminal that answers both and refuses when the record cannot support the answer.

- **[IMPLEMENTED]** `#/deferral` — one American call per open priced decision, solved by Cox–Ross–Rubinstein backward induction (200 steps, American exercise at every node), validated against the Black–Scholes–Merton European price (10.4506 at the pinned reference) and its convergence in steps. Root exercise is the recommendation; the exercise boundary, its hysteresis over `K`, the real-world commit probability, the expected wait and the expected carry to that point are printed. BSM is a validation anchor only, never the price.
- **[IMPLEMENTED]** Inputs come from the record, in that currency and that currency only: `V` = the decision's typed value at stake (Decision Tempo's terms); `K` = the sum of budget lines pointed at the decision (reversible calls pinned to `K = 0` and told to decide now, irreversible calls with no committed line falling back to the full stake with the convention printed); carry = the workspace's own 12-week erosion price, entered as a **cash outflow, never as drift**; σ = 1.4826 × MAD of log(realised ÷ assessed) over settled case exposure and delivered effort ratios, root-time annualised from the printed median horizon. Below the observation floor the frame refuses; below the σ floor it withholds; a **declared** σ is accepted only when labelled `declared` and frozen with that provenance.
- **[IMPLEMENTED]** Break-evens solved by bisection on the same tree: the carry price at which the premium hits zero and the σ below which it never appears. Verdicts are decisions — `commit-now`, `wait`, `indifferent` (under a materiality floor, never advice to postpone), `act-or-drop`, `withheld` — and the premium is never added to EVSI or to the Cost of Waiting's integrated carrying cost, because they measure different things.
- **[IMPLEMENTED]** Frozen frames are prospective timing forecasts (`P(commit by deadline)`), identity-free (no title, question, rationale, person or note), graded exactly once after the window against the decision's **recorded** `decidedOn`; an undated choice is ungradable, a graded frame cannot be deleted, and Brier skill waits for five grades. `optionframe` typed node, `defers-decision` relation and a resolver to `#/deferral?panel=frozen&frame=<id>`.
- **[IMPLEMENTED]** `RULE-DRO-01..03` on the shared spine, marker-idempotent and inside the caller's transaction: link + exactly one owned boundary watch for `wait`/`indifferent` (none for the two verdicts that already say "decide"); scan reconciliation with ≤3 grading tasks and exactly one governed decision per ISO week for windows that expired with the call still open; one blameless process task on a Brier ≥ 0.25. `deferralAutoPropagate = false` pauses freeze-driven writes, never an explicit scan. DRO-01..04 in a new Insights bucket, a nav badge, eight route aliases, and CSV scope **#58** (aggregate only, means and money blank below five frames, no titles or ids).
- **[PLANNED — NEXT]** Portfolio deferral: calls whose values are correlated cannot be priced one at a time, and the graph already knows which decisions share premises. Requires a declared correlation, not a derived one.
- **[PLANNED]** A repeated-look error budget with durable statistical review snapshots (still owed from Sessions 95–96) now also disciplines the weekly deferral scan; immutable intake-time covariates and case-severity mix remain open from Session 96.
- **[PLANNED]** Beyond GBM: a jump term or a declared regime, only if a leader's own record can identify it. Until then it would be decoration, and the module would rather refuse.
- **[REJECTED]** Risk-neutral pricing (no replicating portfolio exists for a leadership decision — it would dress a decision-analysis number in market language); adding the premium to EVSI or to the integrated carrying cost (different quantities; summing them double-counts the delay price the lattice already charges as carry); Black–Scholes as the model (early exercise is the point); a single 0–100 "wait score" (hides the premium and the boundary, and invites ranking incommensurable stakes); defaulting σ, `K` or carry (each would make the screen work on every workspace and print a number nobody supplied); back-filling frames on migration (a frame written after the deadline is not a prediction).

Benchmark: real-options analysis is mature in capital budgeting and carried by specialised tools (Mun's Real Options SLS lattices; DPL and TreeAge Pro inside decision trees), and public cost-of-delay calculators stay one-sided by construction. The differentiation claimed here is narrow and local — a deferral option on an ordinary managerial call, priced from the leader's own recorded stake, commitment cost, carry and settled-magnitude volatility, with refusals where those numbers do not exist, and a frozen timing forecast graded against the recorded decision date. No category-first or market-first claim. See RESEARCH.md §97 and [ADR-0059](docs/adr/0059-deferral-option-terminal.md).

## 2026-10-31 — Session 96: Reference-class case mix and evidence integrity

- **[IMPLEMENTED]** Operational-case type composition on the day-30 mature cohorts; total variation and observed missing prior support, 8-per-cohort floor, no invented category for unknown harvested labels. A 25pp threshold is a convention, not a p-value. Current mutable labels and normalization defaults limit historical inference.
- **[IMPLEMENTED]** Case-mix alerts flow to SURV-12, the survival brief, low confidence on case waiting-cost rows, and the existing scan spine: one review decision per week, typed links to open cases, an owned investigation when possible, and challenge/re-freeze work for frozen artifacts without altering probabilities.
- **[IMPLEMENTED]** Future exits are censored until observed; an unassessed axis no longer yields an overall supported headline; refused cause tests and landmark cells no longer masquerade as a stable mix/flat profile.
- **[PLANNED — NEXT]** Preserve immutable intake-time covariates and genuinely missing dates through schema migration; then compare case severity/type and other classes with missingness reports. Existing normalizer can impute closed dates and old case types, so don't pretend that today’s labels recover history.
- **[PLANNED]** Simultaneous/repeated-look error control and durable review snapshots; case-mix uncertainty intervals or a pre-registered test with validated operating characteristics; broader insight into whether subsequent review changed a decision.
- **[REJECTED]** Automatic reweighting or recalibration on sparse categories: would imply comparability and alter frozen evidence without adequate support. Individual employee attrition scores rejected for privacy and fairness.

Benchmark: Visier describes live cross-HR/finance scenario planning, while Valence describes AI coaching and judgment practice. LeadOS targets an auditable, local-first guard linking observable reference-class mismatch to downstream financial readings and review work, not parity with either vendor. See RESEARCH.md §96. Competitor absence and market-first claims **[UNVERIFIED]**.

## 2026-10-31 — Session 95: Transport, decomposed — two axes, three landmarks, challenged freezes (ADR-0058, RULE-SURV-08, SURV-11, no schema change)

**Blunt gap selected.** Session 94 attributed drift at one landmark; downstream, the confidence machinery still pooled exits. `waitCost.rowConfidence` dropped a row to low on *any* `drift.changed` — punishing any-exit exposure arithmetic for a completion-mix shift that leaves it valid — while a pure mix shift (drift false) downgraded nothing anywhere, and frozen forecasts (survival readings, wait-exposure certificates, consequence readings) never learned that the curve they rode on had been challenged. This session implements Session 94's [PLANNED — NEXT] (decomposition-aware confidence) and [PLANNED — NEW] (fixed landmark grid) in full, as one two-axis transport read model consumed by four modules.

- **[IMPLEMENTED]** `driftCohortsAt(items, key, today, τ)` generalizes the fixed cohorts (recent started [τ, τ+60) days ago, prior [τ+60, τ+120), follow-up capped at τ; τ=30 byte-identical to Session 94, deep-equality pinned). One shared `decomposeLandmark` now serves the day-30 verdict and the flanks, so the landmarks cannot implement differently.
- **[IMPLEMENTED]** Landmark profile at 14/60 (`driftLandmarkProfile`) under its own fixed 24-test Holm family (6 classes × 2 causes × 2 landmarks); three families per scan (6/12/24), each controlled within itself, joint and repeated-look control explicitly not claimed. Shape vocabulary across 14/30/60: flat, early-only, mid-only, late-only, multi-landmark, sustained, crossing (same cause, opposite significant directions), not-assessed. The profile opens no work; RULE-SURV-07 stays day-30-driven.
- **[IMPLEMENTED]** `classTransport(klass)`: timing axis (any-exit log-rank) × completion axis (day-30 verdict) × shape → headline (both-undermined / completion-only / timing-only / transport-supported / not-assessed). Favorable verdicts are `favorable-shift` (pooled curve conservative), never failures; untested classes are `not-assessed`, never "stable". Named in code/UI as a descriptive stability audit of the reference class — not Bareinboim–Pearl transportability — and it adjusts no number.
- **[IMPLEMENTED]** Axis-aware consumption: `waitCost.rowConfidence` caps at low only on timing failure; completion-only failure keeps the evidence-based level and names the unquotable framing (completion median, overdue list) versus what stands (exposure, still-open timing); favorable shift reads conservative. Consequence Lab delay futures carry transport banners (timing-undermined = descriptive until reviewed; completion-only = futures stand) and frozen consequence readings stamp both axes into `graphSnapshot` (additive whitelist, no schema bump). SURV-11 fires only completion-only. Brief gains a TRANSPORT line per non-supported assessed class. CSV #53 +11 columns (axis codes, shape, day-14/60 deltas + Holm p; blank where refused, no titles). New transport card on the classes panel with a labelled 14/30/60 table.
- **[IMPLEMENTED]** `RULE-SURV-08` on `survival.scan`: frozen survival readings with predictions in a class whose completion *or* timing axis is undermined receive an appended transport-challenge note (frozen probabilities untouched); wait-exposure certificates are challenged *only* on timing failure — newest per class gets one owned re-freeze task, typed-linked `tracks-followup`. Caps 5 notes / 3 tasks per scan; markers per rule × artefact × class × axis × ISO week; marker history sliced to 400. The shipped automation is deliberately axis-discriminating: completion-only failure leaves every certificate standing, pinned by test.
- **[PLANNED — NEXT]** Case-mix overlap/positivity check before either axis may print "supported": a cohort whose composition changed (severity/kind mix) can fail transport for reasons neither the log-rank nor the decomposition attributes.
- **[PLANNED — NEW]** Repeated-look error budget with durable statistical review snapshots; Holm control remains per-scan only, now across three families.
- **[PLANNED — NEW]** Gray's (1988) test with a verified influence-function variance — would also give the `crossing` shape a curve-wide test instead of a landmark-by-landmark description. Still refused until verifiable against a published worked example.
- **[REJECTED]** One unified 36-test Holm family (retroactively changes Session-94 verdict p-values or double-prints the day-30 cell); recalibrating the pooled curve on the recent cohort (destroys the frozen-forecast audit trail; labelling beats adjusting); a single transport score (re-pools the axes); challenging exposure certificates on completion failure (their arithmetic is any-exit and remains valid — that was the pooled thinking being removed); ML-monitoring-style "retrain" semantics for a leader's reference class.

### Competitive gap status
Delivery analytics still average over completed work (percentiles of completed items cannot see a substitution; CircleCI Q3 2026 WIP-inflation figures are vendor material [UNVERIFIED]); ML-monitoring vendors own the drift vocabulary (detect → diagnose → retrain) but "retrain" is exactly what a frozen-forecast audit trail must refuse. Multi-landmark stability reading (landmarking, van Houwelingen 2007) is standard in biostatistics and absent from the searched delivery surface. Search-limited; **no category-first claim**. The shipped distinction remains narrow and testable: a fixed-cohort, three-landmark, two-axis stability audit of a delivery reference class that changes what four downstream modules may quote and challenges frozen evidence — without adjusting a single number. See [RESEARCH.md §95](RESEARCH.md) and [ADR-0058](docs/adr/0058-transport-decomposed.md).

## 2026-10-31 — Session 94: Drift decomposition — did work stop finishing, or start being dropped? (ADR-0057, RULE-SURV-07, SURV-09/10, no schema change)

**Blunt gap selected.** The transport guardrail just shipped tests time to *any* exit — it can say behaviour changed but not *which exit* changed, and the two readings demand opposite interventions (completion capacity vs intake discipline). Worse, the failure mode no tool in the hunt can see: completions replaced one-for-one by abandonments at unchanged speed leaves cycle time, the any-exit curve and the drift test all green while the system quietly stops finishing things. This session implements the previous entry's [PLANNED — NEXT] in full, and fixes a variance defect in Session 89 that the new work exposed.

- **[IMPLEMENTED]** `kaplanMeier` emits both Aalen–Johansen incidences (`cif` completion, `cifA` abandonment), so `S + F_c + F_a = 1` at every step. The incidence **variance was defective since Session 89** (Y² for Y(Y−d), total count for cause count, missing −2 cross term, final-F referenced at every step): 0.0048 vs a provable 0.012 lumped, 0.0344 spread. Replaced by the three-term delta-method form (Braun & Yuan: Aalen's counting-process form overestimates at small n), exact at the multinomial anchor F(1−F)/n lumped *and* spread, pinned by test. Session 89's bands/brackets inherit the correction; frozen readings store probabilities, not bands, so none is rewritten.
- **[IMPLEMENTED]** `driftDecomposition` over the same fixed cohorts: exact day-30 partition (Δstill-open = −ΔF_c − ΔF_a, residual computed), per-cause landmark Wald tests (delta-method variances), Pepe–Mori integrated difference as p-free effect size, Holm over the fixed 12-test family (6 classes × 2 causes — a second family beside drift's six, labelled; joint scan-wise control not claimed), sparse-cause refusal below five pooled events, cohort refusal below eight. Nine verdicts: substitution, completion-decline, abandonment-rise, stall, churn, completion-gain, abandonment-decline, broad-improvement, no-attributable-shift.
- **[IMPLEMENTED]** Wald boundary discipline: F∈{0,1} in both cohorts → identical shares are p=1; differing shares use Fisher's exact test on day-30 counts **only when both cohorts verify fully-observed** (a mid-window parked record forbids it); otherwise refused. Fisher pinned to the tea-tasting (0.0285714) and R textbook (0.002759) values.
- **[IMPLEMENTED]** `RULE-SURV-07`: one drift decision per class per week, framed by component — intake review with ≤10 recent abandonments linked as exhibits when abandonment leads; completion review when finishing leads; attaches to the SURV-06 decision when that fired first (found by frozen rationale tag), stands SURV-06 down when it fires first; owned investigation task; ≤20 open-item `informs` links. Significant improvement → one positive-deviance capture task. SURV-09/10 signals (10 = substitution with silent any-exit drift); brief attribution line; CSV #53 +12 columns (blank below floors, no titles); classes-panel decomposition table; method panel names the landmark/Fisher logic and the Gray non-claim. No schema change (read model + existing markers, the drift precedent).
- **[IMPLEMENTED — Session 95]** Decomposition-aware forecast confidence, generalized into the two-axis transport read model. See the Session 95 entry above and ADR-0058.
- **[PLANNED — NEW]** Gray's (1988) test with a verified influence-function variance, validated end-to-end against a published worked example before it prints a p-value.
- **[IMPLEMENTED — Session 95]** Fixed landmark grid (14/30/60 days) — shipped as the day-30 family plus a flanking 24-test profile family rather than one unified family, for the reasons in ADR-0058.
- **[REJECTED]** Gating the decomposition on the any-exit drift (misses substitution — the point); Fine–Gray regression (proportionality without a question); storing decomposition readings in a new schema version (invites back-filling a diagnostic); seeding 40 backdated demo records so the card lights up (shared-fixture churn for a screenshot; the refusal prints its counts).

### Competitive gap status
Delivery analytics (LinearB 2026 benchmarks, Keypup/Jellyfish-class tooling) report cycle-time averages/percentiles over completed work; the strongest public flow study found (Apache Cassandra Jira) must hand-exclude batch closes before Little's Law reconciles. Competing-risk incidence comparison is standard in biostatistics (Gray 1988; Pepe & Mori 1993; landmark tests) and absent from the searched delivery/people-analytics surface. Search-limited; **no category-first claim**. The shipped distinction is narrow and testable: a fixed-cohort, equal-follow-up decomposition of delivery drift into finishing vs giving up, exact at the landmark, with a variance estimator pinned to its multinomial limit, refusals where events are sparse, and a component-framed governed response on the shared spine.

## 2026-10-31 — Calendar-cohort forecast transport guardrail

- **[IMPLEMENTED]** Six-class fixed-cohort drift check: mature start windows, equal 30-day follow-up, evidence floors, Mantel–Cox log-rank, Holm family correction, restricted mean exit-time difference and visible assumptions/refusals.
- **[IMPLEMENTED]** SURV-08 insight; financial confidence downgrade without silent arithmetic edits; RULE-SURV-06 scan fan-out into one DACI review/class/week, recorded-leader evidence task and typed `informs` links to affected open work. Existing atomic storage, schema normalizers and audit spine retained.
- **[IMPLEMENTED — Session 94]** Completion-incidence versus abandonment drift decomposition, with competing-risk uncertainty and sparse-event refusal. See the Session 94 entry above and ADR-0057.
- **[PLANNED — NEW]** Case-mix overlap/positivity checks before stratified transport claims.
- **[PLANNED — NEW]** Repeated-look error budget and durable statistical review snapshots; current Holm control is per scan only.
- **[REJECTED]** Easy alternative: another static risk tile. A transport failure must change downstream confidence and open accountable review work.
- **[REJECTED]** Auto-recalibrating forecasts from a drift p-value: association is not an estimated probability correction.

## 2026-10-31 — Session 93: Consequence Lab — see the recorded ripple, price the *whole* wait, grade the future (Schema v67, ADR-0056, RULE-CSQ-01..05, CSQ-01..04, CSV #57)

**Blunt gap selected.** Existing typed case/decision/premise/resilience links worked; Decision Tempo and Cost of Waiting priced direct delays; the Survival curve censored open work correctly; Evidence Terminal pooled scored interventions. But `#/wait`'s `price × weeks × P(still open at horizon)` was presented as *expected cost* even though it is the **endpoint lower bound** on expected carrying cost. The leader could not trace one open decision across the graph and examine the consequences of waiting *before* choosing an option. Building another chart would have been safe and insufficient. The chosen module joins cross-domain graph evidence, financial timing, statistical survival, organisational premises and prospective learning, while refusing a causal “domino” claim the data cannot support.

- **[IMPLEMENTED]** `consequence.js`: bounded, deterministic two-hop graph walk over typed operational edges (`≤64` nodes / `≤2000` inspected links, sorted paths, directions, first/second-order bridge counts, reachable broken-edge count). People, candidates, conflicts, pulses and system-generated measurement edges never relay. Premise Sentinel watch/breach status, Resilience TTS/TTR shortfalls, other open decisions and separately-priced related queue items are joined **on read** — no second form or text inference. Lazy graph resolution avoids resolving every link in a large workspace. The demo lands on the highest-priority *supported* priced call while the full queue remains in Cost-of-Waiting rank order.
- **[IMPLEMENTED]** `integrateConditionalSurvival`: **conditional restricted mean outstanding time** (RMST) = `∫₀ʰ S(age+t)/S(age)dt` on the existing Kaplan–Meier step function, multiplied by the root decision's real weekly price (typed value/12-week Reinertsen linear erosion, or declared class price). Compares the **endpoint lower bound ≤ exact expected carrying cost ≤ full-period ceiling** at +1/+2/+4 weeks. The lower bound in `#/wait` is left as existing certificate semantics but named honestly beside the new number; no stored certificate is rewritten. Refuses a probability below ≥3 dated exits and the class at-risk floor, or beyond the last observed time; unknown/missing price is `null`, never zero. Currencies remain separate. Related items' full-block prices are explicitly **conditional ceilings** (only if they all wait), never added to the root or presented as causal losses.
- **[IMPLEMENTED]** Schema v67 adds `consequenceReadings` and `consequenceMarkers`, five clamped settings and additive `66→67` migration with **zero invented forecasts**; fail-closed normalizer keeps only prospective dated, bounded records, drops invalid probabilities, clears invalid prices (not to zero), repairs unsupported grades, caps retained readings at 60 (freeze refuses when full). A prospective freeze stores one bounded aggregate, not titles, prose, people or stakeholder stances; a later real `decidedOn` timestamp grades *still open at review date* once with Brier, base-rate skill withheld below five graded readings. Missing source/date, early review, re-grade and deleting graded history all refuse. `clearDemo` drops ungraded orphaned demo readings, keeps already-graded history but excludes removed sources from calibration.
- **[IMPLEMENTED]** `RULE-CSQ-01..05` on the existing transaction spine **before Decision Tempo**: freeze → `maps-consequence` source edge + ≤12 `surfaces-impact` first-hop edges, one real leader-owned verification task for watch/breached premises, **one** DACI coordination decision per root/ISO week when a priced call touches another open decision; explicit scan → stale-edge reconciliation + one owned due grading task; a graded surprise → one blameless learning task when auto propagation is on. New relations are SYSTEM_GENERATED so value derivation cannot mistake structural provenance for new money. Full pause/explicit-scan and marker-idempotency semantics; no option chosen, status changed or message sent. A premise breach can itself propagate on the same shared spine — this is a real multi-rule cascade.
- **[IMPLEMENTED]** `#/consequences` five-panel premium terminal (Executive read / Ripple map / Delay futures / Frozen & graded / Method), with a direct entry point on every open Decision card; identity-free board brief with download/copy fallback; Insights bucket, nav badge, aliases, typed node resolver, CSV scope #57 aggregate-only by horizon × currency. Every mean and money aggregate is blank below five readings in that bucket, never zero. Real-browser contrast/AT remains **[UNVERIFIED]**; five panels pass axe structural checks with contrast disabled in JSDOM.
- **[VERIFIED LOCALLY]** 30 new Consequence Lab tests (including a failed-storage write that must surface as unsaved, not a false success): exact hand RMST (8 items → 1.75 expected weeks vs 1.0 endpoint lower bound at a 2-week horizon), algebraic bounds, floors/tail/currency/refusals, bounded directional graph and privacy exclusions, two linked decisions + priced budget + breached premise cascading in one transaction, pause and idempotent scan, real freeze→`decideDecision`→grade→persist/reload, demo cleanup, CSV privacy, five axe-clean panels. Two additional wait-regression tests pin the corrected legacy interpretation. Final canonical suite: **1,710/1,710** green (including 30/30 Consequence Lab tests and both legacy-lower-bound assertions); standalone portability **7/7**, v67; ESLint, boundary and internal documentation links clean. Details in the session log.

### Fresh competitive finding → shipped code

AnyLogic and Indicio advertise multi-event what-if analysis; Causal Wizard can estimate effects when the identification conditions exist; Societies.ai demonstrated agent-simulated second-order reactions in an October 2026 vendor blog. None of those sources validates a causal effect from LeadOS's graph; product comparisons are search-limited, **[UNVERIFIED] by hands-on trial**, and no category-first claim is made. The novel *implementation inside this workspace* is to turn an existing priced decision's endpoint lower bound into an exact integrated conditional wait, place a separately-labelled conditional ceiling beside the actual two-hop topology, then freeze/grade the one claim the data can test. See [RESEARCH.md §93](RESEARCH.md) and [ADR-0056](docs/adr/0056-decision-consequence-lab.md).

### Next ambitious bets (ranked)

1. **Decision-dependent transport and interference:** prospectively annotate which linked items truly wait on a root and validate with real settlements; measure how correlated decisions in the same cohort break independence, then add a defensible interval around conditional RMST cost. Never infer blockers from adjacency alone.
2. **Overlap-corrected Evidence Terminal:** quantify the effective independent information lost when ITS study windows reuse observations, with covariance estimated from dated metric series rather than a guessed global ρ; refuse when pairwise overlap lacks a supportable covariance.
3. **Cross-manager shared queue coupling:** shared arrival streams, workload fairness and priced coordination capacity across managers; expose when a local optimum increases another unit's wait, and make cross-team governance a DACI decision rather than an automatic reassignment.

**[REJECTED]** Synthetic stakeholder agents predicting named people (no validated behavioural model or consent); “graph path = causal effect” (the data do not identify it); summing related prices into one predicted domino loss (overlap and FX); freezing a probability past observed follow-up; retrofitting old certificates with a newly computed expected value (would silently rewrite a historical convention); a weighted risk score with incompatible units; automatic decision choice or message sending.

## 2026-10-31 — Session 92: Evidence Terminal — pooling what has actually worked here, and pricing one more study (Schema v66, ADR-0055, RULE-EBM-01..05, EBM-01..08, CSV #56)

- **[IMPLEMENTED]** `evidence.js`: the engine, pure read. Two families pooled with the same core. **Effect family** — every scored, locked impact study contributes the ITS level shift as a percentage of the pre-period mean (dimensionless, so different metrics can be pooled) with its SE converted the same way, **sign-oriented so positive always means better** while the un-oriented shift is kept beside it. **Resolution family** — every declared probability that has since resolved (a study's `expectedConfidence`, a premise prior, a frozen support-plan probability) pooled on the log-odds scale with the Haldane–Anscombe 0.5 correction, Wilson intervals, Brier against the base-rate reference, skill, and calibration-in-the-large. Pooling core: **DerSimonian–Laird** random effects with τ² = max(0, (Q−df)/C), Cochran's Q, I², and **both** intervals computed with the **wider** of the z and **Hartung–Knapp** interval reported — a small-study correction may only widen what is claimed. `overlappingPairs` counts studies on the same metric whose windows share observations and prints the count beside the pooled SE instead of assuming independence. `leaveOneOut` flags any study whose deletion moves the answer by more than the median within-study SE (deliberately *not* the pooled SE, which τ² inflates — that test is circular and clears every outlier). Egger refuses below 10 studies. EVPI/EVSI in closed form with both limits asserted by test. `evidenceReport`, `evidenceSignals` (EBM-01..08), `evidenceAttentionCount`, `evidenceBrief`.
- **[IMPLEMENTED]** `evidenceSchema.js`: fail-closed `normalizeEvidenceReviews` (drops a cell with no pooled estimate rather than keeping a null that would read as "no effect"; repairs a grade claimed without its pairs back to frozen) and `normalizeEvidenceMarkers` (cap 400). A frozen review stores **aggregates only** — no title, hypothesis, note or identifier — so it cannot become a second unredacted copy behind the export boundary.
- **[IMPLEMENTED]** `evidenceRules.js`: RULE-EBM-01..05 on the shared spine **before `decisionTempoRule`**, marker-idempotent, one transaction. EBM-01 opens **one** DACI decision per cell **ever** when a pooled interval stays on the harmful side of zero (`grounds-practice` edge to the review that grounded it); EBM-02 opens one replication task on `impact.scored` when a supported result stands **alone** — counted on independent roots, not rows, so three studies of which two are replications is still one finding; EBM-03 opens one pre-registration task per (outcome × intervention × ISO week) where information value exceeds expected effect; EBM-04 attaches the newest frozen review to open cases as `recommends-for` edges plus one owned delegation (a scan only — an edge needs a durable source, and a page view is not one); EBM-05 reconciles stale edges and opens grading work. `evidenceAutoPropagate=false` pauses automation; an explicit scan always runs.
- **[IMPLEMENTED]** Schema v66 (`evidenceReviews`, `evidenceMarkers`, 13 clamped `evidence*` settings, additive `65 → 66` migration, empty on upgrade); seven commands in `actions.js` (`scanEvidence`, `freezeEvidenceReview`, `gradeEvidenceReview`, `deleteEvidenceReview`, `evidenceBriefText`, `evidenceRead`, `evidenceSignals`) with every refusal (nothing poolable, review date in the past, re-grading, deleting a graded review); the `#/evidence` six-panel terminal (Overview, What works, What next, My judgement, Reviews, Method) with an inline SVG forest plot; typed `evidence` node + `recommends-for` / `grounds-practice` relations + resolver `#/evidence?panel=reviews&review=<id>`; nav badge and eight aliases; `Evidence` insights bucket; CSV scope #56; demo seeds seven extra studies scored by the **real** estimator and one review frozen by the **real** builder so the terminal never opens on a dead end.
- **[FIXED]** Real defects found by writing and running the suite, not waived: (1) `randomEffectsPool` was fed units carrying `effect` where the pooling core reads `estimate`, so **every** cell silently refused to pool — the whole terminal was inert on first run; (2) `actions.js` declared `gradeEvidenceReview` locally, shadowing the imported engine function, so the action **recursed into itself** and grading could never succeed; (3) `unreplicated` required `replications === 0`, which excluded precisely the case it exists to surface — a cell with one root and two replications; (4) metric direction was harvested but never applied, so a fall in a "down is good" metric (latency, meeting load) was reported as a backfire; (5) `#/impact` rendered one identically-named `<section>` landmark per study, nine of them on the demo — an axe `landmark-unique` violation and a screen-reader dead end; (6) `#/evidence` and `#/parity` had no document title.
- **[PLANNED]** Per-class drift over calendar time (carried from Sessions 89–91): two-sample Mantel–Cox log-rank over calendar splits in `survival.js`, coupled into `waitCost.js`.
- **[PLANNED]** Calibration-discounted EVPI ceiling (carried): show the Platt-adjusted ceiling beside the raw one so the correction is visible without being applied silently.
- **[PLANNED]** Overlap *magnitude*: the terminal reports that independence is broken and by how many pairs; the next step is an effective-sample-size correction rather than a caveat.
- **[REJECTED]** Pooling exploratory studies (rewards declaring a hypothesis after the answer arrived); reporting τ² or I² below four studies; a fixed-effect pooled estimate; trim-and-fill or selection models (publication bias is not the dominant bias when the studies are your own and pre-registration is the protocol — and a funnel correction would invent the studies that "should" have been run); REML/Paule–Mandel (the empirical comparison shows they do not move the answer, and DL is checkable by hand); ranking on the point estimate rather than the lower bound; giving an untested lever a mean it has not earned; storing study text in a frozen review.

### Competitive gap status
Every meta-analysis tool on the market — RevMan, Comprehensive Meta-Analysis, JASP and jamovi, R `metafor`, Meta-Essentials, MetricGate, the free calculators — is built for a researcher who **already has a spreadsheet of study estimates**: you paste effects and standard errors, it returns a pooled estimate, a forest plot and heterogeneity statistics. None of them harvests the studies from the leader's own operational records, runs inside the system that owns the work the finding should change, refuses below declared floors, converts the pooled claim into owned work in the same transaction, or keeps it inside an export boundary. Methodologically the design leans on published evidence rather than on novelty: **Korevaar et al. (2023), _Research Synthesis Methods_**, find random-effects meta-analysis of ITS level-change estimates yields coverage close to nominal regardless of estimation method or study count, and the **2024 empirical comparison in _BMC Medical Research Methodology_** finds the choice of random-effects estimator barely moves the pooled estimate — which is why DerSimonian–Laird is chosen for transparency, not for accuracy it does not have. Search-limited comparison; **no claim of category-first status** in meta-analysis, and no vendor outcome claim is used as evidence. The shipped distinction is narrow and testable: the synthesis runs on the workspace's own pre-registered studies and its own resolved probabilities, states the independence assumption it is breaking, refuses below declared floors with a printed reason, grades its own frozen intervals for coverage *and* accuracy, and turns a pooled finding into a decision, a replication task or a case edge inside the same transaction. The overlap warning appears to be genuinely unaddressed by the tools surveyed — no tool this author found flags that two ITS studies of the same team metric over overlapping calendar windows share observations — but that is a statement about the search, not a proven category first.

## 2026-10-31 — Session 91: Leadership Parity & Standard Consistency Terminal — LMX disparity decomposition, promise reliability, and intra-leader threshold audits (Schema v65, ADR-0054, RULE-PAR-01..05, PAR-01..06, CSV #55)

- **[IMPLEMENTED]** `parity.js`: pure cross-domain read engine grading **only the leader's allocation, promise reliability, and evidentiary consistency** across 10 existing modules (zero employee scores, zero demographic attributes, zero reads of `conflicts` or `pulses`). Multi-channel LMX allocation (`coaching`, `feedback`, `authority`, `sponsorship`) tenure-prorated per 30 active days with early-ramp protection (`parityRampFloorDays`); finite-sample-corrected Gini $G\cdot\frac{n}{n-1}$, zero-safe Atkinson $A_{0.5}$, and **exact additive Theil $T$ entropy decomposition** ($T = T_{\text{between}} + T_{\text{within}}$ across `level × ramp` cohorts, separating Buengeler et al. 2021 *LMX Variety* from *LMX Disparity*); **Structural Fringe ("Invisible Zone")** detection; **Leader Promise Reliability Ledger** (Rousseau 1989/1995) over leader-owed 1:1 actions, 30-60-90 `managerSupport`, feedback follow-ups, and deferred GROW reviews with Wilson (1927) 95% intervals and `promiseGapPp` asymmetry; **Intra-Leader Standard Consistency & Noise Audit** (Kahneman, Sibony & Sunstein 2021; Leventhal 1980) across Performance Recovery plan-adoption bars, Succession halo-vs-overlooked bench inversions, and Review evidence-to-rating Kendall's $\tau_b$ + discordant pairs + final-quarter recency concentration; **14-day counterfactual rebalancing planner** (`planParityRebalance`); signals `PAR-01..06`, attention count, deterministic no-names brief, and frozen audit grading (Brier 1950).
- **[IMPLEMENTED]** `paritySchema.js`: fail-closed normalizers for `parityAudits` (`frozen` / `graded`, cap 60, downward repair when a `graded` claim lacks a valid grade) and `parityMarkers` (cap 400).
- **[IMPLEMENTED]** `parityRules.js`: synchronous post-commit rules `RULE-PAR-01..05` registered on `DEFAULT_POST_COMMIT_RULES` **before `decisionTempoRule`** — standard-consistency DACI decision per ISO week (`RULE-PAR-01`, `audits-consistency` edges), Structural Fringe blameless 1:1 reflection prompt + leader-owned check-in delegation (`RULE-PAR-02`, `rebalances-attention` edges), broken leader-promise recovery task (`RULE-PAR-03`, `repairs-contract` edges), overlooked-bench sponsorship prompt (`RULE-PAR-04`), and stale audit grading task + stale-edge reconciliation (`RULE-PAR-05`).
- **[IMPLEMENTED]** Schema v65 (`parityAudits`, `parityMarkers`, nine clamped `parity*` settings, additive `64 → 65` migration); commands in `actions.js` (`freezeParityAudit`, `gradeParityAudit`, `deleteParityAudit`, `scanParity`, `parityBriefText`, `parityRead`); `#/parity` six-panel terminal (Overview, Allocation & LMX, Promise ledger, Standard consistency, Rebalance & audits, Method) with inline SVG Lorenz & Theil charts and dialogs; typed `parity` node + `rebalances-attention`, `audits-consistency`, `repairs-contract` relations; CSV scope #55 (`parity`, opaque `CH-*` and `PA01..` codes, zero names/notes); Today & Person cross-links; demo historical frozen parity audit.
- **[FIXED]** Audited and repaired real cross-module defects uncovered in source inspection: (1) `warGameSignals` (`app/core/domain/warGame.js`) + `DOMAIN_ORDER` (`insights.js`) emitted string severities and wrong shape, causing `NaN` priority and silent `byDomain` omission in `buildInsights`; (2) `warGameRule` (`app/core/domain/warGameRules.js`) failed to read/write `draft.warGameMarkers`, returned `undefined` instead of effects for `propagationLineage`, and wrote non-schema decision/delegation fields (`status: 'open'`, `ownerId: ''`) dropped on reload; (3) `performanceSignals` (`app/core/domain/performance.js`) deep-linked to `?tab=concerns` and nonexistent `panel=conversation` instead of `?panel=evidence` / `?panel=plan`; (4) `ARCHITECTURE.md` stale Schema v62 label.
- **[PLANNED]** Per-class drift over calendar time — two-sample Mantel–Cox log-rank over calendar splits in `survival.js` coupled into `waitCost.js`.
- **[PLANNED]** Calibration-discounted EVPI ceiling in `valueOfInformation.js` alongside raw EVPI.
- **[PLANNED]** Cross-manager queue coupling (Kingman arrival coupling between interdependent units) and 1:1 `talkingPoints` cap (`MAX_TOPICS = 40`) overflow indicator.
- **[REJECTED]** Collapsing four leadership channels into one opaque "Fairness Score" (hides whether coaching time vs. stretch autonomy is skewed); collecting or inferring protected demographic attributes or message sentiment; reading confidential `conflicts` or anonymous `pulses`; scoring, ranking, or labelling any employee; printing Gini/Theil below 3 post-ramp people, cross-concern dispersion below 2 adopted plans, or Kendall's $\tau_b$ below 3 rated reviews; treating job-level/ramp decomposition as legal disparate-impact advice.

### Competitive gap status
Performance and people-analytics suites (Lattice, Culture Amp, Betterworks, 15Five, Leapsome, Visier) run post-hoc cross-manager rating calibration or pulse-survey listening; AI coaching tools summarize drafts or role-play conversations. Search-limited comparison; **no claim of category-first status** in HR calibration or people analytics, and no vendor outcome claim is used as evidence. The shipped distinction is narrow and testable: continuous intra-leader LMX Theil decomposition, dated leader-promise fulfillment with Wilson intervals, and cross-threshold consistency checks across formal recovery plans, succession nominations, and reviews — computed locally from the workspace's own working records, with explicit statistical refusals and synchronous post-commit follow-through.

## 2026-10-31 — Session 90: Cost of Waiting Terminal — pricing the queue the workspace already keeps (Schema v64, ADR-0053, RULE-WAIT-01..05, WAIT-01..06, CSV #54)

- **[IMPLEMENTED]** `waitCost.js`: the engine, pure read. Declared weekly prices per class (`waitPrices`, cap 24, fail-closed); derived decision prices = dominant value at stake ÷ erosion window (12 wk, linear Reinertsen CD3); **unpriced, never zero**. `stillOpenProbability` = S(age+Δ)/S(age) from the Session 89 curve, refused below the at-risk floor with a reason, `beyondEvidence` past max observed. `waitCostReport`: rows ranked priced-overdue first (overdue = past the class completion median), per-row scenarios at 1/2/4/8 weeks (P still open, **legacy endpoint lower bound** = price × weeks × P; corrected as integrated expectation in §93), **per-currency totals never pooled**, top-item share. `buildExposureCertificate` freezes the week's priced queue (cap 60, review date). Signals WAIT-01..06, attention count, deterministic no-names brief.
- **[IMPLEMENTED]** `waitCostSchema.js`: `normalizeWaitPrices` / `normalizeWaitExposures` / `normalizeWaitCostMarkers`, all fail-closed with warnings; negative or non-numeric prices are dropped, not clamped.
- **[IMPLEMENTED]** `waitCostRules.js`: RULE-WAIT-01..05 marker-idempotent per ISO week, on the spine **before decision tempo** (attention market last). Scan/price events: reconcile stale `prices-delay` edges; freeze the weekly certificate; ≤40 `exposure→item` links with the price in the summary; exactly one triage DACI decision per currency/week above threshold; ≤5 owned delegations (+3d, recorded owner only); ≤3 declare-a-price tasks per unpriced overdue class (+7d, leader). `waitAutoPropagate=false` pauses automation; an explicit scan always runs and is idempotent.
- **[IMPLEMENTED]** Schema v64: `waitPrices` + `waitExposures` + `waitCostMarkers`, clamped `wait*` conventions, additive `63→64` migration. Empty on upgrade — no price is invented for existing workspaces.
- **[IMPLEMENTED]** Five commands in `actions.js` (`declareWaitPrice`, `removeWaitPrice`, `scanWaitCost`, `freezeWaitExposure`, `waitCostBriefText`); the `#/wait` terminal (Overview, Queue, Certificates, Prices, Method) with dialogs; the Method panel names CD3/WSJF, S(s+w)/S(s) and every refusal.
- **[IMPLEMENTED]** Cross-module wiring: `exposure` typed node + SYSTEM_GENERATED `prices-delay` relation + resolver `#/wait?panel=certificates&exposure=<id>`; nav badge, `RENDERERS.wait`, four aliases; `Cost of waiting` insights bucket; CSV scope #54 (per class × currency + ALL rows, opaque C01.. codes, scenario figures blanked below the evidence floor); demo seeds three USD prices and **no pre-frozen certificate**; `index.html` v64 meta.
- **[IMPLEMENTED]** 43 new tests (12 suites) including a hand-computed KM fixture, the full one-write cascade, rule idempotency and an axe pass; version-pin sweeps 63→64 (61+2 files), CSV 53→54 (17 files), `waitExposures` fixture + `exposure` route in the typed-link lineage suite. Three defects found by the first run and fixed, not waived: a negative price clamped to 0 instead of dropped; a mis-dated hand fixture (median 0) caught by the assertions; a jsdom-realm array in the axe assertion.
- **[PLANNED]** Per-class drift over calendar time — a two-sample log-rank of this class against a calendar split, so "slowing" is measured, not felt.
- **[PLANNED — ambitious]** Cross-concern fairness audit (carried from Sessions 88–89): is the same evidence floor applied to everyone?
- **[PLANNED]** Calibration-discounted EVPI ceiling: show the Platt-adjusted EVPI beside the raw ceiling.
- **[PLANNED]** Cross-manager queue coupling (Kingman arrival coupling between units that exchange work).
- **[REJECTED]** WSJF-style division by job duration (the duration is itself estimated — multiplication is printed instead); pooling currencies; a per-person price; auto-reordering the queue (the triage is a DACI decision the leader makes); back-filling a certificate or a price after the fact; printing a scenario below the at-risk floor or unflagged past the longest observation; treating a declared price as a measurement.

### Competitive gap status
CoD/CD3 tooling (Reinertsen 2009; WSJF; Productboard/Aha!/Airfocus; roadmap vendors; the Maersk >$200k/week example) prices product-backlog items from a leader-declared per-feature CoD; people-analytics vendors (Visier, One Model, Crunchr, ChartHop, Culture Amp, Worklytics) and AI-coaching tools (CoachHub, BetterUp, Hone, Rocky.ai, Hyperbound) do not price the operational queue from the workspace's own records. Search-limited comparison; **no claim of category-first status** in cost-of-delay tooling, and no vendor outcome claim is used as evidence. The shipped distinction is narrow and testable: a weekly price declared once per class of work, multiplied by a censoring-aware still-open probability estimated from the leader's own records across six modules, per currency, scenario-simulated over declared wait horizons, with refusals printed where the data cannot support a number.

## 2026-10-30 — Session 89: Delivery Survival Terminal — censoring, competing risks and the hazard of waiting (Schema v63, ADR-0052, RULE-SURV-01..05, CSV #53)

- **[IMPLEMENTED]** `survival.js`: the engine, with no persistence and no UI. `harvestWorkItems` reads six source collections into one item shape (kind, start, end, exit type, censoring date, elapsed days, recorded owner, declared vs actual effort, route) and counts an item with no start date as undated rather than assuming one. Estimators: Kaplan–Meier (1958) product-limit survival with Greenwood (1926) variance and a Kalbfleisch–Prentice log–log band; **Aalen–Johansen (1978) cumulative incidence** of completion with the Aalen variance, so completion and abandonment are competing risks instead of one minus the other; Nelson–Aalen hazard over declared elapsed-time buckets with a Katz log-rate ratio; Mantel–Cox log-rank on one degree of freedom with the exact tail `2·(1 − Φ(√χ²))`; conditional completion over a forward window given survival to the item's age; `medianExit` that returns *not reached* rather than the maximum; `agePercentile` for rows where too few comparables remain at risk; `effortBias` on paired declared/actual effort in the same unit only; `survivalReport`, `buildPredictionSet`, `gradeReading` (Brier 1950 against the class base rate, i.e. a skill score, withheld below five settled items), `attachOutcomes`, `survivalSignals` (SURV-01..07), `survivalAttentionCount`, a deterministic no-name brief, and `conventionsFromSettings`.
- **[IMPLEMENTED]** `survivalSchema.js`: `normalizeSurvivalReadings`, two statuses (frozen, graded), labels and hard bounds; an unreadable reading is dropped rather than repaired silently.
- **[IMPLEMENTED]** `survivalRules.js`: RULE-SURV-01 frozen reading → typed `endangers` edges to the items it does not expect to finish plus one owned task per item (max 5, recorded owner only); RULE-SURV-02 graded reading that lost to its base rate → one repair task; RULE-SURV-03 scan → exactly one DACI decision per class per week when abandonment reaches the declared share of exits; RULE-SURV-04 scan → one task per returned delegation with no recorded reason; RULE-SURV-05 scan → one grading task per stale reading. Marker-idempotent; `survAutoPropagate=false` pauses automatic work but never an explicit scan.
- **[IMPLEMENTED]** Schema v63: `survivalReadings` + `survivalMarkers` in `COLLECTIONS`, eight clamped `surv*` conventions, normalization with a warnings sink, additive `62→63` migration. An empty reading list is the correct upgrade state: a prediction cannot be back-filled.
- **[IMPLEMENTED]** Four command-layer refusals in `actions.js`: an empty prediction set, a review date already past, a horizon outside 1–180 days, a second grading, and deletion of a graded reading. `survivalBriefText()` is deterministic and carries no names.
- **[IMPLEMENTED]** `#/survival` four-panel terminal (Queue, Classes, Readings, Method) plus three dialogs, with the **age percentile** column labelled as a share of past exits and explicitly not a probability; the Method panel names every estimator, every assumption (independence of censoring, exchangeability within a class, **no Fine–Gray subdistribution model**) and every refusal.
- **[IMPLEMENTED]** Cross-module wiring: the `reading` typed node with an `endangers` relation and a resolver to `#/survival?panel=readings&reading=<id>`; nav entry, alias table and attention badge in `main.js`; the `Delivery survival` insights bucket; CSV scope #53 (22 aggregate columns, figures blanked below the evidence floor); `survivalRule` registered on the spine **before** decision tempo so every decision it opens is priced in the same atomic write.
- **[IMPLEMENTED]** 57 new tests, and the **62→63** version-pin sweep across the suite (plus CSV 52→53 in 17 files, the insights domain ceiling 22→23, a `survivalReadings` fixture in the typed-link lineage suite, and a `reading` focus route assertion). Three real defects were found by the first execution and fixed, not waived: a zeroed PERT triple read as a 0-day estimate, `closedOn`/`abandonedOn` read off change records that only keep `anchoredOn`, and `'reading'` filed as a link *relation* instead of an *entity type* (which silently produced zero edges for RULE-SURV-01).
- **[PLANNED — ambitious]** Fine–Gray subdistribution hazards once enough abandoned items exist to fit one: the current incidence is honest about the cause-specific hazard, but "what share of what I start do I finish" is a subdistribution question.
- **[PLANNED]** Per-class drift over time — is this class of work slowing, or was last quarter unusual? A calendar two-sample log-rank against the existing estimator.
- **[PLANNED]** Wire the cost of the wait to the pricing the workspace already has: an item past its class median has a cost of delay that decision tempo and the attention market can price today. Currently a sentence, not a number.
- **[PLANNED — ambitious]** Cross-concern fairness audit (carried from Session 88): are plans adopted at the same evidence floor for everyone?
- **[REJECTED]** A completion "score" per person or team; a forecast of an individual's delivery; any probability printed below the at-risk floor; an invented exit date for an abandoned change; back-filling a prediction after the outcome is known; deleting a graded reading.

### Competitive gap status
Project trackers (Linear, Jira, Asana) show cycle-time averages and burndowns; portfolio-analytics vendors (Jellyfish, LinearB, Swarmia) sell delivery metrics with averages and percentile bands; PMO suites sell earned value. Search-limited comparison; **no claim of category-first status** in delivery analytics, and no vendor outcome claim is used as evidence. The shipped distinction is narrow and testable: the curve is estimated from the leader's own records across six modules with censoring and competing risks handled explicitly, the naive and corrected completion figures are printed together with the reason they differ, and the page refuses a probability its data cannot support.

## 2026-10-30 — Session 88: Performance Recovery Terminal — due process, evidence and the cost of waiting (Schema v62, ADR-0051, RULE-PERF-01..05, CSV #52)

- **[IMPLEMENTED]** `performanceSchema.js`: the persisted contract for a concern — 5 statuses, 4 expectation sources, 6 observation sources, 2 conversation kinds, 7 support kinds, 3 verdicts, the 7 tri-state Mager–Pipe answers, and hard bounds (120 concerns / 80 observations / 60 conversations / 60 supports / 4 objectives / 80 history / 160 markers / 20 notes). `normalizePerformanceConcerns` refuses impossible shapes rather than repairing them silently.
- **[IMPLEMENTED]** `performance.js`: the engine. `evidenceAudit` scores *answerability*, not volume (live window, distinct dates, specificity at the feedback module's 0–4 SBI floor of 3, stale count, average quality). `proceduralJustice` maps Leventhal (1980) / Colquitt et al. (2001) to six checkable facts — notice, accuracy, consistency, voice, bias suppression, support — each `met | gap | unknown` with a one-line fix. `analyseCause` runs Mager & Pipe (1970) into eight cause classes with an explicit confidence and an unanswered list. `supportAdequacy` checks the remedy against the implied one. `costOfInaction` prices declared inputs (Reinertsen 2009 cost of delay, replacement-cost convention) and returns **unpriced, not zero** when nothing is declared. `predictionOutcome` + `performanceCalibration` score the frozen probability with Brier (1950) and withhold the average below five resolved plans. Plus `performanceReport`, `performanceSignals` (PERF-01..08), `performanceAttentionCount`, a deterministic no-name brief and `conventionsFromSettings`.
- **[IMPLEMENTED]** `performanceRules.js`: RULE-PERF-01 no dated expectation → one owned task + one blameless 1:1 prompt; RULE-PERF-02 evidence floor met without a two-way conversation → the conversation task + prompt; RULE-PERF-03 plan adopted → one DACI decision on the **support mechanism**, typed `concern→person` and `decision→concern` links, and a dated check-in; RULE-PERF-04 not-met review → exactly one decision about the next **process** step with no exit option; RULE-PERF-05 explicit scan → one task for a passed review. Marker-idempotent, deterministic, suppressed by `perfAutoPropagate=false` but never on an explicit scan.
- **[IMPLEMENTED]** Schema v62: `performanceConcerns` in `COLLECTIONS`, eleven clamped `perf*` conventions, normalization with a warnings sink, additive `61→62` migration. **The migration also splits `coupledLoadAutoPropagate` out of the continuity module's `couplingAutoPropagate`**, fixing a real v61 collision in which pausing one module paused the other; the new key inherits the old value once, so no setting flips on upgrade.
- **[IMPLEMENTED]** 13 command-layer refusals in `actions.js`: a plan cannot be adopted while a due-process gate stands unless the leader writes a ≥40-character override stored verbatim and shown beside the plan forever; review is single-scoring and cannot be backdated before adoption or dated in the future; a concern with a plan cannot be deleted into silence; observation dates cannot be in the future; the probability is clamped to 5–95%.
- **[IMPLEMENTED]** `#/performance` five-panel terminal (Concerns, Evidence, Diagnosis, Plan, Method) and seven dialogs; the Method panel names the frameworks and states the refusals, including *"This is not legal advice."*
- **[IMPLEMENTED]** Cross-module wiring: `perfconcern` typed node with a `concerns` relation and resolver; nav entry, alias table and attention badge in `main.js`; the `Performance recovery` insights bucket (an unlisted domain vanishes from the roll-up silently); CSV scope #52 (codes only) plus a sensitive-export box in Settings; a demo seed that generates every decision, task and prompt by **calling the real rule**.
- **[IMPLEMENTED]** 43 new tests; the 61→62 version-pin sweep across 52 test files was required and is complete.
- **[PLANNED — ambitious]** A fairness audit *across* concerns: are plans adopted at the same evidence floor for everyone, or does the floor quietly depend on who the leader is? This is a testable property of the leader's own record, not a survey.
- **[PLANNED]** Prompt-hygiene affordance: eight modules now write 1:1 talking-point markers and the 40-topic cap silently drops the oldest. The UI should say so.
- **[PLANNED]** Team-load interaction: a person in a recovery plan while carrying on-call, and handover integrity when a concern ends in a role change.
- **[REJECTED]** A performance rating, a potential score, a nine-box grid, a forced ranking, a "flight risk" score, and any sentiment or language analysis of a person. **[REJECTED]** Any adverse action: the app cannot terminate, demote, dock pay or change a role. **[REJECTED]** Legal advice — the audit is a procedural-fairness checklist, and the copy says so. **[REJECTED]** Auto-generating a PIP that presumes the conclusion: the plan form refuses to open while a fairness fact is missing.

### Competitive gap status
HR performance suites (Lattice, 15Five, Culture Amp) sell review workflows, ratings and engagement analytics; PIP-template marketplaces automate a document whose conclusion pre-exists; people-analytics vendors infer sentiment and flight risk from messages. Search-limited comparison; **no claim of category-first status** in performance management, and no vendor outcome claim is used as evidence. The shipped distinction is narrow and testable: the tool audits the leader's process and prices the situation, refuses to proceed while a fairness fact is missing, grades the leader's own stated probability, and makes the adverse action structurally unavailable.

## 2026-10-30 — Session 86: The Strategic War-Game Terminal — cascade posture under declared macro-scenarios (Schema v60, RULE-WG-01..04)

- **[IMPLEMENTED]** `warGame.js`: a declared strategic exercise with up to 12 named macro-scenarios per game. Each scenario declares a kind (demand shift, budget contraction, key-person loss, regulation change, competitor move, supply disruption) and a direction (severe/moderate/mild × negative/positive). The engine projects each scenario through every major analytical module: strategy coherence (say-do gap divergence via `strategyTotals`), attention market (resource reallocation via `buildAttentionMarket`), coalition stability (winning coalition count change via `analyzePowerGame`), and case severity shifts. A composite resilience reading aggregates observable divergences across ≥3 scenarios.
- **[IMPLEMENTED]** Schema v60 additive collections `warGames` and `warGameMarkers`. Fail-closed: unreadable game dropped, markers capped at 200×200 chars.
- **[IMPLEMENTED]** `RULE-WG-01..04` on the shared spine: typed `stresses` edges from war game to strategy bets whose gap worsens >10pp; one DACI decision when any scenario breaks coalition stability; one owned re-planning task when attention reallocation >50%; typed `prefigures` edges to cases whose severity increases ≥1.0. All marker-idempotent.
- **[IMPLEMENTED]** `#/wargame` terminal with four tabs: Scenarios, Stress Map (bet×scenario matrix with gap divergence, reallocation, coalition shifts, case shifts), Resilience (composite with methodology limits), Method (frameworks, conventions, guarantees). New `wargame` typed node with `stresses`/`prefigures` relations and resolver route.
- **[IMPLEMENTED]** 22 new tests: schema v60 additivity and migration, normalization, entity type and relation registration, state projection under adverse/favourable scenarios, scenario evaluation, war-game report synthesis, signal generation, brief, attention count, and rule firing.
- **[IMPLEMENTED]** Full wiring: actions (add/update/commit/addScenario/updateScenario/removeScenario/retire/delete), schema normalization, post-commit chain, main.js route, nav item with badge, insights bucket, typed link resolution.
- **[FIXED]** Updated 60+ existing test files for schema version assertion (59→60) and migration chain ('58→59' → '59→60'). Added wargame fixture and focus parameter to typed-links-lineage test. Added resolveLinkedEntity case for wargame.
- **[PLANNED — ambitious]** Per-scenario strategy-bet attribution: identify which specific bets shift most under each scenario, not just the aggregate gap divergence.
- **[PLANNED]** Board-ready auto-generated synthesis: printable executive summary pulling from strategy, cases, power, attention market and decisions for each war game.
- **[PLANNED]** Scenario probability elicitation: let the leader declare relative plausibility (not probability) of scenarios, then weight the composite accordingly.
- **[REJECTED]** Automatic probability assignment to scenarios (they are declared, not predicted). Single "resilience score" (the composite is a summary of observables, not a fabricated number). Records created or destroyed by projection (existing records are adjusted within declared ranges only).

### Competitive gap status
Scenario planning tools (Schoemaker 1995; Schoemaker, Heaton & Teece 2018) and enterprise war-gaming consultancies exist. LeadOS claims no category-first status in scenario planning itself. The shipped distinction is narrower: the scenarios are cascaded through the leader's own records across strategy coherence, attention allocation, coalition stability and case severity in one computation, with typed graph edges proving which bets and cases the game stressed. Search-limited comparison; no claim of absence.

## 2026-10-30 — Session 85: The Signal Path — cascade reach, latency and deafness (Schema v59, ADR-0050, RULE-SIG-01..04, CSV #51)

- **[IMPLEMENTED]** `signalPath.js`: reach as a series/parallel product over hops derived from the roster, false alarms compounding in the opposite direction, arrival-conditional latency, expected loss `θ × exposure × (1 − reach × (1 − min(1, lag/horizon)))`, Shannon mutual information, d′ with the log-linear correction, Wilson intervals, Brier scoring, and five levers each priced by re-running the same evaluator. A management cycle is detected and refused.
- **[IMPLEMENTED]** Schema v59 additive collections `signalClasses`, `signalProbes`, `signalLevers`, fail-closed on load (unreadable class dropped, dangling origin cleared, settled probe with no observation reopened, committed class without a frozen reading demoted). A committed reading freezes at four decimal places and the exposure cannot be rewritten afterwards, because that number is what the probes grade.
- **[IMPLEMENTED]** Probe ledger as questions rather than surveillance: a probe records a fact that already existed and asks how the leader learned it (`escalation` / `skip-level` / `monitoring` / `accident` / `never`); latency comes from two typed dates; below six settled probes the page prints counts and withholds a verdict.
- **[IMPLEMENTED]** `RULE-SIG-01..04` on the shared spine: typed `reaches`/`involves` edges per committed chain, exactly one DACI redesign decision plus one owned probe task when the ledger contradicts the declaration, a link from any case that lands on a path below the blind floor (real `case.created` event), and owned dated work for an adopted lever. All marker-idempotent.
- **[IMPLEMENTED]** `#/signal` terminal (Path/Reach/Probes/Levers/Method), five dialogs, `signal` typed node with `reaches`/`signals` relations and a resolver route, `Signal path` Insights bucket with `SIG-01..07`, nav badge, CSV scope #51 (class codes, ratios and counts only), deterministic brief, demo seed through the real contract.
- **[IMPLEMENTED]** 28-test suite: schema additivity and fail-closed normalisation, exact series/parallel composition, mutual information and inverse-normal accuracy, roster-derived depth and cycle refusal, lever monotonicity and explicit hurdle refusal, freeze immutability, probe settlement rules, all four rules with real events and idempotent re-fires, the six-probe verdict floor, signals/brief determinism, JSDOM render on every panel, CSV privacy.
- **[FIXED]** Rule idempotency markers were written unbracketed into fields the guards then searched for in bracket form, so a second contradictory probe would have opened a second decision and a second task; `RULE-SIG-02..04` now write `[…]` into the exact field each guard reads (verified by an idempotent re-fire test).
- **[FIXED]** `RULE-SIG-04` events carried the class id while the rule looked up a lever id, so an adopted lever produced no owned work at all; the event now identifies the lever.
- **[FIXED]** Frozen readings were rounded to two decimal places by the normalizer, which silently moved the number every probe is graded against (0.6084 → 0.61 and a different Brier term); frozen reach/bits now keep four places.
- **[FIXED]** `.mono` was used by the Method panel but never defined in `styles.css`; the formulas rendered as body text.
- **[PLANNED — ambitious]** Per-hop attribution once several probes exist per relay, so the page can say *where* the message stopped rather than only how often it did.
- **[PLANNED]** Sub-day latency for channels that move in hours; carry the blind-path link into a case's own risk pricing.
- **[REJECTED]** Sentiment, mood or message-volume inference about people; instrumenting internal communication to measure transmit directly; ranking levers and showing only the best; a single "channel health" index; any verdict below six settled probes; treating a committed reading as editable.

### Competitive gap status

Escalation routing for systems is a mature category (PagerDuty, OpsGenie, Xurrent), and silence, the mum effect and upward distortion are decades-old literature (Rosen & Tesser 1970; Athanassiades 1973; Milliken, Morrison & Hewlin 2003; Morrison 2014). LeadOS claims no behavioural-science contribution and no category-first status. The shipped distinction is narrow: the channel is priced from the leader's own roster, the per-hop declaration is made falsifiable by a small probe ledger instead of by surveying people, and the tool grades the declaration rather than the team. Search-limited comparison; no claim of absence.

## 2026-10-30 — Session 84: Autopilot Studio — governed operating agreements (Schema v58, ADR-0049, RULE-AP-01, CSV #50)

- **[IMPLEMENTED]** Closed-vocabulary agreement system: 4 source adapters (case, decision, delegation, goal), 14 events, typed facts, 5 bounded actions (decision, delegation, coaching, premise, comms), 7 template tokens. No eval, no property paths, no user code; new sources plug into the same compiler, rehearsal, executor and ledger.
- **[IMPLEMENTED]** Rehearsal-bound activation: the same pure executor previews every agreement against current records on a disposable copy (matches, creates, owner load, blockers, threshold sensitivity) and activation binds approval to a digest of definition + workspace revision + rehearsal. Stale tokens, blocked actions and changed workspaces refuse.
- **[IMPLEMENTED]** `RULE-AP-01` evaluates FIRST on the post-commit spine so agreements see the record as the triggering action left it; agreement-created records still emit derived events for built-in rules (verified: the agreement decision satisfies RULE-DEC-01's guard; RULE-DEL-01 still advances the case). Desired-state markers (one record per agreement/version/source/action) reuse across re-fires; processed keys skip identical re-fires silently.
- **[IMPLEMENTED]** Hard refusals: nothing sent, no option selected, no rating/pay/hiring/termination effect in the vocabulary; missing owners and full 1:1 queues block whole runs, record the refusal and pause; 24-record batch ceiling applies nothing on breach with a failure receipt; agreement output cannot trigger another agreement (human actions still can); stored active agreements that cannot prove their contract pause on load.
- **[IMPLEMENTED]** `#/autopilot` terminal (Agreements/Runs/Method), five dialogs (builder, rehearsal+activation, pause, retire, delete), `autopilot` typed node + `automates` system-generated relation, `Autopilot` Insights bucket with `AP-01`, nav badge, CSV scope #50 (codes/counts only), deterministic brief, two demo drafts validated by the real contract.
- **[IMPLEMENTED]** 27-test suite covering schema additivity, registry closure, boundary refusals, rehearsal purity, activation binding, five-effect fan-out with built-in coexistence, idempotency, both refusal paths, cascade guard, batch ceiling, UI labels, CSV privacy, wiring, fail-closed loading, lifecycle, demo and brief. `#/autopilot` added to the axe-gated route list.
- **[FIXED]** `downloadText` in the Attention Market passed positional arguments to an object-parameter function, which would have saved a file containing "undefined". Now uses the object form with a visible fallback.
- **[PLANNED — ambitious]** Leader-confirmed driver/dependency entities as agreement facts, joining the session-83 correlated-exposure item; per-class calibration from reviewed runs above an evidence floor; premise-breach, watch-alert and negotiation-close source adapters once their fact sets are crisp.
- **[REJECTED]** Free-text/LLM-authored rules (non-deterministic, unauditable); post-built-in evaluation order (built first — `status=open` on `case.created` could never match); one record per firing (duplicates until budget death); a portfolio confidence composite (same reasoning as §82).

### Competitive gap status

Aera (Oct 27 2026) describes Policy Studio (approve drafted rules, test against live decisions, then enforce) and a per-decision policy ledger; Cloverpop describes zero-code playbooks over a decision graph; WorkBoard and Lattice ship conversational/portfolio agents with vendor-claimed outcomes. All vendor material, [UNVERIFIED]. LeadOS claims no superior enterprise engine: the shipped distinction is the local-first binding — a vocabulary small enough to read, a rehearsal computed from the leader's own records, approval bound to that preview, and five bounded attributed writes. Search-limited comparison; no claim of absence.

## 2026-10-30 — Session 83: common-mode exposure without fake correlation

- **[IMPLEMENTED]** `RULE-ATT-05` reconciles typed `shares-barrier` links among active cases whose recorded systemic-barrier text matches exactly after Unicode/case/whitespace normalization. Case create/edit/resolve/reopen/delete events are covered; changing a barrier or pausing propagation removes stale edges. Link summaries contain no source prose.
- **[IMPLEMENTED]** Attention Market groups same-currency case exposures and shows additive versus full-overlap scenarios; unknown/unpriced values remain unknown. `ATT-S6` routes to the market. This is a sensitivity, not an interval, correlation estimate, causal finding, or objective adjustment.
- **[IMPLEMENTED]** Removed the mutable `contextNow` module global from candidate harvesting; each reader uses its supplied clock.
- **[PLANNED — ambitious]** Replace exact-text matching with leader-confirmed driver/dependency entities, provenance, confidence, and alternate-driver review; do not infer common causes from free-text similarity alone.
- **[PLANNED]** Calibrate Attention Market hour declarations from reviewed actuals by source class; separate leader effort from total team effort and avoid applying a bias multiplier below an evidence floor.
- **[PLANNED]** Cross-manager attention capacity: model shared delegate pools only after explicit team membership, common currency and overlapping horizon are available.
- **[REJECTED]** Applying a correlation coefficient or reducing the solver's objective from matching text alone — no observed dependence or comparable time horizon supports it.
- **[REJECTED]** Replacing this with a generic AI coach/roleplay chatbot — current vendors already offer adaptive conversation simulation, while the sharper verified gap was correlated operational exposure inside an existing capacity decision.

### Competitive gap status

NIST IR 8286C Rev. 1 describes aggregation and harmonization of cybersecurity risk registers; Resolver is publicly described as combining incident, investigation, RCA and corrective action; Coachello/Skillsoft CAISY offer practice simulations. LeadOS is **not** claiming a superior enterprise risk engine or a novel simulation. The shipped distinction is the narrow link from an existing systemic-barrier record into the same local leader-attention market. Search-limited comparison; no claim of absence.

## Session 82 — 2026-10-30: Price the leader's week (Schema v57, ADR-0047, RULE-ATT-01..04, CSV #49)

### Why this was the high-leverage slice

The audit found the one question the workspace could not answer. Forty screens each own a queue and each reports its own attention count; the Signals feed merges them by severity. None of that answers *I have eleven hours this week — what is the best eleven hours I can buy, and what does the twelfth cost me?* A merged list cannot express that two rows are the same item in different modes, cannot express that a hand-off converts the leader's hours into somebody else's, and prices nothing. The result is visible in the product and in the category: obligations that carry a number win, obligations that do not quietly stop being scheduled, and no decision is recorded because nobody made one.

### Implemented

- **`app/core/domain/attentionMarket.js`** — a multiple-choice knapsack over monetised obligations with **two resource constraints** (the leader's hours and the delegate pool). Exposure, hours and success probability are each derived from the record that already exists; anything unrecorded is `null` and the item is listed as `unpriced` rather than treated as zero.
- **The solver, in three stages.** Convex-hull pruning per group; exact depth-first branch and bound with a remaining-value ceiling and two feasibility prunes inside a hard node budget (optimal, gap exactly 0, for markets up to 14 groups); Lagrangian fallback with Dyer's incremental-ratio LP, a golden-section minimisation of the dual, and a printed gap.
- **The price of the next hour is a finite difference** — the same market re-solved with one more hour — not a relaxation artefact. A zero price means the budget is not binding, which is an answer.
- **`app/core/domain/attentionMarketRules.js`** — `RULE-ATT-01` typed `allocates`/`forgoes` edges; `RULE-ATT-02` one owned, dated delegation per named hand-off (never an invented owner); `RULE-ATT-03` exactly ONE DACI decision carrying the whole forgone list **with its price**; `RULE-ATT-04` attribution decision plus owned re-planning task when a plan misses. All marker-idempotent.
- **`#/attention`** — five panels (Plan, Market, Unpriced, Frontier, Method), three dialogs, a deterministic brief, and a reviewed demo plan scored by the real scoring function.
- **Schema v57** additive: `attentionPlans`, seven clamped conventions, one migration, one typed entity, two relations. CSV scope #49 (counts and codes only). Insights bucket `Attention market` with `ATT-S1..S5`. Nav badge. Demo seeding through the real solver and the real freeze function.

### Defects found and fixed by building it

| Defect | Why it mattered |
|---|---|
| `pruneToHull` removed the **cheap** dominated option instead of the expensive one | Every delegation vanished from the market and every plan looked like "do everything yourself". The removal rule is now a regression test. |
| Effort-days were priced as **leader** hours | A funded item's `effortDays` is team effort. The first market allocated 423 h of "leader attention" against a 12 h budget. Replaced with a declared, printed leader-share convention and a per-row override. |
| Delegation was offered automatically on an uninformative prior | With no measured record, handing off looked strictly better than doing the work (same value, a quarter of the hours) and the solver handed all ten obligations to one person. The mode is now withheld below the sample floor. |
| A single-resource model could not express the real trade | Added the delegate pool as a second ceiling with its own Lagrangian price, because "one more hour of **your** week" and "one more hour of **somebody else's**" imply different actions. |
| A printed 65% gap on a four-item week | The dual was valid but loose. Added bounded exact search so small markets report optimality and the gap is meaningful when it appears. |
| Signals and the nav badge paid for the frontier ladder and the price solves | Two extra solves per read. Added a cheap-read mode; only the terminal pays. |

### Verified

`tests/app/attention-market.test.mjs` — **29 tests**, including the solver checked against exhaustive enumeration on 60 random markets, the two ceilings never exceeded and never able to hurt when raised, the pruner regression, the frozen-prediction immutability, review exclusion of unmoved items, idempotency, the typed-graph round trip, and every panel rendering with one `h1` and named tables. Full canonical suite: **1,374/1,374**. Boundary **196 modules / 84 suites / 0 leaks**. Docs links **284/284**. ESLint clean on all changed files.

### Competitive finding converted into product

Strategy tools sell portfolios of initiatives (Anaplan, Pigment, o9: connected planning); decision-intelligence tools log and sequence decisions (Cloverpop, LeadOS's own portfolio engine); forecasting platforms score individual predictions (Metaculus). None of them prices a working manager's *attention* as a capacity constraint with a measurable dual, and none writes the forgone set into a decision register with its cost. Search-limited observation, not proof of absence — sources and their status are in `RESEARCH.md` §82.

### Limits and explicit rejection

- **Rejected: a weighted single score.** The module never merges value and hours. The budget is a constraint and the dual is the exchange rate; a weighted sum would hide which term the leader cares about.
- **Rejected: annotating a signal with a fabricated dollar amount** when the source record has none. This was the tempting fourth feature; a made-up number in an evidence card is the exact failure the whole codebase is written against.
- **Rejected: automatic delegation below the measurement floor.** See above.
- **Limits:** no correlation between obligations, no scheduling, no cross-currency arithmetic, no learning curve. The leader-share convention can be wrong in either direction. Real-browser and assistive-technology behaviour of `#/attention` remains **[UNVERIFIED]**, as does the quarantined legacy `src/**` tree.

### Next ambitious bets (top 3)
1. **Correlated obligations by shared root cause.** The RCA field already records a systemic barrier; two cases citing the same barrier are not two independent exposures. Collapse them with a printed correlation assumption and re-price the plan.
2. **Calibrated hours.** The hours are the one input the leader supplies. Score them: predicted vs actual hours on every reviewed plan gives a per-class Brier-style reading and a per-leader bias multiplier applied to future estimates.
3. **Cross-manager attention coupling** (carried over from §80/§81): two leaders who review each other's work share a delegate pool; model the coupling instead of assuming independent weeks.

## Session 81 — 2026-10-30: Plan the sequence of tests (Schema v56, ADR-0046, RULE-SEQ-01..03)

### Implemented
- **Sequential Investigation Planner** (`app/core/domain/sequentialInvestigation.js`): solves the declared test menu exactly by backward induction over up to three stages and six tests. It conditions the belief by Bayes' rule after each settled test, is independent of settlement order under conditional independence, and reports the stop value, the best single test, the full-sequence value, the second-stage gain and the expected number of tests run.
- **Sequence tab** (`#/voi?panel=sequence`): the decision tree as a nested list with the recommended path, the belief before and after settled tests, each test's raw net alone (negative when it does not pay for itself), and the assumptions the plan rests on. Refusals are explicit and reasoned.
- **`RULE-SEQ-01`** writes one advisory conditional-plan note when a second stage is material. **`RULE-SEQ-02`** opens one commit decision with each option priced under the current belief when the plan stops, and revises that open decision in place. **`RULE-SEQ-03`** creates one owned, dated task for the next test on the frame owner, linked back to the frame, or records a note when there is no owner. All three are marker-idempotent on the shared post-commit spine, and registered with contracts and catalog entries.
- **No migration.** The planner is a read model over existing records. Schema stays at v56.
- Verified: **18 new tests** in `tests/app/sequential-investigation.test.mjs`. These include a consistency check that matches the existing `evaluateInquiry` net across 60 deterministic random frames, exact arithmetic (perfect test = EVPI on top of stop value, 700 = 520 + 180), monotonicity in horizon, Bayes conditioning, every refusal, the three rules through the real action layer, and the rendered tab. Full suite: **1,345/1,345** (baseline 1,327 plus the 18 new tests). Focused ESLint clean on all changed runtime and test files.

### Competitive finding converted into product
- Decision-tree tools (SpiceLogic, SmartOrg Supertree, TreeAge) already compute EVPI and, in the case of Supertree, automatically re-order tree nodes for value of information. LeadOS does not claim automatic sequencing is new. Its narrower claim is that the exact plan drives owned tasks, notes and a commit decision inside the decision register, and is re-read on every settlement. That is a search-limited observation, not proof of absence. Sources and labels are in `RESEARCH.md` §81.

### Limits and explicit rejection
- **Conditional independence is assumed, not checked.** Tests that read the same source overstate the second stage. Stated on the page; not detected.
- **Sensitivity and specificity are the leader's declarations.** The planner does not validate them.
- **Rejected: a greedy one-step stopping rule.** It is the failure mode the 2026 preprints describe for myopic rules [UNVERIFIED for this problem class]. The bounded exact search was chosen instead.
- **Rejected: a schema bump for a derived read model.** It would have forced changes across roughly thirty test files for no data gain.
- **Limits:** six tests and three stages maximum; no continuous outcomes; no real-user or screen-reader testing of the new tab (**[UNVERIFIED]**).

### Next ambitious bets (top 3)
1. **Shared-source dependence:** let a leader tag tests that rely on one source. The planner then treats them as dependent and stops overstating the second stage of correlated tests.
2. **Cross-manager queue coupling** (carried over from Session 80): shared arrivals between managers who exchange work, with a stability test rather than independent queues.
3. **Cluster-aware calibration** (carried over from Session 80): resample at the settled-frame level, stratify only on explicitly tagged premise domains, and report effective sample size before exposing an interval.

## Session 80 — 2026-10-30: Calibration meets the money decision (Schema v56, ADR-0045, RULE-LCAL-04)

### Implemented
- The calibration and Information Value terminals now meet in a read-only decision stress: raw EVPI, a Jeffreys beta-binomial mean blended toward the declared probability by `n/(n+10)`, and a marginal Wilson-corner envelope (up to 64 corners) over the exact original payoff matrix.
- The Calibration tab ranks open frames, shows whether the expected-value choice changes under tested corners, and names coverage gaps instead of inventing a number.
- `RULE-LCAL-04` writes one explanatory note and up to three typed `calibrates` edges from the contributing settled forecast records when a new open frame has adequate bin coverage; a settlement also connects already-open frames when their coverage matures (20-frame bounded sweep with an explicit remainder event). It is marker-idempotent and never rewrites the frame probabilities or a frozen prediction. `RULE-LCAL-03` now uses the full calibration verdict, replacing its weaker high/low shortcut.
- No migration, new collection, network call, or new dependency. Read-side stress is calculated from existing records.
- Verified targeted: `node --test tests/app/leader-calibration.test.mjs tests/app/information-value.test.mjs` (45/45). Full canonical verification passed **1,327/1,327** (13m 48s); ESLint clean; boundary **189 modules / 82 suites / 0 leaks**; documentation links **270/270**. Standalone rebuild and verification passed **7/7**; see `AI-SESSION-LOG.md` for exact build details.

### Competitive finding converted into product
- Culture Amp's 2025 AI Coach announcement describes people-science guidance embedded across engagement/performance workflows; Teamspective's 2026 product materials emphasize MCP/assistant integrations in the manager's flow of work; Metaculus documents proper-scoring feedback for individual predictions. LeadOS now makes a distinct connection between a leader's own scored probability history and the dollar value / choice sensitivity of an open decision, with record-level provenance. These are publisher claims and public feature descriptions, not independent validation or proof of market uniqueness.

### Limits and explicit rejection
- **Not a posterior or corrected belief:** the marginal state hit rates are renormalized into a scenario solely to stress EVPI. The view and notes call this out.
- **Not simultaneous confidence:** Wilson intervals are per bin; state-pairs from a single settled categorical frame are correlated. No cluster-robust estimate or domain-shift guarantee is claimed.
- **Rejected:** silently applying the remap to declarations or frozen forecasts; it would substitute historical averages for the leader's current judgement and erase an auditable decision.

### Next ambitious bets (top 3)
1. **Cross-manager queue coupling:** shared arrivals between managers who exchange work, with a stability test rather than independent Kingman queues.
2. **Cluster-aware calibration:** resample at the settled-frame (not state-pair) level, stratify only on explicitly tagged premise domains, and report effective sample size before exposing an interval.
3. **Sequential information design:** price a multi-stage investigation with a stopping rule and value of delay, rather than assuming one test per frame.

## Session 78 — 2026-10-30: The Decision Portfolio Sequencing Engine (Schema v55, ADR-0043, RULE-DPF-01..04)

### Why this was the high-leverage slice
No existing tool synthesizes the typed dependency graph, shared-premise coupling, approver bottleneck, and delay-cost-weighted sequencing into one terminal. The Decision Portfolio Engine treats the leader's open decisions as a constrained portfolio scheduling problem.

### What shipped
- **Schema v55:** `portfolioMarkers`, `portfolioNotes` on decisions, three new settings.
- **`decisionPortfolio.js`:** Coupling graph, dependency DAG, topological sort with CD3, sequencing regret, bottleneck HHI, Decision Load Index (5-component composite), deferral simulation, board brief, 8 signals.
- **`decisionPortfolioRules.js`:** RULE-DPF-01 (coupling discovery), DPF-02 (resolution cascade), DPF-03 (premise scan). All marker-idempotent.
- **`#/portfolio`:** Five-tab terminal — Overview, Coupling, Sequencing, What-if, Board pack.
- **`couples` relation** on typed link graph.
- **ADR-0043**, 24 new tests, CSS, all existing tests updated to v55.

### Verified
- 24/24 portfolio tests, 15/15 core tests, 55/55 domain tests pass.

### Next up
1. RULE-DPF-04 (portfolio triage decision when carrying cost exceeds threshold)
2. Calibrated probability elicitation for VOI
3. Cross-manager queue coupling

## 2026-10-30 — Decision integrity gap and next bets

- **Implemented:** explicit, frozen state/assumption equivalence; correct negative evidence magnitude; per-currency concentration stresses; idempotent provenance repair. Pursued inspectable decision provenance rather than another isolated dashboard.
- **Planned:** a review queue identifying legacy investigation observations and stale generated concentration decisions, with explicit human-approved correction and append-only audit; avoid quietly changing prior beliefs.
- **Planned:** model dependence between repeated tests and evidence sources, with calibrated validation rather than multiplying correlated likelihood ratios as independent observations.
- **Planned:** a typed cross-module decision graph with sensitivity-triggered review and evidence lineage, including currency-aware scenario comparisons and accessibility testing.
- **Rejected for now:** automatic foreign-exchange conversion without dated, sourced rates; it would create spurious precision in an offline app.
- **Rejected for now:** synthetic multi-agent debate presented as objective validation; unsupported assertions would make this evidence problem worse.

## Session 75 — 2026-10-29: The Workforce Transition Terminal (Schema v52, ADR-0040, RULE-TRN-01..06, CSV #46)

### Why this was the high-leverage slice

The audit found one gap that everything else in the workspace pointed at and none of it covered: the app could price
a hire, a merit cycle, a delay, a risk, a delegation and a study — and had nothing at all for the decision where the
money, the law, the knowledge and the survivors all collide at once. Offboarding was nine incidental mentions across
the docs and zero lines of code. It is also the decision a first-time leader is most likely to get wrong precisely
because the tools available to them are either a legal checklist they cannot use or a spreadsheet nobody audits.

### Audit, selection, and fresh benchmark

- Read the real source of `compRules.js` (573), `postCommit.js`, `compSchema.js`, `cases.js` link registry,
  `merit.js` view, `csv.js` scope registry, `insights.js` buckets and the merit test template before writing a line.
  The legacy `src/**` tree stays quarantined and is **not** evidence of running behaviour.
- Competitive scan (below) put two incumbent shapes on the table: enterprise RIF suites, and spreadsheets/consultants.
  Both were rejected as the target, and both were mined for what they get right — a pool, declared criteria, a screen,
  a dated process — which this module keeps while dropping the parts a solo leader cannot use.
- Chosen over the three other plausible slices because it is the only one that *combines* the workspace's existing
  records (pay, ratings, dependency stewardship, open ownership, bench readiness) into one decision, and because its
  automation can be shown end-to-end in the same session: one `decide` produces links, a decision, delegations and
  talking points in the same transaction.

### Fresh research (2026-10-29)

| Source | What it claims | Consequence for this build |
|---|---|---|
| [Onwards HR, Reduction in Force software](https://www.onwardshr.com/reductions-in-force) | Employee pools from a business justification, `considered for` vs `impacted by`, HR/legal review, automated OWBPA/WARN compliance, adverse-impact analysis, severance automation, historical trend reporting. | This is the incumbent shape, and it is a **compliance file**. Its outputs are approvals and mandated forms, not prices or trades. |
| [AxisSynapse, Reductions in force](https://docs.axissynapse.com/elr/reductions-in-force) | Snapshot the workforce at definition time, choose a selection methodology (performance/skills/seniority/role-elimination), a scored criteria worksheet with weights, a 3–5 person calibration committee, the four-fifths analyser *with* a standard-deviation test and a k-anonymity floor, WARN timeline, two signatures per step, "the file is the defense record". | The most sophisticated public description of the category. It validates three of this session's choices (criteria before names, a size floor, a printout of the ratio) and validates the refusal: the whole artefact depends on protected classes and counsel. It has no priced alternative, no capability loss, no survivor model, no frozen prediction. |
| [Joveo, *What Is Adverse Impact?* (2026)](https://www.joveo.com/blog/what-is-adverse-impact-four-fifths-rule/) and [hiringstandards.com adverse-impact guide (2026)](https://hiringstandards.com/adverse-impact-and-hiring-standards/) | UGESP 29 CFR § 1607.4(D); the EEOC's own Q&A concedes a 20% gap may not indicate impact at small n; passing is not a safe harbour; effect size and practical significance both matter. | The screen must print reliability and refuse small groups — implemented, and the demo prints `insufficient` rather than a ratio over one group of one. |
| [Raghavan & Kim, *Limitations of the Four-Fifths Rule*, Georgetown Law Technology Review (2024)](https://georgetownlawtechreview.org/wp-content/uploads/2024/01/Raghavan_Kim_Final-Proof.pdf) | The rule is a crude effect size with no notion of significance; at small n a single data point flips the conclusion and can reverse *which* group is disadvantaged; courts do not use it as a determinative test. | Directly shaped shipped code: `impactScreen` now returns a **fragility count** — how many selections must move, at constant headcount, before the direction of the disparity reverses — printed in words next to the ratio. |

**Competitive conclusion.** The category sells *compliance*: a defensible file. This module sells *decision quality*:
what the list costs against the alternatives, what it does to recorded capability, who is the sole holder that makes
it impossible, and what happened to the people who stayed. Parity with vendor features (WARN automation, release
packets, protected-class analysis) is deliberately **not** claimed and, where it exists, **not verified**.

**Ambition benchmark.** Killing a role in this app now changes: the roster, the dependency map, the delegation queue,
the 1:1 talking-point queue, the decision register, the automation timeline, the insights roll-up, the CSV export and
the calibration ledger — in one transaction, with typed provenance on every edge.

### What shipped

- **Schema v52, additive `51 → 52`:** `transitionPrograms` (label, kind, status, effective date, target headcount and
  optional ceiling, declared weights, one comparison dimension, owner, nested candidate rows, eight process gates,
  one frozen snapshot, resolved outcomes, a 40-entry history) and eight clamped settings. No programme, candidate,
  target or salary is invented for an existing workspace.
- **`app/core/domain/transition.js`:** candidates from recorded pay/rating/stewardship/ownership/bench; exit-cost
  arithmetic; constrained selection with swap repair and a relaxation bound; a seeded weight ensemble; the
  four-fifths screen with Wilson intervals, coverage and fragility; cheapest-compliant-swap search with an
  infeasibility verdict; continuity exposure with sole-holder refusals; the survivor redistribution convention with
  frozen per-person predictions; four priced alternatives compared by Pareto dominance; a backwards-planned gate
  timeline; Brier calibration; `TRN-01..06` signals and a deterministic brief.
- **`transitionSchema.js` / `transitionRules.js`:** versioned normalisers and the frozen snapshot builder;
  `RULE-TRN-01..06` on the shared spine, registered in the catalog and the propagation contracts ledger.
- **`app/views/transition.js`:** the five-tab terminal — plan table with inline naming, gates, screen and compliance
  cards, stability bands, continuity obligations, alternatives, method and limits.
- **Thirteen actions** with validation, ownership gates and append-only history; typed-link registration
  (`transition` entity, `separates` / `screens` / `hands-over` relations, `#/transition?program=` route); CSV scope
  #46; the `Workforce transition` Insights bucket; a two-programme demo (one frozen and resolved, one live).
- **`tests/app/workforce-transition.test.mjs`** (15 claims) — see ADR-0040 "Verification".

### Defects the new suite found (and fixed)

1. **CSV scope #46 crashed:** `daysBetween` was used but never imported, so the export threw rather than leaking —
   caught by the first run of the new test.
2. **Undeclared candidates became a group.** Twelve people with no group code formed an `unspecified` bucket that
   outvoted two declared groups and made the screen read `insufficient` for the wrong reason. Undeclared rows are now
   coverage, outside the comparison, and the page prints the count.
3. **Two horizons.** The outcome window used a literal 365 days while the review was dated by the declared setting.
4. **Redeployment duplicated the involuntary plan** when no requisition existed (same headcount, same cost, same
   capability), which distorts a Pareto comparison. It is now marked unavailable and excluded.
5. **No owner, no accountability.** `decide` and `finalize` accepted an unowned programme, so the evidence task and
   the outcome-tracking task were silently skipped. Both gates now refuse and name the missing owner.
6. **The link-graph contract test did not know the new entity.** `typed-links-lineage` derives a focus parameter per
   entity type; `transition` addresses a programme by `?program=`, so the entry was missing and the route check fell
   through to the path-segment branch. The route was right; the contract map was one entity short.
7. **Stale field names after the Pareto rewrite:** the CSV column still said `minimax_alternative` and the view still
   described minimax regret. Renamed and rewritten; `costRegret`/`capabilityRegret` became `costAboveBest`/
   `capabilityAboveBest`, which is what they compute.

### Verification and limits

- `node --test tests/app/workforce-transition.test.mjs` → **15/15**.
- Full repo suite → **1,236 / 1,236 tests pass, 0 failures** (78 suites, `npm test`).
- `npm run lint` clean; `npm run check:boundary` reports 174 canonical modules and 78 suites with zero quarantine or
  network leaks; `npm run check:links` resolves 249 internal links across 147 markdown files.
- Standalone build: **3,741,131 bytes**, 173 source modules, schema v52, 7/7 standalone tests. The size tripwire moved
  from 3.70 MB to 3.90 MB with the rationale recorded in the test; the bytes-per-module density bound (21.6 KB vs the
  24 KB cap) is unchanged and is what still catches a duplicated module.
- **Cross-module self-test, printed rather than asserted in prose:** declaring four named exits and calling
  `decideTransition` once produced, in one transaction, **1 mechanism decision, 4 owned delegations (1 scoring-grid
  evidence task + 3 hand-overs), 5 new typed links (`screens`, `tracks-followup`, `hands-over`×3) on top of the 5
  written at declaration (`stewards` + `separates`×4), 11 events**, and a second `scanTransition` reported
  `changed: false` — the marker-idempotency claim, measured.
- Accessibility: the page and all five of its panels were added to the axe/console audit
  (`tests/app/access-audit.test.mjs`), which now renders `#/transition` in the aggregate sweep and every panel on the
  demo programme — 13/13 in that suite, zero violations, zero console errors.
- **Limits, stated rather than implied:** not legal advice; no protected class; no significance test (the fragility
  count is the honest substitute); capability is operational value in these records, not a person's worth; the
  redistribution rule is mechanical; no FX; the optimizer is a bounded heuristic; the ensemble is a weight-robustness
  check rather than a probability; vendor parity and absence claims remain **[UNVERIFIED]**.

### Next up

- **Requisition-aware redeployment:** price a real internal move against a named opening (skills gap, ramp cost,
  retention), so the `redeploy` path stops being a binary availability flag.
- **The "what would it take" solver for the target:** given a fixed criteria set and floor, invert the headcount and
  ceiling to the smallest change in either that clears the screen — the question a leader actually asks after a failed
  screen.
- **A survivor-side second wave:** score the frozen survivor predictions as a survival curve after the horizon, and
  open one decision when observed attrition exceeds the modelled band.
- Carried from earlier sessions: crash-safe versioned outbox; recipient-side receipt for fidelity; decision-delay
  scenario with an auto board pack; deeper ONA for continuity risk.

## Session 74 — 2026-10-29: The Merit & Pay-Equity Terminal (Schema v51, ADR-0039, RULE-COMP-01..05, CSV #45)

### Why this was the high-leverage slice

Seventy-three sessions of this workspace answered questions about *work*: did the decision hold, did the delegation
return, did the metric move, was the intervention delivered. The biggest decision a first-time manager makes about
*people* had no surface at all. Every reviewed compensation product runs a cycle, stores bands and reports an
"adjusted vs unadjusted gap" (Lattice, Payscale, beqom, CompXL); none of them prices what the allocation is
**buying**, and none of them grades its own retention prediction afterwards. A merit spreadsheet produces a number
and a communication problem. This session turns the budget into a constrained decision problem with a printed
objective, a decomposition with an interval that matches the sample, and a model that scores itself.

### Audit, selection, and fresh benchmark

- `origin` verified as `https://github.com/shahramclaude/Leados.git` before any edit; branch
  `arena/27298d94-leados`. The legacy `src/**` tree stays quarantined and was not audited line by line.
- Audited the additive-migration and normalizer pattern, the post-commit spine and its contracts ledger, the typed
  link registry, `clearDemo`/redaction paths, the CSV scope registry, the Insights domain buckets, the JSDOM/axe
  harness and the existing `#/fidelity` page as the closest structural precedent.
- Fresh public material is recorded in `RESEARCH.md` §77: the 2026 vendor feature scan (Lattice, Payscale, beqom,
  CompXL, Comprehensive.io) and the small-sample critique of the four-fifths rule, including Watkins, McKenna &
  Chen (FAccT 2024) on the rule being an imperfect synecdoche for disparate-impact law.

### What shipped

- **Schema v51 / additive `50 → 51`:** `compBands` and `meritCycles`. No band, cycle or salary is invented for an
  existing workspace, and demo cleanup removes demo cycles and rows while **keeping a frozen audit** — a
  settlement is a record of a past decision, not a projection to be recomputed.
- **`app/core/domain/comp.js`:** band positioning (compa-ratio, range penetration), band integrity with a printed
  refusal to repair a broken range, relative-pay findings (inversion inside the reporting line, external-hire
  premium against the internal median at the same level), twofold Oaxaca–Blinder on log pay over level, tenure,
  last rating and an explicit rating-missing term, an adjusted-gap interval from the group coefficient's own
  standard error with a Cornish–Fisher t multiplier, the four-fifths screen over the *decision* with Wilson
  intervals and a reliability floor, a four-term printed retention hazard, a replacement-cost model weighted by
  the succession bench, three priced policies with regret, a frozen fairness snapshot, a Brier-scored
  calibration card, `MER-01..07` signals and a one-page brief.
- **`app/core/domain/compRules.js`:** `RULE-COMP-01` typed `compensates` provenance; `RULE-COMP-02` exactly one
  DACI **mechanism** decision plus one owned evidence task and one blameless preparation question when the audit
  is flagged — never an individual adjustment, because no individual adjustment repairs a distribution;
  `RULE-COMP-03` one owned relative-pay task per cycle (never one per pair) with `compares-pay-with` links;
  `RULE-COMP-04` one dated outcome review; `RULE-COMP-05` a resolved prediction on `person.archived`.
  Marker-idempotent, with `compAutoPropagate: false` pausing the automation while an explicit scan still runs.
- **`#/merit`:** cycle picker that lands on the cycle with work left in it, live budget meter, three policy cards
  with their consequences and regret, an editable allocation table (band position, departure risk, replacement
  exposure), fairness, retention, calibration and method panels, a settlement panel and two keyboard-operable
  dialogs.
- **CSV scope #45** and the `Merit & pay equity` Insights bucket: ratios, counts and grades under opaque cycle
  codes — no salary, no absolute pay figure, no name, no note, no cycle label.

### Defects the new suite found (and fixed)

| Defect | Why it mattered |
|---|---|
| `money(null)` returned `0` via `Number(null)` | "Pay not recorded" silently became a real zero in compa-ratios, budget arithmetic and the frozen audit. Missing pay now stays missing, and a cycle with a blank decision cannot be finalized. |
| Policy comparison used the last-applied proposal as its baseline | After applying a policy, every rival policy looked like it bought nothing. The baseline is always current pay. |
| Peer median recomputed inside each policy | Paying everyone moved the peer median, so each policy improved its own baseline — circular. The reference is the current cohort. |
| Percentile bootstrap on 8+8 people | A resample can empty a level cell; the interval then measured composition noise. Replaced with the group coefficient's standard error. |
| Page defaulted to the frozen cycle | A finalized cycle with a live draft sitting beside it made the module look like a report instead of a decision surface. |
| Finalization checked the budget before the blank rows | A blank proposal cannot be distinguished from an unchanged one when the budget refuses first; the guard order and the test now match the message. |

### Verification and limits

- `tests/app/merit-equity.test.mjs`: **15/15 pass** — additive migration, band refusal, action refusals, exact OLS
  inversion, constructed-gap decomposition with an interval that excludes zero, sample-floor refusals, the
  four-fifths screen at ratio 0, compression and external-premium detection, three policies inside budget with
  retention optimal, finalize guards plus an immutable freeze and reopen, one mechanism decision with one task,
  two delegations, typed links and idempotency, departure → resolved prediction → calibration withheld below five
  outcomes, CSV redaction, demo shape and cleanup, and a JSDOM page/tab/dialog run with zero axe violations.
- The version bump rippled through the suite: `SCHEMA_VERSION` 50 → 51 in 40 files, `'50 → 51'` appended to every
  migration chain, CSV scope count 44 → 45, and the typed-link focus map gained a `merit` route.
- Final gate: `npm test` **1,221 / 1,221 pass** across 77 suites, ESLint clean, canonical boundary 170 modules /
  77 suites / 0 leaks, 240 docs links across 146 files, `git diff --check` clean, `verify:standalone` **7 / 7** with a
  3,596,571-byte Schema v51 artifact.
- **Limits:** the retention coefficients are conventions, not fitted rates; the interval assumes the recorded
  controls are the job-relevant ones; no protected characteristic is stored, so the decomposition runs on hire
  origin or reporting line and cannot answer the question a compliance team would ask. No market-first or parity
  claim is made; competitor feature absence remains **[UNVERIFIED]**.

### Next up

1. A "what would it take" solver: the minimum budget that brings every compa-ratio above the floor without
   breaching the ceiling, priced against the retention optimum.
2. Band drift monitoring across cycles (has the distribution moved toward the ceiling year over year?).
3. Two-dimension decomposition (origin × reporting line) once a workspace has enough records to support it.

## Session 73 — 2026-10-29: The Implementation Fidelity Ledger (Schema v50, ADR-0038, RULE-FID-01..05, CSV #44)

### Why this was the high-leverage slice

Sessions 71–72 made LeadOS able to say *what automation ran* and *whether the outcome moved*. Neither statement is delivery. A leader could score a pre-registered study, read a support/contradict verdict, and never learn that the intervention had reached half the intended people at a third of the planned dose — or that their own account of it disagreed with their own records. Every reviewed people-management product measures **product adoption** and stops there: Lattice's own analytics page defines programme success as "engagement and utilization of Lattice". The missing construct is implementation fidelity, and without it a contradicted study is indistinguishable from an intervention that was never run.

### Audit, selection, and fresh benchmark

- Verified origin `https://github.com/shahramclaude/Leados.git`, branch `arena/a8740f19-leados`, clean tree at `04f6e10ada9805f46bff15704cfa514b29b76e68`. The legacy `src/**` tree remains quarantined and was not audited line by line.
- Audited the additive-migration and normalizer pattern, the typed-link registry and resolver, `clearDemo` and the redacted-export paths, the post-commit rule spine and its contracts ledger, `impactRules.js` (which already imports nothing from fidelity), the CSV scope registry, the Insights domain buckets and the JSDOM/axe harness.
- Fresh public material inspected on 2026-10-29 is recorded in `RESEARCH.md` §76: Lattice's Adoption Dashboards, the 2025 fidelity-framework scoping review, the 2025 systematic review of fidelity measurement (38% of 190 studies measured any component; quality of delivery in 13%), the 2026 Thrive fidelity study (week-1 dose 98.7% → week-4 78.8%), and the Bloom/LATE dilution identity.
- Frameworks applied: RE-AIM (reach/implementation/maintenance, with setting-level adoption deliberately unclaimed), Carroll et al. (adherence, dose, quality, adaptation), Bloom (1984)/LATE for the dilution correction, Wilson intervals for small-n calibration, and Goodhart/Campbell for the per-stage gaming routes.

### What shipped

- **Schema v50 / additive `49 → 50`:** a new `fidelityPlans` collection. No plan, attestation or settlement is inferred for an existing workspace — a denominator chosen after delivery measures the story, not the delivery.
- **`app/core/domain/fidelity.js`:** five stages with weights (reach .25, dose .30, quality .25, sustain .10, adaptation .10) and printed gaming routes; four record instruments bound to typed collections with an explicit standard (1:1 with notes, SBI-complete feedback, delegation with a dated check-in, key result that moved); multiplicative exposure rather than a weighted mean; coverage-gated grading (`insufficient` below 60% of the model's weight on record); agreement classification between the observed ratio and the attested verdict; Wilson intervals; the Bloom dilution correction with its assumptions named; a portfolio read model; `FID-01..05` signals; a one-page brief.
- **`app/core/domain/fidelityRules.js` on the existing spine:** `RULE-FID-01` typed `measures-delivery` links; `RULE-FID-02` disagreement prompt; `RULE-FID-03` one repair decision plus one owned delegation per materially under-delivered settlement; `RULE-FID-04` one task per plan for overdue checkpoints (never one per stage); `RULE-FID-05` frozen `implementationSnapshot` at Impact scoring. Marker-idempotent; `fidelityAutoPropagate: false` pauses automation while an explicit scan still runs.
- **The Impact intersection changes an existing decision.** `RULE-IMP-02` now reads measured exposure: a contradicted study that was materially under-delivered opens *repair delivery or stop on a weak test* with four different options, instead of a stop decision that would kill an idea the organisation never actually ran. The frozen snapshot carries ITT, per-complier estimate, inflated MDE and dilution factor — and `null`, never `0`, when the evaluation could not fit a counterfactual.
- **`#/fidelity`:** observed and attested columns side by side, staged attestation dialog, weakest-stage marking, settlement panel with the frozen reading, effect panel showing the dilution correction, calibration card (withheld below three verdicts), method card naming every constant, and a downloadable brief. Both dialogs are keyboard-operable and axe-clean.
- **Lifecycle and export:** demo cleanup removes demo plans, keeps declared plans and nulls dead pointers without rewriting a frozen settlement; CSV scope #44 exports derived ratios, stage labels and grades with no title, note, name or record ID; Insights gains an `Implementation fidelity` domain bucket.

### Competitive hunt converted into a ledger (2026-10-29)

| Finding | Disposition |
|---|---|
| Lattice Adoption Dashboards measure product utilisation and call it programme success | **Implemented as the contrast:** v50 measures practice delivery against a pre-declared denominator, and the README states the difference rather than claiming a feature war. |
| 2025 systematic review: only 38% of studies measure any fidelity component; quality of delivery in 13% | **Implemented:** coverage-gated grading refuses to score a plan with thin evidence, and the UI prints the coverage share instead of hiding it. |
| 2026 Thrive programme: dose decays from 98.7% in week 1 to 78.8% by week 4 | **Implemented:** a separate maintenance stage read over the final fortnight, plus a ≥80% "clearly met" agreement floor. |
| Bloom/LATE dilution: ITT ÷ compliance, MDE × 1/compliance, required N × 1/C² | **Implemented:** per-complier effect and inflated MDE frozen beside the ITT estimate; withheld below 10% exposure. |
| Participant receipt/enactment and programme differentiation (Carroll) | **Deliberately rejected for now:** a local workspace cannot observe the recipient's side without asking them, and inventing a proxy would be the fabrication this feature exists to prevent. Documented, not silently omitted. |
| Setting-level RE-AIM adoption (adopters ÷ eligible) | **Deliberately rejected:** the workspace does not know the eligible population it never recorded. Claiming it would be the same self-flattering metric the market already sells. |

### Verification and limits

- New suite `tests/app/implementation-fidelity.test.mjs`: **13/13 pass**, covering the additive migration, dangling-pointer cleanup, dated-record observation, multiplicative exposure, instrument refusal, contradiction-needs-a-reason, settle idempotency (one decision, one task), overdue-scan idempotency, the frozen study snapshot and dilation direction, the near-zero-exposure refusal, CSV redaction, demo cleanup, demo signals/brief, and a JSDOM page + both dialogs with zero axe violations.
- The version bump touched 47 test files mechanically (schema version, migration chains, CSV scope count); no assertion was weakened.
- Final `npm run verify:canonical`: ESLint clean, canonical boundary 166 app modules / 76 test suites / 0 leaks, docs links 231 across 145 files, **1,206/1,206 tests pass**. Final `npm run verify:standalone`: **7/7 pass**, distribution 3,479,413 bytes at Schema v50 with 165 bundled source modules.
- **Limits:** delivery is observed only through four typed record instruments; every other practice is human-attested and labelled unverifiable against records. Reach depends on a current roster. The thresholds are printed conventions, not settled science. The dilution correction assumes exclusion and monotonicity that a leader's own delivery does not guarantee. No effectiveness, causal, market-first or parity claim is made; competitor absence remains **[UNVERIFIED]**.

### Next 1–3 roadmap targets

1. **Recipient-side receipt, asked once and never inferred:** a single, anonymous, dated question per intervention window that measures whether the recipient noticed the practice — the one RE-AIM/Carroll construct v50 explicitly refuses to proxy.
2. **Adaptation ledger with a reason taxonomy:** turn the attested adaptation stage into structured entries (content, dose, timing, population) so cross-plan learning stops depending on prose.
3. **Crash-safe versioned outbox:** the local store is synchronous and transactional; a kill/restart test with explicit duplicate and retry policy is still missing, and every rule on the spine depends on it.

## Session 72 — 2026-10-29: Impact execution evidence on the existing event spine (Schema v49, ADR-0037, Impact CSV #32)

### Why this was the high-leverage slice

Session 71 made successful rule cascades inspectable. The next gap was the join between those committed local effects and the existing pre-registered Impact Ledger: leaders could score an outcome, but had no exact, typed source record to inspect against retained execution evidence. The highest-value extension is not another dashboard or rule; it is one immutable, auditable boundary between **what the product's automation recorded** and **what the outcome estimator concluded**.

### Audit, selection, and fresh benchmark

- Verified origin `https://github.com/shahramclaude/Leados.git` and stayed on `arena/c466db98-leados`. The pre-edit tree was clean; the canonical app was local-first `index.html` + `app/**`, Schema v48, with 1,184 canonical tests passing as a baseline. That is a pre-change baseline, not the result for this tree. The legacy `src/**` implementation was not audited line by line.
- Audited the Impact declaration/actions/normalizer/scoring path, shared typed-entity registry, success-lineage format/cap, store cleanup and redacted-export paths, CSV scope #32, impact rules and JSDOM accessibility harness. No architecture rewrite was indicated: the existing synchronous transactional store and generalized post-commit event spine could carry this narrow join.
- Fresh official-source competitor review is in `RESEARCH.md` §75. 15Five's October 2026 docs describe source-grounded Agents/Focus Briefs/AI-assisted reviews/Meeting Assistant; Lattice's June 2026 announcement positions AI Leverage Insights around AI usage, performance data, manager feedback and output signals. These are vendor statements and different evidence units. Current Lattice availability, parity, feature absence and comparative effectiveness remain **[UNVERIFIED]**; no uniqueness claim is made.
- Frameworks applied: Carroll-style implementation fidelity separated from outcome evaluation; pre-registration and interrupted-time-series safeguards retained as the outcome model; atomicity/idempotency patterns considered without claiming a distributed outbox; missingness under bounded observation treated as unknown rather than zero; and data minimization / Goodhart guardrails prevent process counts becoming people scores.

### What shipped

- **Schema v49 / additive `48 → 49`:** existing Impact results are preserved; historical `executionSnapshot` starts `null`. No old successful path is reconstructed.
- **Typed source picker + command validation:** the declaration form lists current records from the shared collection registry for supported intervention types. Actions reject cross-type or missing IDs. Free-text labels remain labels, never match keys.
- **Scoring-time snapshot:** `app/core/domain/impactExecution.js` matches exact typed root/step events from the declared start date through the scoring timestamp. It freezes bounded counts, ledger capacity/truncation state and up to 12 local trace IDs in the same store transaction as the score. It does not count a target/link alone or copy titles, hypotheses, notes, payloads or outcomes.
- **Candid result UI:** the study card links the selected source and retained trace(s), distinguishes observed/no-match/missing-source/no-record/cleared/legacy-not-recorded states, and states that a match is not delivery, exposure, fidelity, adoption, quality, effectiveness or causality. A zero match is not evidence that no work happened.
- **Real cross-module path:** the regression invokes the production `addCase()` action and shared rule chain, verifies its decision and delegation effects, selects that case as an Impact source, scores through `lockImpactStudy()`, and verifies the reverse RULE-IMP-01 `evaluates` edge. The scoring event itself is captured before post-commit automation, preventing a self-referential snapshot.
- **Lifecycle/export:** demo cleanup clears removed source pointers but keeps frozen counts and scrubs lineage references; redacted exports drop navigation IDs when the referenced lineage row is omitted. Impact CSV scope #32 adds bounded status/count columns only—no source IDs, trace IDs, labels, titles, hypotheses or free text.
- **Distribution and docs:** added ADR-0037, §75 research, README/roadmap/session-log/index metadata and the current architecture/state notes; rebuilt the tracked single-file offline distribution from the canonical app.

### Verification and limits

- Focused v49 suite: **9/9 passed**, including migration/normalization, typed action validation, exact date/type matching, cap behavior, redacted export, demo cleanup, CSV privacy and a JSDOM/axe declaration + score-view flow.
- Impact regression suite: **56/56 passed** after the UI and schema edits.
- Final `npm run verify:canonical`: ESLint clean; canonical boundary **161 app modules / 75 test suites / 0 leaks**; docs-link check **221 internal links across 144 Markdown files**, all resolving; **1,193/1,193 tests passed** (12m 11s).
- Final `npm run verify:standalone`: **7/7 passed**; rebuilt standalone distribution **3,399,912 bytes**, Schema v49, with 160 bundled source modules.
- **Repository sync:** commit `3fe8df8f0724d98d5fc3d2f9720482f7b9868bd4` was pushed to `origin/arena/c466db98-leados`. PR [#82](https://github.com/shahramclaude/Leados/pull/82) was created against `main` and verified OPEN; its head matched that pushed commit and GitHub reported `CLEAN` when inspected. The log update recording this result is a follow-up on the same PR branch.
- The new metric is successful LeadOS rule propagation, not full implementation fidelity. It misses work outside LeadOS, work that triggers no rule, and expired lineage; the outcome model still has its own confounding/exposure limits. Current vendor parity, real-browser assistive-technology behavior and legacy `src/**` remain **[UNVERIFIED]**.

### Next 1–3 roadmap targets

1. **Prospective implementation milestones:** distinguish intended, delivered and verified stages for chosen intervention types using dated, human-owned evidence; do not promote generic rule traces to delivery/fidelity claims.
2. **Crash-safe versioned outbox:** explicit duplicate/retry/idempotency policy and kill/restart tests on the local store path, with human gates unchanged. Distributed outbox/Temporal semantics are a benchmark, not current behavior.
3. **Leader-controlled retention/purge:** expose the bounded lineage horizon and the consequences for snapshots, JSON/redacted exports and historical completeness.

## Session 71 — 2026-10-29: Typed propagation provenance across modules (Schema v48, ADR-0036, CSV #43)

### Why this was the high-leverage choice

The obvious next move was another capability inside an existing terminal. The larger product gap was that LeadOS could already execute deterministic, event-driven work across modules, but a successful cascade disappeared into transient metrics. A leader could see the resulting records without a durable, content-minimal account of which event and rule actually connected them. Typed links also needed to land on and select the exact destination record—not just open a module. This increment closes that loop on the existing architecture rather than rebuilding it.

### Repository audit and selection

- Verified the configured origin as `https://github.com/shahramclaude/Leados.git`, active branch `arena/51bb6309-leados`, and a clean working tree before edits. The baseline HEAD matched the then-verified `origin/main` commit `324319864539164ba823ce2aba1ec9f38784f34c`.
- Audited the canonical schema/migrations, typed-link registry and resolver, post-commit queue/savepoints, store cleanup/export paths, scorecard rule, destination views, existing tests and current verification scripts. The legacy `src/**` tree was not treated as current product architecture and was not line-by-line audited.
- The scorecard commit was the best end-to-end demonstration: it already triggers real rules across decisions, delegations, people/coaching and typed links. Adding a trace at the shared rule boundary creates value across the app instead of a one-off history panel.
- The audit also found that long IDs could be truncated into dangling references, retired scorecards lacked verified deep-link visibility, and a committed-observation view path referenced the wrong variable. Those integrity/route defects were corrected and covered.

### Fresh research and competitive/ambition benchmark

Fresh public-source inspection on 2026-10-29 is documented in `RESEARCH.md` §74 and informed [ADR-0036](docs/adr/0036-bounded-propagation-lineage-and-typed-links.md):

- OpenTelemetry's typed, parented span context and OpenLineage's identified run/job/dataset model are useful **architecture patterns** for explicit provenance.
- Temporal and LangGraph set a higher bar for durable/recoverable workflows, human oversight and execution-path inspection. LeadOS does not implement process-restart replay, distributed workers or agent checkpoints; that is a clearly recorded gap, not a parity claim.
- OPA and Evidently informed the choice to keep privacy policy explicit and to separate an execution receipt from outcome evaluation. Netflix Dispatch is excluded as an active comparison because its repository announces archival in 2025.
- These sources are adjacent infrastructure/domain references, not direct management-suite competitors. This session did **not** re-run direct vendor feature-parity research and makes no market-first or competitor-absence claim.

### What shipped

- **Schema v48 / additive `47 → 48`:** `propagationLineage` starts empty. No historic success is guessed from audit entries or records.
- **Shared success trace:** the existing post-commit engine appends one local transaction only when a traceable source event actually commits a rule effect (a workspace change or emitted event). Steps retain rule/event types, parent/depth, changed collection names, typed record IDs, new typed edges and emitted event types—not titles, notes, score values or record bodies. Existing failure receipts remain separate.
- **Hard bounds:** 250 recent transactions; 32 steps per transaction; 48 changed targets, new links and emitted events per transaction. Overlong IDs are rejected rather than truncated; invalid/self-parenting steps are not accepted; truncation is disclosed.
- **Navigable typed links:** resolver-generated paths encode IDs and destination views focus the linked record. All registered link types are schema/resolver tested; route-to-view coverage checks representative modules and retired scorecards. Opening a route does not change the linked append-only record.
- **Real cascade:** scorecard commit now has typed `informs` provenance to the decision/action records produced by the existing `RULE-MTX` flow. The `#/propagation?tab=lineage` surface exposes rule-to-record provenance through the same resolver.
- **Privacy/lifecycle:** conflicts and anonymous pulses remain excluded; `clearDemo` scrubs references to removed records without deleting surviving trace history; redacted export omits candidate-linked transactions; CSV scope #43 exports counts and types only. Full local JSON backups preserve the bounded ledger. IDs are still data and are not claimed to be anonymous.
- **Documentation:** added ADR-0036 and §74; refreshed README, index metadata, roadmap, session log, current architecture and program-state docs. Corrected the obsolete Next.js `LEADOS-STATE.md` and the contradictory legacy architecture assertions rather than carrying them forward as current.

### Deliberately rejected / limits

- No full snapshots, event payloads, titles, notes or scorecard inputs in lineage.
- No inference/backfill of pre-v48 successful history; no replay, compensation or claim of causal effectiveness.
- No OpenTelemetry/Temporal/OPA service or runtime dependency; the canonical app remains local-first and zero-build.
- The ledger is bounded and partial: no-ops are not successes, failures use receipts, and older transactions/details may be omitted at the cap. IDs remain in local workspace JSON. Direct competitor parity, real-browser assistive-technology behavior and the legacy implementation remain **[UNVERIFIED]**.

### Verification

- **Focused:** 80/80 tests passed across typed-link navigation, lineage, comms, forecast integrity and measurement; source/test syntax checks passed.
- **Full canonical, repeated after all final code and documentation edits:** 1,184/1,184 tests passed; ESLint clean; canonical boundary verified 160 app modules / 74 test suites with 0 leaks; documentation links verified **211 links across 143 Markdown files**.
- **Standalone:** `npm run verify:standalone` passed **7/7**; regenerated one-file artifact is **3,383,594 bytes**, Schema v48, 159 source modules. It is a generated distribution tracked by the repository, not a hand-maintained second implementation.
- Commits `2ad2ecb` (code/docs) and `8013286` (standalone build metadata) were pushed only to `arena/51bb6309-leados`. [PR #81](https://github.com/shahramclaude/Leados/pull/81) is confirmed **OPEN** against `main`.

### Next 1–3 ambitious roadmap bets

1. **Crash-safe, versioned rule outbox:** explicit retry/deduplication and restart/kill tests, with idempotency and human-approval gates intact.
2. **Decision-to-outcome provenance:** connect typed execution receipts to pre-registered impact evidence while keeping association distinct from causal claims.
3. **Leader-controlled lineage retention/purge:** make local trace retention and the resulting loss of references visible across JSON and redacted exports.

## Session 70 — 2026-10-29: The Scorecard Integrity Lab (Schema v47, ADR-0035, `RULE-MTX-01..02`)

**Selected over the safe/easy option:** the obvious next increment was the Session 69 backlog
items (cross-window deputy rotation, calendar compression). Those are refinements of a module
that already works. The product's larger hole is that it had no opinion on the one instrument a
leader touches every week and almost always gets wrong: the measure itself. A goals dashboard
reports progress faithfully while the metric quietly pulls effort out of the work. This session
models the incentive, prices the distortion in team hours, searches for a better design and
then makes the model falsifiable.

**Competitive hunt & gap analysis (2026-10-29, public material inspected)**

- **Lattice / 15Five / Culture Amp-style suites** publish AI review drafting, 1:1 prep and
  attrition/succession signals. None of the reviewed public material models the *distorting*
  effect of the metric on the person being measured.
- **Scion (AI succession, scionhr.com)** publishes departure-cascade modelling, span-of-control
  benchmarking and readiness scoring. It models who leaves and who replaces them; it does not
  model what the scorecard makes a stayer do.
- **Agentnoon / ChartHop / Visier-style org planning** model headcount, cost and structure
  scenarios. Measurement design is represented as a library of KPI definitions, not as a game
  between a measure and an agent.
- **Decision-analysis practice (EVPI / EVSI; decision-tree and health-economics tooling)** computes
  the value of information for a single decision. That framing is used inside LeadOS Decision
  Tempo already; it is not a management scorecard design tool.
- **Consulting and practitioner guidance on Goodhart/Campbell** (widely published 2025–2026,
  including AI-evaluation "specification gaming" literature) is checklists and prose: brainstorm
  loopholes, add guardrails, alternate metrics. No reviewed public tool *simulates the equilibrium*
  and ranks redesigns by modelled net value with an explicit measurement cost.
- This is a statement about public material, not proof of competitor absence. Capability claims
  remain **[UNVERIFIED]**.

**What shipped**

- `app/core/domain/measurement.js`: the closed-form multi-task equilibrium (Holmström–Milgrom
  1991; Baker 1992; Banker–Datar 1989 LEN risk; Weitzman 1980 ratchet; Kerr 1975/Campbell 1979
  stakes), a per-metric Goodhart profile, seven deterministic redesign designs, a ranked frontier
  net of a declared measurement cost, a frozen prediction with a falsifier margin, an
  observation scorer that refuses to claim calibration below n = 3, six read-side signals
  (`MTX-01..06`) and a deterministic brief.
- `app/core/domain/measurementRule.js`: `RULE-MTX-01` (commit → one DACI redesign decision,
  ≤2 owned tasks, ≤1 blameless question, typed links) and `RULE-MTX-02` (falsified observation →
  one calibration decision + one pre-filled review). A sound card creates nothing.
- Schema v47: `scorecards` collection, `measurementMetricCostPct` (0–25, clamped) and
  `measurementAutoPropagate`; additive `46 → 47` migration that fabricates no history.
- Actions: declare, edit (drafts only), commit (stale design key and stale revision refused,
  pause switch honoured), record one observation per commit, close the cycle, retire, fork a
  design, bound the policy.
- `#/measurement`: the model and its assumptions printed next to the numbers, the per-task effort
  split, the distortion table, the redesign frontier, the frozen prediction, the observation
  flow, the calibration ledger, and a deliberate declaration form with keyboard-operable rows.
- Insights domain `Scorecard integrity`; CSV scope #42 with opaque scorecard codes and no task
  names, objective text, observation notes or person identifiers; a demo scorecard frozen through
  the same engine the commit action uses.

**Measured on the demo workspace (2026-10-29, 32 declared hours/week):** modelled genuine value
34.3% of first-best, cosmetic share 75.7% of measured effort, Goodhart index 51.9/100, worst
metric "Tickets closed per week" at 66.7. The search recommends the composite redesign
(+23.4 net value points → 69.2% genuine value, 32.1% cosmetic). In hours: ≈21h/week buy behaviour
the scorecard does not reward, ≈11.2h/week recoverable by that design.

**Two defects found by the new tests and fixed before commit**

1. The first implementation divided an already-scaled value index by 100, reporting every
   efficiency as a fraction of a percent (0.3% instead of 27.7%). The value unit is now stated
   once and pinned by a conservation test.
2. With no uncounted task declared, the uncounted-work floor evaporated and 20% of the effort
   budget vanished. Effort is now conserved in both cases, with a test that sums the shares.

**A third defect was found by writing the tests, not by running them:** the attention list was
gated on the Goodhart index alone, so a card the page labelled *distorted* could be absent from
"what needs a decision". Attention now follows the same badge the page renders.

**Deliberately rejected**

- Person-level gaming scores or surveillance of any kind: the model never reads a message,
  calendar or trace, and `recordScorecardObservation` is a human estimate by construction.
- Automatically applying the recommended redesign. The lab forks a draft; a human commits it,
  and the previous prediction stays scorable.
- Treating the modelled efficiency as a measurement. Every surface says "model under your
  declared parameters"; the calibration ledger is the only tested number and it prints its
  sample size.
- Blending the risk premium into the value figure. It is printed separately because it is a
  price, not a composition change.

**Verified:** 27 new tests in `tests/app/measurement.test.mjs`; full-suite result recorded in
`AI-SESSION-LOG.md`; lint, canonical boundary, docs-link check and standalone rebuild all green.

**Next (ranked)**

1. **Score the lab against reality at portfolio scale.** The calibration ledger currently needs
   three committed-and-observed cards. Add a rolling error report and a "declared parameters vs
   observed outcomes" drift chart rather than a single mean absolute error.
2. **Multi-metric gaming interaction.** The model treats each metric's gaming independently; in
   reality agents reallocate across metrics (a guardrail on one moves pressure to another). Add
   a circulation matrix and report the displacement, not just the direct effect.
3. **Link the lab to compensation and review cycles** that LeadOS already records (recognition,
   reviews, budget lines) so a declared stakes percentage is derived from those records rather
   than typed in — with the same refusal to claim causation.

## 2026-10-29 — evidence before status

- **Implemented:** case mitigation AND gate, both link directions, missing-work preservation across reload, visible readiness, reviewed/audited removal and event-driven re-evaluation. A finished delegation cannot silently hide another missing or returned mitigation. Monitoring does not certify effectiveness.
- **Planned (high leverage):** propagate a reversible status-change warning when a new or returned mitigation invalidates an already-monitoring case, with explicit human review and no automatic claim that a safety barrier failed; generalize integrity handling across other graph types without exposing confidential records.
- **Planned:** evidence-grounded succession/cover rotation linked to actual completed practice, with consent and fairness safeguards (Gloat's published agent use cases); cross-domain scenario comparisons that reconcile costs, skills and capacity without pretending local data are a live HRIS (Visier).
- **Planned:** provenance-scoped, consent-aware 360 feedback workflows and aggregate-only pulse insight (Qualtrics); compare Perdoo's 2026 goal-briefing workflow with the current local-only strategy ledger.
- **Rejected:** automatic people-level attrition scoring and silent AI writeback — insufficient evidence, privacy safeguards and external integrations. A simple status dashboard without a repair path was also rejected; the evidence gate changes a real operational loop.
- **Gap:** existing rules are generalized on an event spine but not every module participates automatically; case update and delegation completion still include direct orchestration. Whole-repository behaviour, real browser keyboard/screen-reader use and historical accuracy remain [UNVERIFIED].


## 2026-10-29 — Connected decision integrity

- **Implemented:** surface unresolved case links, use typed audit provenance, and allow eligible case decision/mitigation rules to recover from missing target records. Retain old edges rather than deleting evidence.
- **Planned:** durable, typed provenance for each rule emission, including source event and target record, with privacy-preserving trace inspection across the whole cascade.
- **Planned:** explicit cross-module graph integrity checks for all entity types and safe human-reviewed repairs, including unsupported schema types and imported records.
- **Planned:** assumption-based scenario comparisons with decision thresholds and prospective validation, not claims of causal identification.
- **Rejected:** silently deleting broken edges or regenerating every downstream artifact: this could destroy evidence or duplicate completed work.

# ROADMAP

## Session 69 — 2026-10-28: Hand-over Execution Verification, Causal Mechanism Attribution & Cross-Team Vendor Contagion ([ADR-0034](./docs/adr/0034-handover-execution-mechanism-attribution-and-vendor-contagion.md), `RULE-LCS-04`, `LCS-06..07`)

**Selected over the safe/easy option:** Session 68b left two explicit gaps ranked #1 and #2 in the
backlog: (1) grading hand-over *implementation* separately from stall prediction so a cover
delegation ticked `done` on paper is not confused with advancing the covered obligations, and
(2) removing the single-shock / single-team ceiling so two simultaneous shocks and a cross-team
vendor/service outage (`state.dependencies`) pulling primary and backup stewards into recovery at
once are modelled and connected. Rather than building an isolated cosmetic view, we implemented
both ranked gaps plus **RULE-LCS-04** on the generalized post-commit spine (`delegation.returned`,
`continuity.drill.closed`, `continuity.scan`).

**Competitive hunt & gap analysis (2026-10-28)**

- **Netflix Dispatch (`Netflix/dispatch`, 6,483 stars, Apache-2.0)** — incident command and role
  handover orchestration; tracks role reassignment and follow-ups, but treats handover as a ticket
  assignment without grading whether the underlying obligations moved inside the window.
- **Target GoAlert (`target/goalert`, 2,857 stars, Apache-2.0)** — on-call scheduling, temporary
  schedule overrides, and multi-step escalation policies; assumes independent responders on a
  rotation without modelling shared vendor/service outages that pull responders across teams
  simultaneously.
- **Backstage (`backstage/backstage`, 34,734 stars, Apache-2.0)** — service/resource catalog graph
  (`dependsOn`, `ownedBy`); models static ownership edges without simulating correlated human +
  technical dependency failure during a leadership absence.
- **PyWhy DoWhy (`py-why/dowhy`, 8,378 stars, MIT)** — graphical causal inference and counterfactual
  mechanism attribution; separates treatment assignment from realized mechanism execution and
  requires explicit refutation/falsification checks.

**What shipped**

- **`gradeCoveredSourceProgress` & `handoverImplementation` (`app/core/domain/leaderContinuity.js`)**:
  grades commissioned hand-overs across three separate dimensions — pre-window briefing
  (`briefed`), delegation execution state (`completed-verified`, `paper-only`, `active-executing`,
  `blocked`, `returned`, `unexecuted`), and dated progress on the underlying covered source
  records (`sourcesMoved / sourcesTotal` across `decision`, `case`, `delegation`, `stakeholder`,
  `goal`, `person`).
- **Causal mechanism attribution (`attributeDrillOutcomes`, enhanced `scoreDrillRecord` & `drillCalibration`)**:
  decomposes closed-drill predictions into `model-miss` (`modelMissKeys`), `implementation-drop`
  (`implementationDropKeys`), `predicted-stall` (`predictedStallKeys`), `unmodelled-resilience`
  (`unmodelledResilienceKeys`), and `clean-cover` (`cleanCoverKeys`), alongside
  `executionConditionedBrier` and `executionConditionedSkill` (Imbens & Angrist 1994 ITT vs. TOT;
  DoWhy mechanism attribution).
- **Multi-shock & cross-team vendor common-mode contagion (`vendorCommonModeContagion`)**:
  traces active dependencies in `state.dependencies` and their downstream blast radius (Simchi-Levi
  `effectiveTTR > ttsDays`), identifies primary and backup stewards in the deputy pool pulled into
  incident recovery across team boundaries, models a second simultaneous shock
  (`continuitySecondShockPct`, default 10%) plus prorated window outage probabilities (or stress
  override `vendorShockPct`), and lists active dependencies missing `annualFailureProb` or
  `ttrDays` in `unmodeledDependencies` rather than treating them as 0% risk.
- **Generalized post-commit rule `RULE-LCS-04` (`app/core/domain/leaderContinuityRule.js`)**:
  - On `delegation.returned`: when a continuity cover delegation is returned, automatically
    re-allocates the covered obligations to the highest-fit remaining deputy at the 75% fallback
    fit convention (`supersededByDelegationId`, `priorDelegationId`, typed links, and a blameless
    1:1 briefing prompt) or opens one DACI cover-gap decision (`[LCS-RETURN:...]`) when no deputy
    clears the floor. Fast-exits with zero savepoint clones on non-continuity delegation returns.
  - On `continuity.drill.closed` / `continuity.scan`: when a commissioned hand-over drops
    implementation (`implementationDropKeys.length > 0`, `paperOnly > 0`, or unrecovered returns),
    drafts one pre-filled After-Action Review (`retros`) separating implementation drops from
    model misses and opens one owned ritual-fix delegation (`[LCS-EXEC:...]`).
- **Signals `LCS-06` & `LCS-07`, `#/handover` UI cards (`handover-vendor-contagion`,
  `handover-implementation`, mechanism attribution in `handover-drill`), and CSV scope #41**:
  opaque mechanism attribution columns (`outcome_mechanism`, `model_misses`,
  `implementation_drops`, `execution_conditioned_brier`) with zero free-text leakage.

**Verified:** 1,140 tests / 69 suites (4 new Session 69 tests in `tests/app/leader-continuity.test.mjs`),
119 automation rules (`AUTOMATION_RULES`), lint, canonical boundary, docs links, standalone build.

**Deliberately rejected:**
- Treating `delegation.status === 'done'` as proof of hand-over execution — rejected because a
  cover task can be closed on paper while 0 linked source obligations moved.
- Replacing unconditional Brier score with execution-conditioned Brier — rejected because hiding
  dropped batons from the headline score would let teams game forecast calibration by not executing
  hand-overs; both are printed side by side.
- Inventing default failure probabilities (e.g. 5%/year) for dependencies missing
  `annualFailureProb` — rejected as silent data fabrication; surfaced in `unmodeledDependencies`.
- PagerDuty/Opsgenie webhook ingestion or Slack bot polling — rejected to preserve LeadOS's
  zero-network, local-first, surveillance-free architecture.

**Next (ranked)**

1. Cross-window longitudinal deputy rotation & succession readiness: track whether the same
   single-point deputy (`coverConcentration.criticalSinglePoint`) is nominated across consecutive
   commissioned hand-overs and link recurring single-point cover to `#/people` growth plans.
2. Counterfactual pre-departure calendar compression: simulate pulling movable critical decisions
   and reviews ahead of `windowStart` and price the cognitive-load spike on `#/load` in the week
   before departure.
3. Real-browser and screen-reader validation of `#/handover` at desktop and mobile widths.

## Session 68b — 2026-10-28: Correlated absence & briefing readiness (Schema v46, ADR-0033)

**Selected over the safe/easy option:** Session 68 shipped an absence model whose exact
distribution assumed independent items. The easy move was to leave that as a documented caveat
and add a new panel elsewhere. Instead the assumption was removed and then *measured*: on the
demo's own records independence understates P90 by 31.6% (19 → 25 stalls). Removing it exposed
two defects that a caveat would have preserved — a coverage formula in which an absent deputy
increased coverage, and a self-cover rule that let a person hold contact with themselves.

**What shipped**

- `simulateCorrelatedAbsence`: one shared cause per window takes one recorded team offline
  together (adjustable 0–100%, default 25%), individual deputy absence at 8% per 14 days
  compounded, and fallback to the next eligible deputy at 75% of recorded fit. Coverage is
  `fit × P(at their desk)`.
- Both models reported side by side with the measured lift; never blended. The exact independent
  distribution stays because it is exact and it is what drills score against.
- Degenerate clusters are reported as findings: `cluster.singleTeamPool` with a rendered label
  when the whole deputy pool is one team or no team is recorded.
- `coverConcentration`: eligible-pool concentration per item; self-cover refused; relationship
  credit requires a typed `stakeholder → person` link.
- `stressAbsence`: zero-write, deep-linkable (`?stress=`), up to three deputies removed.
- `handoverReadiness` + `LCS-05`: acknowledgement is a recorded check-in or completion; inside
  seven days an unbriefed cover delegation is a severity-4 signal; readiness falls back to the
  newest commissioned hand-over.
- Schema v46 additive migration, `continuityCommonCausePct` clamped 0–100; existing drill records
  are not rescored or re-frozen.

**Demo state, actually measured (2026-10-28, 14-day window, after the self-cover fix):** 25
obligations, 13 critical, 1 critical and non-delegable, 2 of 13 priced; exact expected stalls
16.88 (P50 17 / P80 18 / P90 19); correlated stress mean 19.07, P50 18, P80 25, P90 25 with 25.2%
of windows carrying a shared shock; modelled coverage 37.4%; exact cover of two actions in 95
minutes reaching 20/43 criticality weight (46.5%); 7 critical items with no eligible deputy; 1
critical item with exactly one; USD expected 17,540 · ES-90 46,000 independent versus 25,301
correlated. Verdict: *Thin cover*.

**Verified:** 1,136 tests / 69 suites, lint, boundary, docs links, diff check, standalone.

**Deliberately rejected:** replacing the exact model with the Monte Carlo; one blended resilience
score; an arbitrary "N deputies offline" mechanism instead of a reported cluster finding; counting
a queued talking point as acknowledgement; retro-scoring existing drills under the new model.

**Next (ranked)**

1. Grade hand-over *implementation* separately from stall prediction: did each cover delegation
   close any work before the window opened?
2. Two simultaneous shocks and a single vendor failing under two teams — the remaining stated gap
   in the correlated model.
3. Real-browser and screen-reader validation of `#/handover` at desktop and mobile widths.

## Session 68 — 2026-10-28: Leader Continuity Drill (Schema v45, ADR-0032, RULE-LCS-01..03)

**Selected over the safe/easy option:** adding another generic "wellbeing" or "burnout" panel
would be easy, unverifiable and, for a first-time leader, unactionable. This session models the
one seat that the product had never modelled — the manager's own — and makes the answer
falsifiable. The bolder claim being tested is that a leadership tool should be able to say
*"if you are away for these fourteen days, these six critical obligations have no cover, this is
what the stall costs, this is the minimum hand-over, and here is how wrong my last forecast was"*
without a calendar integration.

**What shipped**

- `#/handover` — Leader Continuity Drill. Demand inventory derived from dated records with a
  printed criticality basis and three delegability states (`delegable` / `shared` / `held`).
- Exact Poisson-binomial stall count (mean, P50/P80/P90, P(none)) and a seeded Monte Carlo
  currency tail (expected, P90, coherent ES-90), never summing currencies, never valuing
  unpriced critical work.
- Exact branch-and-bound minimum set cover over deputy × stall-class bundles with a disclosed
  node cap and a labelled greedy fallback; coverage measured over every critical item's weight.
- `RULE-LCS-01` transactional commissioning: one four-option DACI decision, up to four owned
  delegations with explicit authority, typed links to covered records, ≤1 blameless 1:1 prompt
  per deputy; stale-preview refusal and window-level idempotency.
- Drill ledger: frozen predictions, observation scoring (Brier, skill, precision, recall,
  coverage, Wilson interval), counts-only floors, `RULE-LCS-02` rebase decision on negative
  skill, `RULE-LCS-03` structural decision when convention blocks cover.
- Settings with clamps and a pause switch, LCS-01..04 signals, a deterministic brief, a Today
  badge, CSV scope #41 (opaque codes only), and Schema v45's additive `44 → 45` migration.

**Demo state, actually measured (2026-10-28, 14-day window):** 25 obligations, 13 critical, 1
critical and non-delegable, 2 of 13 priced; exact expected stalls 15.66 (P50 16 / P80 17 / P90
18); modelled coverage 37.4%; exact cover of three actions in 115 minutes reaching 23/43
criticality weight (53.5%); 6 critical items left uncovered; USD expected 17,540, P90 and ES-90
46,000 over the priced subset. Verdict: *Thin cover*.

**Verified:** 1,131 tests / 69 suites (10 new), lint, canonical boundary, docs links, diff
check, offline standalone rebuild.

**Deliberately rejected:** calendar/mailbox/presence capture; one aggregate "resilience score";
an LLM-written handover narrative; trusting stored scores instead of re-deriving them; seeding
demo drills so the ledger looks calibrated.

**Next (ranked)**

1. Correlated absence mode: two deputies away in the same week, and one dependency failing under
   both — the independence assumption is the model's largest honest weakness.
2. Grade the *implementation* of a commissioned hand-over (did the deputy's delegations close
   before the absence?), keeping it distinct from stall prediction.
3. Real-browser and screen-reader validation of `#/handover` at desktop and mobile widths.

## Session 65 — 2026-10-28: Constrained-effect robust decisions

**Selected over the safe/easy option:** a new terminal or a probabilistic simulation would
add surface area without fixing the prior model's strongest simplification: the same loss
applied to both plans and independently varying event rates can describe physically
impossible combinations. Extend the already-live decision and evidence-gathering path with
explicit intervention effects and exact feasible sets; keep the original model as the
backward-compatible default.

**Implemented:** Advanced mode lets a leader bound current-minus-proposed event-probability
reduction and proposed-minus-current conditional-loss change. A bounded 2-D half-plane
vertex solver clips each user-defined box, enforces nonnegative proposed severity, and
computes exact savings, Savage minimax regret, dominance, information and investment bounds
at feasible vertex products—no Monte Carlo cell shares or invented likelihoods. A constrained
severity change suppresses the old scalar loss break-even because it is no longer well-defined.
Probability-effect and severity-effect sets are still combined independently; cross-dependence
between them is not modeled. The frontier includes feasible points and exact vertices only. Human commissioning still
uses `RULE-ROB-01` and fans the captured bounds into DACI decision, owned verification,
blameless coaching, typed links and derived Decision Tempo in the same transaction. Existing
basic replay keys are preserved; advanced effects have a versioned distinct key. No schema,
export-scope, dependency or network change.

**Fresh competitive evidence:** Lattice's July 2026 product update says its AI Agent drafts
performance reviews from existing 1:1, feedback, goal and update evidence and reports an
early-customer speed result; a vendor-stated metric, not an independent trial. Gartner's
January 2026 category description of decision-intelligence platforms explicitly includes
simulation, optimization and monitoring outcomes. The product response is not another prose
co-pilot: make an operational recommendation robust to user-declared linked effects, exact
about infeasible combinations, and create an owned falsification task. Full category-by-category
capability comparison and all outcome claims remain [UNVERIFIED]. Source notes in `RESEARCH.md`.

**Deliberately rejected:** simulated employee personas as causal financial proof; using an
assumed prior/Monte Carlo to paint confidence; suppressing the basic model; and a single
break-even-loss figure under changing severity. No market-first claim.

**Proof:** targeted mitigation suite **22/22**; full canonical suite **1,114/1,114**;
ESLint clean; boundary **151 modules / 67 suites / zero leaks**; documentation links
**155 across 135 Markdown files**, all resolve; standalone **3,075,555 bytes / 150 source
modules / schema v43**, **7/7** tests. Eighty constrained boxes were checked against 80,000
candidate random draws, with feasible draws tested against the exact bounds. Real graphical
browser rendering, rendered contrast, spoken accessibility and field outcomes remain
[UNVERIFIED]. Repository push succeeded on `arena/c7ad0491-leados`; details are in
`AI-SESSION-LOG.md`.

**Next (ranked):** (1) immutable numeric evidence vintages + prospective denominator-aware
outcome scoring; (2) real durable compare-and-swap across tabs/encrypted writes before any
rehearsal adoption; (3) constraint-aware scenario extension to delay cost and conditional
severity only after an explicit, reviewable evidence model exists.

Living document. Status is per capability, not per file. Every "Done" line was verified
by an automated test or a measured run in the session that claimed it; anything else is
marked `[UNVERIFIED]` and is not counted as done.

## 2026-10-28 — Mitigation Robustness & Evidence Gate (ADR-0029)

**Selected over the safe option:** another terminal or another fixed-scenario financial
score would leave the decisive probability assumption untested. Extend the real case
rehearsal journey with exact robust analysis and owned evidence acquisition. Do not
adopt live mitigation snapshots while cross-tab storage races remain unresolved.

**Implemented:** independent event-probability intervals, shared horizon, exact eight-corner
continuous loss extrema, Savage minimax regret, dominance/evidence-sensitive classification,
break-even loss/investment thresholds, a model-only perfect-information ceiling (not EVSI),
a 5×5 illustrative frontier, and narrative-free export. Explicit commissioning invokes
`RULE-ROB-01` on the generalized spine: case → DACI decision + verification delegation +
blameless coaching, with typed graph links and automatic derived Decision Tempo delivery.
Existing queues are never evicted; pauses, stale local revisions and invalid owners block
commissioning. Same numeric basis/owner is idempotent after reload. No new schema/export
scope/dependency or direct communication. Decisions capture numbers but remain editable.

**New competitive evidence:** fetched Frappe HR's goal/KRA/appraisal workflow, LangGraph's
stateful durable/human-in-loop orchestration, Trigger.dev's waits/idempotency, Worklytics'
pseudonymization proxy description, and TinyTroupe's experimental business-persona simulation
and empirical-validator release note from public GitHub sources. Translate them into explicit
human gating, an idempotent numeric evidence envelope, and owned verification—not simulated
people presented as causal financial truth. Full vendor comparison remains [UNVERIFIED].
See the dated research entry; no unsupported market-first claim is made.

**New planned, ambitious next steps:**
1. **Constraint-aware robust decisions:** declared dependence constraints and conditional
   loss changing under mitigation; exact feasible-set bounds instead of a rectangular box.
2. **Prospective evidence-to-outcome scoring:** immutable numerical vintages, common horizon,
   exposure denominators and interventions linked to case settlements; abstain until data
   adequacy supports a persistence/reference-class comparison. Never equate task completion
   with effectiveness.
3. **Durable cross-tab safe adoption:** transactional storage and conflict resolution for
   plain/encrypted workspaces, then optimistic preview adoption with actual durable-write
   confirmation. Current local revision guards are not a substitute.

**Deliberately rejected:** FMEA/10 as a probability for this new analysis; cell-count
percentages as confidence; an EVSI claim without an observation model; a new LLM/network
integration merely to sound intelligent; automatic intervention or employee decisions.

**Proof: 1109/1109 canonical tests; 17/17 new targeted tests; 7/7 standalone tests; ESLint,
151-module/67-suite boundary and all 154 documentation links pass.** New deterministic
fixtures/property-style interior checks, full cross-module
production cascade, replay/reload, stale/paused/closed/owner guards, rollback, save failures,
encrypted save/unlock, UI confirmation/invalidation and JSDOM+axe. Latest complete counts and
actual repository synchronization are recorded in `AI-SESSION-LOG.md`. Real-browser visuals,
rendered contrast, spoken accessibility and measured leadership outcomes remain [UNVERIFIED].

## Session 64 — 2026-10-28: Close follow-ups from 1:1 preparation

**Selected journey.** On the person's prep sheet, the leader reviews outstanding promises,
marks a completed prior 1:1 action or manager-owned check-in follow-up done, and sees it leave
the open list after refresh and reload. This closes the loop where the evidence is already
assembled, without inventing a meeting confirmation.

**Why this slice.** Compared with another analytical terminal or the roadmap's scan-cache
work, this is a frequent manager workflow, removes a context switch, and reuses the existing
commitment records and mutation safeguards. Adding persistent draft notes to the prep sheet
was a plausible alternative, but would create a new sensitive prose surface and storage
behavior; this slice has a smaller risk and a directly observable outcome. The underlying
mechanism (prepare from prior commitments, then follow up) is supported by practitioner
workflow guidance, not treated as validated evidence (Manager Tools, [One-on-One Basics](https://www.manager-tools.com/system/files/documents/docs/Manager-Tools_One_on_One_Basics.doc),
accessed 2026-10-28).

**Acceptance criteria:** open 1:1 and leader follow-up records can be completed from the prep
sheet; empty/sparse sheets remain useful; a failed/stale mutation leaves the item visible;
completion survives local reload; completion is not attributed to a held conversation; action
controls are omitted from print; existing conflict and anonymous-pulse exclusions remain.

**Implementation and proof:** reuse `toggleMeetingAction` and `toggleManagerSupportCommitment`,
passing source IDs from the pure prep read model. A manager update stays distinct from meeting
reconciliation; the eight-second toast Undo reverses mistakes. No migration, new export scope,
external action, model call, or permission expansion. `tests/app/prep.test.mjs` covers sparse
and populated prep, excluded sensitive records, accessibility, stale-action failure, success,
undo, and localStorage reload. Focused suites: **50/50**; full canonical suite: **1092/1092**;
ESLint clean; boundary: **148 app modules / 66 suites / 0 leaks**; documentation links:
**151 across 132 files**, all resolve; standalone rebuild and tests: **7/7** at schema v43.
Real-browser and screen-reader validation remain **[UNVERIFIED]**.

**Recovery boundary / next move:** an eight-second undo reverses an accidental completion;
after that window, the prep sheet does not expose a reopen control. Validate whether managers
naturally close these loops here, then consider an inspectable correction path at the source
record. Do not infer value from demo data.

## Session 62 — 2026-10-28: The Strategy Coherence Terminal (Schema v42, ADR-0027)

**Why this and not another governor.** Session 61 fixed the price of the automation chain.
The roadmap's next priorities were more governors: a scan cache, more instrumentation,
sequential monitoring. All three are real and all three are *inside* the frame LeadOS
already had. The blunt gap after 61 sessions was that every terminal measures an activity
inside a strategy that nobody had written down. LeadOS could price a decision, allocate a
structural budget and sense saturation, and could not answer "is the work funding the
strategy we said we were pursuing?" — the one question a management team is actually judged
on, and the one every incumbent tool answers by asking people to self-report a percentage.

**Implemented.**

1. **`strategyBets`** (Schema v42) — a structured strategic choice: Rumelt kernel
   (diagnosis → guiding policy), `advantage` type, explicit `notDoing` refusals, declared
   `weightPct`, accountable owner, horizon and a dated `killCriterion`. An `active` bet
   without an adoption date is demoted to `draft` on load, because the adoption date is the
   vintage and inventing it would let the gap be manufactured.
2. **`strategyTags`** — a link table from any open case, goal, delegation, plan item,
   decision or change to a bet, with an optional effort estimate. No other collection
   gained a field, so the change is additive: the other 65 suites needed only their
   migration-version pins moved, and none of their behaviour changed.
3. **The say–do gap** — declared weights and measured shares are two distributions over one
   support, so divergence is the **total variation distance in percentage points** with exact
   bounds 0 and 100. Per-bet signed gaps, a recent-flow view (28-day default) that leads the
   balance sheet, and a measured Herfindahl concentration with labelled convention bands.
   Effort-weighted shares only when ≥50% of funding tags carry an estimate; otherwise the
   report counts records and says `Counts only`. An unestimated tag is one record, never zero
   effort.
4. **Two exclusions that make the number honest** — work created before the earliest adopted
   bet is excluded as pre-strategy (relabelling history cannot improve the gap), and the
   terminal's own `[RULE-SCO-…]` governance records are excluded (opening a rebalancing
   decision must not worsen the gap it exists to close). Undated records are excluded with the
   count printed.
5. **Falsifiability grading** — six named checks per bet (owner, diagnosis, guiding policy,
   refusal, dated stop rule, funded work), with the missing ones printed instead of a
   confident label.
6. **`#/strategy`** — four tabs (Bets, Coherence, Falsifiability, Verdicts), a deterministic
   plain-text brief, an explicit "Run coherence audit" action, and workspace conventions for
   the 20pp gap, 40% blind-work and 28-day drift window.
7. **RULE-SCO-01..04** on the shared post-commit spine: adoption → one DACI commitment
   decision + one owned tagging delegation + one blameless 1:1 talking point + typed links;
   gap over convention → one rebalancing decision keyed to the diverging bet set; no dated
   stop rule → one owned delegation; overdue stop rule → one retire-or-renew decision and a
   talking point. The rule is deliberately **not** triggered by unrelated events: an explicit
   audit or a strategy event is the trigger, and the cascade is atomic.
8. **SCO-01..06 signals** merged into Insights, a nav badge, and a demo seed of three bets of
   deliberately different quality.

**Measured in this session** (`tests/app/strategy-coherence.test.mjs`, demo workspace at a
fixed clock):

- Demo declares 60 / 25 / 15 and funds 58.3 / 41.7 / 0 on an effort basis → **say–do gap
  16.7pp** (under the 20pp convention, so no rebalancing decision is opened), concentration
  HHI **0.514 measured vs 0.445 declared**, **82.8% of post-strategy open work outside any
  bet** (24 of 29), one overdue stop rule and one unfalsifiable active bet. Coherence composite
  68.2 (`Drifting`) over 83.3 alignment / 77.8 falsifiability / 17.2 coverage, confidence
  `measured`.
- A hand-built 60/40 declaration against 30/70 funding computes to exactly **30.0pp**; the
  recent-flow view separates a 30.0pp stock drift from a 30.0pp flow drift on the same data.

Two defects were found by running the suites rather than by reading the diff, and both were
fixed in the product: `'Strategy'` was missing from `insights.js` `DOMAIN_ORDER` (all `SCO-*`
findings counted but silently dropped from the domain roll-up), and the adoption dialog graded
the bet from `report.bets`, which holds active bets only, so the bet being adopted displayed six
missing checks until after the transaction that adopted it. `strategyBetGrade(bet, state)` now
grades a draft on its own payload, pinned by a JSDOM test that clicks the draft's own button.

**Cross-module example verified in tests:** `saveStrategyBet → adoptStrategyBet` produces, in
one transaction, a DACI commitment decision with three options and no chosen answer, an owned
tagging delegation addressed to the bet owner, a blameless talking point on that person's
record, and two typed `strategy → decision` / `strategy → delegation` links; re-running the
audit duplicates none of them. An overdue stop rule produces exactly one retire-or-renew
decision and leaves the bet `active` — the app never retires a bet by itself.

**Competitive benchmark.** The 2026 vendor surveys in this space report single-digit shares of
leaders saying daily work ladders up to strategy and roughly four in five getting no signal
when a priority drifts (`RESEARCH.md` §66). Those are vendor-published claims, not trials, and
parity or superiority is **[UNVERIFIED]**. What is deliberately different here: the gap is
computed from the leader's own records as a bounded distance between two share vectors, with
the vintage rule, the scaffolding exclusion and the measurement basis printed on screen —
rather than a self-reported alignment percentage.

**Honest limits.** The measured share is only as honest as the tagging; a leader who tags
generously defeats the metric, and the terminal says so where the tag is created. Effort-weeks
are owner-entered conventions, not measurements. The 20pp / 40% / 28-day values are workspace
conventions, not validated constants. The composite coherence percentage is a weighted mean of
three measured components and is not evidence the strategy is right. No browser or
assistive-technology validation was performed beyond jsdom + axe. There is deliberately no CSV
scope: a share without its declaration is a number with the evidence stripped off.

**Priorities:**

1. Time-series the gap: store periodic coherence snapshots so "the gap is widening" is
   measured rather than inferred from the recent-flow window.
2. Cross-check the tag table against the other governors (a bet whose funded work sits on a
   saturated person is a structural contradiction the Load Governor already half-knows).
3. Field-validate the conventions and the six checks on a consented workspace; until then they
   are conventions, not instruments.

**Verification:** 36 new tests in `tests/app/strategy-coherence.test.mjs` (36/36), full suite
**1070/1070 pass** (626.2 s) against a 1034/1034 baseline, lint clean, canonical boundary 145
modules / 65 suites / 0 leaks, 149 documentation links across 131 files, standalone rebuilt at
144 modules / schema v42. Full detail in `AI-SESSION-LOG.md`. Anything not stated there is
**[UNVERIFIED]**.

---

## Session 61 — 2026-10-28: The Propagation Ledger (Schema v41, ADR-0026)

**Why this and not another module.** The roadmap's own top priority after Session 60 was to
"safely reduce per-event savepoint cost" with no diagnosis, plus durable retry/receipts and
completeness diagnostics. Measuring first showed the previous framing was incomplete: the
savepoint was a contributing cost, not the dominant one. The dominant cost was three rules
recomputing full analytical scans that produced nothing, on every write. Fixing the thing
the roadmap named without measuring would have left 65% of the cost in place. The correction
is recorded in `RESEARCH.md` §65.1 rather than quietly dropped.

**Implemented.**

1. **Copy-on-write savepoints** (`app/core/domain/savepoint.js`). A rule now copies only the
   collections it actually reads. The pre-ADR-0026 strategy is preserved verbatim behind
   `savepoint: 'clone'` so the equivalence suite compares against real old behaviour.
2. **Decline collapse with a proof obligation.** A declined re-run is skipped only when the
   invocation produced no write, no emission, no audit entry, no warning and no effect at an
   unchanged workspace version, and only for rules in `DECLINE_MEMO_RULES`. The
   entity-independence that makes collapse sound is *probed by test*, so an unproven rule is
   never skipped. `declineMemo: false` proves collapse changes the workspace by zero bytes.
3. **The Propagation Ledger** (`#/propagation`, `app/views/propagation.js`): price per rule,
   measured waste, event coverage, and the failure ledger. Instrumentation only — never
   persisted, never exported.
4. **Durable receipts** (Schema v41, `propagationReceipts`): a rule that throws now leaves a
   content-free record of the event that caused it, and can be re-run against current state
   with `retryPropagationReceipt`. A rolled-back propagation is no longer a toast.

**Measured** (`scripts/bench-savepoint.mjs`, demo workspace, median of 3–5 runs):

| Scenario | Baseline | After | Gain |
|---|---|---|---|
| Single `case.created`, 362 records | 233.1 ms | 138.5 ms | 1.7× |
| Single `case.created`, 5,792 records | 4,254.1 ms | 2,943.5 ms | 1.4× |
| Four-event cascade, 362 records | 369.6 ms | 54.0 ms | 6.8× |
| Four-event cascade, 5,792 records | 5,532.0 ms | 1,284.4 ms | 4.3× |

On one `case.created` the chain attempts 42 (rule, event) pairs and 5 apply. `earlyWarningRule`
(150.3 ms), `premiseRule` (82.2 ms), `dynamicsRule` (35.1 ms) and `loadRule` (11.9 ms) account
for ~91% of rule time, and three of them applied nothing on that event.

**Cross-module example verified in tests:** a case-creation transaction propagates into typed
links, a DACI decision, a mitigation delegation, a goal check-in, a capacity reserve, a
decision-tempo position and an unsent comms draft — and the failure path of that same chain
now produces a durable receipt that can be re-run. `tests/app/propagation-ledger.test.mjs`
proves: COW and eager strategies produce byte-identical workspaces (including on rollback and
on `delete`), collapse changes no bytes, every declared rule declines identically for two
entities of one event type, and a retry of a still-broken event stays unresolved while a retry
of a now-valid event resolves.

**Honest limits.** Single-machine timings on a synthetic fixture, not a performance guarantee.
Collapse removes *duplicate* scans, not the first one, and does nothing for a cascade of
all-distinct event types — which is why the single-event gain stays at 1.4–1.7× and both
numbers are reported. The remaining cost is genuine analytical work in the three scan rules;
reducing it needs incremental scans or a transaction-scoped scan cache. No browser-timing or
large-workspace profiling was done **[UNVERIFIED]**. A retry re-runs one rule outside the
original transaction, so a rule depending on a later-produced artifact may still decline; the
receipt records the attempt instead of claiming success.

**Verification:** see `AI-SESSION-LOG.md` for the full-suite result, lint, canonical boundary,
documentation links and the standalone rebuild. Any result not stated there is **[UNVERIFIED]**.

**Priorities:**

1. Reduce the remaining first-scan cost in `earlyWarningRule`, `premiseRule` and
   `dynamicsRule` — a transaction-scoped scan cache keyed on the workspace version, with the
   same proof-obligation discipline used for decline collapse.
2. Instrument the remaining entity creation/update producers, and add completeness diagnostics
   that can say which records were never touched by a rule rather than inferring it.
3. Immutable historical input vintages, then sequential monitoring under stated assumptions;
   no BH/BY variant alone repairs invalid scores or repeated looks.

## Session 60 — 2026-10-28: Connected response & forecast integrity (Schema v40)

**Implemented:** synchronous breadth-first derived-event delivery with rule savepoints,
transactional emission/log/warning buffers, automatic lifecycle events for new cases,
decisions, delegations and portfolio records, tuple deduplication and a 64-event ceiling. Derived Tempo delivery is
scoped to related decisions rather than sweeping unrelated overdue/class-level debt.
Case creation now reaches the ordinary case engine from Watch and resilience; source-action
secondary records are delivered too. The case Automation Control Room can rehearse/refresh
that same case lifecycle. A validated optional Watch response captures existing owner, goal,
stakeholder, action, decision choice, FMEA and three-point estimates locally; the one-way
verdict and response survive a failed rule, with explicit retry and warnings. Existing direct
case propagation options remain supported.

**Cross-module example verified in tests:** a confirmed detector-produced alert with real
user-supplied fixture context → typed alert/case → FMEA/PERT opening snapshot, DACI decision,
mitigation delegation, goal check-in, coaching, capacity reserve, proposed Decision Tempo
schedule and unsent stakeholder brief. Resilience-drill → case lifecycle is separately tested;
it no longer invents FMEA ratings, loss/capacity estimates or an owner from a steward. Unrated
case estimates keep magnitude/capacity but withhold probability-based loss, ROI, occurrence
scores and scenario/Pareto valuation; later ratings cannot backfill a frozen opening forecast.
New/resolution dialogs no longer prefill human ratings. No conflict or anonymous pulse entity enters the graph. Not all downstream artifacts are
appropriate without inputs, and not all entity/update paths are instrumented.

**Statistical correction:** Session 59's claimed FDR control, `m×q` expected false-count,
hindsight-free demo skill, daily-per-target forecasting and pooled mixed-unit MAE were not
justified. Watch now presents nominal screening without an error-rate guarantee; full-future
weekly targets are deduplicated, first observations are captured once, later source revisions
are flagged, and legacy/demo/late captures are excluded. Skill is descriptive and segmented
by series, with a five-observation floor. See `RESEARCH.md` §64 and ADR-0025. The old demo
skill numbers are **withdrawn**, not a measured product result.

**Competitive benchmark:** 15Five advertises 360/OKR/review and manager enablement; Lattice
announces 1:1 coaching/recap assistance; Visier advertises workforce scenarios and predictive
models; incident.io describes evidence-linked investigations; Palantir describes ontology
scenarios. These are vendor or third-party claims, not trials; parity or superiority is
**[UNVERIFIED]**. The shipped choice is deterministic, local, auditable cross-module follow-
through rather than a simulated AI agent. Source links and trade-offs: `RESEARCH.md` §64.

**Verification:** full regression passed 997/997 after a scoped-fan-out correction (baseline
975/975); lint, boundary, links and standalone tests passed. Detailed test, timing and actual
sync results are recorded in `AI-SESSION-LOG.md`. Historical sections and unreviewed directories are
**[UNVERIFIED]** in this session; do not read prior "Done" wording as a fresh audit.

**Priorities:**
1. Instrument and test remaining entity creation/update producers and action-level fan-out;
   add provenance-preserving durable retry/receipts and completeness diagnostics. Profile and
   safely reduce per-event savepoint cost: a small synthetic demo-case benchmark rose from
   111.8 ms median at the starting commit to 428.4 ms with additional event delivery (n=7).
2. Introduce immutable historical input vintages, then evaluate sequential monitoring under
   stated assumptions; no BH/BY variant alone repairs invalid scores or repeated looks.
3. Audit remaining historical FMEA/PERT conventions, mixed-currency case rollups and demo-derived
   claims; run real browser/assistive-technology and large-workspace latency tests. Review multi-rater privacy,
   succession, team health and workforce planning gaps against current products **[UNVERIFIED]**.

**Deliberately rejected:** invented human ratings, silently sent messages, demo replay presented
as real skill, pooled mixed-unit errors, or unverified FDR guarantees. No new runtime dependency
or outbound network path.

---

## Session 59 — historical Watch implementation (corrected in Session 60)

The v39 Watch added local series, verdicts, budget/cooldown governors and a forecast ledger.
Its prior statements that BH controlled the repeated scan, that `m×q` was a false-count bound,
that reconstructed demo forecasts were hindsight-free, and that case creation already ran the
full downstream case cascade are **withdrawn**. The surviving historical session log is not a
current correctness claim; Session 60's implementation and tests supersede those assertions.

---

## Session 58 — 2026-10-28: Structural Capital Allocation (Schema v38, RULE-SCA-01..04, CSV #39)

**Shipped:** `#/capital` — the first LeadOS module that treats an improvement plan as a **budgeted portfolio** rather than a sequence of single bets. A leader declares an effort-week budget (1–40, default 12), a horizon (4–52 weeks) and four objective weights; the engine allocates the budget across six structural levers by **marginal return per effort-week** (greedy with proofs of positive gain per accepted step, bounded integer increments), runs a **complementarity pass** so synergetic pairs are funded together, and reports the joint trajectory against doing nothing with a verdict separating *improves* / *investment* / *worsens*. Above the plan: **exact Shapley attribution** over every coalition of the funded levers (≤ 64 evaluations, no Monte Carlo) with the efficiency gap printed, and a first-class **pair-interaction** table (substitute vs complement) reconciled against solo scores. Around it: **seeded Savage minimax regret** over 32 lognormal parameter draws against the plan, six named playbooks and doing nothing; a five-grade **trust ladder** (`unvalidated → refuted → provisional → backtested → validated`) in which only rank ≥ 3 may be called *actionable*; and **out-of-sample checkpoint scoring** in which the do-nothing baseline is frozen beside the prediction at adoption so the later score is *skill* (`1 − model error / naive error`), withheld without a baseline, pooled-suppressed below n = 2. Migration v37→v38 adds `capitalPolicies`, `dynamicsCheckpoints` and five `capital*` settings; normalisers clamp and renormalise weights, bound the budget, demote an adopted-but-undated portfolio, clear off-roster owners, drop unusable/duplicate checkpoints and **re-derive every stored skill**. RULE-SCA-01..04 propagate one DACI commitment decision (priced by Decision Tempo in the same transaction, trust grade in the question), one owned checkpoint delegation, typed `scores` lineage and one re-baselining decision; `capitalAutoPropagate:false` pauses governance only, never an explicit adoption. SCA-01..05 signals join Insights in their own domain; CSV scope #39 exports 3 × 28 numeric/opaque columns; a deterministic board brief downloads from the header.

**Benchmark chased:** strategic portfolio-management suites now sell scenario comparison, dynamic reallocation and value-per-constrained-resource: Epicflow's portfolio optimiser sequences by value per constrained hour and its RRI (Devaux's DIPP) ratio is adjacent to this module's marginal-gain-per-effort-week rule [4](https://www.epicflow.com/blog/strategic-portfolio-management-tools/) [6](https://www.epicflow.com/blog/portfolio-resource-management-a-complete-guide/); Planisware builds efficient-frontier investment scenarios against scorecards and says it plans around the real constraint — scarce specialist expertise [3](https://planisware.com/resources/strategic-planning-alignment/best-strategic-portfolio-management-software); Planview and ServiceNow claim dynamic reallocation and continuous replanning [2](https://www.planview.com/products-solutions/solutions/project-portfolio-management/) [1](https://www.itonics-innovation.com/blog/best-strategic-portfolio-management-software). Meanwhile marketing-mix tooling already allocates by *marginal* return with saturation curves and staged reallocation [19](https://metaflow.life/templates/budget-allocation-plan) [13](https://liftlab.com/solutions/real-time-budget-optimization/). Every one of those is an analyst surface over a plan document; none derives the structure from the leader's own dated records, freezes the prediction with its baseline, scores itself out of sample, or refuses to call its own output actionable. Method side: exact Shapley costs `2^k − 2` evaluations and is the benchmark for a small number of input blocks [14](https://arxiv.org/html/2608.04547v1); Shapley values decompose into a main effect plus pairwise interaction shares [2](https://arxiv.org/html/2610.15144); and a 2025 critique argues the *value function*, not the Shapley axiom set, is the load-bearing choice [6](https://pith.science/paper/2506.13900) — which is why the weights are declared, printed and treated as a convention. Vendor pages and search excerpts reviewed, not trialled: **[UNVERIFIED]**.

**Cross-module links:** dynamics model + roster/portfolio/focused-hours records → derived levers and parameters (provenance graded); `capital.policy.*` and `dynamics.checkpoint.recorded` → `RULE-SCA-01..04` on the shared post-commit spine; commitment decision → Decision Tempo (same transaction); adoption → delegation carrying the frozen prediction; checkpoint → typed `scores` edge (`capital` / `checkpoint` entity types, `allocates` / `scores` relations added to the registry); checkpoint ledger → trust ladder → signals `SCA-01..05` → Insights; report → CSV #39; report → deterministic board brief.

**Verification:** `tests/app/capital-portfolio.test.mjs` **39/39** — hand-computed composite and clamping, effort book, budget feasibility/determinism/zero-budget refusal, exact Shapley efficiency identity (raw, with a documented per-player cent rounding tolerance in the display check), single- and null-player cases, pair-interaction reconciliation, seeded robustness determinism with ordered bands and minimax selection, hand-computed checkpoint skill (model 100 / naive 120 / observed 128 ⇒ **−2.5**), withheld skill without baseline and pooled suppression below n = 2, every trust grade reachable, v38 normalisation repairs, payload guards (draft cannot be scored; no future or pre-adoption observations; one observation per day), the real store cascade with idempotent rescans, the pause switch, signals/Insights/CSV/brief/demo determinism, and JSDOM + axe across all four tabs plus the adopt-from-terminal workflow. Full gate: `npx eslint app/ tests/app/` exit 0; `npm run check:boundary` **129 app modules / 58 suites** / 0 quarantined-tree or network leaks; `npm run check:links` **144 links across 126 markdown files**; **945/945 canonical tests pass**; `npm run verify:standalone` 7/7 with the artifact rebuilt at **2,741,516 bytes**, SHA-256 `bd19256467689618…`, schema v38, source stamp `76aa2f3`. Real-browser and screen-reader checks remain **[UNVERIFIED]**.

**Demo regression (26 weeks, budget 12, 2026-10-28):** plan funds `wipCapPct 55` / `delegationShare 0.30` / `learningShare 0.40` = **8.95 of 12 effort-weeks**, objective **52.76**, 22 greedy steps, 3.05 left; vs doing nothing saturation **−165 pts**, WIP **−90.96 pd**, capacity **+5.59 pd/week**, throughput **−70 pd**, dependency **−65 pts** → **investment**. Exact Shapley: WIP cap **55.18 (104.6%)**, delegation **4.41 (8.4%)**, learning **−6.83 (−12.9%)**; pairs +25.07 complement / −7.34 substitute / +3.70 complement; efficiency gap 0. Minimax regret (32 draws, seed 42, CV 0.25): portfolio mean **52.60** (P10 50.21 / P90 56.38), **max regret 26.93** vs `cap-wip` 33.32 (47.16), `hire-two` 29.91 (57.59), `stop-work` 23.52, `delegate-bottleneck` 12.55, `prevent` 1.32, `protect-learning` −6.16, doing nothing 0. Trust **refuted** (hindcast skill −5.38 / MASE 2.53; out-of-sample n = 1, counts only; assumptions 65% assumed) → recommendation labelled *comparative*. Demo: draft `cap-demo-1` (budget 8, effort 4.85, checkpoint 2026-11-18) and scored `chk-demo-1` (experiment `dyn-demo-1`, 2026-10-25, **skill 0.85**, `beats-persistence`). Cold report 281 ms, cached 0.018 ms. CSV #39 3 rows × 28 columns. Brief 2,100 characters.

**Correction made during verification:** the rules first shipped as `RULE-CAP-01..04` / `CAP-01..05`, colliding with Capacity & Flow's existing namespace (98 catalog rows, **94** unique ids; `CAP-03` meant two different things). Renamed to `RULE-SCA-*` / `SCA-*`, with a comment at the definition and a catalog-uniqueness assertion that now passes.

**Known limits:** effort coefficients are conventions, not measurements; weights are a declared value function, so "optimal" means optimal for those weights; a lever with a negative marginal makes a share exceed 100% in magnitude — real, and why the pair table is printed beside it; lognormal parameter stress is not a calibrated posterior; greedy allocation is not a global optimum and the page says so; the demo model is refuted and `actionable` is unreachable in a fresh workspace by construction.

**Deliberately rejected:** auto-adopting the recommendation; calling the greedy plan optimal; Monte-Carlo Shapley when 64 exact coalitions cost milliseconds; letting a checkpoint score against a baseline that was never frozen; ranking people by lever share; and hiding the trust grade behind a tooltip.

**Next priorities (Top 3):**
1. **Loop-level sensitivity (LTM-lite):** attribute the gap between two policies to specific feedback loops, so the explanation is "B3 was the reason", not "the scenario differed". Still open from Session 57.
2. **Evidence-updated trust:** let the ladder consume the capital checkpoint ledger *and* the dynamics hindcast with an explicit shrinkage convention, so a validated model changes what the app is willing to call a plan.
3. **Opportunity cost of the budget:** price the counterfactual — what the next-best mix at the same effort would have returned — so "we chose this" has an alternative attached.

---

## Session 57 — 2026-10-28: Operating System Dynamics Lab (Schema v37, RULE-DYN-01..03, CSV #38)

**Shipped:** `#/dynamics` — the first LeadOS module that models the team as a system of stocks and flows rather than a snapshot. Five stocks (capacity pd/week, WIP pd, quality debt pd, perceived pressure ratio, dependency 0–1), RK4 at a one-week step with four explicit bounds and a counted clamp week. Seven loops (R1 burnout, R2 key-person, R3 capability growth, B1 backlog drain, B2 hiring drag, B3 symptom repair, B4 intake renegotiation) ranked by **gain** — a central-difference elasticity of each loop's own flow with respect to its own driving stock — with dominance per week, dominance-shift detection and four archetypes (Limits to Growth, Shifting the Burden, Success to the Successful, Fixes that Fail). Stability from the numerically linearised system (Faddeev–LeVerrier + Durand–Kerner). Six playbook interventions and unlimited leader-designed experiments compared against doing nothing, with adoption **freezing** the prediction and opening an owned checkpoint. Calibration: weekly WIP reconstructed from dated portfolio lifecycles, hindcast scored against naive persistence (MASE), with five refusal gates. Migration v36->v37 adds only `dynamicsExperiments`; `normalizeDynamicsExperiments` repairs corrupt rows and drops unusable ones. RULE-DYN-01..03 propagate into decisions + Decision Tempo, a blameless 1:1 prompt and an owned delegation with a typed `tracks-followup` link. Signals DYN-01/02/04/05 merge into Insights; CSV scope #38 exports 20 numeric/opaque columns with no names, hypotheses or notes; a deterministic board brief downloads from the header.

**Benchmark chased:** the market pieces this module touches are professional modelling environments and workforce-planning suites, not a leader-owned operating surface. Vensim, Stella Architect, Powersim, AnyLogic and Insight Maker all do stock-and-flow simulation and causal-loop diagrams, and Vensim/Insight Maker let you choose Euler or RK4 [5](https://analytica.com/blog/best-system-dynamics-simulation-software/) — but the model is hand-drawn by an analyst and the organisation lives outside the file. Stella implements Loops That Matter, and the literature compares LTM, Loop Impact and PPM as distinct dominance measures [12](https://onlinelibrary.wiley.com/doi/10.1002/sdr.1757) — LeadOS deliberately implements gain-share and says so. Meadows' leverage hierarchy is the scaffold for the four-option structural decision [13](https://donellameadows.org/archives/leverage-points-places-to-intervene-in-a-system/), and current systemic-design teaching operationalises leverage points 10/9/8/7 exactly as this module's lever classes do [1](https://www.iseesystems.com/resources/download/scholarship/2025-guzman-abello.pdf). Workforce-planning suites now sell sandbox scenario comparison and org-model editing [10](https://checkthat.ai/answers/what-are-the-best-workforce-planning-software-solutions); none surveyed derives the model from the leader's own dated operational records with per-parameter provenance and no manual model build. Vendor pages and comparison posts are search excerpts, **[UNVERIFIED]** by hands-on trial.

**Cross-module links:** roster / focused hours / portfolio effort + lifecycle dates / dependencies + stewardships / load bands -> derived stocks and parameters (provenance-graded); `dynamics.scan` and `dynamics.experiment.*` -> `RULE-DYN-01..03` on the shared post-commit spine; structural decision -> Decision Tempo (same transaction); experiment -> delegation (`tracks-followup`) carrying the frozen prediction; archetype -> person 1:1 talking point; report -> Signals DYN-01..05; report -> CSV #38; report -> deterministic board brief. Link entity `dynamics` with relations `tests` / `tracks-followup` added to the typed graph.

**Verification:** `tests/app/dynamics.test.mjs` **38/38**: hand-computed characteristic polynomial (lambda^2+3lambda+2) and Durand–Kerner complex pair, analytic Jacobian identities, equilibrium vs divergence, capacity-floor reporting, per-loop gain isolation (R1/B3 inert without overload or debt), WIP-cap and ramp-only hiring drag, learning classified as `investment` under slack and refused as a rescue under saturation, seeded Monte Carlo determinism + ordered bands, archetype detection including capacity-erosion Limits to Growth and provisional confidence at high assumption share, WIP reconstruction with counted gaps, calibration refusal and negative skill, v36->v37 migration, normalizer repairs (undated adoption demoted, departed owner cleared, duplicate/bad-name rows dropped, levers clamped), payload validation, adopt/retire/delete guards, the three rule cascades (1 decision / 1 talking point / 1 delegation, idempotent over repeated scans), pause switch, signals/Insights, CSV #38 opacity, brief, deterministic demo, and JSDOM+axe across all four tabs plus the live-preview dialog. Full gate: `npx eslint .` exit 0; `npm run check:boundary` 125 app modules / 57 suites / 0 quarantined-tree or network leaks; `npm run check:links` 144 links resolve; **906/906 canonical tests pass**; `npm run verify:standalone` 7/7 with the artifact rebuilt at 2,647,591 bytes, SHA-256 `1acd4fd9960be0710079126721f7cd21762d9e6bdca374a7b8fe8ce48e9de512` (engine `os-dynamics-2026.10-v1` embedded). Real-browser and screen-reader checks remain **[UNVERIFIED]**.

**Demo regression (26 weeks, no levers, 2026-10-28):** saturation 99% -> 180%, end WIP 100.19 pd, capacity 12.97 pd/week (-11%), 0 clamped weeks; loop shares B4 48 / R2 33 / B1 13 / R1 6 / B3 1; eigenvalues `0.001333, -0.029494, -0.1, -0.106667, -0.333333` -> **marginal**, characteristic time 750 weeks; archetypes **limits-to-growth (4)** and **success-to-the-successful (3)**, confidence *provisional*; provenance measured 6 / estimated 2 / assumed 15 (65%); calibration *scored*, MASE 2.53, skill -5.38 -> **no-better-than-persistence**, completeness 100% over 19 records / 16 weeks with data. Playbooks: `cap-wip` -94 sat / -50.3 WIP / +21.9 throughput -> improves; `hire-two` -68 / -31.7 / +11.9 capacity / -89.7 throughput -> **investment**; `protect-learning` +13 sat -> **investment**; `stop-work` -65 -> improves; `delegate-bottleneck` -31 -> improves; `prevent` -4 -> improves.

**Known limits:** gain-share dominance is not LTM pathway decomposition; stability is a local linearisation at week 0; behavioural coefficients (attrition response, rework generation, onboarding drag) are stated conventions, not fitted parameters; the model is a structural comparison, not a forecast; no real-browser or screen-reader session this round (**[UNVERIFIED]**).

**Deliberately rejected:** LLM-generated "system diagnosis"; auto-adopting experiments; predicting individual attrition or morale from sparse records; drawing a trajectory without the parameter-provenance split.

**Next priorities (Top 3):**
1. **Policy portfolio with budget:** let a leader allocate a fixed improvement budget across levers and see the joint trajectory, rather than testing one lever at a time.
2. **Out-of-sample checkpoint scoring:** when an adopted experiment's checkpoint passes, score the frozen prediction against the realised WIP trajectory and feed that into the calibration verdict — the honest version of "the model learns".
3. **Loop-level sensitivity (LTM-lite):** attribute the gap between two policies to specific loops, so the explanation is "B3 was the reason", not just "the scenario differed".

---

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

- [IMPLEMENTED v37 2026-10-28] Predictive Anomaly Intelligence (#/anomaly, RULE-ANOM-01): pure Shewhart XmR + linear prediction bands + Brier-calibrated confidence; event-driven cross-module propagation into DACI/decisions, coaching prep, stakeholder briefs, forecast integrity.
- [RESEARCHED 2026-10-28] Competitive gap confirmed: Lattice/15Five/CultureAMP/Betterworks/Visier do SPC or AI coaching separately; none combine statistical process control with automatic organizational response in one local-first workspace.
- [PLANNED] Extend to real-time stream processing (if series grows beyond cap) and add reference-class learning from settled case outcomes to tune prediction intervals.


### 2026-10-28 — integrity-first anomaly follow-up (supersedes Session 56 claim above)
- [IMPLEMENTED] Replace event-delta pseudo-WIP with weekly case snapshots; remove uncalibrated prediction intervals and unconsumed anomaly-action descriptors; disclose limitations and correct XmR signal mapping.
- [PLANNED] Immutable dated case lifecycle transitions, including edits and reopenings, with completeness indicators; then rebuild historical WIP without relying on the capped audit log.
- [CORRECTED — Session 60] Watch screening is heuristic, not verified FDR control. Prospective full-week forecasts and typed response fan-out are implemented with the limitations above; real data-vintage validation remains open → `#/watch`, Schema v40.
- [PLANNED] User-controlled survey/HRIS imports with privacy thresholds and lineage; evaluate whether operational and engagement evidence can be combined without implying causality.
- [REJECTED] Individual attrition prediction and automatic people decisions: privacy, bias and unvalidated harm outweigh a speculative benefit.

## 2026-10-28 — Counterfactual mitigation lab

- **Implemented:** full action-level case-edit rehearsal in isolated stores, current-plan versus proposed mitigation, production generalized rule cascade, collection and typed-link comparisons, private-narrative-free brief, paused-automation disclosure, incomplete-rule warning, HTTP worker execution and stale-input invalidation.
- **Implemented:** Savage minimax-regret sensitivity across three declared loss severities; explicit incremental-cost convention, recorded residual baseline, break-even threshold, unknown-evidence abstention and safety warning. Not calibrated prediction.
- **New planned:** occurrence-proxy robustness grid: show how the preferred plan changes under independently declared baseline/residual occurrence ranges, rather than pretending ordinal FMEA ratings are probabilities.
- **New planned:** prospective rehearsal-to-outcome ledger: freeze approved numeric assumptions and compare realised loss/capacity at a dated review; counts-only until adequate evidence, then compare against persistence/reference-class baselines.
- **Planned:** safe adoption with optimistic concurrency and durable cross-tab conflict handling. No stale preview snapshots may be applied.
- **Deliberately rejected:** LLM-generated financial certainty and automatic people decisions from case narratives. Neither causal validity nor individual fairness is demonstrated.
- **Deliberately rejected this session:** another stand-alone dashboard or a new simulation engine. Reusing the actual write path closes a more important trust gap without adding duplicate rules.

## 2026-10-28 — Session 66: Coupled Continuity-Capacity ("All-Weather") Portfolio Simulation ([ADR-0030](docs/adr/0030-coupled-continuity-capacity-simulation.md))

- **[IMPLEMENTED — Session 66]** **All-Weather Continuity-Coupled Portfolio Engine (`app/core/domain/continuityCoupling.js` & `continuityCouplingRule.js`):** closes the long-standing gap between Strategic Portfolio Management (`#/capacity`, `#/scenarios`) and Operational Resilience (`#/resilience`). Pairs Common-Random-Numbers Beta-PERT effort draws with Poisson dependency outage arrivals, multi-tier Nth-party cascades, empirical/split-conformal continuity-drill TTR calibration ($n \ge 5$ floor; honest `declared-point-ttr` below 5), preemptive Critical-Chain steward cutover, and per-currency coherent Expected Shortfall ($\text{VaR}_{90}$ / $\text{CVaR}_{90}$).
- **[IMPLEMENTED — Session 66]** **Generalized Multi-Hop Post-Commit Governance (`RULE-CPL-01..03`, `CPL-01..04`):** `continuityCouplingRule` runs on the shared `postCommit.js` spine (`DEFAULT_POST_COMMIT_RULES`) and chains atomically into `decisionTempoRule` (`RULE-DLY-03`) in the **same store transaction** when a fair-weather plan ($\ge 50\%$ fit) suffers a continuity mirage, pricing Cost-of-Delay (`CD3`) on the newly opened 4-option DACI decision (`RULE-CPL-01`) while opening blameless dual-hat relief delegations and non-evicting 1:1 prompts (`RULE-CPL-02`). Unified `AUTOMATION_RULES` catalog in `automation.js` (`114` rules, backfilling `SCO_RULES`, `RULE-AAR-01..03`, `RULE-ROB-01`, and `COUPLING_RULES`).
- **[IMPLEMENTED — Session 66]** **Cross-Surface Decision UX (`#/capacity`, `#/resilience`, `#/scenarios`, `#/prep/:id`, `#/today`, `#/settings`):** side-by-side Fair-Weather vs All-Weather forecast & dual-hat steward contention table in `#/capacity`; CRN **Resilience-to-Delivery Hardening Frontier** + Markdown brief export in `#/resilience`; counterfactual `dependencyHardening` sandbox levers + `?hardenDep=<id>` deep-link + `RULE-SCN-01` live commitment in `#/scenarios`; blameless dual-hat contention check on 1:1 prep sheets (`#/prep/:id`); Monday mirage alert on `#/today`.
- **[PLANNED — Priority 1]** **Prospective All-Weather & Rehearsal Outcome Calibration Ledger:** freeze pre-horizon Fair-Weather vs All-Weather P80 / fit predictions at horizon start and score realized schedule slip + outage diversion at horizon close against reference-class persistence (`#/forecasts`, counts-only below $n = 5$).
- **[IMPLEMENTED — 2026-10-28, Schema v44, RULE-AAR-04]** **Applied-lesson record corroboration + 30-day practice-persistence check (`#/learning`):** dated, distinct completed artifacts are snapshot-checked and stale evidence is disclosed; the follow-up tests persistence, not efficacy or causality. Scope is anchored changes, completed delegations and reviewed decisions; no semantic matching or external audit.
- **[PLANNED — Priority 1]** **All-Weather / Rehearsal Outcome Calibration:** freeze pre-horizon Fair-Weather versus All-Weather P80/fit predictions and compare actual schedule slip + outage diversion against reference-class persistence, counts-only below n=5.
- **[PLANNED — Priority 2]** **Correlated Common-Shock Stress Mode (`#/resilience` & `#/scenarios`):** optional shared macro-regime shock (regional cloud, power or regulation) across dependency trees; do not claim calibrated tail dependence from sparse local history.
- **[PLANNED — Priority 3]** **Prospective learning-effect evaluation:** pre-register an outcome and baseline before practice adoption, then distinguish practice persistence from operational effect using the Impact Ledger’s safeguards; no retrospective re-labeling.
- **[DELIBERATELY REJECTED]** **Fabricated default failure probabilities (e.g., 5%/yr industry priors) on unestimated dependencies** — invents precision where the record has none; omitted nodes are disclosed via `CPL-03` instead.
- **[DELIBERATELY REJECTED]** **Cross-currency Expected Shortfall ($\text{CVaR}_{90}$) summation via hardcoded FX rates** — violates local-first multi-currency accounting integrity.
- **[DELIBERATELY REJECTED]** **Automatic scope cutting or automatic on-call rotation removal** — leadership trade-offs require accountable human DACI choice, never silent algorithmic mutation.
- **[DELIBERATELY REJECTED]** **Workplace surveillance / calendar-scraping / Slack-sentiment telemetry** — incompatible with psychological safety (Edmondson, 1999) and LeadOS's zero-network local-first trust boundary.


### 2026-10-28 — After-action record corroboration (Schema v44)

- **Implemented:** explicit, dated workspace-artifact corroboration for applied lessons; status/snapshot revalidation and stale-state disclosure; typed `lesson — corroborates → artifact` graph edge; idempotent RULE-AAR-04 30-day persistence delegation + links.
- **Fresh competitive signal:** Lattice’s 2026 product release describes source-grounded AI review drafts; 15Five’s October 2026 Agents overview describes manager Focus Briefs, AI-assisted reviews, and 1:1 prep/notes. Evidence synthesis/coaching is no longer an adequate point of differentiation. LeadOS chased the less-served downstream measurement: can a changed practice be tied to a separate dated operational artifact, and is there a future owner checking whether it persists? These are vendor statements, not independent outcome evaluations; full capability comparisons remain [UNVERIFIED].
- **Named frameworks made operational:** Argyris & Schön’s double-loop learning is represented as the distinction between a human “applied” claim and a practice that persists; Deming PDCA informs the dated follow-up. The follow-up is not an outcome-effect estimate.
- **Deliberately rejected:** inferred matching from free-text similarity, automatically marking lessons applied from task completion, causal attribution from a linked artifact, and individual performance scoring. The workspace has no evidence to justify those inferences.
- **Next research:** make effect claims prospective with an explicit pre-change outcome/baseline, and calibrate whether record-corroboration status predicts practice persistence only after adequate observations.

---

## Session 76 outcome — 2026-10-30: The Structural Design Terminal (Schema v53, ADR-0041)

Session 75 priced who leaves. The sharper, less-served question — the one every other screen
*assumes* — is the shape of the team those people are in: **is the structure the reason everything is
slow, and what happens if it changes?** The market sells org-chart drawing (Lucid, OrgChart,
ChartHop-style hierarchy views) and engagement surveys; consultancies sell the analysis as a slide.
A slide carries no falsifiable claim, so this session made one.

**Shipped:** `app/core/domain/orgDesign.js` (pure read model), `app/core/domain/orgDesignSchema.js`,
`app/core/domain/orgDesignRules.js`, `app/views/orgDesign.js` (`#/orgdesign`, six panels:
structure, coordination, decision queue, designs, authority, method), `app/ui/orgdesign-modals.js`
(three keyboard-operable dialogs), seven actions, Schema v53 (`orgDesigns` + five clamped settings +
additive `52 → 53`), `RULE-ORD-01..05`, `ORD-01..06` signals, CSV scope #47, the `Structural design`
Insights bucket, `orgdesign` as a typed-link node with `structures`/`resizes` relations, the
automation catalog entries and demo cleanup.

**Implemented — Done, verified this session:**

| Capability | Where | What it actually computes |
|---|---|---|
| Reporting-graph reading | `buildStructure`, `structureReading` | Span (out-degree), layers (longest path), Brooks/Graicunas channels `n(n−1)/2` per unit with the manager inside, band breaches in both directions; cycles, self-management and dangling managers reported and cut |
| Measured decision queue | `personQueueModel`, `kingmanWait`, `waitPercentiles` | `λ` from the manager's own completions in a declared window, `Ts` = median of their own spans, `Cs` = their own CV, Kingman's `Wq`; `insufficient` below three completions, `null` at ρ ≥ 1 |
| Priced coordination | `payIndex`, `structureReading.coordination` | Loaded hourly cost from the latest effective merit cycle; unpriced units excluded and the priced share printed beside the total |
| Counterfactual design | `simulateDesign`, `scaleQueue` | Moves applied to the graph only; per-manager predicted ρ and P80 wait by channel scaling, labelled a convention on every row |
| Pareto comparison | `paretoFrontier` | Dominance over four minimised objectives; no composite score; missing latency excluded rather than imputed |
| Reversible commit | `commitOrgDesign`, `revertOrgDesign` | Roster mutation and frozen snapshot in one transaction; restore exactly the recorded line; leave later changes alone and count them |
| Calibration | `freezeDesignSnapshot`, `scoreDesignPrediction` | Per-manager frozen P80 predictions scored later as median absolute percentage error, withheld below the floor |
| Signals and telemetry | `orgDesignSignals`, CSV #47, Insights bucket | Span breach, unstable queue, uncommitted draft, un-scored review, concentrated approval authority; counts only, no names |

**Cross-module links added/updated:** `orgdesign` → `orgDesigns` entity type; relations `structures`
(design → person placed) and `resizes` (design → manager whose unit changed), plus reuse of `screens`
(design → residual/method decision) and `tracks-followup` (design → owned scope task). Rules write
`decisions`, `delegations`, `people.talkingPoints` and `links` inside the same transaction as the
roster change, and the new decision is timeboxed by `decisionTempoRule` in that same atomic write.

**Defects found and fixed by the new suite:**

| Defect | Why it mattered |
|---|---|
| The commit-time rule re-simulated a roster the same transaction had already changed | `delta.moved` was always zero inside the rule, so **no moved-person prompt was ever queued** — the human half of the feature silently did nothing |
| The idempotency marker was appended after a 240-character truncation | A long prompt lost its marker and would have re-appended itself on every scan — the alert-fatigue failure the marker exists to prevent |
| `updateSettings` accepted any band | A maximum below its minimum would have been silently clamped, making every span signal report a breach the leader never declared |

**Demo defect found and fixed:** the sample roster set `managerId: null` on all five people, so the
new page opened on a dead end for every first-time user — and every other screen had been assuming a
hierarchy the demo never had. The demo now carries one real line per person under the lead (span 4
inside the band, ten channels, $27,750/year priced from the FY25 cycle), and the queue reports
`insufficient` rather than inventing a measured wait. No pre-made design is seeded: a reorg is the
leader's to declare.

**Deliberately not built:** automatic tree optimisation (an authority the leader cannot delegate to a
page, optimising a declared objective nobody agreed to); a weighted design score (it hides the
trade-off); inferring a design from the current manager column (it invents the rationale and the
prediction); a second pay source (two salaries that can disagree).

**Still [UNVERIFIED]:** real-browser and screen-reader behaviour of `#/orgdesign`; the span band and
coordination hours are declared conventions rather than validated instruments; the queue is a
single-server approximation that does not model correlated arrivals between two managers; no field
validation with managers who have actually reorganised a team.

**Next priorities (Top 3):**
1. **Cross-manager queue coupling.** Two managers whose units exchange work share an arrival stream.
   Model the coupling explicitly so the terminal stops assuming independence it knows is false.
2. **Prospective implementation milestones.** Let a leader record intended, delivered and verified
   stages for selected intervention types, with dated owner-evidenced steps — without treating a rule
   trace as delivery or a proxy for fidelity.
3. **Leader-controlled retention/purge** for the bounded lineage window and its effect on snapshot
   references, exports and historical completeness.

## Session 77 outcome — 2026-10-30: The Information Value Terminal (Schema v54, ADR-0042, `RULE-VOI-01..05`, CSV #48)

Session 76 measured the shape of the team; Session 75 priced who leaves; Session 74 priced the money. Every one of
those is a decision a leader makes **after** deciding it is worth deciding. The sentence upstream of all of them had
no surface: **how much is it worth to find this out before I commit?**

Without a number, two failures dominate. *"Let's get more data"* is a socially acceptable way of not deciding, with an
unpriced delay attached. *"Let's just decide"* is a way of not thinking, with an unpriced risk attached. Consulting
runs on the gap between those sentences (Hubbard's *measurement inversion* is the sharpest statement of it: the
variables organisations measure most are the ones with the least information value). No software prices it for a
working manager — the decision-analysis tools require you to build a tree first, and the value-of-information
toolchain is health economics in R.

**Shipped:** `app/core/domain/valueOfInformation.js` (pure read model: frame evaluation, EVPI, regret/minimax,
posterior and EVSI, break-even by bisection, likelihood ratios, concentration and flip-stress, Brier/log-loss
scoring, `VOI-01..06` signals, deterministic brief), `valueOfInformationSchema.js`, `valueOfInformationRules.js`,
`app/views/valueOfInformation.js` (`#/voi`, four panels: register, frame, investigations, portfolio),
`app/ui/voi-modals.js` (six keyboard-operable dialogs), nine actions, Schema v54 (`voiDecisions`, `voiStudies`,
seven clamped settings, additive `53 → 54`), `RULE-VOI-01..05`, CSV scope #48, the `Information value` Insights
bucket, `voi`/`voistudy` typed-link nodes with `informs`/`rests-on` relations, automation catalog entries, demo seed
and demo cleanup.

**Implemented — Done, verified this session:**

| Capability | Where | What it actually computes |
|---|---|---|
| Frame arithmetic | `evaluateFrame`, `payoffTable`, `evForOptionWithProbabilities` | Exact enumeration: EV per option, `EVPI = Σ p·max − max Σ p·payoff`, EVPI as a share of the declared stake, the full regret table and the Savage minimax choice, a near-tie flag. A blank cell makes the option **unpriced** and EVPI `null` with the missing count printed; a probability sum ≠ 100 is refused, never rescaled |
| A test's value | `evaluateInquiry`, `posteriorAfterSignal` | Bayes per signal, `EVSI = Σ_signal P(signal)·max_o E[u\|signal] − EV*`, net value, efficiency as a share of the ceiling, break-even sensitivity by bisection (valid because EVSI is monotone — Blackwell), and an explicit `null` when no achievable accuracy pays |
| Total cost of learning | `evaluateInquiry` (`cost` + `delayCost` → `totalCost`) | The consulting critique converted to code: net value subtracts the fee **and the declared worth of the wait**, break-even is solved against the total, and the refusal names the wait rather than only the invoice. The delay is declared, never derived — there is no discount rate and no stochastic option to defer, and the method card says so |
| Evidence | `likelihoodRatioFor`, `RULE-VOI-03` | `LR+ = se/(1−sp)`, `LR− = (1−se)/sp`, clamped at 20; one dated observation appended to the premise the states cite, in the same transaction as the money result |
| Concentration | `buildVoiPortfolio`, `RULE-VOI-04` | Herfindahl reading over premises, open frames per anchor, a declared two-point flip stress and the swing it causes, plus how many open frames would change their preferred option. No covariance is estimated |
| Scoring | `freezeSnapshot`, `scoreFramePrediction` | Deciding freezes EVPI, per-option EVs and the declared distribution; observing the realised state scores it (multi-class Brier, log loss) and records the regret actually incurred. Withheld below the resolved-prediction floor |
| Settings honesty | `conventionsFromSettings` | A typo in a floor or a share is clamped to a declared band with a warning, never read as "switch the measurement off" |

**Cross-module links added/updated:** `voi` → `voiDecisions` and `voistudy` → `voiStudies` entity types; relations
`informs` (frame → the decision it belongs to) and `rests-on` (frame → premise). `RULE-VOI-02` writes one DACI
decision **and** one owned scouting delegation when EVPI clears the money floor or the share-of-stake threshold
(whichever is higher) — so the buy decision is a decision with an owner, not a toast; `RULE-VOI-05` writes a dated
outcome review; all of it on the shared post-commit spine inside one transaction, marker-idempotent.

**Defects found and fixed by the new suite:**

| Defect | Why it mattered |
|---|---|
| `evaluateInquiry` used the positive-signal branch for **both** signals | A perfect test scored EVSI 480 against an EVPI of 180 — every test looked worth more than perfect information, and the verdict was wrong. The perfect-test = EVPI identity is now the guard |
| `likelihoodRatioFor(study)` was passed the whole study object | It silently returned the **negative** likelihood ratio for every settled test, so the belief ledger was updated in the wrong direction |
| The rule emitted `sourceType: 'inquiry'`, which is not in `LINK_ENTITY_TYPES` | `ensureEntityLink` returned `{created:false}` without an error: no provenance edge was ever written and nothing failed loudly |
| `normalizeVoiDecisions` / `normalizeVoiStudies` ran **before** `normalizePremiseOutcomes` | Every state's `premiseId` and every frame's `decisionId` was cleared as dangling on load, so the module lost its entire link structure silently on the second visit |
| The investigations table had no `aria-label` | Repo accessibility contract requires every table to be named; the tab was unlabelled for screen readers |

**Deliberately not built:** EVPPI (there is no parameter-level model to take partial information over, and inventing
one would invent structure the leader never declared); Monte Carlo EVPI (exact enumeration over a small declared frame
is the whole point — a sampled ceiling moves when the seed does); an expected-value nudge that blocks a robust choice
(it demands a written reason instead, and stores it); automatic covariance between premises (a flip stress is honest,
an invented correlation is not).

**Still [UNVERIFIED]:** real-browser and screen-reader behaviour of `#/voi`; the buy-information floor and share-of-stake thresholds are declared conventions, not validated instruments; elicited probabilities come with no
calibration protocol, so an overconfident prior cannot be detected from inside this module; no field validation with
managers who have actually killed a study on the strength of an EVSI number.

**Next priorities (Top 3):**
1. **Per-class drift over calendar time** (carried from Session 89): a two-sample log-rank of each class against a calendar split, so "this kind of work is getting slower" is measured from the leader's own records instead of felt.
2. **Cross-concern fairness audit** (carried from Sessions 88–89): does the evidence floor get applied the same way to everyone — a testable property of the leader's own record that no category product will measure.
3. **Calibration-discounted EVPI ceiling** (carried): show the Platt-adjusted EVPI beside the raw ceiling so the leader sees the magnitude of the correction without it being applied silently. Cross-manager Kingman queue coupling stays on the LEADOS-STATE bet list.

## Session 98 outcome — 2026-10-31: The Deferral Portfolio — reading the whole book of open calls (Schema v69, ADR-0060, RULE-DPO-01..04, DPO-01..05, CSV #59)

**The leap.** Session 97 priced one call's option to wait; Session 98 prices the **book**. Under independent exercise the expected total is the sum of the per-call premiums under *any* correlation — so every expected-value surface is structurally blind to what correlation moves: the joint tail, its concentration, and how often coupled calls lapse together. The new Portfolio tab (`#/deferral?panel=portfolio`) computes exactly those, per currency, from the leader's own records.

**Correlation is discovered, ρ is declared.** `sharedPremisePairs` walks the premise graph (`premise.decisionId` + `rests-on`/`tests` links, open decisions only, canonicalised unordered pairs). A sharing pair with no declared ρ refuses the joint tail and names the pair; non-sharing pairs take ρ = 0 by printed convention; out-of-range ρ is dropped, never clamped; a non-PSD declared matrix is refused, never projected. Cholesky-correlated GBM on a daily grid (convention `deferralPortfolioGridDays`, 1–7), each member following its **own** ADR-0059 lattice policy — boundary tabulated per member — paying its own carry and lapsing at its own deadline. The quoted expected total is always the exact lattice sum; the MC mean is printed only as its grid error with the cause named.

**The tail and its attribution.** VaR/CVaR at a convention level; **Tasche component contributions** that partition CVaR exactly (pinned by test to the cent); HHI on premium and on contribution; top contribution share; the diversification credit with subadditivity and simulation noise told apart; and the **premise stress** — joint lapse under ρ vs under independence, in excess percentage points, with the premise's share of the book's premium.

**The forecast discipline.** Identity-free frozen readings carrying one probability — P(any member commits before the window closes); one freeze per currency per day; graded once, after the window, from recorded `decidedOn` dates (undated ⇒ ungradable); Brier against the frozen claim; skill withheld below five grades; premise movement **appends** challenge notes, never rewrites.

**Cross-module links added/updated:** `portfolioreading → decision` (`aggregates-deferral`, RULE-DPO-01); `portfolioreading → premise` (`stresses-premise`, RULE-DPO-01); `portfolioreading → decision` (`surfaces-impact`, RULE-DPO-02/04); new `portfolioreading` entity type with `deferralPortfolioReadings` owner; premise lifecycle events propagate into the ledger on the same spine; the panel consumes per-call frames, budgets, the premise graph and delivery-history σ. **RULE-DPO-01..04** are registered on the post-commit spine with a published contract, marker-idempotent, inside the caller's transaction. Signals DPO-01..05 read frozen records — the nav badge never runs the simulation.

**Defects found and fixed by building it** (ADR-0060 carries the full list): the zero-diagonal correlation matrix (never PSD — every declared book refused); Session 97's abandon-threshold extraction reporting the lowest abandoned node instead of the highest (the lattice was right, the printed boundary understated the abandon region — fatal the moment a simulation followed the policy); the inverted diversification-credit sign; a masked too-few-members refusal; a hardcoded rule tag in generated rationales; a second `h1` on the portfolio tab (axe-caught); a fake `reading` deep-link param; a `steps` clamp that would have corrupted long-window readings on reload.

**Deliberately not built:** deriving ρ from co-movement (an invented fact); projecting an inconsistent matrix onto the nearest PSD one (the refusal is the feature); quoting the MC mean as the expected total; a live-simulation signals path (signals cite frozen records); tail dependence beyond the Gaussian copula (no record to identify it from — queued with the calibration work).

**Still [UNVERIFIED]:** whether declared ρ survives contact with leaders; the 60%/10pp conventions as useful thresholds; real-browser and assistive-technology walkthroughs; full competitor coverage.

**Next priorities (Top 3):**
1. **ρ calibration from graded readings** once five books exist — the Brier ledger already stores what a recalibration needs, and the same machinery disciplines the declared-correlation step that is currently pure judgement.
2. **Repeated-look error budget with durable statistical review snapshots** (carried from §95/§96, owed since Session 95): the weekly scans across modules are repeated looks at the same records, and nothing prices that.
3. **Immutable intake-time covariates and case-severity mix** (carried from Session 96): transport and case-mix confidence both lean on fields that can change after intake; immutability is the missing substrate.

## Session 99 outcome — 2026-10-31: The Signal Integrity Board — charging the error budget and grading the detectors (Schema v70, ADR-0061, RULE-INT-01..04, INT-01..06, CSV #60)

**The leap.** Every previous session added tests. This one is the first to audit the **procedure that runs them**. LeadOS evaluates ~300 rule predicates plus the early-warning scan on every render; that is a multiple-testing procedure with a price, and Session 98's own closing note ("the weekly scans across modules are repeated looks at the same records, and nothing prices that") is now paid in code rather than carried. The Board (`#/integrity`, five panels) reports two numbers that must disagree: what the declared plan claims about family-wise error, and what the leader's own one-way verdicts say actually happened.

**The budget is charged, not asserted.** Lan–DeMets alpha spending with both published shapes — O'Brien–Fleming-like `α*(t) = 2 − 2Φ(z_{α/2}/√t)` and Pocock-like `α*(t) = α·ln(1 + (e−1)t)` — normalised so `α*(1) = α`, look *k* of *K* receiving the increment. A look past the plan spends nothing and grants no significance. Every recorded look stores its p values as facts and **recomputes** its boundary on read, so a later change of plan cannot rewrite history; each look also stores the plan that was in force, so the bar it faced is the bar it faced. Multiplicity correction uses the effective test count `1 + (m−1)(1−ρ)` with ρ **declared** and a printed 0/30/60% sensitivity table — never estimated from co-firing, because a leadership record cannot identify the dependence between its own detectors.

**The detectors are graded by their own verdicts.** Four verdicts (confirmed / explained / dismissed / false alarm) split into detection truth and actionable truth. Per-family Wilson intervals produce `over-claiming` only when the **upper** bound is under the declared floor, `calibrated` only when the **lower** bound clears it, `indeterminate` otherwise, and `insufficient` below the verdict floor — a figure is printed with its count but never scored. Alerts-per-useful-alert makes attention cost a number. Pooling across families gives the suite-level detection rate, actionable precision, false-alarm rate and NNF-alert. **Only `Early warning` carries a p-value** and receives the full correction; the other 54 families are rule predicates with no null distribution and are audited by measured precision — asserted in the suite so the claim cannot quietly rot.

**Frozen forecasts, graded once from what followed.** A review freezes the budget state plus exactly one prospective claim — P(any false alarm among the next *n* surfaced signals), the declared false-alarm rate compounded over the horizon. It is graded after the window from *surfaced* verdicts dated inside it (suppressed candidates were never shown, so they are excluded), scored by Brier, with skill withheld below three grades. Premise-style movement **appends** challenge notes; nothing is rewritten. A grade without an outcome is dropped on load; an empty window stays ungradable.

**Cross-module links added/updated:** `integrityreview → decision` (`governs-monitoring-plan`) and `integrityreview → delegation` (`calibrates-rule`) through the case graph; a new `integrityreview` entity type with a `#/integrity?panel=ledger&review=` route; the Board's signals join the Insights roll-up in the new `Signal integrity` domain (42/42 buckets filled); `findingCard` gains a **Judge this signal** action on every insight card, so the verdict ledger is filled from the surface where findings already appear. **RULE-INT-01..04** are registered on the post-commit spine with a published contract, marker-idempotent within the ISO week, and never rate a person: verdicts are keyed by a de-identified FNV digest, the ledger has no person field, and calibration tasks are opened **for the leader**, never for the colleague whose record tripped a rule.

**Defects found and fixed by building it** (ADR-0061 carries the reasoning): the O'Brien–Fleming early boundaries were reported as reachable when the first Pocock/OBF increments are 1e-8-scale (a "bar" nobody can clear is a formality — now flagged `effectivelyUnreachable`); the budget governor's look-pace condition was inverted (it fired when the plan was *nearly over*, which is arithmetic working correctly — now a share of the plan *still to run*); a spend was reported against a look count of zero; `integritySignals` could not distinguish "nothing to judge" from "seven findings nobody has judged"; the setup nudge was counted as a gradeable detector firing; a second `h1`-free panel set was axe-clean only after removing non-existent `.chip`/`.view-stack` classes inherited from earlier copy-paste; the standalone ceiling had to be raised a third time (5.2 MB → 5.4 MB at an unchanged 20.4 KB/module density).

**Deliberately not built:** FDR-control claims across looks (ADR-0024 is withdrawn for a reason); a Bonferroni divisor over deterministic predicates (arithmetic cosplay — no null hypothesis exists); deriving ρ; storing derived boundaries on the look record; grading a review on suppressed candidates; letting the governor change the plan on the leader's behalf; per-person precision anywhere in the module.

**Still [UNVERIFIED]:** whether 10%/12-look/Pocock defaults survive contact with real use; whether leaders can sustain the two-tap verdict habit long enough for intervals to narrow (12 weekly looks is a quarter — this module is honest that its first useful reading may arrive after the leader has stopped looking); real-browser and assistive-technology walkthroughs of the five panels; full competitor coverage.

**Next priorities (Top 3):**
1. **Structural prior borrowing across families** — a family with 3 verdicts can borrow pooled precision from the 54 others through a partial-pooling model instead of printing "insufficient" for a quarter. This is the exact inference the Board currently refuses to make and the one that would make its first quarter useful.
2. **Immutable intake-time covariates and case-severity mix** (carried from Session 96): transport and case-mix confidence both lean on fields that can change after intake; immutability is the missing substrate — and the Board's own frozen reviews now depend on the same idea.
3. **ρ calibration from graded ledgers** (carried from Session 98): both modules now store what a recalibration needs — frozen claims plus outcomes — and neither uses it yet.

## Session 110 outcome — 2026-11-01: The Coupling Ledger — reading a declared ρ back against realised joint timing (Schema v78, ADR-0070, RULE-CPL-01..03, CPL-01..05, CSV #68)

**Delivered the carried Top-3 item, and corrected it.** Sessions 98 and 99 both listed "ρ calibration from graded ledgers" as a top-three carry, and both had the estimator wrong: a Brier ledger grades *a probability about an outcome*, while ρ is *a dependence between two processes*, and one book-level binary per reading identifies neither. The estimator that does work was already in the data. Every decision carries a creation date and, once made, a frozen `decidedOn`, so every call has an at-risk calendar window and a resolution block — and two declared partners either resolved inside the same block or they did not.

`#/deferral?panel=coupling` (fifth panel of the Deferral Option Terminal):

- **Estimand named and protected.** Co-resolution *given that both resolved*, in `couplingBlockDays` (30) calendar blocks. A pair with an open member is **refused with a printed reason** and never counted as a non-coincidence; a pair whose whole common window fits in one block is refused because a coincidence there is arithmetically certain.
- **Structure-preserving rotation null.** Each call's resolution block rotates inside its own at-risk window (`s = (rotation + 31·callIndex) mod window`), so marginals are preserved, a call in several pairs keeps one placement across all of them, and the family is deterministic — no seed, no drift between machines. Because each rotation window is at least as wide as the pair's common window, the null is conservative: p-values overstate rather than understate the evidence. The analytic expectation `|A∩B|/(|A|·|B|)` is printed beside every count.
- **Two-sided.** `pValue` (upper) and `pValueLow` (deficit). This is not cosmetic: with zero coincidences the upper test returns p = 1 forever, so a one-sided test could never report an over-declaration — the exact failure mode of the module's headline question.
- **Declared ρ → coincidence reference as a printed convention, twice.** Bivariate-normal copula on the block index under τ = ρ and under the exact normal-theory Spearman transform τ = 2·sin(πρ/6) (Kruskal 1958). At ρ = 0 the curve reproduces 1/k exactly; at ρ → 1 it reaches 1. Disagreement on a magnitude marks the finding mapping-dependent and opens no work.
- **Six verdicts, six assessments.** `insufficient` / `unidentifiable` / `inconclusive` / `independent` / `coupled` / `hedged` → `confirmed` / `over-declared` / `under-declared` / `overstated` / `understated` / `unresolved`. A band below `couplingMinPairs` prints **no assessment at all**; materiality `max(5 pp, 20% of the model figure)` gates every size claim.
- **Frozen reviews are aggregate-only and graded once.** Counts, the rotation summary, the model reference, one prospective probability from a Laplace-smoothed commitment hazard **re-based to the review's own window**, and member ids. No title, no question, no person, no note. A later contradicted declaration appends a challenge note and never rewrites the frozen figures.
- **No write path to `correlationDeclarations`.** The module never clamps, defaults, derives or writes a declaration. "Declare from your record" pre-fills and states its source; the leader confirms.
- Three rules on the existing spine, five signals, CSV scope #61 (band aggregates only), and the demo seeds **workspace history** — 22 dated decisions in 11 premise-coupled pairs plus declarations — so every figure on the screen is computed by the live engine (14 declarations, 12 testable, 2 refused, the near-independent band **coupled / under-declared** at lift 2.93).

**Defects found and fixed by building on shipped code:** the bivariate normal was computing the CDF for **ρ²** (0.290 against a true 0.333 at ρ = 0.5), and a fixed 240-panel grid was wrong exactly where this module reads (panel count now scales with 1/√(1−ρ)); `verdictFor` read `minPairs`/`alpha`/`liftTolerance` off the band descriptor where they are `undefined`, silently disabling every floor while a two-pair band printed `coupled`; RULE-CPL-02 returned before its own contradiction branch; a frozen claim re-based a 90-day hazard onto a 30-day window (95.7% where 65.1% was right); a review could be read back with a band missing; and the deferral terminal had never been through axe because it was not in the accessibility suite's route list.

**Next priorities (Top 3):**
1. **Close the loop into the price.** The advisory ρ is printed and never applied. Build a governed "accept the record's estimate" path — one declaration change through the ordinary append-only history, with the before/after and the evidence that justified it. Refused this session for the same reason the workspace refuses to auto-adjust anything.
2. **Immutable intake-time covariates and case-severity mix** (carried from Session 96): a review frozen from a state whose covariates then moved is quoting a state that no longer exists — this module now depends on that idea too.
3. **Structural prior borrowing across families** (carried from Session 99): a family with 3 verdicts borrows pooled precision instead of printing "insufficient".
