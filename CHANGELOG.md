## 2026-11-01 — Session 101

- Added an on-demand Beta-binomial logistic regression preview for whether the explicitly ordered delegation-authority ladder is associated with on-time delivery. It reports posterior uncertainty and refuses sparse/non-varying inputs.
- Added the accessible **Authority model** panel to Borrowed evidence. The preview does not change base forecasts, rules, propagation or personnel decisions. No schema change or dependency.
- Added ADR-0063 and competitive-research notes; updated README, roadmap, session log, canonical index metadata and generated standalone artifact.

## Changelog — 2026-10-31 (Session 100 · Schema v71 · ADR-0062)

- **Borrowed Evidence Engine (`#/credibility`)**: every small sample in the workspace — signal families, assumption criticality classes, delegation authority classes — is now priced with the evidence it shares through a Beta-binomial hierarchy fitted by full Bayes on a deterministic grid (BDA3 §5.3 hyperprior), with a 90% interval, the unit's own weight Z = n/(n+M), the exact probability it sits below its floor, the date its own record takes over, and the outcomes that would flip its verdict.
  - Why: every terminal correctly refused small samples ("too few verdicts"), which left a new manager's first quarter almost entirely unanswered; partial pooling answers early while saying exactly how much of each number is borrowed.
- **Outside view on registration (RULE-CRE-01)**: an assumption declared more confidently than its criticality class has delivered opens one governed outside-view decision per class per week, with typed `outside-view` edges — at `premise.created`, while re-pricing is still cheap. Premises flagged later that week attach to the same open decision.
- **Checkpoint tasks for late-running authority classes (RULE-CRE-01)**: a class decisively below the on-time floor opens one leader-owned task linked to every delegation falling due within 21 days, each carrying its borrowed probability of landing on time.
- **Borrowed precision for thin signal families (RULE-CRE-01 + Signal Integrity Board)**: a family the pool places decisively below the Board's floor, while its own record is too thin, opens one re-tune task; the Board's inventory now shows each thin family's borrowed precision and what a never-judged family inherits.
- **Exchangeability governance (RULE-CRE-02)**: a heterogeneous pool (χ² p < 5% and I² ≥ 50%) or one carried by a single unit (≥ 15 pp and > 1 posterior SD) opens one decision per group per week; the leader's written ruling is obeyed for 90 days, and a refused group is never pooled.
- **Borrowing is graded (RULE-CRE-03)**: every borrowed claim the rules act on is frozen with both forecasters — borrowed and own-data Jeffreys — and scored by Brier on the same outcomes; empty windows lapse; a borrowed miss own data avoided opens a blameless process task; six losing frames open the decision to stop borrowing.
- **What-if and break-even**: hypothetical outcomes re-weight the hyperposterior exactly (no refit), so the terminal prints "5 failures → below" per unit.
- **Schema v71** (additive `70 → 71`): `credibilityFrames`, `credibilityDeclarations`, `credibilityMarkers`, fifteen clamped conventions; new `credibilityframe` graph node and `borrows-evidence` / `outside-view` / `governs-pooling` relations; Insights bucket **Credibility** (CRE-01..05); CSV scope **#61**.
- **Defects found while building it**: a regime named by a significance test (now by mean posterior Z); influence on an absolute threshold (now also > 1 posterior SD); a capped continued fraction for concentrated Betas (now an Edgeworth branch, pinned < 1e-3); shrinkage measured from the Jeffreys estimate instead of x/n; a global `.row` rule that would have re-laid-out three views; same-week premises dropped from the outside-view decision.

Cross-module links added/updated: `credibilityframe → premise | alert` (`borrows-evidence`), `decision → premise` (`outside-view`), `credibilityframe → decision | delegation` (`governs-pooling`, `tracks-followup`), `delegation → delegation` (`tracks-followup`, checkpoint coverage); Signal Integrity Board inventory ← borrowed precision; Insights ← CRE-01..05; nav badge ← severity ≥ 3.

## Changelog — 2026-10-31

- **Deferral Portfolio (`#/deferral?panel=portfolio`, Schema v69, ADR-0060)**: the fifth tab of the Deferral Option Terminal reads the **whole book** of priced open calls per currency instead of one call at a time. Why: under independent exercise the expected total is the sum of the per-call premiums under *any* correlation, so every expected-value surface is structurally blind to the thing that makes a book different from a list — what correlation moves is the joint tail, the concentration of that tail, and how often coupled calls lapse together.
- **Correlation is discovered, ρ is declared.** `sharedPremisePairs` walks the premise graph (`premise.decisionId` + `rests-on`/`tests` links, open decisions only, unordered pairs); a sharing pair with no declared ρ **refuses the joint tail and names the pair**; non-sharing pairs take ρ = 0 by printed convention; ρ outside [−0.99, 0.99] is dropped, never clamped. The declared matrix is factored by Cholesky and a non-PSD matrix is **refused, never projected** onto the nearest valid one.
- **Common-random-numbers Monte Carlo on a daily grid** (convention `deferralPortfolioGridDays`, 1–7): every member follows its own ADR-0059 lattice policy (boundary tabulated per member), pays its own carry and lapses at its own deadline; correlated shocks from the factored matrix. The quoted expected total is **always the exact lattice sum** — the MC mean is printed only as its grid error with the cause named (checkpoint overshoot; the commit *rate* still matches the lattice, pinned ≤ 1.5pp by test).
- **Tail with exact attribution**: per-currency VaR/CVaR at a convention level; **Tasche component contributions** that partition CVaR exactly (no Euler approximation); HHI on premium and on contribution; the top contribution share; the diversification credit as `CVaR(book) − Σ standalone CVaR` with subadditivity and simulation noise told apart. **Premise stress**: per shared premise — members, premium share, joint lapse under ρ vs under independence, and the excess in percentage points; the reading freezes the worst excess.
- **The same forecast discipline as the per-call terminal**: an identity-free frozen reading with one probability — P(any member commits before the window closes); one freeze per currency per day; graded once, after the window, from recorded `decidedOn` dates (undated ⇒ ungradable); Brier against the frozen claim; skill withheld below five grades; a premise that moves **appends** a challenge note and never rewrites a figure.
- **`RULE-DPO-01..04` on the shared spine** (`deferralPortfolioRule`, contract published): a freeze maps the reading to every member call (`aggregates-deferral`) and every stressed premise (`stresses-premise`) and opens one concentration-watch task only past the convention; an explicit scan reconciles stale edges, opens ≤3 grading tasks and turns an expired window with open members into ONE governed decision per ISO week; a graded surprise (Brier ≥ 0.25) opens one blameless process task; a premise breach opens exactly one re-price decision per premise per week. `deferralPortfolioAutoPropagate = false` pauses automation, never an explicit scan.
- **Signals read frozen records, not live renders** (`DPO-01..05`, `Deferral portfolio` Insights bucket): the nav badge never runs the simulation — a signal cites a reading id and a freeze date.
- **Surfaces**: `portfolioreading` typed node with resolver (`?reading=<id>` focuses that record), declare-correlation and freeze dialogs, CSV scope **#59** (per-currency aggregates, BLANK below five readings), six route aliases, and a demo that seeds a coupled book — the two top-priced calls `tests`-linked to the load-bearing premise (a relation attention-market does not read as sharing) plus one declared ρ = 0.45. No forecast is pre-frozen.
- **Defects found and fixed, not waived** (full list in ADR-0060): the correlation matrix was initialised with a zero diagonal (never PSD — every declared book refused); Session 97's boundary extraction reported the *lowest* abandoned node as the abandon threshold, understating the abandon region the moment a simulation followed the policy; the diversification credit sign was inverted against the payoff-terms CVaR convention; a too-few-members refusal masked its true cause; `newDecision` hardcoded the premise rule's tag in every rationale it wrote; the portfolio panel rendered a second `h1` inside the outer page header (caught by the axe test); the `reading` deep-link param was a fake affordance; the reading schema clamped `steps` at 156 while the daily grid produces up to 366.
- **Docs**: ADR-0060 (+ index), `RESEARCH.md` §98, `ROADMAP.md` Session-98 entry, README, `LEADOS-STATE.md`, this changelog and `AI-SESSION-LOG.md`.

Cross-module links added/updated: `portfolioreading → decision` (`aggregates-deferral`, RULE-DPO-01); `portfolioreading → premise` (`stresses-premise`, RULE-DPO-01); `portfolioreading → decision` (`surfaces-impact`, RULE-DPO-02/04); new `portfolioreading` entity type with `deferralPortfolioReadings` collection owner; the panel consumes the per-call terminal's frames, budgets, premise graph and delivery-history σ; premise lifecycle events now propagate into the portfolio ledger in the same transaction as every other premise consumer.

Competitive/ambition benchmark this session: portfolio-CVaR with component contribution is standard in *investment* tooling (Portfolio Visualizer, PortfoliosLab, Asset Lens — Ledoit-Wolf covariance, concentration decomposition), and the academic method for *real-option* portfolios (Cholesky-correlated GBM with per-option optimal stopping; Gamba 2002; Schwartz's LSM abandonment) is decades old — but both live on market data or one-shot calculators (risk-register copulas, engineering-portfolio VaR in AI tool directories). No searched tool prices a leader's *own decisions* as a correlated book from their workspace records, declares ρ over a shared-premise graph, freezes P(any commit) and grades it by Brier. The claim is narrow and local; absence is a search result and **no category-first claim** is made.

Repository status: additive `68 → 69` (empty `deferralPortfolioReadings` / `correlationDeclarations` / `deferralPortfolioMarkers`, ten clamped conventions incl. the grid); no new dependency, no network call, no backend. Verification is recorded in the final session report and in `AI-SESSION-LOG.md`; real-browser and assistive-technology walkthroughs remain **[UNVERIFIED]**.

Next up (from roadmap): the repeated-look error budget with durable statistical review snapshots (owed since Session 95); immutable intake-time covariates and case-severity mix (owed since Session 96); ρ calibration from graded readings once five books exist.

## 2026-10-31 — Session 97: Deferral Option Terminal (Schema v68, ADR-0059)

- **Deferral Option Terminal (`#/deferral`, Schema v68, ADR-0059)**: new module that prices the *flexibility to wait* as an American call instead of pricing only the cost of waiting. Why: Decision Tempo, Cost of Waiting, the Consequence Lab and Information Value are all one-sided, so the product could only ever nag about delay and had no way to say that holding a call open is itself worth a measurable amount.
- **Cox–Ross–Rubinstein lattice** (20–400 steps, American exercise at every node) with the exercise boundary, flexibility premium, real-world commit probability, expected wait and expected carry; Black–Scholes–Merton retained **only** as the validation anchor (convergence pinned by test, 10.4506 reference).
- **Inputs derived from the record, never defaulted**: `V` = typed decision value terms; `K` = budget lines pointed at the decision, with reversible calls pinned to `K = 0` and told to decide now; carry = the workspace's own 12-week erosion price, charged as a cash outflow and never as drift; σ = `1.4826 × MAD(log(realised ÷ assessed))` over settled case-exposure and delivered-effort ratios, root-time annualised from a printed median horizon. Refusals below the observation floor, withholding below the σ floor, and a declared σ accepted only when labelled.
- **Break-evens solved by bisection** on the same tree (break-even carry, break-even σ) and five verdicts — commit now, waiting pays, indifferent under a materiality floor, act or drop, withheld. The premium is explicitly never added to EVSI or to the Cost of Waiting's integrated carrying cost.
- **Identity-free frozen frame** with one prospective claim (`P(commit by deadline)`), graded exactly once after the window against the decision's recorded `decidedOn`; an undated choice is ungradable, a graded frame cannot be deleted, Brier skill waits for five grades, and the 67→68 migration back-fills nothing.
- **`RULE-DRO-01..03` on the shared spine**, marker-idempotent and inside the caller's transaction: typed `defers-decision` link plus exactly one owned boundary watch for `wait`/`indifferent`; scan reconciliation with ≤3 grading tasks and one governed decision per ISO week for windows that expired with the call still open; one blameless process task on Brier ≥ 0.25. `deferralAutoPropagate = false` pauses freeze-driven writes, never an explicit scan.
- **Surfaces**: `optionframe` typed node and resolver, `Deferral options` Insights bucket (DRO-01..04), nav badge, eight route aliases, CSV scope **#58** (aggregate only, means and money blank below five frames, no titles or ids), four panels (overview / boundary / frozen / method) and a freeze dialog with a live preview.
- **Docs**: ADR-0059 (+ index), `RESEARCH.md` §97, `ROADMAP.md` Session-97 entry, README, `LEADOS-STATE.md`, `FEATURES.md`, this changelog and `AI-SESSION-LOG.md`.

Cross-module links added/updated: `optionframe → decision` (`defers-decision`, RULE-DRO-01); `optionframe → decision` (`surfaces-impact`, RULE-DRO-02 expired-window decisions); new `optionframe` entity type and `deferralFrames` collection owner; the terminal consumes Decision Tempo value terms and derived carry, the Cost of Waiting price convention, budget commitments, settled case-exposure ratios and delivered effort ratios; frozen frames are challenged/closed by scan work that lands on the same delegation and decision records as every other module.

Competitive/ambition benchmark this session: real-options tooling exists for capital projects (Mun's Real Options SLS; DPL and TreeAge Pro within decision trees) and public cost-of-delay calculators are one-sided by construction; no searched leadership workspace prices the deferral of an ordinary managerial call from the leader's own recorded stake, commitment cost, carry and measured volatility, nor freezes a timing forecast graded against the recorded decision date. The claim is narrow and local; absence is a search result and **no category-first claim** is made.

Repository status: additive `67 → 68` (empty `deferralFrames` / `deferralMarkers`, nine clamped conventions); no new dependency, no network call, no backend; the standalone artifact was regenerated and its portability suite re-run; `DELIVERY-MANIFEST.json` is untouched because it documents the quarantined legacy world-model build, not the canonical app. Verification is recorded in the final session report and in `AI-SESSION-LOG.md`; real-browser and assistive-technology walkthroughs remain **[UNVERIFIED]**.

Next up (from roadmap): portfolio deferral with declared correlation between calls; the repeated-look error budget with durable statistical review snapshots (owed since Session 95); immutable intake-time covariates and case-severity mix (owed since Session 96).

## 2026-10-31 — Session 94: Drift decomposition — did work stop finishing, or start being dropped? (ADR-0057, RULE-SURV-07, SURV-09/10, no schema change)

- The calendar-drift guardrail pooled every exit; it now decomposes. `kaplanMeier` emits **both** Aalen–Johansen incidences (completion and abandonment), so survival + the two incidences partition every cohort exactly, and the change in "still open at day 30" is the completion change plus the abandonment change with a computed zero residual. Each cause is compared across the fixed cohorts with a landmark Wald test (delta-method variances), Holm-controlled over the fixed family of six classes × two causes; the Pepe–Mori integrated difference prints as a p-free effect size. A cause below five pooled events is refused as counts. At the 0%/100% boundary the Wald variance is truly zero: identical shares are p = 1, differing shares fall back to Fisher's exact test only for verified fully-observed cohorts, otherwise refused. Nine verdicts — including **substitution**, the one-for-one swap of finishes for give-ups at unchanged exit speed that no any-exit or cycle-time view can see.
- **Defect found and fixed, not waived:** the cumulative-incidence variance shipped in Session 89 was a mis-transcription (Y² for Y(Y−d), total exits for cause exits, missing −2 cross term, final F referenced at every step) answering 0.0048 lumped and 0.0344 spread where the provable multinomial value is 0.012. Replaced with the three-term delta-method form — exact at the multinomial anchor F(1−F)/n in both configurations, now a pinned regression test. Session 89's incidence bands and quantile brackets inherit the correction; frozen readings store probabilities and are untouched.
- `RULE-SURV-07` on the shared spine: exactly one drift decision per class per week, framed by the component that moved (intake review with ≤10 recent abandonments linked as exhibits; completion review about blockers), two-way precedence with `RULE-SURV-06` (attaches to the generic review if it fired first), one owned investigation task, ≤20 `informs` links to open work, and a positive-deviance capture task on significant improvement. `SURV-09` (adverse attribution) and `SURV-10` (silent substitution) join the Delivery-survival insights bucket; the brief gains an attribution line; CSV scope #53 gains 12 decomposition columns, blank below floors; the Classes panel gains the decomposition table and the Method panel the named non-claims (no Gray test, no causality).
- 19 new tests in `tests/app/drift-decomposition.test.mjs`, including Fisher pinned to published values and a real `scanSurvival()` commit persisted across reload. No schema change, no new dependency, no network call.

## 2026-10-31 — Session 90: Cost of Waiting Terminal — pricing the queue the workspace already keeps (Schema v64, ADR-0053, RULE-WAIT-01..05, WAIT-01..06, CSV #54)

- New `#/wait` module. A leader declares one weekly price per class of work (cap 24; fail-closed normalizers drop negative or non-numeric amounts with a warning); a decision with linked committed money is priced **derived** — value at stake ÷ the 12-week erosion window, linear Reinertsen CD3 — and an item with no price is **unpriced, never zero**.
- Every open item is read against the Session 89 survival curve: `stillOpenProbability` = S(age+Δ)/S(age), refused below the at-risk floor with the count and a reason, flagged `beyondEvidence` past the longest observation. Wait-horizon scenarios (1/2/4/8 weeks) print P(still open) and expected additional cost = price × weeks × P per row; totals are **per currency and never pooled**, with top-item concentration. Rows are ranked priced-overdue first, where overdue means past the class's own completion median.
- Weekly **exposure certificates** (`waitExposures`, cap 60, newest first) freeze the priced queue, totals, scenarios and a review date — navigable via the new `exposure` typed node and SYSTEM_GENERATED `prices-delay` edges with resolver `#/wait?panel=certificates&exposure=<id>`.
- `RULE-WAIT-01..05` on the shared spine before decision tempo, marker-idempotent per ISO week: stale edge reconciliation, the weekly certificate, ≤40 exposure→item links with the price in the summary, exactly one triage DACI decision per currency per week above the declared threshold, ≤5 owned delegations (+3d, recorded owner only), ≤3 declare-a-price tasks per unpriced overdue class (+7d). `waitAutoPropagate=false` pauses automation; an explicit scan always runs and is idempotent (`changed: false` on rescan).
- Signals WAIT-01..06 in the new `Cost of waiting` insights bucket; nav badge, four route aliases; CSV scope #54 (per class × currency rows plus ALL, opaque C01.. codes, scenario figures blanked below the evidence floor, covered counts always shown); demo seeds three USD prices and deliberately no pre-frozen certificate.
- Additive `63 → 64`: `waitPrices`, `waitExposures`, `waitCostMarkers`, clamped `wait*` conventions. Empty collections are the correct upgrade state — no price or certificate is invented for existing workspaces.
- Found and fixed by the new suite, not waived: a negative weekly amount clamped to 0 instead of dropped (now fail-closed); a mis-dated hand fixture caught by the KM assertions; a jsdom-realm array in the axe assertion (now `Array.from`, colour-contrast disabled as in the survival suite).
- 43 new tests in 12 suites; suite-wide pin sweep 63→64 (61+2 files), CSV 53→54 (17 files), `waitExposures` fixture and `exposure` route contract in the typed-link lineage suite. Full suite **1,623/1,623**, lint clean, boundary 227 modules / 91 suites / 0 leaks, standalone **4,658,027 bytes at schema v64** (226 modules) with its 7 portability tests green.

## 2026-10-30 — Session 89: Delivery Survival Terminal — censoring, competing risks and the hazard of waiting (Schema v63, ADR-0052, RULE-SURV-01..05, CSV #53)

- New `#/survival` module. One curve over six source collections — funded portfolio work, cases, requisitions, change programmes, delegations, decisions — with no new data entry to get a first reading. Kaplan–Meier (Greenwood variance, log–log band) keeps open items in the risk set; **Aalen–Johansen cumulative incidence** splits completion from abandonment as competing risks, and both the naive complement and the corrected incidence are printed with the reason they differ. Plus Nelson–Aalen hazard by elapsed-time bucket with a Katz log-rate ratio, Mantel–Cox log-rank on one degree of freedom, conditional completion over a forward window, `medianExit` that says *not reached* instead of extrapolating, and an **age percentile** labelled as a share of past exits and explicitly not a probability.
- Frozen readings are falsifiable commitments (per-item probabilities, the at-risk counts they were conditioned on, the curve digest, a review date) scored once with Brier against the class's own base rate, i.e. a skill score, withheld below five settled items. Refused in the command layer: an empty prediction set, a past review date, a horizon outside 1–180 days, a second grading, deletion of a graded reading.
- `RULE-SURV-01..05` on the shared spine, marker-idempotent: typed `endangers` edges plus one owned task per doomed item (recorded owner only, max 5); one repair task when a graded reading lost to its base rate; exactly one DACI decision per class per week when abandonment reaches the declared share of exits; one task per returned delegation with no recorded reason; one grading task per stale reading. `survAutoPropagate=false` pauses automation, never an explicit scan.
- Additive `62 → 63`: `survivalReadings`, `survivalMarkers`, eight clamped `surv*` conventions. Empty readings are the correct upgrade state — a prediction cannot be back-filled without becoming a prediction made after the answer was known.
- Wiring: `reading` typed node with an `endangers` relation and a resolver; nav entry, alias table and attention badge; the `Delivery survival` Insights bucket; CSV scope #53 (22 aggregate columns, figures blanked below the evidence floor); the rule registered before decision tempo so every decision it opens is priced in the same atomic write.
- Found and fixed by the new suite, not waived: a zeroed PERT triple read as a 0-day estimate (now absent, never zero); `closedOn`/`abandonedOn` read off change records that only keep `anchoredOn` (abandoned changes are censored and counted as `abandonedUndated`); and `'reading'` filed as a link *relation* instead of an *entity type*, which silently produced zero edges for RULE-SURV-01.
- 57 new tests. Suite-wide pin sweep 62→63, CSV count 52→53 in 17 files, Insights domain ceiling 22→23, and a `survivalReadings` fixture plus a `reading` focus-route assertion in the typed-link lineage suite.

## 2026-10-30 — Session 84: Autopilot Studio — governed operating agreements (Schema v58, ADR-0049, RULE-AP-01, CSV #50)

- New `#/autopilot` module. A leader declares standing instructions in a closed vocabulary (4 sources, 14 events, 5 actions, 7 template tokens); each agreement rehearses against current records on a disposable copy and activates only by approving that exact preview (digest-bound token over definition + workspace revision + rehearsal).
- `RULE-AP-01` evaluates first on the spine so conditions see the record as the action left it; one `case.created` fans out into a decision, owned task, coaching prompt, joined assumption and stakeholder drafts with typed `automates` provenance, while built-in rules co-fire (RULE-DEC-01 declines via its existing linked-decision guard; RULE-DEL-01 still advances the case). Desired-state markers reuse across re-fires; identical facts skip silently.
- Hard refusals throughout: nothing sent, no option selected, no personnel effects in the vocabulary; missing owners and full queues block whole runs with ledger entries and pauses; 24-record batch ceiling rolls back with a receipt; agreement output cannot chain into another agreement; unprovable stored activations pause on load.
- `Autopilot` Insights bucket (`AP-01`), nav badge, CSV scope #50 (codes/counts only), deterministic brief, two demo drafts, 27-test suite, `#/autopilot` axe-gated. Additive `57 → 58`; no new runtime dependency or network call.
- Fixed: Attention Market brief download passed positional args to an object-parameter `downloadText` (would have saved "undefined"); now uses the object form with a fallback toast.

## 2026-10-29 — Session 73: The Implementation Fidelity Ledger (Schema v50, ADR-0038, RULE-FID-01..05, CSV #44)

- New `#/fidelity` module. A leader declares a plan before delivery (intervention type, population, planned units, window ≤364 days); five weighted stages are scored — reach .25, dose .30, quality .25, maintenance .10, adaptation .10 — and every stage prints its own gaming route.
- Four stages are derived from dated typed records with an explicit standard (1:1 carrying written notes; SBI-complete feedback; a delegation with a dated check-in; a key result that moved). Adaptation has no instrument and the page says so instead of substituting a proxy.
- The second reading is a dated human attestation kept beside the record reading, never averaged with it. A contradicting verdict requires a written reason and is classified optimistic/conservative/lenient/strict/mismatched.
- Exposure is multiplicative (reach × dose × quality); grading is refused below 60% coverage (`insufficient`, not a low score). Attestation calibration reports concordance and over-claim rate with Wilson 95% intervals, withheld below three verdicts.
- `RULE-FID-01..05` on the existing post-commit spine: typed `measures-delivery` links, a disagreement prompt, one repair decision plus one owned delegation per materially under-delivered settlement, one overdue-checkpoint task per plan, and a frozen `implementationSnapshot` at Impact scoring. Marker-idempotent; `fidelityAutoPropagate: false` pauses automation while an explicit scan still runs.
- Bloom/LATE dilution correction: ITT, per-complier estimate (ITT ÷ exposure) and inflated MDE are frozen together; withheld below 10% exposure; `null` (never `0`) when the evaluation could not fit a counterfactual.
- `RULE-IMP-02` now reads measured exposure: a contradicted but materially under-delivered study opens *repair delivery or stop on a weak test* rather than a stop decision.
- Additive `49 → 50`; demo cleanup keeps declared plans, removes demo plans and nulls dead pointers without rewriting a frozen settlement; CSV scope #44 and the `Implementation fidelity` Insights bucket are derived telemetry only.
- Fixed two defects the new tests found: a failed evaluation's placeholder `0` was being reported as a diluted effect of zero, and the overdue-checkpoint idempotency marker was written to `support` but probed in `title`, which would have duplicated the task on the second scan.

## 2026-10-28 — Session 55: Assumption-Aware Scenario Tails
- `#/premises?tab=tails`: paired CRN Monte Carlo (baseline vs premise-coupled P50/P80/P90), leave-one-out premise attribution, correlated-evidence pseudo-replication flags, TAIL-01..03 Insights signals, tail brief, CSV scope #37. Derived on Schema v36 — no migration. 864/864 tests, standalone rebuilt.

# Changelog

## 2026-10-30 — Session 76: The Structural Design Terminal (Schema v53, ADR-0041, RULE-ORD-01..05, CSV #47)

- New `#/orgdesign` module: the one decision every other screen assumes. Reporting structure is
  derived from the roster, not declared twice — span is out-degree, layers the longest path,
  coordination channels `n(n−1)/2` per unit with the manager included (Graicunas 1933; Brooks 1975).
  A cycle, a self-managed record and a dangling manager are reported and cut, never quietly repaired.
- The decision queue is measured per manager from that manager's own completed commitments:
  arrivals from their completion count in a declared window (Little 1961 in steady state), `Ts` the
  median of their own spans, `Cs` their own coefficient of variation, wait from Kingman's (1961)
  diffusion approximation. Below three completions the queue is `insufficient`; at ρ ≥ 1 the wait is
  `null`, because an unstable queue has no finite expectation.
- Coordination is priced from the latest effective merit cycle at the manager's loaded hourly rate.
  A unit with no recorded pay is `unpriced` and the printed total carries its priced share, so a
  partial sum can never be read as the whole.
- A design is a draft until committed. `commitOrgDesign` refuses a missing owner, no moves, a move
  that changes nothing, an archived or missing person, a self-report and a reporting cycle; then it
  applies every move to `people.managerId` and freezes the snapshot — measured and modelled values
  stored separately — in the same transaction, recording each previous line.
- `revertOrgDesign` restores exactly the line recorded at commit and leaves alone any line someone
  changed again, reporting how many it skipped rather than overwriting a later decision.
- Candidate designs are compared on four minimised objectives as a Pareto set. No weighted composite
  is computed, because it would decide the trade-off the leader has to decide.
- `RULE-ORD-01..05`: typed `structures`/`resizes` provenance; **one** DACI decision about the
  mechanism when a unit is still over the declared band plus one owned scope task on its manager —
  never a decision that moves one named report to one named manager; at most three blameless prompts
  for the people whose line or depth moved; one dated outcome review that restates the frozen
  prediction; and a scored median absolute percentage error, withheld below the declared floor.
  Marker-idempotent; `orgAutoPropagate: false` pauses the automatic side while an explicit scan runs.
- Additive `52 → 53` with five clamped settings. CSV scope #47 exports counts and ratios under opaque
  positional design codes — no name, identifier, label, note, individual pay or individual wait —
  and still exports a live reading when no design exists. Insights gains a `Structural design`
  bucket (`ORD-01..06`). Demo cleanup drops moves for removed demo people and keeps a frozen
  snapshot verbatim.
- Fixed two defects the new suite found: the commit-time rule could never see who had moved (it
  re-simulated a roster that the same transaction had already changed, so `delta.moved` was always
  zero and no moved-person prompt was ever queued); and the idempotency marker on a 1:1 talking
  point was appended *after* a 240-character truncation, so a long prompt silently lost its marker
  and would have re-appended itself on every scan.


## 2026-10-29 — Session 74: The Merit & Pay-Equity Terminal (Schema v51, ADR-0039, RULE-COMP-01..05, CSV #45)

- New `#/merit` module. A cycle declares a budget (amount or share of payroll), one comparison dimension, an owner and dated pay rows; bands are declared per level and a band that does not form a range is dropped with a warning rather than repaired into invented money.
- Three policies are priced against the same budget, each with spend, budget use, min/max increase, band violations, the four-fifths ratio it would produce, expected departures, retained value and **regret**: across the board, performance-weighted (with an explicit fallback weight for missing reviews), and a marginal-retention-value greedy allocator over replacement cost × modelled departure reduction.
- Twofold Oaxaca–Blinder on log pay over level, tenure, last rating and an explicit rating-missing term. The interval on the adjusted gap is the group coefficient's own standard error with a Cornish–Fisher small-sample t; a percentile bootstrap was implemented, measured and **rejected** because at 8+8 people it measures which level cell a resample emptied.
- The four-fifths rule runs over the *decision* (favourable = at or above the cohort median), carries Wilson intervals, reports `reliable: false` below the sample floor, and the page states that a screen is not a legal conclusion.
- No protected characteristic is stored. The audit runs on a declared comparison — hire origin or reporting line — with three fixed caveats, including that an unexplained gap is not proof of discrimination.
- The retention hazard is four printed terms (band deficit, peer deficit, recorded concern) with no coefficient fitted to the user's data; finalization freezes per-person probabilities, `person.archived` resolves them, and the Brier skill score against the observed base rate is withheld below five outcomes and printed as `null` when the base rate has no variance.
- `RULE-COMP-01..05`: typed `compensates` provenance; **exactly one** DACI mechanism decision plus one owned evidence task and one blameless preparation question when the audit is flagged — never an individual adjustment; one relative-pay task per cycle with `compares-pay-with` links; one dated outcome review; a resolved prediction on departure. Marker-idempotent; `compAutoPropagate: false` pauses automation while an explicit scan still runs.
- Additive `50 → 51`; demo cleanup removes demo cycles and rows and nulls dead pointers while keeping a frozen audit; CSV scope #45 exports ratios, counts and grades under opaque cycle codes and no salary, name, note or label; Insights gains a `Merit & pay equity` bucket (`MER-01..07`).
- Fixed six defects the new suite found: `money(null)` returned `0` via `Number(null)`, silently turning an unrecorded salary into a real zero in compa-ratios, budget arithmetic and the frozen audit; the policy comparison used the last-applied proposal as its baseline; the peer median was recomputed inside each policy, making every policy its own reference; the bootstrap interval above; the page defaulting to a frozen cycle with a live draft beside it; and the finalization guard order, which let the budget refusal mask a blank decision.


## 2026-10-28 — Correlated absence stress & hand-over briefing readiness (Schema v46, ADR-0033)

- The exact stall distribution assumed independent items. Removing that assumption on the
  demo's own records lifts the expected stall count from 16.88 to 19.07 and P90 from 19 to
  25 — a 31.6% tail lift. Both models are now reported side by side, with the lift printed,
  and never blended.
- Added `simulateCorrelatedAbsence`: one shared cause per window takes the deputies recorded
  on one team offline together (adjustable 0–100%, default 25%), each deputy is individually
  away with 8%-per-14-days odds, and cover falls back to the next eligible deputy at 75% of
  their recorded fit instead of to nobody. Coverage is now `fit × P(at their desk)`.
- Fixed a real defect: the old `pCover = fit × availability` formula made an absent deputy
  *increase* coverage, so a stress test built on it would have reported less exposure after
  removing the person the plan depends on. A test now pins that 100% absence means certain
  stalls.
- A single-team (or unrecorded-team) deputy pool is reported as a finding — `cluster.singleTeamPool`
  with a rendered label — rather than left looking like a modelling accident.
- Added `coverConcentration`: distinct eligible deputies per item at the evidence floor, so a
  plan naming one of three eligible deputies is not mistaken for a single point of failure.
- Fixed a modelling error: a person was eligible to cover contact with a stakeholder whose
  record is themselves, and received a relationship bonus for it. Self-cover is now refused
  with a stated reason, and relationship credit requires a typed `stakeholder → person` link.
  Correcting it moved the demo plan from 53.5% to 46.5% criticality coverage — the honest number.
- Added zero-write deputy-unavailability stress (`stressAbsence`): pick up to three deputies,
  re-derive the window from the remaining pool, and see which items lose cover. Deep-linkable
  via `#/handover?stress=<ids>`; writes nothing.
- Added `handoverReadiness` + `LCS-05`: a commissioned hand-over is only "briefed" when each
  cover delegation has a recorded check-in or is completed. Inside seven days, an unacknowledged
  cover delegation raises a severity-4 signal. The readiness card falls back to the newest
  commissioned hand-over, because the plan that needs briefing is the future one.
- Settings: `continuityCommonCausePct` (0–100, clamped) with a `45 → 46` migration. Existing
  drills are never rescored or re-frozen — rewriting them would make the ledger retroactive.
- Verification: 1,136 tests across 69 suites (5 new in this increment), lint, canonical
  boundary, docs links, diff check and the offline standalone rebuild.

## 2026-10-28 — Leader Continuity Drill (Schema v45, ADR-0032, RULE-LCS-01..03)

- Added `#/handover`: a simulation of the leader's **own** absence, built from dated
  obligations already in the record (open decisions and decision reviews, case review
  dates, 1:1s past cadence, active delegations, stakeholder contacts, goal check-ins).
  Nothing is inferred from a calendar, mailbox, sentiment or presence signal.
- Every item carries a printed criticality basis and one of three delegability states:
  `delegable`, `shared`, or `held` (a performance conversation, or an irreversible
  call above the big-bet threshold). Held work is never covered; it is shown as
  uncovered with the reason and raises a structural signal.
- Two distributions, one arithmetic: the stall **count** is an exact Poisson-binomial
  convolution (mean, P50/P80/P90, P(none)); currency exposure is a seeded Monte Carlo
  over the same per-item probabilities with P90 and coherent expected shortfall at 90%.
  Currencies are never summed, and unpriced critical items are counted, not valued.
- Minimum cover is an exact branch-and-bound set cover over (deputy × stall class)
  bundles with an explicit setup-minutes cost and a disclosed node cap; coverage is
  measured over **every** critical item's criticality weight, so uncoverable work can
  never be counted as covered. Deputy fit is componentised recorded evidence, never a
  performance rating and never exported by name.
- `RULE-LCS-01` commissions the plan transactionally: one four-option DACI decision,
  up to four owned delegations with explicit authority due before the absence, typed
  links to every covered record, and at most one blameless 1:1 prompt per deputy.
  Stale `planKey`/`windowStart`/`expectedRevision` is refused; duplicate commissioning
  is idempotent at the window level.
- Drills freeze the prediction, then score it: Brier, base rate, Brier skill score,
  precision/recall and a Wilson interval, withheld to counts below five predictions and
  three closed drills. `RULE-LCS-02` opens a rebase decision when measured skill is
  negative; `RULE-LCS-03` opens a structural decision when convention blocks cover.
- Added settings with clamps (`continuityHorizonDays` 1–90, `continuityMinFitPct`
  1–100, `continuityAutoPropagate`), an additive `44 → 45` migration with an empty
  drill ledger, LCS-01..04 Insights signals in `Leader continuity`, CSV scope #41
  (opaque drill/item codes, no titles, names or notes), a deterministic brief and a
  Today badge.
- Verification: 1,131 tests across 69 suites (10 new continuity tests, including exact
  vs Monte-Carlo agreement, held-never-covered, stale-plan refusal, window idempotency,
  migration, CSV opacity and JSDOM + axe); lint, canonical boundary, docs links, diff
  check and the offline standalone rebuild all pass.
- Deliberately rejected: calendar/presence capture, an aggregate "resilience score",
  an LLM handover narrative, storing scores in the record, and seeding demo drills to
  make the ledger look calibrated.

## 2026-10-28 — After-action record corroboration (Schema v44, RULE-AAR-04)

- Added dated, distinct workspace-artifact references for applied lessons, with live snapshot/state/date checks and stale-link disclosure.
- Added `lesson — corroborates → artifact` graph links, a counts-only-below-five corroboration measure, a stale-artifact signal, and a private-narrative-free 30-day sustainment delegation when an active owner exists.
- Historical Schema v43 “applied” claims remain unverified. Corroboration is record presence, not semantic validation or causal effectiveness.
- Added official Lattice and 15Five product-release research, ADR-0031, audit, roadmap and README coverage; rebuilt offline standalone.

## 2026-10-28 — Mitigation robustness & evidence gate

- Added exact interval Savage minimax regret with independent event-probability bounds,
  shared horizon, continuous loss extrema, dominance/evidence-sensitive verdicts,
  break-even thresholds, information ceiling and narrative-free numeric export.
- Added a bounded illustrative probability frontier, explicit model/safety limitations,
  and an open-case **Stress-test mitigation** entry point into Automation control room.
- Added `RULE-ROB-01` to the generalized engine: explicit human commissioning creates
  linked DACI, owned verification and blameless coaching work; automatically published
  record events also reach Decision Tempo. No mitigation is applied or communication sent.
- Added exact local revision/evidence guards, reload-safe duplicate prevention,
  queue preservation, save-status disclosure, and 17 targeted tests including one-write
  cross-module propagation, rollback, encrypted reload and structural accessibility.
- Removed two pre-existing fixed-delay UI test races by waiting for observable tempo-route
  and disclosure-dialog state instead of assuming rendering completes in 15/30ms.
- Updated research, roadmap, audit, ADR-0029 and offline standalone. Schema v43 unchanged;
  no new runtime dependency or service. Cross-tab transaction isolation, real-world
  outcome calibration and visual/screen-reader verification remain open.


## 2026-10-28 — Close 1:1 follow-ups from preparation

- The prep sheet can close completed prior 1:1 promises and manager-owned check-in follow-ups
  through existing mutation APIs; it hides the controls when printing and refreshes the open list.
- Preserves the distinction between a manager's status update and a commitment confirmed in a
  held 1:1 (`completedInMeetingId` remains empty); an eight-second undo reverses accidental
  completion; no schema or export format change.
- Added workflow coverage for successful completion, stale-action failure, accessibility and
  localStorage reload; conflict and anonymous-pulse exclusions are unchanged.

## 2026-10-28 — After-Action Review & Learning Ledger (Schema v43)

- Added the `#/learning` terminal (ADR-0028): one dated review per closed case, change, decision or
  delegation, with the intention and the outcome pre-filled from the record that froze them, and a
  human-authored cause that is never inferred.
- Added eleven lesson classes and a change ledger where `applied` / `dropped` require a dated human
  note; `changeType: 'none'` is stored as an observation and never counts toward the applied rate.
- Added measured recurrence over distinct events and the unclosed-recurrence finding: a class that
  repeats while the change committed after the first sighting is still open.
- Added `RULE-AAR-01..03` on the shared post-commit spine (auto-draft on close, one owned
  delegation / DACI decision per committed change, one close-or-drop decision per repeating class),
  plus LEARN-01..06 Insights signals, a Today card, a deterministic plain-text brief and an additive
  v42→v43 migration that invents no review.
- Coverage, applied rate, median time to apply and the composite index are withheld below their
  sample floors and print their denominators; undated closures are excluded and counted.
- Fixed a pre-existing defect in `buildForm`: it never returned `setErrors`, which three dialog
  modules already call, so a rejected submission threw instead of showing its field error.
- No CSV export scope: the free text here is the most sensitive prose in the workspace.

## 2026-10-28 — Connected response & Watch integrity (Schema v40)

- Added a bounded derived-event queue with transactional rule savepoints, automatic case /
  decision / delegation / portfolio lifecycle events, deduplication and explicit failure logging.
- Connected confirmed Watch alerts and breached resilience drills to the shared case lifecycle;
  optional validated response context powers actual decisions, delegations, goals, capacity,
  proposed timeboxes and unsent briefs. Added safe retries and v39→v40 migration.
- Withheld probability-based case loss, ROI, occurrence calibration and scenario/Pareto values
  when FMEA is unrated; retained recorded PERT magnitudes and stopped pre-filling human ratings.
- Corrected unsupported FDR / expected false-count claims; excluded legacy, demo and late
  forecasts from skill; froze first observations and report per-series comparable errors only.
- Withdrew the Session 59 demo skill and the claim that the old Watch case already cascaded.
  Current test/build/sync details are in `AI-SESSION-LOG.md`.

## 2026-10-28 — Early-Warning Watch (historical v39, corrected)

The v39 Watch introduced alert screening, human verdicts, governors and a prediction ledger.
Its original statistical and cascade claims are superseded by the v40 correction above.


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

### Added — Session 58: Structural Capital Allocation (`#/capital`, Schema v38, RULE-SCA-01..04, CSV #39)
- New local-first terminal that spends a **fixed effort-week budget** (1–40, default 12) across six
  structural levers by marginal return on the binding constraint, with a bounded integer allocation
  and a pairwise complementarity pass. Effort costs are a published convention book, printed with
  every plan, not a hidden weight.
- **Exact Shapley attribution** over every coalition of the funded levers (`≤ 64` model evaluations,
  no sampling), with the efficiency gap printed, share-of-gain percentages, and a first-class
  substitute/complement **pair-interaction** table reconciled against the solo scores.
- **Seeded Savage minimax regret** over 32 lognormal parameter draws (seed 42, CV 0.25) against the
  plan, the six named playbooks and doing nothing, with P10/P90 bands.
- **Trust ladder** `unvalidated → refuted → provisional → backtested → validated`; only rank ≥ 3 may
  be called *actionable*, and every grade lists the evidence that would move it. The demo reports
  *refuted* and the UI says "comparative".
- **Out-of-sample checkpoint scoring**: the do-nothing baseline is frozen beside the prediction at
  adoption, so a later observation yields a skill score (`1 − model error / naive error`), with the
  skill withheld when no baseline was frozen and pooled skill suppressed below n = 2.
- Post-commit propagation on the existing spine: `RULE-SCA-01` exactly one DACI commitment decision
  (Shapley rows as options, trust grade in the question) priced by Decision Tempo in the same
  transaction; `RULE-SCA-02` exactly one owned checkpoint delegation; `RULE-SCA-04` typed `scores`
  lineage; `RULE-SCA-03` exactly one re-baselining decision when pooled out-of-sample skill turns
  non-positive. `capitalAutoPropagate:false` pauses checkpoint governance only — an explicit
  adoption always fans out.
- `SCA-01..05` signals merged into Insights (own domain, `DOMAIN_ORDER`), opaque CSV scope **#39**
  (3 rows × 28 columns, no names, titles or notes), deterministic board brief, and a demo seed with
  one draft portfolio and one genuinely scored checkpoint (skill 0.85).
- Additive v37 → v38 migration: `capitalPolicies`, `dynamicsCheckpoints`, five `capital*` settings.
  Normalisers repair rather than trust: weights are clamped and renormalised, the budget is bounded,
  an adopted portfolio without a date is demoted to draft, an off-roster owner is cleared, unusable
  or duplicate checkpoints are dropped, and every stored skill is re-derived on load.
- **Fixed a namespace collision found during verification:** the new rules were initially numbered
  `RULE-CAP-*`/`CAP-*`, colliding with Capacity & Flow (98 catalog rows, 94 unique ids). Renamed to
  `RULE-SCA-*`/`SCA-*` and added a catalog-uniqueness test.
- Verification: 945/945 tests across 58 suites (capital suite 39/39), ESLint clean, boundary 129
  modules / 58 suites, 144 docs links resolve, standalone rebuilt (2,741,516 bytes, schema v38).


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
