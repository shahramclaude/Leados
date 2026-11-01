## 2026-11-01 — How much of what you believe about your team survives its own measurement error? The Measurement Reliability Terminal (Session 109, Schema v77, [ADR-0069](./docs/adr/0069-measurement-reliability-terminal.md), CSV #67)

Every other terminal in this product audits an object the workspace stores: a case, a forecast, a premise, a delegation, a policy. **None audited the instrument a first-time leader uses to make the most consequential people calls they will ever make — the performance review rating.** That rating decides pay, promotion, stretch scope and whether someone is managed out. It is a measurement, it has a variance decomposition, and in the entire 2026 performance-management market nobody computes it. Culture Amp ships bias detection, calibration outlier flags and causal-inference language; Leapsome flags a department average more than 0.5 points from the company mean; Lattice, 15Five, Visier, Perceptyx and the AI-native entrants ship drafting, summarising, sentiment and attrition scoring. Every one of those signals is about **people or about managers**. None is about the reliability of the measurement itself. A 2026 standards review of HR analytics tooling is explicit that the accepted evidence stack is ICC, Bland–Altman and test–retest, and that alpha alone is insufficient — and no vendor publishes any of it for ratings.

`#/reliability` (seven panels) reads only reviews the leader already wrote, and answers four questions.

- **How much of the spread between my people is signal?** Every completed review becomes one observation of a people × cycle design. A balanced two-way random-effects ANOVA is solved exactly — τ² between-person, cycle and residual pooled as *occasion error*, because a manager cannot bank a good quarter and cash it later. Printed: ICC(1), a Satterthwaite interval, an F test of τ² = 0 with its p-value, and the reliability of the **mean of k ratings** by Spearman–Brown. A single rating and a four-rating average are different facts, and reporting only the flattering one is how an instrument gets oversold. Unbalanced designs use Cochran's n₀ and a balance ratio; a design too ragged to carry a coefficient is refused with a machine-readable reason instead of smoothed.
- **What should I expect from this person next time?** Per-person credibility n/(n + K), K = occasion error ÷ between-person variance, with regression to the mean stated as the expectation for the **next** observation. This is deliberately not a score, a potential rating or a ranking — the module has no code path that produces one.
- **Can I actually tell these people apart?** Separation is a posterior test, not a sort: two people share a tier unless the evidence separates them. The finding is the tier count and the number of indistinguishable adjacent pairs — on the demo record, 3 tiers and **2 of 4 adjacent pairs indistinguishable**. Inside a tier the order is alphabetical, on purpose, and membership never leaves the screen.
- **What would a defensible difference cost?** A decision study: **MDE 1.27 rating points** at 80% power on the current record, **7 ratings per person** to detect a one-point gap, and **8.9 months** at the declared 90-day cadence. A refusal the leader cannot act on is only half a product.

**Instrument convergence, with a hard refusal.** Three instruments that should describe the same people are tested against the rating record with tie-corrected Spearman and an exact permutation p: goal attainment, feedback balance and delivery timeliness. No composite is formed unless **every testable pair** converged. The demo makes the strongest honest case for why:
- goal attainment orders the same five people almost identically to the ratings (**ρ = 0.90**) and the exact test still returns **p = 0.083** — five people and one swapped pair. That is reported as *uncertified agreement*, with the sentence explaining that a single swapped pair at n = 5 is a limit of the rank test, not evidence the instruments measure different things;
- feedback balance and delivery timeliness do not carry enough items per person to rank at all, and say so.

Calling the first pair "agreement" would be a lie; calling it "disagreement" would be a worse one. The panel prints both.

**Freeze once, grade once, lapse an empty window.** A frozen reading stores the design counts, the coefficients, the tier and pair counts and the floor in force — **never a person's name, reading or tier membership** — and is graded once, out of sample, against the record as it stands at the horizon. A window that closes with fewer than the declared number of new observations **lapses** instead of being credited.

**`RULE-REL-01..05` on the same spine as every other module:**
- **REL-01** records each completed review as exactly one observation (a reopened-then-recompleted review is never double-counted) — and deliberately emits **no** workspace event, so `review.completed` stays the terminal entry downstream readers rely on;
- **REL-02** opens **at most one** governed DACI decision per ISO week, plus one blameless process task, when the instrument sits below its declared separability floor *while* differentiation is actually being asked of it (a merit cycle exists, or a calibration decision is open) — priced downstream by Decision Tempo in the same transaction — and links it with `qualifies-differentiation`;
- **REL-03** is the surprise guard: when a just-completed rating lands a full scale point outside that person's credibility-weighted band, it appends an advisory note to the review and opens one leader-owned verification task. **The rating is never rewritten**, and the note is a note, not a correction;
- **REL-04** opens at most one blameless method task per month when two instruments that should describe the same people do not converge;
- **REL-05** reconciles markers and edges and grades or lapses a frozen reading once, from strictly later observations only.

`reliabilityAutoPropagate` pauses the automatic side; an explicit scan always runs and reports what it would have done.

**Telemetry, not a target list.** CSV scope **#67** carries counts, ratios and coefficients with every cell **blank below its floor and never zero** — no name, no person id, no per-person rating, no free text. The board brief names no person and prints tier *sizes* only, because a brief gets forwarded and a tier membership does not travel with it. `REL-01..06` signals, a *Measurement reliability* Insights bucket, a nav badge and twelve route aliases complete the wiring.

**Not claimed:** that an ICC is a fairness measure (it is silent about bias against any group); that the coefficients generalise to other scales, populations or cadences; that a wide interval or a refusal means "no difference" rather than "unmeasured"; or that five people can certify an instrument. The caveats card and the brief print the limits, including that cycle and residual are pooled as occasion error on purpose and that a cohort-wide shift will therefore read as noise. Real-browser and assistive-technology behaviour of this page remains **[UNVERIFIED]**.

## 2026-11-01 — Would a rule have beaten you? The Counterfactual Policy Terminal (Session 108, Schema v76, [ADR-0068](./docs/adr/0068-counterfactual-policy-terminal.md), CSV #66)

Every prior LeadOS terminal grades the work against a declared standard, a forecast, or a plan the leader wrote. None of them could answer the question a board actually asks after a year of judgement calls: **would a standing rule have done better than the decisions this leader already made?** Not "was the decision good" — a counterfactual about the *policy* that produced it.

`#/counterfactual` is the **Counterfactual Policy Terminal**. It is off-policy evaluation applied to a manager's own records, and it is built to refuse as carefully as it estimates.

- **Four families of decision points, zero new data entry.** Every dated workspace record that already carries a decision and a settled result is harvested: a registered assumption and its human-assessed outcome (arm = a dated observation existed before it settled), a DACI call and its outcome review (arm = decided inside the declared review window), a delegation and its delivery date (arm = a checkpoint was held before the due date), a closed case and what actually happened (arm = mitigation spend was committed before resolution). Reward is 0 / 0.5 / 1 by each family's own declared rule. Nothing is entered for this screen, and **no arm is ever re-armed**: a policy is only evaluated where the record already took it.
- **Five policies race, four estimators disagree in public.** The recorded behaviour policy is *exactly identified*, so no model is fitted and no weight is applied to it — it is the plain mean, with agreement 100% and no interval. Against it: always act, always hold, prequential best-so-far, and adaptive-recent. Each is scored by a shrunk direct method, inverse propensity scoring, **Hájek (1971) self-normalised IPS** as the bounded headline, and the **doubly-robust** combination (Robins, Rotnitzky & Zhao 1994). Their spread is printed as the fragility diagnostic: above 10 points the row is called *fragile* rather than reported as a finding. Under poor overlap one rarely-taken arm moved doubly-robust by eight points; the bounded headline does not, which is why it leads.
- **Identification is checked before estimation, not after.** Manski (1990/1995) worst-case bounds — assumption-free and family-bounded — bracket every point estimate, and the missing fraction, effective sample size and per-arm floors decide whether a row is estimated or refused. A policy the record never took is **refused-unidentifiable**, never extrapolated. On the demo record: *always act* is +0.95pp with a 95% interval of [−3.92, +5.69]pp (**no-difference**), while *always hold* (+6.94pp), *prequential best* (−7.57pp) and *adaptive-recent* (−8.26pp) sit inside their own bounds and are refused — three of four alternatives cannot be answered by this record, and the terminal says so.
- **Hidden bias is priced, not assumed away.** Matched pairs are greedy nearest neighbours inside a caliper on **pre-treatment covariates only** (post-treatment matching collapsed overlap to zero in an earlier iteration). Balance is reported as ASMD (Stuart 2010), never assumed. McNemar (1947) is exact and two-sided, and a Rosenbaum (1987, 2002) bound gives the worst-case p-value as hidden bias grows, with the **design sensitivity Γ\*** solved by bisection to the exact Γ where the finding would be overturned. A **Hoeffding (1963) confidence sequence** lets the race be watched every day without the interval losing its time-uniform coverage — at 90 decision points the half-width is 0.19.
- **One governed ruling per week, never a policy adopted for you.** `RULE-CFP-01..04` run on the shared post-commit spine, marker-idempotent and pauseable: prospective capture before the outcome is known, outcome resolution from record dates, at most one policy-ruling DACI decision *plus* one blameless process task per ISO week, and reconciliation that drops decision points whose source record was deleted. Frozen evaluations are graded **once** from strictly later evidence and **lapse rather than being credited** when the window closes empty.

**Start:** `npm ci` then `npm run app`, or open the rebuilt `LeadOS-standalone.html`. Verify with `npm run verify:canonical` and `npm run verify:standalone`.

**Scope & limits:** this is decision support from observational records, not a causal experiment and not a person rating. No policy is ever adopted on the leader's behalf; the engine reads no confidential collection (`conflicts`, `pulses`, `candidates`, `messages` are provably never touched); no person is a unit anywhere in the module; the matched-pairs design requires no unobserved confounding, and the terminal states that assumption rather than hiding it. Real-browser and physical screen-reader walkthroughs remain **[UNVERIFIED]** (automated JSDOM + `axe-core` verified across all six panels).

---

## 2026-11-01 — Outcome Attribution & Loop Settlement Terminal: separate team execution from strategic thesis error, leader bottlenecks, and schedule/cost drift (Session 107, Schema v75, [ADR-0067](./docs/adr/0067-outcome-attribution-loop-settlement.md), CSV #65)

Response Studio (`#/responses`) and Action Bundles (`#/bundles`) let a leader rehearse and atomically adopt a coordinated response across cases, DACI decisions, delegations, assumptions, budgets, stakeholder briefs, and 1:1 prompts. Until now, however, LeadOS stopped at the adoption receipt: it could not tell whether a closed or slipping loop succeeded or failed because of **delegated execution**, **leader-gated clearance bottlenecks**, or a **falsified strategic premise**.

`#/attribution` is the **Outcome Attribution & Loop Settlement Terminal**:

- **Zero-re-entry $O(V + E)$ loop discovery:** harvests adopted Action Bundles, adopted Response Plans, and multi-channel Case Control Loops directly from the existing entity and typed-link ledgers.
- **Lipke (2003) Earned Schedule & Goldratt (1997) Fever Chart:** computes Earned Schedule ($ES = P \cdot PD$), time-based schedule performance ($SPI(t) = ES / AT$), schedule variance ($SV(t)$), and independent duration forecast ($IEAC(t) = AT / P$, withheld below 5% clearance), plotting elapsed window burn against clearance in Green / Watch / Red corridors.
- **Pressman–Wildavsky (1973) clearance separation & 2×2 attribution:** splits leader-owned gates (unchosen DACI calls, unsent briefs, unheld 1:1 support) from delegated work and classifies loops into six regimes: *Validated Win*, *Thesis Falsified — Clean Execution* (Holmström/Kerr team exoneration), *Leader-Gated Stall*, *Execution Drift — Untested Thesis* (Fixsen Type-III error guard), *Confounded — Refused* (explicit refusal when both execution and outcome fail without a settled premise), and *In-Flight On Pace*.
- **Brinson–Fachler (1985) 3-way economic variance & Savage (1951) ex-post policy regret:** decomposes cost delta into schedule drift, rate/spend revision, and joint interaction with zero residual while enforcing strict ISO currency isolation (`mixed-currency-refused`) and keeping unspent budget commitments `encumbrance-only`; grades ex-post regret across Response Studio's `Contain now` / `Evidence first` / `Delay` branches.
- **Prospective Brier calibration & generalized `RULE-STL-01..05` propagation:** freezes Cromwell-clamped $[5\%, 95\%]$ loop forecasts ahead of closure, grades them once out-of-sample on `case.resolved` / `premise.outcome` (Brier Skill Score withheld below $n = 5$), writes typed `settles-loop` / `exonerates-delivery` / `flags-bottleneck` edges, queues blameless 1:1 clean-delivery credit prompts, opens governed double-loop thesis-pivot DACI decisions (priced downstream by Decision Tempo in the same transaction), seeds After-Action Review drafts, flags leader-owned decision bottlenecks, and guards open assumptions against premature Type-III abandonment without breaking untouched Action Bundle withdrawal.

**Start:** `npm ci` then `npm run app` (default `http://localhost:5173`), or open the rebuilt `LeadOS-standalone.html` directly. Verify with `npm run verify:canonical` and `npm run verify:standalone`. This session: all 107 canonical test suites pass (**0 failures** across `[a-z]*.test.mjs`, including new `settlement.test.mjs` **9/9** and `access-audit.test.mjs` **13/13**), standalone **7/7**, scale **5/5**, lint, boundary, and internal markdown links pass.

**Scope & limits:** never a person rating or HR ranking; personal-blame language is rejected/scrubbed; observational attribution refuses confounded loops rather than claiming causal proof; real-browser and physical screen-reader walkthroughs remain **[UNVERIFIED]** (automated JSDOM + `axe-core` verified).

---

## 2026-11-01 — Currency-safe capacity and hiring decisions

Capacity now withholds global allocation and release rankings when estimated values use multiple currencies. The capacity-overload rule still opens a linked trade-off decision, but explains why ranked deferrals are unavailable; suggested scope trims are withheld too. Hiring and Today show vacancy exposure per currency; scenario historical vacancy and shadow-value claims are withheld when their units do not match. Existing decisions are not rewritten. No exchange rates, schema changes or new dependencies are introduced. Full workspace-wide dimensional safety and real-browser accessibility remain **[UNVERIFIED]**.

---

## 2026-11-01 — Decision integrity: currencies and portfolio tails (Session 105)

The operational-case portfolio now separates amounts by currency rather than adding, for example, EUR to USD and labeling the result USD. When a scenario's participating funded projects, cases, simulated changes or hiring costs use different currencies, the scenario engine withholds its combined valuation and Pareto claim; no exchange rates are invented. Different single-currency scenario values are not compared either. The decision handoff preserves that uncertainty rather than calling an unavailable comparison “dominated”. Numeric daily vacancy costs now enter scenario economics.

Summed individual P90 estimates for cases and diverted person-days are explicitly labeled as such, **not** as a portfolio P90; dependence is unknown. These checks are derived from the current records, so existing case rules still create decisions, delegations, capacity reserves and coaching prompts in the same transaction, and the valuation guard updates without re-entry. No storage migration, backend, dependency, or FX service is added. Other financial aggregations and capacity value-density rankings remain **[UNVERIFIED]** for mixed-currency safety; this change does not constitute a workspace-wide FX system.

---

## 2026-11-01 — Action Bundles: one review, many modules, one transaction (Session 104, Schema v74, [ADR-0066](./docs/adr/0066-action-bundles.md), CSV #64)

Response Studio now hands off to **Action Bundles** (`#/bundles`). From one operational case, propose a coordinated decision, delegated verification, testable assumption, budget commitment, stakeholder briefs and a blameless 1:1 prompt. Edit or deselect each action, rehearse the real production commands in a background worker, inspect the exact collection and typed-graph diff, then adopt atomically.

The generalized rule spine receives every staged source event in the same store transaction. A failed command, failed rule or mismatch with the reviewed footprint rolls the whole bundle back. Adoption freezes target fingerprints; withdrawal is allowed only while every target is untouched. It returns work, releases unspent money, dismisses unsent drafts and removes only untouched records—audit history and downstream work remain. No message is sent, no option is chosen, and no spend is recorded by adoption.

**Integrated:** case detail and Response Studio handoffs, Today and Signals attention, typed `bundle` node and `coordinates` relation, RULE-BND-01..03, Settings review-checkpoint toggle, nav badge/route aliases/title, aggregate-only CSV #64, receipt export, demo cleanup, additive v73→v74 migration, hosted module worker and standalone Blob worker.

**Start:** `npm ci` then `npm run app` (default http://localhost:5173), or open the rebuilt `LeadOS-standalone.html` directly. No account, backend, model key or runtime network call. Verify with `npm run verify:canonical` and `npm run verify:standalone`. This session: full suite **2018/2018**, final focused regressions **86/86**, standalone **7/7**; lint, boundary and documentation-link checks pass.

**Scope:** software rehearsal is not a causal outcome forecast; commitments are not actual spend; coaching is not a person score. Real-browser/assistive-technology walkthrough remains **[UNVERIFIED]** (JSDOM + axe coverage is automated).

---

## 2026-11-01 — Response Studio: rehearse contain / verify / wait across the real rule graph before you commit (Session 103, Schema v73, [ADR-0065](./docs/adr/0065-response-studio.md), CSV #63)

A first-time manager's hardest moment is not filling a form. It is the sentence after an incident lands:
**"What happens if I contain this now, verify it first, or wait?"** Until this session LeadOS could capture
the intake and simulate a case, but the three choices were still intuition, and the product could not show
their cross-module consequences before they became facts.

`#/responses` is the **Response Studio**. Pick an intake draft, declare the weekly delay cost
(low / mode / high), the mitigation budget, the delay window and the evidence window, then run a rehearsal.
The same commands and post-commit rules that run after commit are replayed in three disposable stores:

- **Contain today** — open the case now and spend the declared mitigation budget;
- **Verify first** — zero mitigation spend today, a cheap evidence action and a dated review;
- **Wait** — keep the budget, replay the case at the declared delay, and price the carry cost.

You see the operational diffs, typed relationships, rule failures, warnings and economics side by side.
The economics are **declared, not inferred**: PERT three-point mean, carry cost, Savage minimax regret,
and a verification break-even threshold. Adoption rechecks revision and fingerprints, refuses any failed
branch, and writes the case + routed intake + immutable receipt in **one transaction**. Follow-up is a
generalized rule (`RULE-RSP-01..04`): typed `rehearses`/`responds-to` edges, one owned delegation or DACI
decision fallback, and orphan repair. `responseAutoPropagate` pauses follow-up only. CSV #63 and the
identity-free brief export aggregate telemetry only. Hosted builds use a module worker; the standalone
reuses its inline bundle as a Blob worker with a fail-closed timeout.

**Cross-module links added/updated:** `response` and `intake` typed-link nodes, `rehearses` /
`responds-to` relations, a published propagation contract, the `Responses` insights bucket
(`RSP-01..03`), Today banner, Intake handoff, Settings cadence toggle, nav badge and route aliases.

---

## 2026-11-01 — Your probability words are an instrument: certify them out of sample, then transport them (Session 102, Schema v72, [ADR-0064](./docs/adr/0064-confidence-transport.md), CSV #62)

Every terminal in this product asks the leader to write a number with a percent sign on it. A decision's *P(this works out well)*. An assumption's prior. A study's expected confidence. A recovery plan's adopted probability. A deferral's *P(committed by the deadline)*. A monitoring review's *P(any false alarm)*. A survival reading's *P(still open at the horizon)*. Those numbers drive rankings, expected values, deferral premiums and every downstream forecast — and until this session nothing in the product asked the only question that makes them mean anything: **when this leader writes 80%, does 80% happen?**

`#/confidence` is the **Confidence Transport Terminal**. It harvests every settled declaration the workspace already keeps across **seven ledgers** (assumption outcomes, decision reviews, scored impact studies, recovery-plan reviews, graded deferral timing calls, graded monitoring reviews and survival horizons), orients each so 1 means *the declared event happened*, and races three instruments against each other on the leader's own record:

- **identity** — the numbers exactly as written, the null hypothesis that translating them buys nothing;
- **Platt scaling** — a two-parameter logistic fit with a Gaussian prior toward identity, so a thin record cannot manufacture a dramatic correction;
- **binned isotonic regression** — pool-adjacent-violators with a Beta(1,1) pseudo-count in every occupied bin and monotonicity repaired after smoothing, the most flexible map that can be fitted without inventing an ordering.

**The race is prequential, not in-sample.** Every settled declaration is predicted by a map that was fitted only on settlements that arrived *before* it. The last 240 settlements are the test set, and nothing is scored on data its own model saw. Brier is the only score. The verdict is decided by a deterministic paired bootstrap on the per-settlement Brier difference, and it can refuse in three different ways: `insufficient` below 24 settled declarations or 16 out-of-sample points (with the counts printed and no map fitted at all), `no-gain` when nothing clears the material margin with the interval's lower bound above zero, `harmful` when every fitted map is materially worse than the numbers as written, and `supported` only when both conditions hold. Simplest instrument first: the sigmoid wins a tie.

**A transport is applied, never written back.** Every open declaration is printed exactly as written, with the certified reading beside it and the gap in points; 15 points flags a reading. Six live readings per module, ranked by disagreement. The declared number in the record is never rewritten — a product that silently edits your forecast to its own better number has destroyed the only thing that made the forecast gradeable. A **calibration certificate** freezes the map's parameters, the prequential scores at issue, the pace and an expected-resolution count as facts; grading uses only settlements that resolved strictly *inside* the window, a window that closes empty **lapses** rather than being credited, and skill is derived on read from the two frozen Brier scores — never stored, never scored from a single window.

**Four rules on the shared spine** (`RULE-CTR-01..04`), marker-idempotent, inside the caller's transaction, paused by `confidenceAutoPropagate` while an explicit scan always runs: certify when transport is supported and nothing is open — with typed `recalibrates-belief` edges to the three promises it reads furthest from; one owned re-read task per source module per ISO week (cap 5 declarations); grade/lapse/challenge, where a transported loss opens one blameless process task and at most one governed decision per week; and edge reconciliation to deleted certificates.

**No per-person calibration exists anywhere in this product, and this module does not add one.** The unit is the leader's probability vocabulary. The demo makes the whole workspace tell one story: its decision journal carries 58 dated calls whose declarations slope the right way and land far too optimistically, which is exactly what makes Forecast Integrity, Calibration and Confidence Transport agree instead of contradicting each other.

**Cross-module links added/updated:** new `certificate` node (`#/confidence?panel=certificates&certificate=`) and relation `recalibrates-belief` (system-generated, assertable by the engine only); typed edges from a certificate to the premises, decisions and delegations it reads furthest from; a published propagation contract for the rule; the `Confidence` insights bucket (`CFI-01..05`); CSV scope **#62** (aggregate rows only — bands, sources, maps and certificates; no declaration title, id, name or free text, and blanks rather than zeros below every floor); an identity-free brief; a nav badge and 14 route aliases.

**Verified:** 46/46 new confidence-transport tests, including the hand-computed Platt recovery (true slope 1.6, intercept −0.8 recovered within tolerance), the isotonic monotonicity repair, the prequential guarantee (no point scored by a model fitted on it), the three-way refusal (`insufficient` / `no-gain` / `harmful` / `supported`), the stale-then-lapsed certificate lifecycle, single-grading, marker idempotency across repeated scans, the pause-versus-scan distinction, the aggregate-only CSV, the typed node/relation/route, six rendered panels and an axe-clean pass.

## 2026-11-01 — The Authority Model: does autonomy predict on-time delivery? (Session 101, Schema v71 unchanged; [ADR-0063](./docs/adr/0063-authority-covariate-model-preview.md))

The Borrowed Evidence terminal now has an **Authority model** panel (`#/credibility?panel=covariate`). When the leader has enough outcomes across at least three authority levels, it fits a deterministic one-covariate **Beta-binomial logistic regression** over the authority contract's ordinal ladder (recommend → agree → act + inform → own). It reports the posterior autonomy slope, a 90% interval, `P(slope > 0)`, and class-level on-time predictions with intervals. It fits only when the panel is opened; the existing rate estimates and event rules are unchanged.

This is a research preview, not a causal claim: delegation classes are few, outcomes may be temporally dependent, and authority assignment is not random. It does not change forecasts, verdicts, or automation. The panel refuses on insufficient variation and states the model prior. It first requires the existing pool's minimum three observed classes and eight decisive outcomes (plus a non-degenerate pattern), then at least three distinct authority levels. No new data collection, dependency, schema migration, or person-level score.

## 2026-10-31 — How much of this number is yours? The Borrowed Evidence Engine (Session 100, Schema v71)

A new manager's workspace is made of small samples, and for ninety-nine sessions every terminal did the honest thing with them: it refused. *Too few verdicts. Below the floor. Insufficient.* Correct each time — and useless together, because in the first quarter almost every question was answered "ask again later". The market does the same thing more bluntly: survey platforms suppress any group under three to five people, so a fifteen-person company gets one company-wide number. Open **`#/credibility`** (nav: *Borrowed evidence*) and every small sample is now priced with the evidence it shares with its neighbours.

**What it computes.** Each evidence group is a Beta-binomial hierarchy: signal families (the Signal Integrity Board's *actionable precision*, against the Board's own floor), assumption criticality classes (how often settled premises held) and delegation authority classes (delivered by the due date — returned and overdue work count as not delivered, work not yet due is censored rather than guessed). The hyperparameters are integrated over by **full Bayes on a deterministic grid** under the BDA3 hyperprior — not plugged in, because plug-in empirical Bayes understates its own uncertainty — so every unit gets a borrowed estimate with a 90% interval, its **own weight** Z = n/(n+M) (Bühlmann credibility, exact for this model), the exact posterior probability it sits below its floor, the **date its own record takes over** at the current pace, and the number of outcomes that would **flip its verdict**. A *what-if* re-weights the hyperposterior exactly to show what three more false alarms would do.

**What it acts on.** `RULE-CRE-01` runs on the shared post-commit spine the moment evidence arrives. Register an assumption at 90% in a class that has held 2 of 8 times and, in the same transaction, the **outside view** opens one governed decision (re-price / defend the inside view in writing / buy information / refuse borrowing) with a typed `outside-view` edge to the premise — later premises that week attach to the same decision. A delegation authority class that is decisively late opens one leader-owned **checkpoint task** linked to every delegation falling due in 21 days, each with its borrowed probability of landing on time. A signal family that the pool says is below the precision floor — while its own record is still too thin for the Board — opens one re-tune task. `RULE-CRE-02` asks once whether a heterogeneous pool is really one kind of thing, and obeys your written ruling for 90 days. Nothing is ever a person: units are families and classes, and every task is the leader's.

**Borrowing is graded, not trusted.** Every borrowed claim the rules act on is **frozen** with both forecasters — the borrowed estimate and the unit's own (Jeffreys) estimate — and `RULE-CRE-03` scores both by Brier on the same outcomes when the window closes. If borrowing loses to own data over six graded frames, the engine says so and opens the decision to stop. The demo seeds frames frozen from the state as it stood 30 days ago and graded from what actually followed: borrowing won one of three, and skill is withheld until three more are graded.

**Cross-module links added/updated:** new `credibilityframe` node (`#/credibility?panel=ledger&frame=`), relations `borrows-evidence` (frame → premise/alert), `outside-view` (decision → premise) and `governs-pooling` (frame → decision/delegation); `tracks-followup` edges from checkpoint tasks to delegations; the Signal Integrity Board's inventory now shows each thin family's borrowed precision and what a never-judged family inherits; a new **Credibility** Insights bucket (CRE-01..05) and nav badge; CSV scope **#61**. Additive `70 → 71`. See [ADR-0062](./docs/adr/0062-borrowed-evidence-engine.md). Real-browser and assistive-technology walkthrough remains **[UNVERIFIED]**, as does whether criticality and authority classes are the exchangeability classes leaders actually believe in. A borrowed number is model-based decision support, not a measurement.

## 2026-10-31 — Who grades the grader? The Signal Integrity Board (Session 99, Schema v70)

LeadOS evaluates roughly 300 rule predicates and one statistical scan every time a screen renders. That is a multiple-testing procedure, and until this session the product kept no record of what it cost or how often it was right. Every earlier session added tests; this one audits the *procedure that runs them*. Open **`#/integrity`** (nav: *Signal integrity*) and the Board reports **two numbers that have to disagree**: what the declared plan claims about family-wise error, and what your own one-tap verdicts say actually happened.

**The budget is charged, not asserted.** Lan–DeMets alpha spending, both published shapes — O'Brien–Fleming-like `α*(t) = 2 − 2Φ(z_{α/2}/√t)` and Pocock-like `α*(t) = α·ln(1 + (e−1)t)` — normalised so `α*(1) = α`, look *k* of *K* receiving the increment. Look 13 of a 12-look plan spends nothing and grants nothing; the budget does not renew itself. Multiplicity uses the **effective test count** `1 + (m−1)(1−ρ)` with ρ **declared** and a printed 0/30/60% sensitivity table — never estimated from co-firing, because a leadership record cannot identify the dependence between its own detectors, and inventing it would be the exact failure the Board exists to prevent.

**The detectors are graded by your verdicts.** On every insight card there is now a **Judge this signal** button: confirmed, explained, dismissed or false alarm. Those four split into detection truth (*explained* and *dismissed* were real changes) and actionable truth (only *confirmed* and *false alarm* enter actionable precision). Each family gets a Wilson 95% interval, and the status is deliberately asymmetric: **over-claiming** only when the *upper* bound falls below your floor, **calibrated** only when the *lower* bound clears it, **indeterminate** in between, **insufficient** below the verdict floor — where the count is printed and no score is given. Alerts-per-useful-alert (`nnfAlert`) turns "these alerts are noisy" into a number with an interval.

**One family carries a p-value. Fifty-four do not, and the product says so.** A predicate over your records has no null distribution, so applying Bonferroni to it would produce the *appearance* of rigour and none of the content. Only the early-warning scan is corrected; the rest are audited by measured precision. That claim is asserted in the suite so it cannot quietly become false.

**Forecasts freeze and are graded once.** A review stores the budget state on a date plus exactly one prospective claim — P(any false alarm among the next *n* surfaced signals) — and is graded after the window from *surfaced* verdicts dated inside it (a suppressed candidate was never shown, so it is never scored). Brier, with skill withheld below three grades; challenge notes **append**, nothing is rewritten.

**Cross-module links added/updated:** `integrityreview → decision` (*governs-monitoring-plan*) and `integrityreview → delegation` (*calibrates-rule*) through the case graph; a new `integrityreview` entity type deep-linking to `#/integrity?panel=ledger&review=`; the Board's own signals join the Insights roll-up in a new **Signal integrity** domain (42 of 42 buckets filled); verdicts are keyed by a de-identified digest so **no person is scored**, and calibration tasks open on the *leader*, never on the colleague whose record tripped a rule. **RULE-INT-01..04** run on the post-commit spine, marker-idempotent per ISO week, and never change the monitoring plan on your behalf — the governor opens one governed decision with four priced options instead.

**Try it in the demo:** load Demo data and open `#/integrity`. The demo carries 27 verdicts across 5 families, 7 recorded looks (69% of the budget spent), one **graded** review whose prediction provably predates its grade, one live unresolved claim, and a family measured below its floor. Judge a couple of findings from `#/insights` and watch the family's status move. CSV scope **#60** exports aggregate-only rows with a blank cell — never a zero — below the floor. Additive `69 → 70`. See [ADR-0061](./docs/adr/0061-signal-integrity-board.md). Real-browser and assistive-technology walkthrough of the five panels remains **[UNVERIFIED]**, as does whether 10% / 12 looks / Pocock survives contact with real use. This is a monitoring-cost model on your own records, not a claim about your team.

## 2026-10-31 — What fails together? The book of open calls (Session 98, Schema v69)

The per-call terminal prices one option at a time; a leader holds a **book** of them. Under independent exercise the expected total is the sum of the per-call premiums under *any* correlation — so every expected-value surface is structurally blind to what makes a book different from a list: what correlation moves is the **joint tail**, the **concentration** of that tail, and how often coupled calls **lapse together**. Open **`#/deferral?panel=portfolio`** (nav: *Deferral options → Portfolio*) and the terminal reads the whole book per currency.

**Correlation is discovered, ρ is declared.** The premise graph already knows which calls fail together — two decisions resting on the same load-bearing premise are coupled (`premise.decisionId` plus `rests-on`/`tests` links, open decisions only). A sharing pair with **no declared ρ refuses the joint tail and names the pair**; the graph identifies the coupling, you own the number. Non-sharing pairs take ρ = 0 by printed convention; ρ outside [−0.99, 0.99] is dropped, never clamped; and a mutually inconsistent set of declarations is refused outright — the module will not silently project it onto the nearest valid matrix.

**What you can act on.** Per-currency VaR/CVaR at your tail convention, with **Tasche component contributions** that partition the tail exactly — a call that is a small share of the premium but a large share of the tail is the concentration finding; HHI on premium and on contribution; the diversification credit (subadditivity: pooling softens the tail; a small negative measured credit is simulation noise, and the panel says which is which); and the **premise stress** — for each premise coupling members, the joint lapse probability under your declared ρ beside the same under independence, and the excess in percentage points. That excess is the number that says "these calls fail together X pp more often than unrelated calls would."

**The forecast discipline is unchanged.** A frozen reading stores ids, aggregates and **one** probability — P(any member commits before the window closes) — and nothing else: no titles, questions, persons or notes. One freeze per currency per day; graded exactly once, after the window, from recorded `decidedOn` dates; Brier against the frozen claim; skill withheld below five grades. A premise that moves **appends** a challenge note to every reading resting on it and never rewrites a figure. `RULE-DPO-01..04` propagate on the shared spine: every member call and stressed premise is linked to the reading; a scan reconciles edges, opens grading work and turns an expired window into one governed decision per week; a graded surprise opens one blameless process task; a premise breach opens one re-price decision per premise per week.

**Honest limits, printed on screen.** The quoted expected total is **always the exact lattice sum** — the Monte Carlo runs on a daily grid, is printed only as its grid error with the cause named (checkpoint overshoot; the commit *rate* still matches the lattice), and never stands in for the exact number. Signals read frozen records, not live renders. The demo seeds a coupled book (two top-priced calls `tests`-linked to the load-bearing premise, one declared ρ = 0.45) and no pre-frozen forecast. CSV scope **#59** exports per-currency aggregates only, blank below five readings. Additive `68 → 69`. See [ADR-0060](./docs/adr/0060-deferral-portfolio.md). Full browser/assistive-technology walkthrough remains **[UNVERIFIED]**. This is a decision-analysis model on a real-world measure, not a market price and not investment advice.

## 2026-10-31 — What is the flexibility to wait worth? (Session 97, Schema v68)

Every delay surface in LeadOS prices **what waiting costs** — Decision Tempo's carrying rate, the Cost of Waiting queue, the Consequence Lab's integrated cost, Information Value's EVSI. None of them priced **what the right to wait is worth**, so the product could only ever nag. Open **`#/deferral`** (nav: *Deferral options*) and the new terminal prices one open decision's option to wait as an **American call**, solved by Cox–Ross–Rubinstein backward induction at every node, and refuses when the record cannot support the answer.

**What it computes.** The stake `V` is the decision's typed value at stake. The commitment cost `K` is the money budget lines already point at that decision; a **reversible** call sinks nothing, so `K = 0` and the terminal tells you to decide now, while an irreversible call with no committed line falls back to the full stake and prints that convention. Waiting costs the workspace's own 12-week erosion price as a **cash outflow, never as drift**, because putting the delay price into both would double-count the Cost of Waiting arithmetic. Volatility is **measured, not typed**: 1.4826 × MAD of log(realised ÷ assessed) across your settled case exposures and delivered effort ratios, root-time annualised from the median horizon it prints. Below the observation floor the frame refuses; below the σ floor it withholds; a σ you declare yourself is accepted only when labelled `declared`.

**What you can act on.** The exercise boundary — *commit when the stake reaches X* — with the hysteresis that only exists because the call is irreversible and the value is uncertain; the flexibility premium; the probability the optimal policy commits before the window closes; the expected wait and the carry paid to get there; and two solved break-evens: the **carry price at which waiting stops paying** and the **σ below which it never appears**. Verdicts are decisions, not scores: *Decide now*, *Waiting pays*, *Indifferent* (a premium under your materiality floor is not advice to postpone), *Act or drop*, or *Withheld* with the missing input named.

**What it refuses.** It never adds the premium to EVSI or to the Cost of Waiting's integrated carrying cost — they measure different things — and it never runs on a risk-neutral measure, because a leadership decision has no replicating portfolio. No default σ, `K` or carry: each would make the screen work on every workspace and print a number nobody supplied. No `act-or-drop`/`commit-now` frame opens a watch task; the two verdicts that say "decide" do not also say "wait".

**The forecast.** Freezing a frame stores a bounded, identity-free record — stake, cost, carry, σ and its source, the lattice output and exactly one claim: `P(commit by deadline)`. It is graded once, after the window, from the decision's **recorded** `decidedOn`; a choice recorded without a date is ungradable, a graded frame cannot be deleted, and Brier skill waits for five grades. `RULE-DRO-01..03` write on the shared spine in the same transaction: a typed `defers-decision` link plus one owned boundary watch; a scan that reconciles edges, opens due grading work and turns a window that expired with the call still open into exactly one governed decision per ISO week; and a blameless process task when a grade misses by Brier ≥ 0.25. `deferralAutoPropagate = false` pauses freeze-driven writes, never an explicit scan.

**Try it in the demo:** load Demo data, open `#/deferral`, and use the what-if row to declare a carry of 0 on the irreversible negotiation call — the premium rises from USD 742 to USD 2,085 and the verdict flips from *Indifferent* to *Waiting pays*. The what-if is a URL, not a write; nothing is stored until you freeze. Signals land in Insights (*Deferral options*) and on the nav badge; CSV scope **#58** exports aggregates only, with means and money blank below five frames. Additive `67 → 68` — empty frame and marker ledgers, no back-filled prediction. See [ADR-0059](./docs/adr/0059-deferral-option-terminal.md). Full browser/assistive-technology walkthrough remains **[UNVERIFIED]**. This is a decision-analysis model on a real-world measure, not a market price and not investment advice.

## 2026-10-31 — Case-mix guard for delivery forecasts

Open **Delivery survival → Classes → Operational cases**. The new overlap read compares the current case types in the same two mature day-30 cohorts used by the existing drift check. It prints cohort counts and total-variation distance; a difference of at least 25 percentage points or a recent type absent in the earlier cohort requests review. This is a descriptive convention, not a statistical test or causal diagnosis. Current types can have changed since intake; normalized older records may default missing types to `risk`, so the check cannot prove historical overlap.

When the mix triggers, **Cost of waiting** marks affected case rows low-confidence without changing prices or probabilities. An explicit survival scan opens a linked review decision and, if an active owner can be resolved, a task; it challenges relevant frozen survival readings and can link a re-freeze task to the latest exposure certificate. No messages are sent. SURV-12 surfaces the warning and the survival brief includes it. Evidence is refused if either cohort has fewer than eight records or a harvested type is unknown. This first slice covers case type only, not severity or other work classes.

The survival harvester also no longer counts a future-dated exit as already observed. An unassessed transport axis can no longer produce an overall supported headline; an untestable exit cause is not described as a stable mix. **[UNVERIFIED]** full repository and legacy tree, real-browser/assistive-technology walkthrough, usefulness in the field. Existing case normalization can replace an invalid/missing closed date with today, so the harvest fix cannot recover dates already repaired by normalization.

## 2026-10-31 — Transport, decomposed: which numbers may still be read? (Session 95)

The decomposition below now runs at **three landmarks (14 / 30 / 60 days)** and is read as **two transport axes** on the **Delivery survival → Classes** panel. A shift that exists only by day 14 is intake volatility; one that survives to day 60 is structural; the shape across landmarks is named (early-only, sustained, crossing…). **Timing** (time to any exit) carries still-open probabilities and waiting-cost exposures; **completion** (the day-30 exit-mix verdict) carries completion probabilities and the "50% complete by" quantile. When only the completion axis fails, timing outputs stand and the failing numbers say so — on **Cost of waiting**, row confidence is no longer flattened by any drift, and the **Consequence Lab** flags descriptive futures and stamps both axes into every frozen reading. A **Scan** additionally challenges your frozen evidence: survival readings on a challenged class gain a note (their probabilities are never rewritten), and exposure certificates gain one owned re-freeze task — only when *timing* fails, because that is the arithmetic they freeze. Nothing is recalibrated: this is a stability audit of your reference class, not causal transport. See [ADR-0058](./docs/adr/0058-transport-decomposed.md).

## 2026-10-31 — Drift decomposition: which exit moved? (Session 94)

The transport check below pools every exit. The **exit-mix decomposition** on the same **Delivery survival → Classes** panel splits it: by day 30, did the recent cohort *finish* less, *give up* more — or both at once, at unchanged speed, so every cycle-time view stays green while completions are quietly replaced by abandonments? The split is exact (completed + abandoned + still open = 100% in each cohort), each cause is landmark-tested with Holm correction across six classes × two causes, sparse causes are refused rather than estimated, and a **Scan** opens the week's drift decision framed by the component that moved — an intake review with recent abandonments linked as exhibits, or a completion review about blockers. See [ADR-0057](./docs/adr/0057-drift-decomposition-competing-risks.md).

## 2026-10-31 — Forecast transport guardrail

Open **Delivery survival → Classes** (`#/survival?panel=classes`) to check whether historical delivery behaviour still describes recent work. Fixed start cohorts (30–89 versus 90–149 days ago) receive equal 30-day follow-up; Mantel–Cox log-rank tests use Holm correction across all six classes. Requires 8 items per cohort and 6 observed exits. Restricted mean time to **any exit** supplies the direction; abandonment is not success.

A detected shift lowers **Cost of waiting** confidence to low without changing declared prices or probabilities. **Scan** creates one review decision per class/week, links up to 20 affected open records, and creates a five-day evidence-check delegation if the leader resolves to an active person. No owner is invented. All changes use the existing atomic post-commit/persistence spine and append audit events. No dependency or schema change.

Limits: observational diagnostic; assumes independent items/censoring and comparable case mix. Fixed windows can miss other shifts. Holm controls this scan's six comparisons, not repeated looks over time. No detected shift is not proof of stability. Generated decisions freeze the diagnostic as text, not a reconstructable statistical snapshot.

Verification: 108 targeted tests passed (calendar drift, survival and cost of waiting), including real API propagation and reload. Full legacy/repository audit remains **[UNVERIFIED]**.

## 2026-10-31 — The Consequence Lab: what happens while a decision waits? (Session 93, Schema v67)

**Open `#/consequences`** in the app, or on an open Decision card select **Trace consequences**. No new intake form: the Lab reads the decision, its already-recorded money and typed graph connections, and the class's dated completion/abandonment history. Five panels take a first-time leader through an auditable decision-futures exercise:

1. **Executive read.** The default is the highest-ranked *priced* open decision whose +2-week survival curve actually meets the evidence floors. Its weekly price, still-open probability and **integrated expected carrying cost** are shown beside the number of first- and second-order operational records it touches. Select another decision to see it, even if its probability must be withheld.
2. **Ripple map.** Trace up to two recorded typed links from the source to cases, budgets, premises, dependencies, goals, other open calls and stakeholder records. Each path says *which* link connects two actual records; each destination deep-links to the source. People, candidates, confidential conflicts and anonymous pulse answers never relay. A graph path is **an association, not a causal effect**. A missing link is reported; a capped map is visibly incomplete.
3. **Delay futures.** Compare +1, +2 and +4 weeks. The module integrates the conditional Kaplan–Meier survival curve over each period: `E[outstanding weeks] = (1/7)∫ S(age+t)/S(age) dt`, then multiplies by the weekly price **already derived** from typed decision value (linear Reinertsen cost of delay) or the price the leader declared. This is more honest than the `#/wait` screen's `price × weeks × P(still open at end)`, which is a **lower bound** on expected carrying cost because it ignores time spent waiting by decisions that close before the endpoint. The Lab prints that lower bound, the integrated expected cost, and the full-wait ceiling together. With too few dated exits, too few items at risk or a horizon beyond the observed record, the expected cost is **withheld**, not set to zero. An unpriced call is **unpriced, not free**. Currencies never mix.
4. **Frozen & graded.** Freeze a supported +1/+2/+4-week probability *before the outcome*, then review once after the exact horizon: the decision's recorded `decidedOn` settles whether it was still open. Brier loss is printed for the frozen probability; base-rate skill waits for five graded readings. A missing decision date is a refusal, and a graded record cannot be rewritten or deleted. A failed browser save is explicitly warned as **in-memory only** with an export-backup path, never toasted as saved. A sealed reading stores only IDs and bounded aggregate numbers — no title, person, stakeholder stance or note.
5. **Method & refusals.** Every assumption, floor, named method and rejected interpretation is on screen. Conditional ceilings for linked priced work mean **“if every related item also waits the full period”**; they are not an expected domino loss, are never added to root cost and may describe overlapping money. They are not a recommendation to decide now.

**One action, many modules:** freezing a reading writes its typed `maps-consequence` / `surfaces-impact` links, an owned signpost-verification task if a linked premise is at watch/breach, and at most one DACI coordination decision per root/week when another open decision is connected and the root has material recorded delay price — all **in the same post-commit transaction**. An explicit scan reconciles stale edges and opens due grading work; a material forecast miss opens one blameless learning task when automation is enabled. Nothing is sent, no option selected, no person scored. Consequence signals land in Insights/Today and on the nav badge. An identity-free, board-ready text brief can be downloaded or copied. CSV export scope **#57** groups by horizon × currency and blanks means/money below five records; no individual reading appears.

**Try it in the demo:** load Demo data, visit `#/consequences` (the default selected decision has a supported curve), compare +2 weeks with the `#/wait` endpoint-only lower bound, select a linked decision from the chooser to follow its recorded path to a source case or budget, then **Freeze** a supported horizon. In your own workspace, first register a decision and link its operational context (the Decision card has a one-click entrance). There is no application backend, new dependency, external model or network call. This is an evidence-bounded decision aid, **not an AI that predicts the causal effect of your choice**.

See [RESEARCH.md §93](RESEARCH.md) for the named RMST, causal-evidence and competitive sources, [ADR-0056](docs/adr/0056-decision-consequence-lab.md) for the design and refusals, [ROADMAP.md](ROADMAP.md) for the next higher-leverage bets, and [AI-SESSION-LOG.md](AI-SESSION-LOG.md) for verified test/sync results. **[UNVERIFIED]:** real-browser screen-reader/contrast walkthrough, field validation with managers, class exchangeability and price accuracy; legacy `src/**` is non-canonical.

## 2026-10-31 — Evidence Terminal: what do several studies of the same lever say together? (Session 92; Schema v66)

Sessions 84–91 built the workspace's *single-study* machinery: the Impact Ledger pre-registers a hypothesis and scores it with interrupted-time-series regression, the Assumption Ledger scores priors, the Performance terminal freezes and scores a support-plan probability, and the Information Value terminal prices a declared experiment. Each answers a question about **one** study. `#/evidence` answers the one after it: **several studies of the same lever on the same metric have now closed — what do they say together, is the disagreement real, and is one more study worth running?**

Two families, pooled with the same core:

- **Effect family.** Every scored, locked impact study contributes its ITS level shift as a percentage of the pre-period mean — dimensionless, so different metrics can be pooled — **oriented so positive always means better**, with the un-oriented shift kept beside it. A fall in feedback latency is an improvement, not a backfire.
- **Resolution family.** Every *declared* probability that has since resolved — a study's expected confidence, a premise prior, a frozen support-plan probability — pooled on the log-odds scale with the Haldane–Anscombe correction, Wilson intervals, Brier **skill** against the base rate, and calibration-in-the-large (observed vs expected events, two-sided z).

Pooling is **DerSimonian–Laird random effects** with τ², Cochran's Q and I², and **both** intervals are computed so the **wider** of the z and **Hartung–Knapp** interval is reported — a small-study correction may only widen what the terminal claims. Five guards keep the number honest:

- **Pooling floor.** Fewer than three pre-registered studies ⇒ counts only, no estimate, reason printed. Exploratory studies are counted and shown, **never pooled** — that would reward declaring a hypothesis after the answer arrived.
- **Heterogeneity floor.** τ² and I² are withheld below four studies: three cannot separate real between-study variance from noise. Above it, I² ≥ 75 with p_Q < 0.1 returns **"Depends where you use it"**, not an average.
- **Direction.** A cell is only "works here"/"backfires here" when the reported interval excludes zero on the useful/harmful side *for that metric's declared direction*.
- **Independence.** Random-effects pooling assumes independent estimates. Two ITS studies of the *same* team metric whose **windows overlap** share observations, so the pooled SE is optimistic. The terminal counts the overlapping pairs and prints them beside the estimate instead of assuming the problem away. No meta-analysis tool surveyed (RevMan, CMA, JASP, `metafor`, MetricGate, the free calculators) flags this.
- **Influence.** Leave-one-out names any study whose deletion moves the pooled answer by more than the median within-study SE, or flips whether the interval crosses zero.

Egger's test refuses below ten studies: below that a funnel plot is a shape, not a signal. Ranking is the **lower credible bound plus the priced value of what one more trial would teach**, with both limits asserted by test — an uninformative trial is worth exactly zero and a perfect one is worth EVPI. When no within-study noise was declared, the value of a trial is `null` **with a reason**, never `0`, which would read as "worthless" when it is merely unpriced.

Freezing a review stores **aggregates only** — no title, hypothesis, note or identifier — so it cannot become a second unredacted copy behind the export boundary, and a later edit to a study cannot rewrite what it said. Grading reports **coverage beside mean absolute error**, because an interval wide enough covers almost anything and coverage alone would reward predicting nothing useful.

Five marker-idempotent rules (`RULE-EBM-01..05`) run on the shared post-commit spine before `decisionTempoRule`, pauseable via `evidenceAutoPropagate` while an explicit scan always runs: one DACI decision per pooled cell **ever** when the interval stays on the harmful side of zero, with `grounds-practice` edges back to the evidence (`RULE-EBM-01`); one replication task when a supported result stands alone — counted on independent *roots*, so three studies of which two are replications is still one finding (`RULE-EBM-02`); one pre-registration task where information value exceeds expected effect (`RULE-EBM-03`); typed `recommends-for` edges from the newest frozen review to open cases plus one owned delegation, because an edge needs a durable source and a page view is not one (`RULE-EBM-04`); stale-edge reconciliation and grading work (`RULE-EBM-05`).

EBM-01..08 signals, an `Evidence` insights bucket, nav badge, CSV scope #56 (opaque intervention/outcome/source codes; no titles, hypotheses, notes, names or free text; blank below every floor, never zero), and a demo that scores seven extra studies through the **real** estimator and freezes one review through the **real** builder, so the terminal never opens on a dead end.

Writing the suite found six real defects, all fixed rather than waived: the pooling core was fed units carrying `effect` where it reads `estimate`, so **every** cell silently refused to pool and the terminal was inert; `actions.js` declared `gradeEvidenceReview` locally, shadowing the imported engine function so the action **recursed into itself** and grading could never succeed; `unreplicated` required `replications === 0`, excluding precisely the case it exists to surface; metric direction was harvested but never applied, so a fall in a down-is-good metric was reported as a backfire; `#/impact` rendered nine identically-named `<section>` landmarks (an axe `landmark-unique` violation); `#/evidence` and `#/parity` had no document title.

See [RESEARCH.md §92](RESEARCH.md), [ADR-0055](docs/adr/0055-evidence-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: every meta-analysis tool surveyed is built for a researcher who already has a spreadsheet of study estimates — none harvests from the system where the work happened, none writes the finding back into the decisions and cases it should change, none refuses below declared floors, and none flags overlapping study windows. Search-limited comparison; **no claim of category-first status** in meta-analysis and no vendor outcome claim used as evidence. The design leans on published evidence rather than novelty: Korevaar et al. (2023, *Research Synthesis Methods*) find random-effects meta-analysis of ITS level-change estimates holds nominal coverage regardless of estimation method or study count, and the 2024 empirical comparison in *BMC Medical Research Methodology* finds the choice of random-effects estimator barely moves the answer — which is why DerSimonian–Laird is chosen for transparency, not for accuracy it does not have.

## 2026-10-31 — Leadership Parity & Standard Consistency: audit the leader's own distribution and bar (Session 91; Schema v65)

Session 88 audited the leader's due process *within* one performance concern; Session 90 priced the open queue. Neither answered the uncomfortable cross-cutting question Session 88 explicitly left open: **is this leader distributing coaching, stretch scope, promise reliability, and evaluative thresholds consistently across peers — or running one bar for an inner circle and another for everyone else?** Commercial HR and performance platforms (Lattice, Culture Amp, 15Five, Leapsome, Visier) tackle bias post-hoc through multi-manager HR calibration panels, survey sentiment, or demographic cuts, leaving a single manager's day-to-day operational allocation unmeasured before review season.

`#/parity` audits **only the leader's recorded behaviour** across active direct reports from dated workspace artifacts (1:1s, SBI feedback, GROW/stretch delegations, recognition, succession bench nominations, formal performance concerns, and completed reviews) — storing **zero protected characteristics**, computing **zero employee scores or rankings**, and taking **zero adverse actions**:

- **LMX Variety vs. Disparity (Theil $T = T_{\text{between}} + T_{\text{within}}$, finite-sample Gini, zero-safe Atkinson $A_{0.5}$):** Decomposes four leader-investment channels (coaching time, SBI feedback, stretch authority, sponsorship) across `level × rampBand` cohorts (Graen & Uhl-Bien 1995; Buengeler, Piccolo & Locklear 2021; Theil 1967; Atkinson 1970). New joiners inside `parityRampDays` (default 90d) are explicitly protected so elevated onboarding support counts as structural *LMX Variety* ($T_{\text{between}}$) and never triggers a fringe or disparity alert ($T_{\text{within}}$). Post-ramp teammates with skipped/overdue 1:1s, zero SBI feedback, and zero stretch/recognition while peers receive multi-channel capital surface in the **Structural Invisibility Fringe**.
- **Psychological-Contract Promise Ledger (Rousseau 1989; PSYCONES 2025; Wilson 1927):** Audits only `leader` and `shared` 1:1 commitments (`carryHistory` carry chains, overdue counts, and 95% Wilson score intervals so a `1/1` record is never misread as 100% reliability) and flags cross-teammate fulfillment spread above `parityPromiseGapWarn` (default 35pp).
- **Intra-Leader Standard Consistency & Noise Audit (Leventhal 1980; Kahneman, Sibony & Sunstein 2021; Nordmo 2026; Kendall 1938 $\tau_b$):** Compares evidentiary bars across adopted Performance Recovery plans (observation counts, override asymmetry, voice timing), checks succession nominations against the 5-signal behavioural rubric (halo nominations vs. overlooked 4/5+ bench), and computes tie-adjusted Kendall $\tau_b$ concordance plus $>65\%$ final-quarter recency flags across completed reviews.
- **Counterfactual 14-Day Rebalancing Planner & Falsifiable Parity Audits (Brier 1950):** Allocates `parityWeeklyBudgetHours` greedily across leader-owned actions (overdue promises, fringe 1:1/SBI restoration, overlooked-bench career conversations, standard re-anchoring) and projects counterfactual $T_{\text{within}}$ and overdue-promise reductions. Freezing a Parity Audit snapshots baseline metrics and an ex-ante improvement probability (5–95%), scored irreversibly once after `reviewOn` with Brier's quadratic rule (mean Brier withheld below five graded audits).

Five marker-idempotent rules (`RULE-PAR-01..05`) run on the shared post-commit spine before `decisionTempoRule`: domain-scoped standard-consistency DACI decisions with typed `audits-consistency` edges (`RULE-PAR-01`), blameless 1:1 prompts and leader-owned tasks (never assigned to the neglected report) with `rebalances-attention` edges (`RULE-PAR-02`), promise-repair tasks/decisions with `repairs-contract` edges (`RULE-PAR-03`), overlooked-bench sponsorship prompts (`RULE-PAR-04`), and stale-audit grading work (`RULE-PAR-05`). `parityAutoPropagate=false` pauses automatic triggers while explicit `scanParity` always runs. Signals `PAR-01..06` surface in the `Leadership parity` insights bucket; Today (`#parity-triage`) and Person views surface due audits and overdue leader commitments; CSV scope #55 exports opaque cohort and channel aggregates only (zero names, person IDs, conflict prose, or pulse comments).

Session 91 also uncovered and repaired **five pre-existing cross-module defects** from earlier sessions: (1) string severities on `warGameSignals` breaking numeric sorting plus missing `'War games'` in `DOMAIN_ORDER`; (2) `warGameRules` failing to persist `draft.warGameMarkers` and omitting required decision/delegation fields; (3) `warGameRules` passing 2 arguments instead of 3 to `ensureEntityLink`, causing `postCommit` savepoints to roll back war-game propagations silently; (4) `app/views/warGame.js` calling `ui/components.js` with incompatible positional signatures; and (5) `performanceSignals` emitting legacy `?tab=` / `panel=conversation` deep links instead of `#/performance?panel=evidence|diagnosis|plan|concerns`.

See [RESEARCH.md §91](RESEARCH.md), [ADR-0054](docs/adr/0054-leadership-parity-consistency-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: Lattice, Culture Amp, 15Five, Leapsome, Visier, and inFeedo Amber focus on multi-manager review calibration, pulse/sentiment surveys, or demographic equity cuts; search-limited comparison, and **no claim of category-first status**. The distinction is structural and testable: intra-leader allocation entropy, leader-owed promise intervals, and cross-artifact evidentiary concordance are computed locally from dated operational records before review season, with zero demographic collection and zero employee scoring. Explicitly not legal advice.

**Verified:** 15/15 new parity tests across 6 suites plus new War-Game and Performance regression tests. Full canonical suite **1,640/1,640 pass** (0 failures), `eslint` clean, canonical boundary **232 app ES modules / 92 test suites / 0 leaks**, internal docs links **322 across 161 markdown files**, standalone build **4,752,191 bytes at schema v65** (231 inlined modules) with **7/7** portability tests green.

## 2026-10-31 — Cost of Waiting: the queue with a price tag on the wait (Session 90; Schema v64)

Session 89 could say *which open items have already outlasted their class and what the chance is they are still open in N weeks*. None of that was in money. `#/wait` puts the price on the wait: the leader declares **one weekly price per class of work** (cases, funded work, hiring, change programmes, delegations, decisions — cap 24, fail-closed), and every open item is multiplied by the censoring-aware probability from the leader's own closed records: P(still open after waiting w more weeks) = S(age+w)/S(age). A decision with linked committed money is priced automatically — value at stake ÷ the 12-week erosion window (linear Reinertsen cost-of-delay, CD3) — and an item with no declared price is shown as **unpriced, never zero**.

The Queue ranks priced-overdue items first — overdue meaning past the class's own completion median — and prints per row the price (declared / derived / unpriced), days overdue, the still-open probability with the at-risk count it was conditioned on, and the legacy wait-horizon scenarios (1/2/4/8 weeks: probability and **endpoint lower bound**, `price × weeks × probability`; Schema v67 corrects the time-integrated expectation in the Consequence Lab). Totals are **per currency and never pooled**, with the top item's share of overdue exposure. Below the at-risk floor the scenario cell prints the refusal; past the longest observation it is flagged as extrapolated. Weekly **exposure certificates** freeze the priced queue, totals and scenarios with a review date, and are navigable from every priced item through typed `prices-delay` edges.

Five marker-idempotent rules on the shared spine make it structural: a scan or a price change reconciles stale edges, freezes the weekly certificate, links the priced-overdue queue to it (≤ 40, price in the edge), opens **exactly one triage DACI decision per currency per week** above the declared threshold, one owned delegation per top priced-overdue item (≤ 5, due +3 days, recorded owner only), and one declare-a-price task per unpriced overdue class (≤ 3, due +7 days). The rule opens the decision; the leader makes it. Signals WAIT-01..06 land in the new `Cost of waiting` insights bucket; CSV scope #54 exports aggregate per class × currency under opaque codes with scenario figures blanked below the evidence floor.

Schema v64 is additive (`waitPrices`, `waitExposures`, `waitCostMarkers`, clamped `wait*` conventions). On the shipped demo: 30 open items, 20 priced, 3 priced-overdue; **USD 40,538.89/week** of waiting exposure, **13,861.11** of it overdue; waiting +1/+2/+4/+8 more weeks is expected to add **19,141 / 27,032 / 26,420 / 41,758** more USD. Empty collections are the correct upgrade state — no price or certificate is invented for an existing workspace.

See [RESEARCH.md §90](RESEARCH.md), [ADR-0053](docs/adr/0053-cost-of-waiting-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: CoD/CD3 tooling (Reinertsen; WSJF; Productboard/Aha!/Airfocus) prices product-backlog items from a leader-declared per-feature cost of delay; people-analytics and AI-coaching vendors do not price the operational queue from the workspace's own records. Search-limited comparison, and **no claim of category-first status**. The distinction is narrow and testable: the price is declared once per class, the still-open probability is censoring-aware and estimated from the leader's own records across six modules, currencies are never pooled, and the page refuses a number its data cannot support.

**Verified:** 43/43 new tests, including the hand-computed Kaplan–Meier fixture (S(10)=0.5, S(15)=1/3, P(+2 weeks at age 13)=2/3), per-currency totals, all five rules with idempotency, the one-write cascade (certificate + links + triage decision in a single `store.update`), the aggregate-only CSV, the typed node/relation/route, rendered panels and an axe-core pass. Full canonical suite **1,623/1,623 pass**, lint clean, boundary 227 modules / 91 suites, standalone build **4,658,027 bytes at schema v64** (226 modules) with its 7 portability tests green.

## 2026-10-30 — Delivery Survival: the queue that tells you what waiting costs (Session 89; Schema v63)

Every queue in every tool, including this one, answers *what is open*. None of them answers the question a manager actually asks on a Monday: **which of these has already taken longer than work like this normally takes here, and if I wait two more weeks, what is the chance each one is still sitting there?** Two statistical reasons explain why nobody ships the answer, and neither is a styling decision. Open items are **censored** — drop them, as every "average cycle time" tile does, and you have measured only the work that went well. And work is **abandoned** as well as finished — count an abandoned item as "still running", and every team eventually completes everything.

`#/survival` handles both. It harvests every dated record the workspace already keeps across six modules — funded portfolio work, operational cases, hiring requisitions, org-change programmes, delegations and decisions — with no new data entry to get a first reading, and it estimates the curve properly: Kaplan–Meier product-limit survival with Greenwood variance and a log–log band, keeping open items in the risk set; the **Aalen–Johansen cumulative incidence** of completion, so abandonment is a competing exit rather than a silent censoring. The page prints both figures side by side, because the gap between them is exactly the work the organisation starts and does not finish. On top of that: Nelson–Aalen hazard in elapsed-time buckets, a Mantel–Cox log-rank comparison of any two classes, conditional completion over the next N days given the item is still open, and an **age percentile** — the share of past exits that took less time than this item already has — which is labelled a percentile and never a probability, because a percentile of past exits has no horizon in it.

The refusals are on the screen, in the place the number would have been: below the at-risk floor the page prints the refusal and the at-risk count instead of a probability; a median that was never reached says *not reached* instead of printing the maximum; a tail past the longest observation is flagged as extrapolated; a reading with fewer than five settled items withholds its skill score. A frozen reading is a falsifiable commitment — per-item probabilities, the at-risk counts they were conditioned on, the curve digest, a review date — scored once, afterwards, with Brier's quadratic rule **against the class's own base rate**. A graded reading cannot be deleted; a prediction cannot be frozen after the fact.

Five marker-idempotent rules on the shared spine make it structural: a frozen reading writes typed `endangers` edges to the items it does not expect to finish and one owned task per such item (max 5, addressed only to the record's real owner); a graded reading that lost to its base rate opens one repair task; a scan opens exactly one DACI decision per class per week when abandonment reaches the declared share of exits — one decision about a class of work, never one per item; one task per returned delegation with no recorded reason; one grading task per stale reading. `survAutoPropagate=false` pauses automation; an explicit scan always runs.

Schema v63 is additive (`survivalReadings`, `survivalMarkers`, eight clamped `surv*` conventions). Every statistic is recomputed on read, so no stored number can drift from the records that produced it — and an empty reading list is the correct upgrade state, because back-filling a prediction would be a prediction made after the answer was known.

See [RESEARCH.md §89](RESEARCH.md), [ADR-0052](docs/adr/0052-delivery-survival-terminal.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: project trackers show cycle-time averages and burndowns, portfolio-analytics vendors sell delivery metrics with percentile bands, PMO suites sell earned value. Search-limited comparison, and **no claim of category-first status** in delivery analytics. The distinction is narrow and testable: the curve is estimated from the leader's own records across six modules with censoring and competing risks handled explicitly, both the naive and the corrected completion figure are printed with the reason they differ, and the page refuses a probability the data cannot support. A vendor dashboard printing the corrected number would have to tell its customers that a quarter of their work is abandoned; the naive number is better for the vendor.

**Verified:** 57/57 new tests, including the hand-computed Kaplan–Meier and cumulative-incidence fixture, the log-rank tail, the at-risk refusal, the median-not-reached case, the effort-bias pair rule, the reading lifecycle refusals, all five rules with idempotency, the pause-versus-scan distinction, the insights bucket, the aggregate-only CSV, the typed node/relation/route, five rendered panels and an axe-core pass. Full canonical suite **1,580/1,580 pass**, boundary 222 modules / 90 suites, docs links 313 across 159 files, standalone build **4,590,498 bytes at schema v63** with its 7 portability tests green.

## 2026-10-30 — Performance Recovery: audit the leader's process, price the wait (Session 88; Schema v62)

Every other terminal grades something the leader produced. This one is for the moment the thing in question is a **person who is not delivering** — the moment where the market's tools are a rating grid, a PIP template whose conclusion already exists, or sentiment analytics scraped from messages. All three are refused here. What ships instead is the only artefact that actually helps: the leader's own record of what was expected, what was seen, whether the person was heard, whether anything was changed to help, and what the gap costs while nobody decides.

`#/performance` holds a concern as a dated record: the declared expectation with its source and the date it was said, the observed gap and its impact, observations scored for **answerability** against the feedback module's SBI scale (three thin observations are one moment dressed as a pattern, and the page says so), conversations, support actions, and the seven **Mager & Pipe** analysis questions that separate "could not" (a skill remedy) from "could and didn't" (a system remedy). Six **Leventhal/Colquitt** procedural-justice rules — notice, accuracy, consistency, voice, bias suppression, support — plus a named diagnosis gate a formal plan. While any gate stands the app refuses to adopt one unless the leader writes an override of at least 40 characters, which is stored verbatim and displayed beside the plan for the life of the record. It is not a checkbox, and it cannot be edited away.

Adoption freezes the objectives, a review date and a 5–95% probability; review is single-scoring, cannot be backdated before adoption or dated in the future, and a not-met verdict opens **exactly one** decision about the next *process* step with no exit option. Waiting is priced from recorded pay (Reinertsen cost of delay, replacement-cost convention) or reported as unknown — never zero. Five rules on the shared spine make it structural: a missing expectation opens one owned task and one blameless 1:1 prompt; meeting the evidence floor without a two-way conversation opens the conversation; adopting a plan opens one DACI decision on the support mechanism plus typed `concern→person` and `decision→concern` edges and a dated check-in; a not-met review opens one next-step decision; an explicit scan sweeps a passed review into one task. All marker-idempotent, all suppressible by `perfAutoPropagate=false` — but never an explicit scan.

The honesty envelope is tighter here than anywhere else in the product, and it is enforced in code rather than in copy: **no** performance rating, potential score, nine-box, ranking, sentiment or language analysis, and **no adverse action** — the app cannot terminate, demote, dock pay or change a role. The brief omits names by construction, CSV scope #52 exports one row per concern under opaque codes (`PC01`, `P01`) with no labels, notes or override text, and every screen that could be mistaken for a legal opinion says *"This is not legal advice."*

v62 also fixed a real v61 defect: the Coupled Load terminal had reused the continuity module's `couplingAutoPropagate` key, so pausing one paused both. `coupledLoadAutoPropagate` is now its own key and inherits the old value once, so no workspace's setting flips on upgrade.

See [RESEARCH.md §88](RESEARCH.md), [ADR-0051](docs/adr/0051-performance-recovery-due-process.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: HR performance suites (Lattice, 15Five, Culture Amp) sell review workflows, ratings and engagement analytics; PIP-template marketplaces automate a document with the conclusion pre-written; people-analytics vendors infer sentiment and flight risk. Search-limited comparison, and **no claim of category-first status**. The bet is narrow and testable: grade the leader's process and the leader's own probability, refuse to proceed while a fairness fact is missing, and make the adverse action structurally unavailable.

**Verified:** 43/43 new tests, including the 40-character override gate, single-scoring and backdating refusals, marker idempotency across repeated edits, the pause-versus-scan distinction, Brier scoring with the five-plan floor, the insights bucket, the codes-only CSV, five rendered panels and axe-clean markup. Full canonical suite **1,523/1,523 pass**, boundary 217 modules / 89 suites, docs links 307 across 158 files, standalone build 4,511,380 bytes at schema v62.

## 2026-10-30 — The Signal Path: what never reached you (Session 85; Schema v59)

Every other terminal in this workspace grades a decision you made. None of them grades the **channel the decision's inputs travelled through**. A disciplined decision engine fed by a three-level reporting line scores the choice as if the facts arrived intact, when three relays forwarding at 78% each deliver a material fact 47% of the time — and nothing in the workspace ever counts the misses, so the channel is described as working.

`#/signal` prices a declared escalation channel as a series of relays. Reach is `1 − (1 − Π t_hop)(1 − q_direct)`; false alarms compound in the opposite direction, so depth costs twice; latency is arrival-conditional rather than a naive sum; expected loss is `θ × exposure × (1 − reach × (1 − min(1, lag/horizon)))` — a channel absorbs part of a loss, never abolishes it. Information is Shannon mutual information in bits, sensitivity is d′ with a log-linear correction, and depth is derived from your roster: a management cycle is detected and refused rather than given a plausible-looking number.

The declaration is **falsifiable**, which is the whole point. Committing freezes the reading at four decimal places and refuses to let the exposure be rewritten; probes then ask a question you already know the answer to — *this fact existed on Monday, how did you come to know it?* — and the ledger grades the frozen prediction with counts, a Wilson interval, d′ and a Brier score. Below six settled probes the page prints counts and explicitly withholds a verdict. Nothing here infers anything about a person: the probe records delivery, not sentiment, and the copy says so.

Five interventions are priced, and each is re-scored by the *same* evaluator, so no recommendation can contradict the baseline it came from and no lever may lower reach or raise the wait. The hurdle is your own price of an hour, taken from the Attention Market where that terminal has a measured price; a lever below the hurdle is still shown, priced and labelled as not clearing. Four rules on the shared spine make it structural: typed `reaches` edges along the chain, exactly one redesign decision plus one owned probe task when the ledger contradicts you, a link from any case that lands on a blind path, and owned dated work for an adopted lever.

See [RESEARCH.md §85](RESEARCH.md), [ADR-0050](docs/adr/0050-signal-path-cascade-latency.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: escalation and on-call routing (PagerDuty, OpsGenie, Xurrent) is mature for *systems*, and the mum effect, upward distortion and organizational silence are decades-old findings in the management literature (Rosen & Tesser 1970; Athanassiades 1973; Milliken, Morrison & Hewlin 2003). This is not a claim of category-first status, and no vendor's outcome claim is used as evidence. The bet is narrow: price the channel from the roster, learn the per-hop declaration from a probe ledger instead of from surveillance, and grade the declaration rather than the people.

**Verified:** 28/28 new tests; real `addSignalClass → commitSignalClass → addSignalProbe → settleSignalProbe → adoptSignalLever → addCase` flow with rules co-firing, marker idempotency, and a case linked only when its path is genuinely blind; demo seeded through the real contract; axe-gated terminal. Full canonical suite and standalone verification below in the session log.

## 2026-10-30 — Autopilot Studio: standing instructions the workspace follows — but only after you rehearse them (Session 84; Schema v58)

Every previous LeadOS automation was developer-authored. Now a leader can declare their own **operating agreements**: when this event happens and these recorded facts match, create this accountable work. The vocabulary is deliberately closed — 4 sources (cases, decisions, delegations, goals), 14 events, 5 actions (open a DACI decision, assign owned work, prepare a blameless 1:1, register a testable assumption, ensure stakeholder briefs) — so there is nothing to misread and nowhere for a guessed owner or a sent message to hide.

Nothing runs until it is **rehearsed**: the same executor previews the agreement against your current records on a disposable copy, showing every match, every record it would create, every owner it would load, every blocked action and a threshold sensitivity. Activation binds your approval to a digest of the definition, the workspace revision and that preview — change anything afterwards and the approval is void. Execution is all-or-nothing inside the triggering transaction with typed `automates` provenance, durable idempotency keys and a bounded budget; a missing owner or a full 1:1 queue blocks the whole run, records the refusal and pauses the agreement instead of half-applying it.

Two deliberate orderings make this honest rather than merely functional. The rule evaluates **first** on the post-commit spine, against the record as your action left it — built-in propagation flips a fresh case to mitigating mid-transaction, so any later position would make "created while open" unmatchable. And markers are **desired-state** (one record per agreement, version, source and action): identical re-fires skip silently, changed facts open a new run that reuses the existing response instead of duplicating it.

What it can never do is the actual specification: no message sent, no decision option selected, no rating, no pay/hiring/termination effect, no agreement triggering another agreement. See [RESEARCH.md §84](RESEARCH.md), [ADR-0049](docs/adr/0049-governed-operating-agreements.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: Aera's October 2026 release describes Policy Studio (approve drafted rules, test against live decisions, then enforce) with a per-decision policy ledger, and Cloverpop/WorkBoard/Lattice all ship governed or conversational automation with vendor-claimed outcomes. This is not a claim of category-first status. The bet is the local-first binding for one leader with no model to trust: a readable vocabulary, a rehearsal from their own records, approval bound to that preview, five bounded writes. Sources, confidence labels and limits are in the research note.

**Verified:** 27/27 new tests; real declare → rehearse → activate → `addCase` fan-out (decision + task + prompt + joined assumption + drafts, 10 typed edges) with built-in rules co-firing and RULE-DEC-01 correctly declining; idempotent re-fires; both refusal paths with pause + AP-01; cascade guard; batch-ceiling rollback with receipt; axe-gated terminal. Full canonical suite and standalone verification below in the session log.

## 2026-10-30 — Shared-barrier risk is now visible across cases (Session 83; Schema v57 unchanged)

Operational risk is rarely independent. LeadOS now compares the **systemic barrier** a leader has already recorded on active cases and groups exact matches (case/Unicode/whitespace-normalized). On case create, edit, resolution, reopening or deletion, `RULE-ATT-05` reconciles typed `shares-barrier` case links. The graph edge contains no copied RCA text; changing the barrier removes stale links.

The Attention Market's Market panel now shows a **common-mode sensitivity** beside the ordinary additive plan: the sum of case exposures versus the scenario where they fully overlap (the largest individual exposure). Different currencies stay separate; unpriced cases stay unknown. This is deliberately an exposure sensitivity, **not** a correlation estimate, confidence interval, causal claim or optimizer input. A new signal routes the leader back to the cases. The optimization still makes the original additive assumption; pricing a correlated loss requires better evidence than matching prose.

The implementation also removes a mutable module-global clock from the Attention Market harvesters, so explicit `now` values are passed through each read and do not leak between calls. No schema migration or runtime dependency was needed. See [RESEARCH.md §83](RESEARCH.md), [ADR-0048](docs/adr/0048-shared-barrier-exposure-sensitivity.md), and the [session log](AI-SESSION-LOG.md).

Competitive context: risk aggregators already describe portfolio/common-cause analysis (NIST IR 8286C; Resolver's publicly summarized incident-to-RCA workflow), while AI-coaching vendors such as Coachello and Skillsoft CAISY offer conversation simulation. This is not a claim of category-first status. The bet is narrower: connect a leader's existing 5-Whys barrier entries to a privacy-minimized typed graph and expose the non-additivity question in the same hour-allocation market. Sources, confidence labels and limits are in the research note.

**Verified:** focused suite 31/31; real `addCase` → link → market scenarios → resolve/reopen → manual-link refusal → stale-edge removal; currency and missing-value handling; JSDOM render. `npm run verify:canonical` passes 1,376/1,376 tests, lint, boundary and docs links; `npm run verify:standalone` passes 7/7.

## 2026-10-30 — Price the week, not the list: the Attention Market (Schema v57)

Every screen in this workspace owns a queue and each one reports its own attention count. None of them answered the question a manager actually opens the product to ask: **I have eleven hours this week — which eleven hours should they be, and what does the twelfth cost me?** A merged, severity-sorted list cannot answer it, because it cannot say that two rows are the same item in different modes, it cannot say that handing work off moves it into somebody else's week, and it prices nothing. The consequence is the one every manager lives with: the obligations that carry a number win, and the ones that do not quietly stop being scheduled — with no decision on record, because nobody made one.

`#/attention` answers it. Every obligation the workspace can price becomes one group of mutually exclusive choices — **do it yourself**, **hand it off**, or **let it carry** — and the week is solved as a multiple-choice knapsack under **two** ceilings: your declared hours, and a delegate pool that stops the plan from handing everything to the most reliable person and calling it a strategy.

- **Nothing is invented.** Exposure comes from the record that already exists: a case's three-point cost estimate, a funded item's effort and value, a negotiation's stakes over your own BATNA, a dependency's measured daily impact and time-to-recover, an overspent budget, a priced decision frame. An obligation with no money is listed as `unpriced` with the hours it consumes, because work that cannot enter an optimisation is a fact the leader needs, not a row to delete.
- **The price of your next hour is measured.** The same market is re-solved with one more hour and the change is the price. A zero means the budget is not binding — which is an answer, and one most leaders never get.
- **Optimal when it can be, honest when it cannot.** Small markets close exactly by branch and bound and say "optimal" with a zero gap. Larger ones fall back to Dyer's relaxation with a Lagrangian dual minimised by golden-section search, and print the distance to a bound they can prove. No printed number claims more than it has.
- **The forgone set gets a price and an owner.** `RULE-ATT-03` writes **one** decision covering everything the plan refused, with the expected value it gives up, so "I was too busy" stops being free.
- **A plan is held to its own number.** Committing freezes the budget, the bought set, the forgone set and every success probability. The review re-reads each bought record, excludes items that have not moved (a plan is not wrong for being young), and scores the frozen probabilities with a Brier term over settled items only.

**What the build found:** the first convex-hull pruner removed the *cheap* dominated option instead of the expensive one, which silently deleted every delegation from the market; `effortDays` was being priced as the *leader's* hours, allocating 423 hours of "attention" against a 12-hour budget; and delegation, offered automatically on an uninformative prior, handed all ten obligations to one person because a hand-off looked strictly better than doing the work. All three are fixed and the first is now a regression test. Effort-days are team effort, so the module applies a **declared leader share** (default 10%), prints it beside every derived figure, and lets you override any row.

**Competitive benchmark (vendor documentation and peer-reviewed literature, not independent validation):** the algorithms are decades old — [Dyer (1984)](https://link.springer.com/article/10.1007/BF01580667) for the multiple-choice knapsack relaxation, [Fisher (1981)](https://pubsonline.informs.org/doi/10.1287/mnsc.27.1.1) for Lagrangian bounds. Enterprise connected-planning platforms (Anaplan, Pigment, o9) solve capacity allocation at company scale with a modelling team and a pipeline; calendar optimisers (Reclaim, Clockwise) allocate time *blocks* rather than priced *obligations*; Cloverpop logs decisions without allocating a manager's hours [UNVERIFIED — public product descriptions only]. LeadOS's narrower claim is the binding: objectives derived from the leader's own dated records, constraints on their own week and their team's own measured reliability, a frozen prediction, and a forgone list written into the decision register with its cost. That is a feature-shape comparison, not a claim of category-first status. See [ADR-0047](docs/adr/0047-attention-market-constrained-allocation.md), [`RESEARCH.md` §82](RESEARCH.md) and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

## 2026-10-30 — Plan the tests, not just the next one: the Sequential Investigation Planner (Schema v56, unchanged)

The Information Value Terminal priced one test at a time. A leader with three open tests saw three independent net values and no answer to the question that actually matters: **what do I run first, what do I do after each result, and when do I stop?** The new **Sequence** tab (`#/voi?panel=sequence`) answers it. It solves the declared test menu exactly by backward induction over up to three stages, conditions the belief by Bayes' rule after each settled test, and draws the decision tree as a nested list with the recommended path.

Every number is inspectable. The Sequence tab shows the stop value, the best single test, the full-sequence value, the second-stage gain, the expected number of tests run, each test's raw net value alone (negative when a test does not pay for itself, matching the register), and the assumptions the plan rests on: binary tests, conditional independence given the true state, and a finite menu. It refuses explicitly for unpriced frames, probabilities that do not sum to 100, settled evidence that cannot all be true, and excludes coin-flip and untargeted tests from the menu. Its limits are capped and printed rather than hidden: at most six tests (any excess is counted), and at most three stages.

Three marker-idempotent rules on the shared post-commit spine act on the plan:

- **`RULE-SEQ-01`** writes one advisory note giving the conditional plan when a second stage adds at least the materiality threshold.
- **`RULE-SEQ-02`** opens one commit decision, with each frame option priced under the current belief, when the plan says to decide now. A later stop revises that open decision in place; a decided one is never edited.
- **`RULE-SEQ-03`** creates one owned task on the frame owner for the next planned test, dated to that test and linked back to the frame. With no owner, it records a note and invents no assignee.

A worked example in the test suite (Vendor status read at 60/70, free; Load test at 70/70, USD 20 fee and wait) gives a plan of 550 against 520 for deciding now, a second-stage gain of 24, and a 1.39 expected number of tests. The planner's numbers were then checked by hand against the Bayes update and the backward induction; they agree.

**Consistency with the existing engine is tested, not assumed.** Across 60 deterministic random frames, each test's one-stage net equals the existing `evaluateInquiry` net within rounding. A perfect test is worth exactly the EVPI on top of the stop value (700 = 520 + 180), and a duplicate test adds nothing.

**Competitive benchmark (vendor documentation, not independent validation):** SpiceLogic's Decision Tree Analyzer computes EVPI from a hand-built tree and highlights the recommended policy after each result ([SpiceLogic docs](https://spicelogic.com/docs/decisiontreeanalyzer)). SmartOrg's Supertree "automatically re-orders tree nodes to calculate values of information and of control" ([SmartOrg](https://smartorg.com/supertree-sensitivity/)), so automatic sequencing is not new in that category. TreeAge Pro is listed at a one-time $450 price on a third-party directory [UNVERIFIED — the price was not checked against the vendor]. Cloverpop's public descriptions cover capturing decisions, rationale and outcomes; we found no description of a test-sequencing calculation [UNVERIFIED]. A [third-party scoring page](https://www.rfp.wiki/artificial-intelligence/decision-intelligence-platforms/cloverpop) rates its simulation and scenario testing at 3.2/5 [UNVERIFIED]. LeadOS's distinct combination is narrower than "sequential decision analysis": the exact plan is kept inside the decision register, its tasks and notes are written by the same event spine, and it is re-read on every settlement. We did not find evidence that the competitors above tie a plan to owned tasks and a decision log, but that is a search limit, not a proof of absence. See [ADR-0046](docs/adr/0046-sequential-investigation-planner.md), [`RESEARCH.md` §81](RESEARCH.md) and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

## 2026-10-30 — Calibration now changes the decision sensitivity (Schema v56)

LeadOS now carries a leader's own scored probability history into the **money and option sensitivity of an open decision**. The Calibration panel compares declared EVPI with a shrinkage-weighted scenario and a marginal Wilson-corner range, then reports whether the expected-value option changes across those tested scenarios. It refuses to calculate when any target probability band has fewer than three historical observations or the payoff table is incomplete.

When a new VOI frame has enough evidence, `RULE-LCAL-04` appends one explicitly non-prescriptive stress note and up to three typed `calibrates` links to the prior settled forecast frames that contributed the evidence. A later settlement also backfills eligible already-open frames (bounded to 20 per sweep, with a remainder event). The declaration and any frozen snapshot are never rewritten. This is a descriptive stress—not a posterior, forecast, or simultaneous confidence interval—and samples are not corrected for within-frame clustering. See [ADR-0045](docs/adr/0045-calibration-to-decision-sensitivity.md), [`RESEARCH.md` §80](RESEARCH.md), and [`AI-SESSION-LOG.md`](AI-SESSION-LOG.md).

**Competitive benchmark:** People-platform AI coaching (Culture Amp) and MCP/in-flow leadership assistants (Teamspective) make contextual action guidance a current product direction; forecasting platforms such as Metaculus return proper-score feedback. LeadOS joins the leader's score history to a specific business frame's EVPI with inspectable typed evidence. This is a public-feature synthesis, not a verified first-to-market or effectiveness claim.

Verification and release status for this change are recorded in the session log.

## 2026-10-30 — Decision evidence integrity

Information Value investigations can update an assumption only if the leader explicitly confirms that **one selected state is equivalent to that assumption**; composite targets and unconfirmed tests remain decision evidence, not belief updates. The association is frozen when the test is declared and checked again on settlement. Negative diagnostic evidence now uses the reciprocal likelihood ratio expected by the assumption ledger. Portfolio stress amounts are separated by currency; no exchange rates are invented. The concentration scan repairs missing typed follow-up links without duplicating tasks or decisions.

**Existing workspaces:** earlier releases could write investigation observations without this confirmation, underweight negative results, or produce concentration decisions that combined currencies incorrectly. Review existing investigation-sourced observations in the assumption ledger and old generated concentration decisions before relying on them; history is not silently rewritten. Scanning Information Value repairs missing concentration links when the premise is currently the top qualifying concentration. Back up your workspace first. This local app does not validate declared test accuracy or prove that the leader's equivalence is true.

## Information value — what is worth finding out before you commit (2026-10-30, Schema v54)

Seventy-six sessions of this workspace price almost everything a leader decides *after* the decision: a delay, a commitment, an intervention, a structure, pay, an exit. The sentence that decides whether any of those are worth opening had no surface at all: **how much is it worth to find this out before I commit?**

Without a number, two failures dominate real management. *"Let's get more data"* is a socially acceptable way of not deciding, with an unpriced delay attached. *"Let's just decide"* is a way of not thinking, with an unpriced risk attached. Consulting runs on the gap between those two sentences; no software prices it.

Schema v54 adds the Information Value Terminal (`#/voi`), which takes a declared decision frame — two to six states of the world with probabilities summing to exactly 100%, two to five options including doing nothing, and what each option pays in each state — and computes what information about that frame is worth.

- **EVPI is exact, not simulated.** `EVPI = Σ p(s)·max(o,s) − max(o) Σ p(s)·o(s)`, enumerated over the declared state space (Raiffa & Schlaifer 1961; Howard 1966). It is an upper bound *given the leader's declarations*, and the page says so beside every figure. No Monte Carlo, no seed, no approximation to argue about.
- **A missing payoff is null, never zero.** One blank cell makes that option unpriced and makes EVPI `null`, with the count of missing cells printed. A zero would silently become the most persuasive number on the page — the unknown option would look free.
- **Probabilities that do not sum to 100 are refused, not rescaled.** Rescaling typos produces a confident answer from numbers nobody declared, and nothing downstream can tell.
- **A test is worth what it changes.** With the declared sensitivity and specificity, Bayes' rule gives the exact posterior and `EVSI = E_signal[max_o E[u | signal]] − max_o E[u]`. Net value subtracts the declared cost; a test that costs more than it can be worth is reported as such, including the case where **no achievable accuracy pays for it**. The break-even sensitivity is found by bisection, which is valid because EVSI is monotone in accuracy (Blackwell 1951/1953). A test whose sensitivity and specificity sum to 100% is a coin flip and is refused at entry.
- **Expected value is not the only defensible rule.** Minimax regret (Savage 1951) sits beside it, and the page says plainly when the robust choice differs. Deciding against the arithmetic is allowed and requires a written reason — not a nudge towards the arithmetic, but a demand that a legitimate judgement be recorded as one rather than absorbed as an accident.
- **A settled test is evidence in the belief ledger.** `RULE-VOI-03` converts the arrived signal into the standard diagnostic likelihood ratio — `LR+ = se/(1−sp)`, `LR− = (1−se)/sp` — and appends **one dated observation** to the premise the frame's target states rest on, in the same transaction as the money result. The decision frame and the Assumption Ledger are the same uncertainty seen from two sides; a perfect test's infinite likelihood ratio is clamped, because the ledger refuses certainty.
- **Decisions that rest on one premise are one bet.** A Herfindahl index and a declared flip-stress (swap the two probabilities that carry the premise) show how many open frames change their preferred option if it is wrong, and what sticking with the old choice would cost. The flip is a declared stress, **not a probability that the premise is wrong**, and no covariance is estimated. `RULE-VOI-04` opens exactly one decision about de-risking the shared assumption — never one per frame.
- **A decided frame is held to its own number.** Deciding freezes EVPI, the per-option expected values and the declared distribution in the same write, and schedules one dated review that restates them. Recording the state that actually happened scores the frozen distribution (multi-class Brier 1950, log loss) and writes the **regret actually incurred**. Nothing is back-filled; nothing is rewritten.

`RULE-VOI-01..05` run on the shared post-commit spine and are marker-idempotent: typed `rests-on` provenance to every premise a frame's states reference plus an `informs` edge to the decision it belongs to; **exactly one** buy-information DACI decision (with the price of each branch printed) plus one owned task to scope the cheapest informative test when EVPI clears a declared money floor *or* a share of the declared stake — whichever is higher; one premise observation per settled test; one de-risking decision when a premise anchors too many open frames; and one dated outcome review per decision. `voiAutoPropagate: false` pauses the automatic side while an explicit scan still runs. The demo workspace carries two priced frames over its own assumption ledger, one live investigation and one settled one, so the page never opens on a dead end — the lesson Session 76 recorded after the structural terminal shipped against a roster with no reporting lines.

CSV scope #48 exports counts and ratios under opaque positional codes — **no label, no question, no premise title, no name, no currency amount, no individual payoff**. See [ADR-0042](docs/adr/0042-information-value-terminal.md) and [`tests/app/information-value.test.mjs`](tests/app/information-value.test.mjs).

## Workforce transition — the plan you can price, and the screen you must not quote (2026-10-29, Schema v52)

Every other module here answers a question about work. The largest people decision a first-time manager is ever in the room for — **who leaves, what it costs, and what leaves with them** — had no surface. The tools that exist are a compliance file (employee pools, protected-class adverse-impact analysis, WARN timelines, release packets, two-reviewer sign-off) or a workbook and a consultant's PDF. Both answer "can this survive a challenge". Neither answers "is this a decision".

Schema v52 adds the Workforce Transition Terminal (`#/transition`), with five tabs that read the same records the rest of the app already keeps — pay from the merit cycle, last completed rating, dependency stewardship, bench readiness, open cases, delegations and goals.

- **The cost is arithmetic with printed conventions.** Pay in lieu of notice at the declared notice days, severance at the declared months-per-year-of-service inside the declared cap. No tax, no holiday balance, no statutory guess, no FX. A person with no recorded pay is **unpriced** and `null` — never `0`, and never quietly dropped from a total that reads as complete.
- **Selection is a constrained optimizer that admits what it is.** Greedy by the declared objective, then swap repair against a cost ceiling, with blocked rows excluded (a sole steward of a critical dependency is **refused**, not warned about), locked rows forced, and the fractional-relaxation bound plus the gap to it printed. It never claims optimality.
- **Stability instead of confidence.** A seeded ensemble perturbs the declared weights, re-solves, and prints what share of draws each person survives. A name in every draw is robust to the weight table; a name in half of them is a judgement the model is hiding. It is not a probability that anyone should leave.
- **The screen is a screen.** Four-fifths over a declared organisational dimension or opaque group codes, with Wilson intervals on every rate, no comparison below the declared group floor, a printed count of candidates with no group code at all — and, because a ratio is an effect size with no significance test, **how many selections would have to move before the direction reverses**. On the test fixture: three of eight against one of eight, one transfer. The page says so instead of printing "adverse impact detected".
- **Compliance is priced.** When the screen fails, the module searches swaps between the over- and under-selecting groups and reports the cheapest set that clears the floor — swaps, cash delta, capability lost, headcount unchanged — or states that no swap set inside this plan can reach it, so the target or the criteria have to change.
- **Knowledge that walks out is an obligation, not a warning.** Continuity risk is read from recorded stewardship and open ownership; each materially at-risk leaver gets one owned hand-over task dated before the last working day; a sole holder blocks the selection outright.
- **The survivors are modelled, and the model is frozen before the change.** Recorded ownership is redistributed mechanically to the three lowest-loaded teammates; overload is reported; a four-term departure convention is frozen for retained high-value people as well as leavers, so the convention can produce a **false positive** and be scored for it. Brier skill is withheld below five resolved predictions.
- **Four paths, one comparison rule.** Declared-criteria selection, a voluntary offer priced as *adverse selection* (take-up concentrates among the most mobile — the people the criteria would have kept), internal redeployment (marked unavailable, not silently identical, when there is no receiving requisition), and doing nothing. Cash and capability are never converted into each other: the output is either one dominating option or the Pareto frontier with the trade between its ends.

`RULE-TRN-01..06` run on the existing post-commit spine and are marker-idempotent: typed `separates` provenance to every named person, **exactly one mechanism decision** about the criteria and the target when the screen fails (plus one owned scoring-grid evidence task) rather than a private swap of two names, one owned hand-over per at-risk leaver with typed edges to the dependencies at stake, at most three blameless survivor prompts, one dated outcome review plus one owned tracking task at finalization, and a resolved prediction when someone leaves. `transitionAutoPropagate: false` pauses the automatic side while an explicit scan still runs. Two gates refuse before any of that is spent: no **decide** without an accountable owner and a fully named target, no **finalize** without an owner and at least one priced exit.

Defects the new suite found and fixed: the CSV scope threw on `daysBetween is not defined` (never imported); `impactScreen` folded twelve undeclared candidates into an `unspecified` group and made the screen unreadable for the wrong reason; the outcome window used a literal 365 days while the review used the declared horizon; redeployment with no requisition silently reported the same headcount and cost as the involuntary plan; `decide` and `finalize` accepted a programme nobody owned. CSV scope #46 exports counts and ratios under positional programme codes — **no name, no identifier, no group code, no note, no per-person cost, no departure probability**.

This is a decision surface, not an HR system: it stores no protected characteristic, produces no legal document, runs no payroll, and its conventions exist to be printed and later contradicted by the calibration card. See [ADR-0040](docs/adr/0040-workforce-transition-terminal.md) and [`tests/app/workforce-transition.test.mjs`](tests/app/workforce-transition.test.mjs).

## Merit & pay equity — what the money buys, and what pattern it makes (2026-10-29, Schema v51)

Every other module in this workspace answers a question about work. The largest decision a first-time manager makes about **people** — how to spend a fixed merit budget across a team of unequal market position, unequal replaceability and unequal history — had no surface at all. The tools that exist produce a spreadsheet and a communication problem; pay-equity consulting produces a PDF that is out of date the day it prints.

Schema v51 adds the Merit & Pay-Equity Terminal (`#/merit`). It prices the decision three ways against the same budget, then grades its own prediction later:

- **Three policies, one budget.** Across-the-board at the budget's share of payroll; performance-weighted with an explicit fallback weight for anyone without a completed review; and **marginal retention value** — a raise-by-raise greedy optimiser over `replacement cost × reduction in modelled departure probability`, bounded by the band ceiling and the cycle's maximum increase. Each policy prints spend, budget use, minimum and maximum increase, band violations, the four-fifths ratio it would produce, expected departures, retained value and **regret against the best feasible policy**. Applying one recomputes it from the records; the view never writes a plan it was handed.
- **A decomposition with an honest interval.** Twofold Oaxaca–Blinder on log pay, controlling for level, tenure and the last completed rating (a missing review gets an explicit missingness term instead of being dropped). The interval on the adjusted gap is the standard error of a group indicator times a small-sample t. A percentile bootstrap was tried, measured and rejected: with eight people per group a resample can leave a level cell empty, so the interval measures composition noise rather than uncertainty about the gap.
- **A screen, not a verdict.** The four-fifths rule (EEOC Uniform Guidelines) is applied to the *decision*: a favourable outcome is an adjustment at or above the cohort median. Wilson intervals attached, `reliable: false` below the sample floor, and the page prints that a screen is not a legal conclusion.
- **No protected characteristic is stored.** The audit runs on a comparison the leader declares — hire origin (internal promotion versus external hire) or reporting line. Both are recorded, decision-relevant and not protected classes. Three caveats always print: an unexplained gap is not proof of discrimination, the controls are thin, and scope, negotiation history and market timing sit inside the residual.
- **The model grades itself.** The retention hazard is `logistic(z)` over four printed terms (band deficit, peer deficit, a recorded concern, nothing else) and no coefficient was fitted to the user's data. Finalizing freezes a per-person probability, `person.archived` resolves it, and the Brier skill score against the observed base rate is reported only at five or more outcomes — the demo honestly shows a base rate with no variance and a skill of `null`.

`RULE-COMP-01..05` run on the existing post-commit spine: typed `compensates` provenance from the cycle to every person it pays; **exactly one mechanism decision** when the audit is flagged (recalibrate the bands against the work, publish the grid and its evidence rules, commission a targeted review, or collect the missing variables — each with its cost) rather than an individual adjustment, because no individual adjustment repairs a distribution; one owned relative-pay task per cycle with typed `compares-pay-with` links; one dated outcome review; and a resolved prediction when someone leaves. Marker-idempotent, with `compAutoPropagate: false` pausing the automatic side while an explicit scan still runs.

Two defects the new suite found and fixed: `money(null)` coerced a blank salary to `0` through `Number(null)`, and the policy comparison read its own last-applied proposal as the baseline. Finalizing now refuses a cycle containing a blank decision, because a frozen audit cannot contain an empty row. CSV scope #45 exports ratios, counts and grades under opaque cycle codes — **no salary, no absolute pay, no name, no note, no cycle label**.

This is a decision surface, not a compensation system: it stores no protected class, runs no payroll, and its hazard coefficients are conventions that exist to be printed and later contradicted by the calibration card. See [ADR-0039](docs/adr/0039-merit-and-pay-equity-terminal.md) and [`tests/app/merit-equity.test.mjs`](tests/app/merit-equity.test.mjs).

## Implementation fidelity — was the thing actually delivered? (2026-10-29, Schema v50)

Every reviewed people-management suite measures whether **the tool** was used. Lattice's own analytics page describes its Adoption Dashboards as metrics on "engagement and utilization of Lattice". That is product adoption, not intervention fidelity, and the difference decides whether a contradicted study means "the idea failed" or "we never ran it".

Schema v50 adds the Implementation Fidelity Ledger (`#/fidelity`). A leader declares a plan *before* delivery — intervention type, intended population, planned units, and a window of at most 364 days — and the ledger then reads that plan two ways that are never merged:

- **Observed.** Four stages are derived from dated typed records the leader already keeps, each with an explicit standard: 1:1s that carry written notes, feedback notes that are complete Situation–Behaviour–Impact records, delegations that carry a dated check-in, goals with a key result that moved. Adaptation has **no instrument**, and the page says so rather than substituting a proxy.
- **Attested.** A dated human verdict per stage with an author and a note. A verdict that contradicts the records requires a written reason, and the disagreement is classified (optimistic, conservative, lenient, strict, mismatched) instead of being averaged away. Across plans it becomes a leader-level calibration statistic with a Wilson 95% interval, withheld below three verdicts.

Exposure is **multiplicative** — reach × dose × quality — because a practice delivered to everyone at 40% dose is not 70% delivered. Grading is refused (`insufficient`) when the evidence covers less than 60% of the model's weight, which is the reporting gap the 2025 fidelity reviews keep finding, surfaced as a state instead of a footnote.

`RULE-FID-01..05` run on the existing post-commit spine and are marker-idempotent: typed `measures-delivery` links to the measured record, a disagreement prompt, one repair decision plus one owned delegation when a settlement shows material under-delivery, one overdue-checkpoint task per plan, and a frozen `implementationSnapshot` when a linked Impact study is scored. That snapshot prints the ITT estimate, the Bloom/LATE per-complier estimate (ITT ÷ measured exposure) and the inflated minimum detectable effect together — so a study run at 50% exposure is described as underpowered by construction — and yields `null`, never `0`, when no counterfactual was fitted. `RULE-IMP-02` reads the same exposure: a contradicted but materially under-delivered study opens *repair delivery or stop on a weak test*, not a stop decision.

This is **delivery, not effectiveness**. It cannot see work outside LeadOS, practices with no typed records, or receipt by the people on the other side; it scores no person and reads no free text. The thresholds are printed conventions. Competitor absence, parity and comparative effectiveness remain **[UNVERIFIED]**. See [ADR-0038](docs/adr/0038-implementation-fidelity-ledger.md) and [`tests/app/implementation-fidelity.test.mjs`](tests/app/implementation-fidelity.test.mjs).

## Impact execution evidence — connect a declared intervention to its retained rule path (2026-10-29)

Schema v49 extends the existing Impact Ledger rather than building another workflow. When declaring a study, a leader can choose the exact existing case, decision, delegation, goal, feedback record or other supported typed source. Scoring freezes a bounded snapshot of successful LeadOS propagation transactions whose root or applied-step event names that exact source. A real case-created cascade can reach decisions, delegations, goals and coaching records through the shared event spine; the study connects back to the source case with an `evaluates` edge.

This is **implementation evidence, not an efficacy claim**. The ledger does not show work outside LeadOS or prove delivery, exposure, fidelity, adoption, quality or causality. A zero match can mean no automation was triggered, the work happened elsewhere, or the transaction aged out of the bounded 250-row lineage. Historical v48 studies are labeled `not-recorded`; no past snapshot is inferred. See [ADR-0037](docs/adr/0037-impact-execution-evidence.md) and [`tests/app/impact-execution.test.mjs`](tests/app/impact-execution.test.mjs).

- The snapshot is taken at scoring, counts exact typed root/step matches from the declared start date, and keeps at most 12 local trace-navigation IDs. It stores no copied titles, hypotheses, notes or event payloads.
- The Impact screen names the source record and shows the scoring-time counts with explicit uncertainty language. Redacted exports remove navigation IDs for lineage rows they omit; demo cleanup clears deleted source pointers while preserving frozen counts.
- Impact CSV scope #32 adds status and bounded aggregate counts only—no source IDs, trace IDs, labels, titles, hypotheses or free text.
- Research compared this slice with vendor-announced Lattice Workforce Intelligence / AI Leverage Insights and 15Five Agents. These are different products and evidence units; current availability and feature parity remain **[UNVERIFIED]**. No uniqueness or competitor-absence claim is made.

Frameworks informing the design: implementation fidelity versus outcome evaluation (Carroll et al.); pre-registration and interrupted-time-series guardrails already in the Impact Ledger; atomicity/idempotency patterns from reliability engineering (not a claim of a distributed outbox); missingness under a bounded observation window; and data minimization.

## Cross-module provenance — follow what the automation actually changed (2026-10-29)

A typed link should land on the record it names, and a successful automation cascade should leave a receipt without creating a second copy of sensitive content. LeadOS now does both on the existing local event spine. See [ADR-0036](docs/adr/0036-bounded-propagation-lineage-and-typed-links.md), [`tests/app/typed-links-lineage.test.mjs`](tests/app/typed-links-lineage.test.mjs) and [`tests/app/typed-link-navigation.test.mjs`](tests/app/typed-link-navigation.test.mjs).

- **Exact navigation:** the shared typed-link resolver builds encoded routes; destination views focus the selected record instead of dropping the leader at a module home. Selection is navigation only. Retired scorecards remain reachable for provenance.
- **A real cross-module example:** committing a distorted scorecard can create a redesign decision, owned delegations and a coaching prompt, connected back to the frozen scorecard with typed `informs` links. The automation—not a hand-written narrative—produces the lineage.
- **Schema v48 success lineage:** `#/propagation?tab=lineage` records the source event, applied rule steps, changed collection/type/ID references, new typed edges and emitted event types. It stores no titles, summaries, notes, score inputs or record bodies. It is capped at 250 transactions, 32 steps, and 48 target, edge and event references per transaction; omissions are disclosed.
- **No fabricated past:** upgrading a v47 workspace starts with an empty lineage. No success is inferred from old audit messages. Failures continue to use the separate propagation-receipt path; the lineage is not a replay log or a claim of causal effectiveness.
- **Lifecycle and export:** conflicts and anonymous pulse records are excluded; clearing demo data scrubs deleted-record references; candidate-linked transactions are omitted from redacted exports. CSV scope #43 exposes counts and types only, while a full JSON backup preserves the bounded ledger. Record IDs remain workspace data and are not claimed to be anonymous.

The feature extends the native browser app and existing generalized rule engine; it adds no runtime dependency or network service.

## Scorecard integrity — what the numbers will make people do (2026-10-29)

Every goals tool reports progress on the metric you chose. LeadOS now models the metric itself.
Declare a scorecard — the tasks it counts, what each is really worth, how easy each number is to
move without moving the work, how noisy it is, and how much pay or promotion rests on it — and the
lab computes the effort equilibrium an honest agent will land in: genuine work, cosmetic movement,
and the uncounted job that quietly stops happening.

The output is a figure a leader can act on: **34.3% of first-best value** on the demo card, with
**75.7%** of measured effort modelled as cosmetic, and the search offering a redesign worth
**+23.4 net value points**. In hours, ≈21h/week buys behaviour the scorecard does not reward and
≈11.2h/week is recoverable. Committing freezes the prediction; recording what actually happened
scores the model and prints the miss. Nothing is inferred from messages, calendars or telemetry,
and no person is ever scored. See [ADR-0035](docs/adr/0035-scorecard-integrity-lab.md) and
`tests/app/measurement.test.mjs`.

## Case mitigation evidence gate (2026-10-29)

The case graph now shows how many distinct linked mitigation delegations are complete or missing. **Monitoring is a cue to verify residual risk, not proof of safety.** Completion of a delegation moves an open/mitigating case to Monitoring only when every `mitigates` delegation in either graph direction is present and marked done. Returned or missing work blocks the transition. Duplicated edges count once. Well-formed links from an existing case to a missing mitigation survive normalization and reload (unlike other invalid links), with a warning. After checking the missing work, use **Review & remove** on the case to remove that link; the audit records the link and the case rule re-evaluates remaining work. No delegation is deleted. Removing the last link never implies completion. Existing Monitoring cases are not automatically rolled back, and manually resolving a case remains a human action.

This is deterministic local logic, not an AI prediction or proof that the work is effective. No network or new runtime dependency. See `tests/app/case-mitigation-gate.test.mjs`.


## Case cascade integrity (2026-10-29)

Case details flag operational links whose targets cannot be resolved. The case rule preview and sync treat missing decision and mitigation targets as missing, so eligible rules can create replacement linked work; broken edges remain for investigation. The case audit shows typed case events and propagation events for explicitly linked peers, rather than guessing relevance from titles. It excludes conflict and pulse events. This is an integrity safeguard, not an assertion that all modules self-repair.

# LeadOS — a leadership workspace that keeps its own receipts

LeadOS helps a first-time manager turn real conversations, feedback, goals and commitments
into evidence-linked next steps. Its team-health indicator is an explainable heuristic over
those records, not an objective leadership grade or a substitute for listening to people.

## The Scorecard Integrity Lab — modelling the measure, not just the goal ([ADR-0035](docs/adr/0035-scorecard-integrity-lab.md), `RULE-MTX-01..02`, Schema v47)

Goals tooling has an unexamined premise: that measuring something and reporting progress on it is
neutral. It is not. A measure is an incentive, and an incentive that pays for the cheap way to move
a number will buy the cheap way — from people who are not being cynical at all. LeadOS could already
track a goal's pace honestly (`goalPace`), check a single change for incentive alignment
(`evaluateStarAlignment`), and price the value of waiting on a decision (`expectedValueOfInformation`).
It had nothing to say about the instrument itself.

**The model.** `scorecardEquilibrium` solves a multitask principal–agent problem with a gaming
technology, in closed form, on the leader's declared parameters:

- `ŵ = w/Σw` — declared weights are renormalized, so a hand-edited 80/80 cannot double the real
  intensity;
- `ρ = ŵ/(1 + rσ²)` — a noisy metric is discounted (Banker & Datar 1989);
- `genuine = (ρ/c)(1 − 0.6·ratchet)` — the ratchet withholds output (Weitzman 1980);
- `gaming = ρ·ease·(0.6 + 0.8·stakes)/k` — stakes raise cosmetic behaviour (Campbell 1979);
- uncounted work receives **none** of the incentive (Holmström & Milgrom 1991), and the shortfall
  against first-best is printed rather than implied.

Effort is conserved: the declared uncounted-work floor is a share of a fixed budget, and when the
leader declares nothing uncounted, that floor redistributes instead of evaporating — a defect the
new tests found and now pin.

**The redesign search.** Seven deterministic designs — re-weight toward value that is hard to fake,
pair guardrails on the most gameable metrics, halve the stakes, measure the work you left uncounted,
and three combinations — are evaluated against the same model and ranked by modelled value net of a
declared per-metric measurement cost (default 2 points). A recommendation is made only when the net
lift clears 2 points; *keep it* is a legitimate and common answer.

**The falsifier.** Committing freezes the prediction: efficiency, cosmetic share, neglect, Goodhart
index, worst metric, and a +12pp margin. The leader later records their own estimate of how much of
the movement was cosmetic; the lab scores it, prints the error, drafts an after-action review when
the model was too kind, and refuses to claim calibration below three observations.

**Cross-module propagation.** `RULE-MTX-01` turns a distorted commit into exactly one DACI redesign
decision with four real options (including accepting the distortion), at most two owned delegations
(instrument the counter-metric; baseline the uncounted work) and at most one blameless 1:1 question.
`RULE-MTX-02` turns a falsified observation into one calibration decision and a pre-filled review.
A sound scorecard creates nothing at all. A committed design cannot be edited — the lab forks a new
draft with its own prediction, so the earlier forecast stays scorable.

**What this is not.** It is not a measurement of any person, and it never reads a message, calendar,
keystroke or sentiment. The parameters are declared conventions; a leader who declares their metric
unfakeable will be told the card is sound. That is the risk the falsifier exists to cover, and why
every number on the page is printed next to the equation that produced it.

## Hand-over execution verification, causal mechanism attribution & cross-team vendor contagion ([ADR-0034](docs/adr/0034-handover-execution-mechanism-attribution-and-vendor-contagion.md), `RULE-LCS-04`, `LCS-06..07`)

A cover delegation marked `done` on paper is not the same thing as an executed hand-over, and a
drill that stalls because nobody briefed or executed the cover plan is not a probability-model
error. Session 69 closes the three remaining gaps from [ADR-0033](docs/adr/0033-correlated-absence-and-briefing-readiness.md):

1. **Three-stage hand-over implementation grading (`gradeCoveredSourceProgress`, `handoverImplementation`, `LCS-06`).**
   Every covered source obligation (`decision`, `case`, `delegation`, `stakeholder`, `goal`,
   `person`) linked from a commissioned cover delegation is checked against its own dated
   lifecycle fields on or after `windowStart`. A cover delegation closed as `done` while zero
   linked source obligations moved is graded **`paper-only`** (never silently counted as executed)
   and raises `LCS-06` at severity 4; advancing at least one linked source record upgrades it to
   **`completed-verified`**.
2. **Automatic fallback hand-off on returned cover (`RULE-LCS-04` on `delegation.returned`).**
   When a deputy returns a commissioned cover delegation (`status: 'returned'`), `RULE-LCS-04`
   evaluates the remaining deputy pool for that window at the 75% fallback fit convention
   (`CONTINUITY_BACKUP_FIT_DISCOUNT`). If an eligible backup deputy clears the evidence floor, it
   creates a replacement cover delegation (`priorDelegationId`, `supersededByDelegationId` on the
   returned record, typed links to the parent hand-over decision and all covered obligations, and
   one blameless 1:1 briefing prompt). If no remaining deputy clears the floor, it opens one DACI
   cover-gap decision (`[LCS-RETURN:...]`) linked to the uncovered obligations so Decision Tempo
   prices it in the same transaction.
3. **Causal mechanism attribution on closed drills (`attributeDrillOutcomes`, `RULE-LCS-04` on `continuity.drill.closed`).**
   Closed-drill predictions are partitioned into **`model-miss`** (predicted covered or actively
   executed cover that still stalled), **`implementation-drop`** (commissioned cover that was
   unapproved, unbriefed, returned, unexecuted, or paper-only and stalled),
   **`predicted-stall`**, **`unmodelled-resilience`**, and **`clean-cover`**, reporting both the
   unconditional Brier/skill and **`executionConditionedBrier`** / **`executionConditionedSkill`**.
   When a window drops implementation, `RULE-LCS-04` automatically drafts one pre-filled
   After-Action Review (`retros`, Schema v43) and opens one owned ritual-fix delegation
   (`[LCS-EXEC:...]`).
4. **Multi-shock & cross-team vendor common-mode contagion (`vendorCommonModeContagion`, `LCS-07`).**
   Removes the single-shock, single-team ceiling by modelling a second simultaneous shock
   (`continuitySecondShockPct`, default 10%) alongside active service and vendor dependencies in
   `state.dependencies` (Schema v29) whose Simchi-Levi survival shortfall (`effectiveTTR > ttsDays`)
   pulls primary and backup stewards across multiple teams into incident recovery at once. Active
   dependencies missing `annualFailureProb` or `ttrDays` are surfaced in `unmodeledDependencies`
   and never treated as 0% failure risk.

## Correlated absence and the briefing nobody recorded (Schema v46, ADR-0033)

Schema v45's exact stall distribution assumed independent items. Measured on the demo's own
records, that assumption was worth **31.6% of the P90 tail**: 16.88 expected stalls and P90 19
under independence become 19.07 and P90 25 once a shared cause is allowed. So the page now shows
both, side by side, and prints the lift instead of picking the flattering number.

The correlated model (`simulateCorrelatedAbsence`) adds three mechanisms and states each one:
one shared cause per window takes the deputies recorded on **one team** offline together (25% by
default, adjustable 0–100%, a stress convention and not a measured outage rate); each deputy is
individually away with 8%-per-14-days odds compounded over the window; and when a deputy is away
the item falls back to the **next eligible deputy at 75% of their recorded fit**, or stalls if
there is nobody else. Coverage is now `fit × P(at their desk)` rather than `fit × availability`.

That last change fixes a real defect rather than tidying one: under the old formula a deputy who
was away *reduced* coverage by a multiplier but never lost it, so a stress test would have
reported **less** exposure after removing the person the plan depends on. There is now a test
pinning that 100% absence means certain stalls.

If every deputy is recorded on one team — or on none — a team-level shared cause is total. The
page reports that as a finding with a rendered label rather than letting P90 equal the item count
look like an accident, and points you at the deputy-unavailability stress for a partial loss.

**Concentration, not nomination.** `coverConcentration` counts distinct *eligible* deputies per
item at the evidence floor. A plan that names one of three equally eligible deputies is not
concentrated; an item with exactly one eligible deputy is. This also caught an error: a person was
eligible to cover contact with a stakeholder whose record is themselves, and collected a
relationship bonus for it. Self-cover is now refused with a stated reason, and relationship credit
requires a typed `stakeholder → person` link rather than a name in a text field. Correcting it
moved the demo plan from 53.5% to **46.5%** criticality coverage — the honest number.

**Stress, with no writes.** `#/handover?stress=<deputyIds>` takes up to three deputies out of the
window and re-derives coverage from the remaining pool at the same evidence floor. It shows which
obligations lose cover, which lose it entirely, and the change in expected stalls. Nothing is
commissioned, nothing is written, and the deep link is shareable.

**Then check the briefing.** A commissioned hand-over is a document until someone acknowledges it.
The readiness card links the hand-over decision's cover delegations and counts a delegation as
acknowledged only when it has a recorded check-in or is completed — never because it exists, and
never because a talking point was queued. Inside seven days, an unacknowledged cover delegation
raises `LCS-05` at severity 4. If you preview today's window while a future hand-over is
commissioned, the card shows the **future** one, because that is the plan that needs briefing.

**Evidence contract:** the correlated model's probabilities are conventions with printed values,
not measured outage or illness rates, and the assumptions list is rendered in full. One shared
cause per window is modelled; two simultaneous shocks and a vendor failing under two teams are not.
Readiness measures *recorded* acknowledgement, so a briefing that happened but was never recorded
reads as unbriefed — the correct bias for a workspace that claims to keep receipts. Existing drills
were not rescored under the new model, because that would make the ledger retroactive. See
[ADR-0033](docs/adr/0033-correlated-absence-and-briefing-readiness.md).

## Leader Continuity Drill — what breaks if you are not there (Schema v45, ADR-0032)

Open **Leader continuity** (`#/handover`). Pick the date an absence starts and how long it
lasts. LeadOS lists every dated obligation already in the record that currently needs the
leader inside that window — decisions waiting for a call or a review, case review dates, 1:1s
past cadence, active delegations, stakeholder contacts, overdue goal check-ins — and says, item
by item, why it scored the criticality it did.

Three things make the answer usable rather than decorative:

1. **Some work is not coverable, and the app says so.** A management conversation, or a call
   that is both irreversible and above your big-bet threshold, is marked *held*: it appears in
   the uncovered list with its reason and raises a structural signal. It is never quietly
   assigned to a deputy on paper.
2. **The stall count is exact, and the money is coherent.** The number of items that stall is a
   Poisson–binomial convolution of the per-item probabilities, so the mean, P50/P80/P90 and the
   probability that nothing stalls carry no sampling error. Currency exposure is a seeded Monte
   Carlo over the same probabilities, reported per currency with P90 and expected shortfall at
   90%, and never summed across currencies. Only items with a recorded amount are valued; the
   rest are counted as unpriced, not guessed.
3. **The hand-over is the smallest one that covers critical work.** Candidate actions are
   deputy × stall-class bundles with an explicit setup cost in minutes; the planner solves
   minimum set cover by exact branch and bound under a disclosed node cap and falls back to a
   labelled greedy plan when the instance is too large. Coverage is measured over every critical
   item's weight, so exported, held or uncoverable work cannot be counted as covered.

**Commission** creates the actual work in one transaction: one four-option DACI decision, up to
four owner-assigned delegations with explicit authority due before you leave, typed links to
every covered record, and at most one blameless 1:1 prompt per deputy. A stale preview is
refused (`planKey`, window and workspace revision are all checked), and a second click on the
same window is idempotent rather than creating a near-duplicate plan.

**Then test the prediction.** A drill freezes today's stall probabilities against a dated
window; nothing recomputes them. When you return, tick what actually stalled and record how many
unpredicted stalls you saw. Scoring is Brier, base rate, Brier skill, precision, recall and
coverage, withheld to counts below five predictions and three drills. Negative skill opens one
rebase decision instead of hiding behind a dashboard.

**Evidence contract:** the model assumes conditional independence between items, so shared
causes (two deputies away in the same week, one dependency failing) are out of scope. Deputy fit
and criticality are transparent conventions with printed components, not validated
psychometrics, and fit is never written to a person record or exported. A drill scores the
workspace's own prediction — not the quality of the handover, and not whether your absence
caused what you observed. The demo workspace starts with an empty drill ledger and no fabricated
history. See [ADR-0032](docs/adr/0032-leader-continuity-drill.md).

**Competitive benchmark, not a superiority claim:** the vendor material reviewed this session
(Lattice's Spring/Summer 2026 release, 15Five's Agents overview) describes AI review drafting,
focus briefs and meeting preparation. None of the public descriptions reviewed covers simulating
the manager's own dated absence, pricing the stalled obligations, solving the minimum cover, and
scoring the frozen prediction against a real absence. Public capability descriptions are not
proof of absence, and competitor behaviour and user outcomes remain **[UNVERIFIED]**.

## After-action evidence: from “applied” to record-corroborated — 2026-10-28 (Schema v44)

Open **Learning ledger** (`#/learning`) → **Ledger**. An applied label remains a human
claim. For a lesson, **Attach record** offers only a distinct anchored org change, completed
delegation, or reviewed decision dated between the review and the claimed application. The
leader selects the artifact and writes what it corroborates. LeadOS snapshots its small set
of relevant fields and rechecks that snapshot and the qualifying state every time the report
is rendered. If the record changes, disappears, becomes unfinished, or falls outside the
window, the evidence is labelled **stale**; it is never quietly kept green.

A link creates `lesson — corroborates → artifact` in the typed relationship graph. When the
lesson has an active owner, the same atomic post-commit transaction (`RULE-AAR-04`) also opens
one 30-day sustainment delegation, with links back to both lesson and artifact. The follow-up
asks whether the practice persisted and what evidence supports that; it explicitly does not
claim the practice worked or caused an outcome. Duplicate retries are idempotent. No owner
means no invented assignment. The new coverage card stays separate from the learning index:
corroboration is counts-only below five applied lessons, and stale records are reported
separately.

**Evidence contract:** a selected record is workspace corroboration, not external audit,
semantic matching, independent witness, proof of implementation quality, or causal/economic
effect. The chosen artifact can be misclassified by the user. Evidence lives in the local
workspace; no new export of lesson narratives, network service, connector, model, or telemetry
was introduced. v43 “applied” claims are preserved with empty evidence lists and remain
unverified after migration. See [ADR-0031](docs/adr/0031-learning-record-corroboration.md).

**Competitive benchmark, not a superiority claim:** Lattice describes review drafts grounded
in 1:1s, feedback, goals and prior reviews ([Spring/Summer 2026 release](https://lattice.com/blog/lattice-spring-summer-2026-product-release)); 15Five describes Agents for evidence-grounded review writing, manager focus briefs, and meeting preparation/notes ([Agents overview, updated 2026-10-08](https://success.15five.com/hc/en-us/articles/51450804595483-Agents-Overview)). Both vendor descriptions demonstrate that evidence synthesis and AI coaching are now incumbent capabilities. LeadOS therefore advances the *after* side of the loop: a user-selected dated artifact, stale-link detection, then a scheduled persistence check. Current competitor product depth and real-world user outcomes were not independently tested **[UNVERIFIED]**.

## Mitigation robustness & evidence gate — 2026-10-28

Open **Automation control room** (`#/assurance`), or an open case's **Stress-test
mitigation** action. The new gate asks a harder question than a point-estimate ROI:
**does this choice survive being wrong about the probability?**

1. Supply current/proposed event-probability bounds, a shared future horizon and the
   **additional** mitigation cost. Probability fields start blank. By default the case's
   conditional-loss range is shared between both plans. FMEA occurrence ratings are never
   converted here.
2. Or open **Constrain what the intervention changes** and give defensible bounds for
   event-probability reduction and the change in conditional severity. LeadOS clips the
   probability pair and severity pair to their feasible sets and computes exact extrema
   from their vertices—so impossible within-pair combinations cannot dominate the answer.
   Cross-dependence between the probability effect and severity effect is not modeled. Negative probability reduction explicitly permits a worse event rate.
3. Inspect **Savage minimax regret**, dominance versus evidence-sensitive choices,
   worst/best savings, break-even thresholds where defined, and a model-only
   perfect-information ceiling. The basic rectangular model is solved at eight corners;
   constrained mode enumerates exact feasible vertices. Its frontier only shows feasible
   illustrative points, not a probability distribution or confidence score.
4. Choose an active verifier and explicitly **Commission evidence review**. One atomic
   write opens a DACI decision with captured numeric assumptions, an owned verification
   delegation due within seven days (or the shorter horizon), and a blameless 1:1 topic
   if the existing queue has space. Typed links connect the work; the engine's derived
   decision event also reaches Decision Tempo automatically. Nothing applies a mitigation,
   changes residual risk ratings, sends a message or spends money.
5. Export a numeric brief without case/employee narratives. Same numeric facts, assumptions
   and owner reuse the existing gate across reloads. A changed local workspace revision
   requires a fresh comparison. Paused case automation stays paused.

Example: conditional loss **1,000 / 4,000 / 10,000 DKK**, current event probability
**20–80%**, proposed **5–40%**, additional cost **500 DKK**, horizon **30 days**.
Savings range from **−2,500 to +7,000 DKK**. Worst regret is **7,000 DKK** for holding
and **2,500 DKK** for the proposal: the proposal minimizes maximum regret but does
**not** dominate. Gathering evidence is meaningful; the **2,500 DKK** perfect-information
ceiling is a model bound, **not** EVSI or permission to spend that amount on research.

Advanced example: keep probability bounds at current **20–80%** and proposed **5–40%**,
then declare reduction **20–50 percentage points**, severity change **−1,000 to +1,000 DKK**
(proposed minus current), and additional cost **500 DKK**. Exact feasible-set savings are
**−700 to +4,800 DKK**; the proposal still does not dominate. Conditional severity ranges
from **0 to 11,000 DKK** after the nonnegative-loss constraint. No single break-even-loss
number is reported when severity changes under the intervention.

**Limits:** declared ranges are not calibrated estimates or causal evidence. The default
model uses a shared conditional loss and independent probability boxes, which may admit
impossible combinations. Advanced bounds narrow only the dependencies the user declares;
unmodelled dependence remains. Safety/compliance override the financial ranking. Historical spend is sunk;
delay and research costs are unpriced. Captured numbers live in an editable decision record,
not an immutable archive. Local revision checks are not cross-tab write isolation, so the
lab still cannot adopt a rehearsal snapshot. Schema v43 is unchanged; no new runtime
dependency, network service, account or export scope. Calculation and safety contract:
[ADR-0029](docs/adr/0029-mitigation-robustness-evidence-gate.md).

## Close the loop from 1:1 prep — 2026-10-28

Open a person's **Prepare → Open commitments** sheet and mark completed 1:1 promises or
manager-owned check-in follow-ups complete without leaving the preparation workflow. Only
those two record types expose this action; other commitment groups keep their existing
review flows. The action is hidden when printing, saved through the existing mutation APIs,
and the item leaves the open list after the sheet refreshes. An eight-second **Undo** action
restores an accidental completion. Completion remains a manager update
(`completedInMeetingId` stays empty): it does not claim that a 1:1 happened or that the person
confirmed anything. It adds no schema fields and does not change the sheet's
conflict or anonymous-pulse exclusions.

The choice compounds the existing evidence-linked preparation and follow-through ledger
rather than adding another terminal: the manager can see what they owe and close a finished
promise at the point they review it. Manager Tools' practitioner guide treats notes and
follow-up as critical and explicitly asks managers to prepare by reviewing their follow-up
notes ([One-on-One Basics](https://www.manager-tools.com/system/files/documents/docs/Manager-Tools_One_on_One_Basics.doc),
accessed 2026-10-28); this is practitioner guidance, not evidence that this change improves
outcomes. The feature is deterministic and local; no model or connector is involved.

## 1:1 discussion confirmation — 2026-10-28

A prepared agenda is not evidence that a conversation happened. In **Prepare → Log the
1:1**, select the items actually discussed and explicitly confirm them. Optionally clear
confirmed employee topics from their waiting list; otherwise they remain for a future meeting.
Changing the selection, person, or meeting status resets the confirmation. Skipped and moved
meetings cannot confirm discussion or clear topics. Existing local records and export formats
are unchanged; the feature does not send messages or access new data.

This addresses a frequent follow-through risk using existing agenda and talking-point data,
rather than adding another queue. An adoption signal worth checking with users is whether
uncovered topics return to the next 1:1 without requiring re-entry; no impact has been measured.
Atlassian describes keeping undiscussed topics on the agenda and assigning follow-up actions
([one-on-one meeting guidance](https://www.atlassian.com/blog/teamwork/running-successful-one-on-one-meetings),
accessed 2026-10-28); that product guidance is not evidence of a measured LeadOS outcome.

## The After-Action Review & Learning Ledger — 2026-10-28 (Session 63, Schema v43, ADR-0028)

Open **Learning ledger** in the sidebar (`#/learning`).

Every other terminal measures the work. This one measures whether the team converts what
happened into a change in how it works — and it can print the sentence no other tool prints:

> *You have diagnosed the same class of failure three times. The change you committed after
> the second one was never made.*

No incumbent product prints that, because printing it needs four things at once: a dated
record of the event closing, the intention **as frozen before the outcome was known**, a
classification stable enough to count, and the discipline to keep a committed change `open`
until a human says it was made. LeadOS already held the first two — case forecasts frozen at
opening, settled actuals, decision probabilities recorded before the call, delegation due
dates. v43 adds the last two.

**The review is pre-filled from the record, never from memory.** Opening a review for a
closed case loads *what was supposed to happen* from the forecast snapshot frozen at opening
and *what actually happened* from the settled actuals; for a decision it loads the recorded
probability and the reviewed outcome. The closing date is read from the record and cannot be
typed over, and a review cannot be held before the outcome it reviews. That is what stops a
retrospective from becoming a hindsight story.

**The cause is yours, and it has a floor.** The two evidence questions arrive filled; the
*why* is a human sentence of at least 12 characters or the review does not hold. No model, no
keyword rule and no template writes a cause in this codebase.

**A lesson must be classified, and must say what changes.** Eleven classes, each naming a
*system* failure mode rather than a person: estimation, scope, dependency & handoff, decision
quality, escalation, quality & rework, staffing & capacity, communication, process & ritual,
assumption, other. `Nothing — this was a one-off` is a first-class answer: it is stored as an
**observation**, shown beside committed changes, and excluded from the applied rate. That is
the difference between single-loop learning (fix the error) and double-loop learning (change
the policy that produced it), and the ledger keeps them apart instead of averaging them into a
"lessons learned" document nobody opens twice.

**A change is applied only when a human says so.** `open → applied` requires a date and a
sentence about what is now different; `dropped` requires the same and is the honest
alternative to a loop that rots open forever. Closing the related delegation is explicitly
*not* evidence: a task ended, a practice may not have changed.

**What propagates (ADR-0008 spine, one transaction):**

| Rule | Trigger | What the leader gets |
|---|---|---|
| `RULE-AAR-01` | a case, change, decision or delegation closes | one review, dated from the record, with both evidence questions pre-filled — no cause, no lesson, no verdict |
| `RULE-AAR-02` | a lesson is recorded on a held review | a `delegation` change opens exactly one owned delegation; a `decision` change opens one DACI decision; an owned lesson queues one blameless follow-up talking point |
| `RULE-AAR-03` | the same class repeats while its earlier change is still `open` | exactly one close-or-drop decision per class, not one per event — the app never drops the change itself |

Markers are stable (`[RULE-AAR-02:<lessonId>]`), so replay is a no-op and a class cannot
accumulate duplicate decisions. `learningAutoDraft` and `learningAutoPropagate` stop the
derived records without hiding the measurement.

**What is measured, and what is withheld.** Coverage is dated closures in the review window
that carry a held review or a dated skip, over all dated closures in the window; undated
closures and closures outside the window are excluded **and counted**, with the reason
printed. Below three dated closures there is no percentage at all — only counts. Median time
to apply is withheld when fewer than two changes have applied, and the composite index is
computed only over the components that can be measured (coverage 35%, applied changes 35%,
learning carried 30%), renormalising the weights and naming what is missing; below two measurable
components the index is not shown.

**What this deliberately does not do.** Nothing rates a person: a lesson names a system, a
decision or a practice, and every tab says so. There is no CSV export scope for this ledger,
so the free text here — the most sensitive prose in the workspace — stays inside the existing
export-redaction and conflict-privacy boundaries. There is no automatic class inference from
RCA prose and no auto-applied change; both were rejected in ADR-0028. Timings and rates are
computed on the demo workspace only **[UNVERIFIED]** beyond it.

## The Strategy Coherence Terminal — 2026-10-28 (Session 62, Schema v42, ADR-0027)

Open **Strategy coherence** in the sidebar (`#/strategy`).

Every other terminal answers a question *inside* a declared frame — what a decision is worth,
where effort is allocated, what a premise assumes. This one asks whether the frame itself is
the one being funded. Strategy documents are the best-dressed fiction in management: a leader
writes five priorities, funds three of them, plus two accidents nobody chose, and the deck
stays true because nothing in the system ever compares the two. LeadOS now holds both sides.

**Declare the bets.** A bet is a Rumelt kernel, not a note: a diagnosis, a guiding policy, at
least one thing the team will **not** do, an accountable owner, a declared share of effort, a
horizon, and a dated stop rule (metric, direction, date). A draft is not measured; an active
bet must carry the date it was adopted, and the normaliser demotes an active bet with no
adoption date back to draft with a warning, because an invented adoption date would let the
gap be manufactured.

**Then tag real work to it.** One link table — `strategyTags` — points at open cases, goals,
delegations, plan items, decisions, changes and hires, with an optional effort estimate. No
other module gained a field, so the change is additive: a workspace from Schema v41 migrates
without one record being rewritten.

**Then the number is forced.** Declared shares and measured shares are two distributions over
the same support, and the report prints their **total variation distance** in percentage
points (0 = identical, 100 = every funded record sits on something undeclared). On the demo
workspace: declared 60/25/15 against measured 58.3/41.7/0 — a **16.7pp say–do gap**. The
15% bet is funded by nothing at all, and the 25% bet is over-funded by 16.7pp. Per-bet signed
gaps are printed beside the aggregate; there is no invented "alignment score" and no weighted
composite of unrelated units.

Alongside it, three tests that a deck cannot pass:

- **Blind WIP** — the share of open work inside the strategy era that no bet funds. Demo:
  **24 of 29 records (82.8%)** are strategy-blind, above the workspace convention of 40%.
- **Effort drift** — measured share of the whole stock versus measured share of work tagged in
  the last 28 days. A bet can hold its historical share while nothing new is being put behind
  it; the flow column is what makes that visible.
- **Falsifiability** — six named checks per bet (owner, diagnosis, guiding policy, refusal,
  dated stop rule, at least one tagged commitment), graded falsifiable / partial /
  unfalsifiable. Demo: two bets pass 6 of 6; `bet-demo-3` passes 2 of 6 — no guiding policy,
  no refusal, no dated stop rule, no tagged work — so the weakest bet is named instead of being
  averaged into a healthy-looking 77.8%. The same bet's stop-rule date, 2026-10-22, has passed
  with no human verdict, which is the one overdue call the terminal raises (`SCO-04`).

**Concentration, honestly labelled.** Herfindahl over measured and declared shares, with
conventional bands and the caveat in the UI: a low HHI means the strategy is diffuse, not that
the leader is diversified.

**The coherence composite** (declared-vs-funded 45%, falsifiability 35%, coverage 20%) is only
computed over components that can be measured; the weights renormalise and the missing
components are listed. Below five open post-strategy records or five funding tags the report
demotes itself to **counts-only** and says why — no share is presented as measured when it is
arithmetic on two records.

**What propagates (ADR-0008 spine, one transaction):**

| Rule | Trigger | What the leader gets |
|---|---|---|
| `RULE-SCO-01` | a bet is adopted | one DACI commitment decision (priced by Decision Tempo in the same transaction once a value at stake exists), one owned delegation to tag work already in flight, one blameless talking point |
| `RULE-SCO-02` | gap exceeds the convention | one rebalancing decision naming the over-funded and under-funded bets and three options |
| `RULE-SCO-03` | active bet without a dated stop rule | one bounded, blameless delegation per bet to write metric, direction and date |
| `RULE-SCO-04` | stop-rule date passed, no verdict | one retire-or-renew decision plus an owner talking point — the app never retires a bet itself |

Re-running the audit is idempotent: the marker includes the bet set, so the same divergence
never re-opens a decision. Turning off `strategyAutoPropagate` stops the derived decisions and
delegations without hiding the measurement.

**What this deliberately does not do.** Nothing rates a person. There is no strategy CSV
export scope, so bet text — the most sensitive prose in the workspace — stays inside the
existing export-redaction and conflict-privacy boundaries. There is no forecasting of whether a
strategy will win; the terminal measures whether it is funded as declared, which is a fact about
the leader's own records, not a prediction. Effort estimates are self-reported, so the measured
share is only as good as the tagging; the report prints the coverage of effort estimates and
falls back to counting records when fewer than half carry one. Timings and share values are
computed on the demo workspace only **[UNVERIFIED]** beyond it.

## The Propagation Ledger — 2026-10-28 (Session 61, Schema v41, ADR-0026)

Open **Propagation ledger** in the sidebar (`#/propagation`).

Every other screen shows what the automation *produced*. This one shows what it *cost*, what
it *declined*, and what it *lost* — because until now nothing in the product did, and the
number was not small.

**Price.** One `case.created` event attempts 42 (rule, event) pairs across 14 rules and 5 of
them apply. The ledger reports invocations, applications, declines and collapsed re-runs,
then ranks the rules by measured milliseconds. On the demo workspace `earlyWarningRule`
(150 ms), `premiseRule` (82 ms), `dynamicsRule` (35 ms) and `loadRule` (12 ms) accounted for
~91% of rule time, and three of them applied nothing at all on that event. Wall clock and the
sum of rule durations are shown separately, so engine overhead is never folded into a rule's
share.

**Coverage.** Which event types actually moved the workspace, and which were delivered to
rules that all declined. The full rule chain is listed with its declared purpose, whether it
scans the workspace, and whether the engine is permitted to collapse a proven repeat.

**Failures.** A rule that throws is rolled back so the workspace stays consistent — and the
failure becomes a durable receipt (Schema v41) holding the event that triggered it and the
error. **Retry now** re-runs only that rule, against the workspace as it stands. Before this,
a failed propagation was a toast: the decisions, delegations and goals it would have created
were simply absent, with no way to find out later or to ask for them again. Receipts are
content-free by design — event identity and an error message only — so they cannot become a
second copy of your records outside the export-redaction and conflict-privacy boundaries.

**What changed underneath.** The savepoint that gives each rule a private, rollback-safe view
of the workspace used to be a full deep copy of everything, once per rule per event. It is now
copy-on-write: a rule that returns early on its event-type guard — the first line of every
rule in this codebase — copies nothing. Measured on the demo workspace:

| Scenario | Before | After | Gain |
|---|---|---|---|
| Single `case.created`, 362 records | 233.1 ms | 138.5 ms | 1.7× |
| Single `case.created`, 5,792 records | 4,254.1 ms | 2,943.5 ms | 1.4× |
| Four-event cascade, 362 records | 369.6 ms | 54.0 ms | 6.8× |
| Four-event cascade, 5,792 records | 5,532.0 ms | 1,284.4 ms | 4.3× |

A declined re-run is collapsed only when it produced no write, no emission, no audit entry,
no warning and no effect at an unchanged workspace version — and only for rules whose decline
verdict has been **proven** independent of which entity the event named. The proof is a test,
not a comment, so an unproven rule is never skipped however expensive it is. The single-event
gain stays at 1.4–1.7× because there is nothing to collapse there; both numbers are reported.

These are timings on one machine with a synthetic fixture, not a performance guarantee. The
remaining cost is genuine analytical work in the three scan rules, which is now visible with a
name and a number instead of being an unexplained slowdown.

## Counterfactual mitigation lab — 2026-10-28

Open **Automation control room** (`#/assurance`) → **Counterfactual mitigation lab**.
Choose an open case, enter three proposed residual FMEA ratings and an **additional**
mitigation cost, then compare. Two disposable stores run the real validated `updateCase`
action and all production post-commit rules at the same clock: a refresh of the current
plan versus the proposed edit. Collection counts and typed relationship deltas expose
follow-through into decisions, coaching, capacity, communication and other relevant modules.
Global governors may also react: these are whole-transaction effects, not case-only causality.

The financial panel uses **Savage minimax regret** over your three declared loss scenarios.
It exposes break-even loss and both alternatives' worst regret. Occurrence rating / 10 is
explicitly an **uncalibrated sensitivity proxy**, not measured probability; historical
mitigation spending is sunk, and proposed spending is incremental. Missing baseline ratings
or loss estimates suppress economic ranking. Safety and compliance always override it.
Exports contain numeric assumptions and aggregate effects, not record titles, identities or
private narrative. Failed post-commit rules are counted and make the rehearsal incomplete.

No live writes, no messages sent, and no stale snapshot can be applied. Adoption remains an
explicit edit of the original case. HTTP runs use a module worker with a 30-second timeout;
the portable standalone falls back to local execution (large workspaces can pause its UI).
No new dependencies, network calls or schema migration were introduced.

## Connected response & Watch integrity — 2026-10-28 (Session 60, Schema v40)

LeadOS now delivers derived lifecycle events through a bounded, synchronous, breadth-first
queue inside the existing local transaction. A rule's changes, logs, warnings and emitted
events share its savepoint; failure rolls back that rule, reports a warning and does not erase
the source action. New cases, decisions, delegations and portfolio records created by an
action or rule emit typed lifecycle events automatically. Events deduplicate by type/entity/id
and stop at 64 per transaction; a limit or rule failure is recorded, not hidden. Not every
entity or update in the application has been migrated to this mechanism; see the roadmap.
For derived case/decision creations, Decision Tempo only processes related decisions; an
explicit/root scan can still evaluate the wider workspace.

### Try the connected workflow

1. Open **Early-warning watch** (`#/watch`) and record a verdict on an open signal. Detection
   is a screening heuristic; it cannot by itself establish a cause or open a case.
2. For **Confirmed**, optionally choose an existing active owner, goal and stakeholder; add a
   first response action and opt in to an open decision. Optional FMEA ratings must be entered
   as a complete 1–10 set. Optional optimistic / most-likely / pessimistic person-day estimates
   require those ratings. Unknowns stay blank; no ratings, owner, goal or three-point effort inputs are invented.
3. The resulting alert → case link can fan out, depending on the supplied facts and settings,
   to a DACI decision, owner delegation and coaching topic, goal risk check-in, capacity reserve,
   opening estimate, proposed (not armed) Decision Tempo timebox, and unsent stakeholder brief.
   The **Automation control room** can preview or refresh follow-through. No message is sent.
4. A failed promotion leaves the one-way verdict and response context on the alert. Use **Retry
   case promotion** or **Refresh follow-through** in Judged alerts. Automatic sensing may be
   paused without blocking the explicit human confirmation or retry. Rule errors are reported;
   persistence errors are separately surfaced by the store.

The same case lifecycle is used for direct cases and resilience-drill cases. Breached drills
no longer fabricate a case owner, FMEA ratings, loss range or person-days from a steward or
recovery duration. Case-linked typed relationships exclude confidential conflicts and anonymous
pulse records. Watch CSV #40 contains only opaque codes and numeric/provenance fields, never
verdict notes, response text or names.

**Unrated cases:** PERT magnitude and capacity can be recorded without ratings, but
probability-dependent expected loss, ROI, occurrence Brier and scenario net value are withheld.
An opening snapshot with unknown occurrence remains unknown even if someone rates the case
later; magnitude can still be scored. New-case and resolution dialogs do not prefill FMEA
ratings. FMEA occurrence ÷ 10 and projected residual reduction are modelling conventions,
not measured event frequencies; independent empirical validation is **[UNVERIFIED]**.

### What the Watch can and cannot claim

- The four Shewhart rule scores are ranked with a **Benjamini–Hochberg-style step-up**. They are
  nominal screening scores, not validated p-values: limits are fitted in-sample, many vitals
  are overlapping 28-day windows, series are dependent and scans repeat. **No FDR guarantee or
  expected false-discovery count is established.** The budget, cooldown and noisy-series
  suppression remain visible. Governance rules can create monitoring decisions independently
  of a verdict; only a confirmation opens a case from an alert.
- New predictions target an entire future Monday–Sunday week and are unique per series/target.
  The first available outcome is frozen at the next scan; a capture after the following day is
  displayed but excluded from skill. Later reconstructed-source revisions are flagged. Legacy
  and demo replay forecasts are preserved as unscorable, not real out-of-sample evidence.
- Per-series MAE and skill are withheld until at least five timely comparable observations and
  nonzero total naive error; mixed-unit MAEs are never pooled. This floor is a display convention,
  not proof of predictive power. Windows overlap, historical records can be backdated or
  revised before capture, and the local app is not an immutable data-vintage archive.
- Human verdict precision and Wilson intervals describe the judged subset, not ground truth or
  all suppressed alerts. See `RESEARCH.md` §64 and ADR-0025 for assumptions and limits.

**Audit scope:** this session inspected and tested the canonical local-first app paths touched
here, not the entire repository line by line. Earlier capabilities, competitive comparisons,
real-browser/screen-reader behavior and large-workspace performance not independently checked
this session are **[UNVERIFIED]**; historical sections below describe earlier claims, not a fresh
certification.

## Structural Capital Allocation — 2026-10-28 (Session 58, Schema v38)

Open **Capital allocation** (`#/capital`). This is the first LeadOS surface that answers the
question a leader actually faces at the start of a quarter: *I have a fixed number of effort-weeks
and six ways to spend them — which mix, what does it buy, and does the model that priced it deserve
to be believed?*

Set a **budget** (1–40 effort-weeks, default 12), a **horizon** and, if you disagree with the
convention, the four **objective weights**. The engine spends the budget by marginal return per
effort-week — greedy, so every accepted increment paid for itself — and then runs a complementarity
pass, because a synergetic pair funded together is worth more than either alone.

Four tabs, in the order a leader has to think:

- **Plan** — the funded portfolio, effort spent and left, the joint trajectory against doing
  nothing, and a verdict that separates *improves* from *investment* (it raises the ceiling but
  costs this horizon's throughput) from *worsens*. Effort costs come from a published book and are
  labelled conventions, not measurements.
- **Attribution** — **exact Shapley** over every coalition of the funded levers (six levers is 64
  evaluations, so this is exact and instant, never sampled), with the efficiency gap printed. Below
  it, a substitute/complement table: `WIP cap × learning` on the demo is **+25.07** (fund them
  together), `WIP cap × delegation` is **−7.34** (they compete for the same constraint).
- **Robustness** — 32 seeded lognormal draws of every structural parameter, P10/P90 bands, and
  **Savage minimax regret** across your plan, the six named playbooks and doing nothing. On the demo
  the portfolio has mean 52.6 (P10 50.2 / P90 56.4) and max regret **26.93** — it wins because its
  worst case is the least bad, not because its mean is highest.
- **Checkpoints** — the do-nothing baseline is **frozen beside the prediction at adoption**. When the
  checkpoint arrives, the app scores the frozen prediction as a **skill score** against persistence
  (`1 − model error / naive error`), not against memory. Skill is withheld when no baseline was
  frozen, pooled skill is suppressed below two observations, and two non-positive checkpoints open
  exactly one re-baselining decision instead of silently retuning the model.

**The trust ladder is the point.** `unvalidated → refuted → provisional → backtested → validated`.
Only **backtested** or better may be called *actionable*, and every grade lists the evidence that
would move it up. The demo workspace sits at **refuted** (its dynamics hindcast has skill −5.38), so
the page tells you the recommendation is *comparative*, not something to act on. A tool that always
says "optimal" is a toy.

**Cross-module, on the same spine.** Adopting a portfolio opens exactly one DACI commitment decision
— priced by Decision Tempo in the same transaction, with the Shapley rows as options and the trust
grade in the question — and exactly one owned, dated checkpoint delegation carrying the frozen
prediction. Checkpoints append typed `scores` lineage. `SCA-01..05` signals reach Insights, CSV scope
#39 exports numeric telemetry under opaque codes (no names, titles or notes), and the header
downloads a deterministic board brief.

Nothing is auto-implemented, no data leaves the browser, and no people are ranked by the answer.

## Operating System Dynamics Lab — 2026-10-28 (Session 57, Schema v37)

Open **System dynamics** (`#/dynamics`). This is the first LeadOS module that treats the team
as a **system with accumulations and delays** instead of a snapshot: five stocks (delivery
capacity, work in progress, quality debt, perceived pressure, dependency concentration) are
derived from records you already keep, integrated forward with RK4 at a one-week step, and
read back as trajectories, loop dominance and archetypes.

Four tabs, in the order a leader has to think:

- **Structure** — the stocks, where each number came from (measured / estimated / convention),
  the simulated saturation trajectory against the 100% "fully committed" line, and the
  structural-risk score.
- **Loops** — seven named loops (burnout spiral, key-person, capability growth, backlog drain,
  hiring drag, symptom repair, intake renegotiation) ranked by **measured gain**, not by how
  loud they look, plus the dominance table week by week and the archetype findings with their
  evidence lines.
- **Policy lab** — six playbook interventions and your own experiments, each compared with
  doing nothing: delta saturation, delta WIP, delta throughput, delta capacity, and a verdict
  that distinguishes *improves* from *investment* (raises the ceiling while costing this
  quarter's throughput) from *worsens*. Adopting an experiment **freezes** the prediction and
  opens one owned checkpoint; retiring requires a written reason.
- **Calibration** — a hindcast against weekly WIP reconstructed from dated portfolio
  lifecycles, scored against naive persistence, with five refusal gates. On the demo workspace
  the model is explicitly **no better than "tomorrow equals today"** (MASE 2.53, skill -5.38).

Three rules propagate what it finds, atomically and idempotently: **RULE-DYN-01** opens exactly
one four-option DACI structural decision priced by Decision Tempo, **RULE-DYN-02** queues one
blameless, marker-leading 1:1 talking point naming the loop, and **RULE-DYN-03** opens one
delegation carrying the frozen prediction. `dynamicsAutoPropagate: false` pauses the automatic
side; an explicit **Scan now** always runs. CSV scope #38 exports 20 opaque/numeric columns
with no names, hypotheses or notes.

Honesty is enforced, not promised: every parameter carries provenance and the report prints the
split (the demo is 65% conventions, so its structural claims are labelled *provisional*); an
undated closure is excluded and counted, never interpolated; the stability verdict is a local
linearisation and is described as one; and the module never predicts morale, sentiment or
individual attrition. See ADR-0022.

**Status block, verified 2026-10-28 (this session, not carried over):** Schema v37; 125 app ES
modules; 57 test suites; **906/906 canonical tests pass** (ESLint clean, canonical boundary OK,
144 internal documentation links resolve); `npm run verify:standalone` 7/7 with the artifact
rebuilt at 2,647,591 bytes. Demo regression and all engine numbers are quoted in `ROADMAP.md`
for Session 57.

## Automation rehearsal relationship diff — 2026-10-28

In **Automation control → Rehearse a case event**, preview now compares valid
operational relationships before and after the production post-commit rules run.
It groups added and removed edges by source module, relation and target module,
including replacements where both counts rise, and shows before/after counts for
dangling, duplicate and unknown-relation diagnostics. It does not expose names or
record IDs in this diff. Private links are excluded; links are evidence, not causal
claims. Preview is disposable and only covers post-commit rules, not case-opening
action automation; refresh always recomputes against current state.

## Assumption-Aware Scenario Tails — 2026-10-28 (Session 55, derived on Schema v36)

Open **Assumption ledger → Scenario tails** (`#/premises?tab=tails`). LeadOS now answers:
*how much wider is the delivery tail because the reasons for the plan may be wrong — and
which assumption is doing the damage?* Each evidenced premise is coupled through the same
two-hop typed graph to measured committed portfolio work. A paired, seeded Monte Carlo
(Common Random Numbers — identical Beta-PERT draws with and without premise failure)
reports baseline vs premise-coupled P50/P80/P90 and overload risk. Leave-one-out
attribution shows the P90 days recovered by holding each single premise true.

Honesty gates are the feature: a premise with **no committed evidence is never coupled**
(a prior is not a frequency); belief weights a **stress test, not an actuarial forecast**;
failure shocks (+60% load-bearing / +40% major / +25% monitor effort, capped ×3/item) are
labelled conventions. Correlated-evidence clustering groups observations sharing one
typed source — one incident told three times is flagged **pseudo-replicated**, never
silently counted as three. Signals TAIL-01..03 surface tail widening, the dominant
assumption, and evidence concentration in Insights. CSV scope #37 exports opaque
telemetry only. No schema change, no new dependency, no network. See ADR-0021.

## Sensor Calibration Loop — 2026-10-27 (Schema v36)

The Assumption Ledger now closes the loop on its own sensors. When a premise becomes
knowable, use **Assess outcome** to append a human judgement: **held**, **failed**, or
**inconclusive**. A conclusive label is immutable and unique per premise; an inconclusive
checkpoint is retained but not scored. The date is when the outcome became knowable, not
when someone happened to type it. No sensor decides whether its own claim was true.

The new **Sensor calibration** tab scores the sensor's declared likelihood-ratio strength
against those later outcomes with the Brier score, mean forecast vs. observed held rate,
calibration gap, directional accuracy and a forecast-mix PSI comparison. Repeated changes
to the same typed source collapse to its last state before the outcome, and each premise
counts once per sensor. Metrics stay **counts-only below five settled premises**; PSI needs
ten earlier and ten recent samples. PSI compares separate earlier/recent settlement-date cohorts (never splitting one same-day wave) and is only a distribution-shift indicator, not a finding
that quality got worse. The LR-to-probability mapping starts from a neutral 50% prior; it is a
transparent diagnostic convention, not proof that a declared LR is empirically valid. **No
LR is automatically retuned.** Sparse, dependent leadership observations do not justify
auto-learning.

`RULE-PREM-05` links an outcome to its premise (`validates`) and linked decision (`revisits`)
on the generalized event spine. Point-in-time views exclude outcomes not yet knowable, and
clearing demo premises clears their outcomes. CSV scope #36 uses opaque premise codes and
exports numeric sensor telemetry only—no premise titles, notes, people names or evidence
text. See [ADR-0020](docs/adr/0020-outcome-scored-premise-sensor-calibration.md).

## Automation Control Room — 2026-10-27

Open **Automation control** in the sidebar (`#/assurance`). Trace shortest operational
relationship trails with per-hop rule provenance; inspect dangling endpoints, duplicate edges
and unregistered relations; export a text assurance brief. Reverse traversal is labelled: a
relationship is evidence, **not causal failure propagation**. Confidential conflicts and anonymous
pulses are excluded, and arbitrary failure-log text is never displayed or exported here.

Choose a case → **Preview in sandbox** to run the actual post-commit registry on a disposable
copy. See created/updated/removed row counts and a per-rule savepoint trace. **Refresh current
case** requires confirmation and recomputes from current facts; it never installs the preview
snapshot. It may create unsent comms drafts, decisions or coaching prompts. Nothing is sent.

Post-commit rules now use isolated savepoints: an exception discards that rule's writes and
buffered success events, records a named failure, then continues from the last successful rule.
The source action remains committed. This does **not** yet isolate action-level automation,
external effects, ID allocation or whole-transaction persistence failures. Existing storage-error
warnings remain authoritative; a successful refresh means in-memory commit, not guaranteed disk
persistence. No schema migration or runtime dependency was added. See
[the assurance architecture note](docs/adr/0010-automation-assurance-savepoints.md).

## Premise Sentinel — 2026-10-27 (Schema v36)

Open **Assumption ledger** in the sidebar (`#/premises`). Before an important decision,
write down the **load-bearing premise** — the thing that must stay true for the call to
keep working — plus the signpost that would prove it wrong. Give it an owner, a prior
belief, watch/breach thresholds and a review date. LeadOS then watches the records you
already keep: cases, stakeholders, continuity dependencies, budgets, delivery actuals,
forecast challenges, reviewed decisions and cognitive-load bands. A two-hop typed
relationship graph finds linked evidence without you re-entering it.

Each dated observation has a named likelihood ratio for or against the premise. The
engine turns those into a posterior belief using transparent log-odds, discounts old
evidence by a leader-owned half-life, and shows Wald-style evidence boundaries and
information gain in bits. **A broken signpost does not reverse your decision.** It opens
one four-option DACI re-decision (hedge, pause, reverse or buy information), one owner
verification delegation, one blameless 1:1 prompt and typed links back to the original
call; Decision Tempo prices the delay on the same event when typed value links exist.
You can pause governance fan-out, run an explicit signpost scan, reaffirm or retire a
premise with a dated note, and download a board brief. CSV scope #35 exports only opaque
premise codes and numeric belief telemetry — never titles, notes or people names. No
network, LLM, sentiment inference, conflict record or anonymous pulse is used.

The math and its limits are documented in
[ADR-0019](docs/adr/0019-assumption-ledger-premise-sentinel.md) and RESEARCH §61.
Likelihood ratios are conventions, not calibrated probabilities; Wald boundaries are
not p-values on independent trials; the leader owns every re-decision.

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
npm run verify:canonical     # ESLint + ADR-0007 boundary gate + docs link gate + canonical regression suite (see AI-SESSION-LOG.md for latest results)
```

## Run LeadOS from one HTML file on any PC

[`LeadOS-standalone.html`](LeadOS-standalone.html) is a **self-contained copy of the entire
application**: all 111 canonical JavaScript modules and the full stylesheet are inlined into one
~2.3 MB HTML file. There is no server, build, install, backend, account, `node_modules`, CDN,
font fetch or network request.

**To use it:**

1. Download or copy `LeadOS-standalone.html` to any PC (USB stick, desktop, shared drive — the
   filename can be changed).
2. Double-click it. It opens in any modern browser from a `file://` path.
3. Use the app normally. In the served version, **Settings → Portable offline copy** offers the
   same file as a download.

**Moving your records:** the HTML file contains the app, **not your data**. Records are kept by
that browser's local storage under a separate `leados.standalone.v1` key, so the portable copy
does not overwrite a served workspace on the same machine. Before moving PCs, use
**Settings → Export JSON**; on the other PC open the copied HTML and use **Import JSON**. Some
browsers restrict `localStorage` or Web Crypto for local files: if Settings shows a saving
warning, records are temporary and plain JSON exports are not encrypted — export before closing
the tab. The standalone file also ships a `connect-src 'none'` CSP as a defence-in-depth
guarantee that it cannot call a network API.

**Regenerate after changing the app:**

```sh
npm ci --no-audit --no-fund
npm run build:standalone       # writes/overwrites LeadOS-standalone.html
npm run verify:canonical       # full canonical regression suite
```

`esbuild` is a **build-time-only** dev dependency used by
[`scripts/build-standalone.mjs`](scripts/build-standalone.mjs); none of it is needed to run the
generated HTML. The script refuses to overwrite canonical `index.html`, computes a source
fingerprint, rejects any residual external script/stylesheet, module import, `fetch()` or
external CSS URL, and can write to any output path with `--out`. See
[ADR-0009](docs/adr/0009-single-file-offline-distribution.md) and
[RESEARCH.md](RESEARCH.md) §50 for the rationale and limits of `file://` single-file apps.

## Cognitive Load & Attention Governor — 2026-10-27 (Session 52, Schema v34)

`#/load` answers the person-side question every plan begs and no hour-booking heatmap can:
**whose cognitive capacity is the system constraint right now, and what should move?** Nothing
is measured from calendars, messages or keystrokes. Every input is a fact the leader already
records — funded portfolio commitments, the roster and its reporting graph, dependency
stewardships, onboarding plans — and nothing about the result is persisted as a rating. The
report recomputes live, on a **role in a system**, never as a score of the human.

- **One transparent saturation index, four named components** (weights shown in the policy tab,
  no hidden model): intrinsic utilization of ramp-adjusted, reserve-discounted supply (0.40),
  WIP switching against the shared Kanban convention (0.25), extraneous coordination —
  strong-tie degree, 1.5 per direct report, weighted stewardships (0.20) — and open
  delegations/cases (0.15). Five bands follow fixed cut-points with a leader-owned saturation
  threshold (default 80): headroom, managed, elevated, saturated, overloaded. The team panel
  adds Brooks's `n(n−1)/2` communication channels and the single Goldratt system constraint.
- **A seeded Monte Carlo says whether the commitments fit.** Beta-PERT effort draws against the
  person's own horizon supply produce a reproducible overload probability; commitments without
  measured triples are counted as *unquantified* and excluded from every draw — never sampled
  as zero.
- **Per-person Little/Kingman queueing, with honest floors.** Throughput and median cycle time
  come from recorded completions; expected wait is Kingman's `(ρ/(1−ρ))·c·cycle` (c = 1, an
  exported convention). Counts-only below two completions, learned at five; at ρ ≥ 1 the
  terminal reports *unstable* with no fabricated finite wait.
- **Germane load is protected, never penalised.** A ramping team member (active
  onboarding/transition plan, supply factor below one) is flagged, not scored down;
  `RULE-LOAD-04` asks the in-roster manager to protect learning time once the person reaches
  the elevated band.
- **Four event-driven rules on the generalized post-commit spine** (triggered by portfolio,
  delegation, dependency, person-archive and explicit scan events — no hardcoded glue):
  `RULE-LOAD-01` opens exactly one four-option DACI load-shedding decision (defer the lowest
  value-density thread / reassign to measured headroom, honestly naming when none exists /
  open a requisition / renegotiate scope or dates) with typed `involves`/`decides` links,
  priced by Decision Tempo in the same transaction; `RULE-LOAD-02` queues a blameless
  WIP-limit prompt; `RULE-LOAD-03` flags an individually oversized commitment *inside* the WIP
  limit; prompts self-clear when resolved and marker-idempotence makes repeated scans
  converge. A pause switch blocks automatic fan-out while an explicit human scan always runs.

Signals `LOAD-01..05` appear in Signals; CSV scope #34 exports opaque per-person telemetry
(`load_person_n` codes — no names, roles or free text); a deterministic board brief names the
constraint and its caveats. Rules: `RULE-LOAD-01..04` — see
[ADR-0018](docs/adr/0018-cognitive-load-attention-governor.md) and [RESEARCH.md](RESEARCH.md)
§60 (Sweller; Skelton & Pais; Little; Kingman; Anderson; Brooks; Goldratt). The demo ships
mid-story on real records with a visible threshold policy: one ramping team member saturated
at index 76, one engine-opened shed decision, WIP and germane prompts waiting. Thresholds and
weights are transparent conventions, not empirically validated team constants — the UI says so.

## Allocation Governor — 2026-10-27 (Session 51, Schema v33)

`#/allocation` answers the question every plan begs and no ranked list can: **where should the
next person-day go?** Classify each operating-plan item as **Core** (optimise what exists),
**Adjacent** (extend into nearby ground) or **Exploratory** (a bet on new ground) — Nagji &
Tuff's ambition horizons. Work you have not classified is shown as unmeasured; the app never
guesses. From then on the Governor does three things continuously:

- **It learns what each horizon returns.** Every delivered item with recorded actual effort and
  value becomes one settled observation. Per currency, each horizon ("arm") earns a UCB1 index —
  its mean settled value per person-day plus an exploration bonus that prices how rarely it has
  been tried (Auer, Cesa-Bianchi & Fischer 2002). Below five settled bets an arm shows counts
  only: no return is invented. Settled work without recorded actuals is excluded and counted as
  an evidence debt, never scored zero. Currencies are never mixed.
- **It watches your funding behaviour, not your intentions.** If the exploratory share of
  classified effort funded in the look-back window falls below your floor (default 10% over
  180 days), exploration is being starved — March's (1991) success trap, measured. `RULE-ALLOC-01`
  then opens exactly one DACI rebalancing decision with the queued bets attached (fund one,
  fund a smaller probe with a stop rule, defer on the record, or lower the floor deliberately),
  and Decision Tempo prices it in the same transaction. Nothing is auto-funded, ever.
- **It closes the learning loop.** A funded bet queues a 1:1 prompt to agree its learning
  checkpoint and stop rule (`RULE-ALLOC-02`); a delivery without actuals opens one
  evidence-closure delegation (`RULE-ALLOC-03`); funded-but-unclassified work prompts its owner
  to classify it, and the prompt clears itself when done (`RULE-ALLOC-04`).

Rules: `RULE-ALLOC-01..04` (see [ADR-0017](docs/adr/0017-allocation-governor-explore-exploit.md)
and [RESEARCH.md](RESEARCH.md) §59). Signals `ALLOC-01..05` appear in Signals; CSV scope #33
exports the arm table (aggregates only — no titles, no names). The demo ships mid-story: 0%
exploratory funding against a 10% floor, one engine-opened rebalancing decision waiting, arms
honestly counts-only at n<5.

Also fixed this session: blank FMEA ratings persist as *unrated* (`null`) end-to-end — cases show
"Rating needed" instead of a default RPN — and `store.lastPropagations` is wired, so action
results report the cross-module propagations that actually happened.

## Stakeholder Comms Outbox — 2026-10-27 (Session 50, Schema v32)

`#/comms` turns the stakeholder updates you already owe into drafts you can review.
When you register or update an operational case, LeadOS writes a status brief for each
**key stakeholder** (manage-closely or keep-satisfied) and each **opposing** stakeholder
(blocker or skeptical), using only facts recorded on the case: the risk rating, owner,
mitigation, review date and any financial estimate. A fact you have not recorded appears as
**"[to confirm — …]"** and lowers the readiness meter. Approving a draft with a gap requires you
to acknowledge it.

- **Nothing is sent by the app.** You approve, copy the text into your own email or chat, and
  record it as sent. A logged stakeholder touch also marks the matching draft sent.
- **Closure is owed, not assumed.** When the case resolves, unsent briefs are withdrawn. A closure
  note is drafted only for people who were actually briefed. Reopening withdraws it.
- **Edits are honest.** Changing an approved message withdraws its approval. Changing a case fact
  supersedes the draft and records why. A dismissed draft is not re-drafted until the facts change.
- **Typed links.** Each draft links to its case (`communicates`), so it appears in the case's
  linked-entity panel.

Rules: `RULE-COMMS-01..04` (see [ADR-0016](docs/adr/0016-stakeholder-comms-outbox.md) and
[RESEARCH.md](RESEARCH.md) §58). Signals `COMMS-01..03` appear in Signals. The demo workspace
ships a populated outbox.

Limits: FMEA ratings defaulted to 5 at case creation, so an unrated case could not be told apart
from a deliberate 5/5/5 — **fixed in Session 51** (blanks now persist as unrated, and the outbox
readiness check flags them). Drafts are not in CSV exports, but they are in the full JSON backup.

## Impact Ledger — 2026-10-27 (Session 49, Schema v31)

`#/impact` answers the question no other leadership tool will answer: **did that
actually work?** You declare a study before you run it — metric, direction, the
day the intervention starts, how long you are willing to wait, and (optionally)
the effect size you expect and your confidence. The app then decides whether your
records can answer the question at all, and says so when they cannot.

It is not a dashboard with a causal adjective bolted on. Every number is derived
from dates you already typed — 1:1s held, feedback given and observed,
delegations delegated and completed, cases opened and resolved, decisions taken,
pulses answered, recognition given — and the inference is designed to fail
loudly:

- **Pre-registration is a constraint, not a promise.** `declaredOn` is stamped by
  the app, so a hypothesis written down after the intervention began is filed as
  *retrospective* forever and can never count as confirmation. Predictive fields
  are refused once the window closes, and scoring freezes the evaluation
  permanently — the report reads the frozen copy, never a live recomputation.
- **Unmeasured is not zero.** A week with no observation is a gap in the chart,
  never a `0`. A closed record with no close date is excluded and counted, never
  interpolated. A metric whose log does not reach back far enough is trimmed at
  its coverage frontier rather than drawn as weeks of imaginary absence.
- **A result must clear its own noise floor.** `designPower` computes, from your
  metric's own week-to-week variation, the smallest level shift a given number of
  pre- and post-intervention weeks could detect — live, inside the dialog, before
  you commit. An effect below that floor is reported as *underpowered*, never as
  "no effect".
- **Placebo tests, with their own resolution stated.** Every other metric measured
  on the same grid is treated in turn (Abadie-style in-space placebo), and fake
  interruption dates are fitted inside the pre-period (in-time placebo). Rank
  tests report their finest attainable p-value and are refused as a gate when
  they could not possibly reject — a check that cannot fail is not a check.
- **Fragility is quantified.** The ledger states how much differential trend,
  sustained across the post-period, would reproduce the entire estimate, and
  calls the result fragile when that number is small enough to be plausible.
- **The ledger scores you, gently.** Direction accuracy, a Brier score over your
  stated confidences, and the median ratio of realised to declared effect size.
  Most leaders discover they overestimate their own impact by a factor of two or
  more; the app shows the number and moves on.

One intervention can be supported on one metric and contradicted on another — the
demo workspace ships exactly that pair, pre-registered before the same date —
which is the situation a single-line dashboard is structurally unable to
represent.

`RULE-IMP-01..06` then carry the result across the workspace in one transaction:
typed `evaluates`/`replicates` links, a 4-option DACI scale/stop decision for a
confirmatory decisive result, blameless mechanism-framed 1:1 talking points when
a people-facing intervention is contradicted, exactly one proposed replication of
a supported study, and calibration and pre-trend findings. See
[ADR-0015](docs/adr/0015-impact-ledger-preegistered-evaluation.md),
[RESEARCH.md](RESEARCH.md) §57 and `tests/app/impact.test.mjs`.

## Influence Network Intelligence — 2026-10-27 (Session 48, additive on Schema v30)

`#/network` is an offline, **surveillance-free Organizational Network Analysis**
terminal. It derives the collaboration graph **entirely from records you already
entered** — cases, DACI decisions, delegations, goals, changes, negotiations,
operational dependencies, war-room games and typed graph links. It never reads
email, chat, calendar, sentiment, or any external data, and it never rates a
person. A structural position is a fact about your recorded work graph, not a
judgment about a colleague.

- **A real graph engine, not adjectives** (`app/core/domain/orgNetwork.js`):
  Newman bipartite co-affiliation projection; Freeman/Brandes degree,
  betweenness & closeness centrality; weighted PageRank influence; Burt
  structural-hole constraint; Watts–Strogatz clustering; Tarjan articulation
  points & bridges; and Latora–Marchiori network efficiency. Every measure is
  computed by name and verified against textbook graphs.
- **A tunable strong-tie backbone:** incidental co-appearance can make a graph
  look fully connected. A tie must be at least N% as strong as the strongest tie
  (Settings / the map tab, default 50%; 0% shows every real tie). This is a
  visualisation threshold over real data — nothing is invented.
- **Structural key-person stress test:** remove any person from the map and see
  exactly how connectivity, clusters and efficiency change — a deterministic
  what-if, fused with the Operational Resilience Bus Factor (verified backup
  stewards). Identify brokers, isolates and single points of connection before
  they become a continuity problem.
- **Five tabs:** a deterministic SVG network map (accessible name + legend +
  a full data table), positions & centrality, brokers & structural holes,
  the key-person stress test, and a follow-through + board pack.
- **Atomic cross-module automation (`RULE-ORG-01..05`):** one "Run
  influence-network follow-through" fans the analysis, in a single store
  transaction, into typed person↔person graph links, a **blameless**
  cross-training delegation, a DACI org-design decision for a fragmented team,
  1:1 check-in talking points for isolates and over-loaded brokers, and
  `ORG-01..05` signals (also on Today and the nav badge). Idempotent, with
  pause semantics and self-cleaning prompts; employee-authored 1:1 topics are
  never modified. Unrelated writes do not trigger it (no alert fatigue).
- **Privacy by construction:** CSV scope #31 exports only dimensionless scores
  and integer counts keyed by an opaque `node_index` — no names, titles or free
  text. Below two active people the network is reported as unmeasurable, not a
  fabricated zero.

Additive on Schema v30: a derived lens needs no new record collection or
migration; two settings (`networkTiePct`, `networkAutoPropagate`) are handled by
normalization. See [ADR-0014](docs/adr/0014-influence-network-intelligence.md)
and [RESEARCH.md](RESEARCH.md) §56. **Honest limits:** centralities describe
recorded structure, not behaviour or performance; co-affiliation is a proxy for
collaboration, not observed communication; no predictive attrition, sentiment
inference or employee ranking.

## Robust Strategy Lab — 2026-10-27 (Session 47)

Open **War Room → Robust strategy lab** (`#/power?tab=stress`). Edit a situation
and supply an optional **payoff uncertainty ±** bound. Blank means unconfigured;
zero explicitly tests the point estimates. No uncertainty is inferred from confidence.

- **Exact continuous-box guarantees:** tests whether the target remains Nash and whether
  one fixed conditional concession works for *every* independently varying payoff.
  Shows the feasible transfer interval and its uncertainty break point.
- **Savage minimax regret vs Wald maximin:** compares pure strategies by worst regret
  and security payoff. Ties stay visible; the app never chooses for you.
- **Single-opposition shocks:** tests each non-opposed stakeholder becoming opposed,
  keeping the electorate and quota fixed. Neutral is persuadable, not committed.
- **Automatic follow-through:** extended `RULE-PWR-02/04` creates one DACI strategy
  decision, typed relationship and owner 1:1 verification prompt on stress vulnerability;
  `PWR-07` surfaces it in insights. Scripts, briefs and derived verdicts use the same
  analysis. Reanalysis is idempotent and the existing automation pause still applies.
- **Honest limits:** comparable transferable utility, independent equal-width bounds,
  pure-strategy regret and weak Nash only. Not money, a probability, a causal forecast,
  or a full robust mixed-strategy equilibrium solver. Decisions are opening snapshots;
  current analysis is in the lab. Nothing is executed or sent externally.

No runtime dependency or network architecture changes. The optional `stressRadius`
field is an additive schema-v30 extension: old records normalize to `null`, and JSON
export/import retains it. Older app versions may discard the new optional field.
The standalone HTML is regenerated with the lab included.

## Coalition & Incentive War Room — 2026-10-27 (Session 46, Schema v30)

`#/power` (and `#/power/:id`) is an offline **computational political-economy engine** — no
language model, no network, no invented numbers. It reasons over the stakeholders, weights and
payoff estimates *you* record and turns them into a confidence-scored verdict, a Nash-equilibrium
read, a mechanism-design recommendation and a tailored influence script — then fans the result
out across the whole workspace atomically. See [RESEARCH.md](RESEARCH.md) §54 for the 2026
competitive benchmark and [ADR-0013](docs/adr/0013-coalition-incentive-war-room.md).

- **Exact cooperative power indices (Banzhaf / Shapley-Shubik).** A weighted voting game over up
  to 8 stakeholders computed by exact 2ⁿ coalition and n! ordering enumeration: normalised
  Banzhaf & Shapley-Shubik power, Riker **minimum winning coalitions**, **Tsebelis veto players**,
  **dummy players** and **dictators**, plus a stance-aware "can allies/neutrals reach quota?"
  feasibility check and a Banzhaf-power **HHI** concentration score.
- **2×2 non-cooperative game (Nash).** Pure & mixed **Nash equilibria**, strictly dominant
  strategies, **Pareto frontier**, social welfare, **price of anarchy** and coordination loss for
  the leader-vs-pivotal-counterparty game, with a hand-drawn SVG payoff-space chart.
- **Mechanism design (incentive compatibility).** The **minimal transfer** that makes your
  target outcome a Nash equilibrium (revelation principle / DSIC framing), with an explicit
  feasibility bound from the leader's own headroom — i.e. the price of aligning incentives.
- **Confidence-scored, not flat.** An **equilibrium robustness margin** (distance to the nearest
  best-response boundary, relative to payoff scale) combined (weaker-of) with your declared
  estimate confidence into a high/medium/low band — a labelled management convention, not a
  statistical interval.
- **Deterministic influence script & board pack.** An SBI/DESC-framed, per-stakeholder rehearsal
  script and a copyable board brief generated from the computed numbers — explicitly labelled as
  template generation, never an LLM, and never reading confidential conflicts or anonymous pulses.
- **Atomic cross-module propagation (`RULE-PWR-01..06`).** One registered or reanalysed game
  creates typed graph links, a derived verdict snapshot, **one** DACI coalition-strategy decision
  (which the Decision Tempo engine classifies in the same transaction), **one** blameless
  incentive-alignment delegation, and **one** estimate-verification 1:1 talking point —
  idempotently, with a one-click pause. `PWR-01..06` signals, a Today triage card, a nav badge,
  CSV scope #30 (no titles or names), point-in-time rewind and clearDemo parity.

Verified this session: `npm run verify:canonical` → **666/666** tests across **46** suites, 0
ESLint errors, 0 canonical-boundary leaks (99 app modules); `npm run verify:standalone` → **7/7**.
`[UNVERIFIED]`: real-browser graphical rendering, spoken screen-reader output, general-sum
N-player solving, and empirical calibration of verdicts against realised outcomes (needs n≥5
settled games).

## Operational Resilience, Dependency & Continuity Terminal — 2026-10-27 (Session 45, Schema v29)

`#/resilience` (and `#/resilience/:id`) brings an offline, zero-telemetry **Enterprise Resilience
Decision System** into LeadOS — connecting human Bus Factor, internal platforms, and multi-tier
suppliers directly to your live Capacity, Delegations, Goals, Negotiations, Cases, and Decision Tempo:

- **Simchi-Levi Continuity Tolerances (`TTS` / `TTR` / `REI`) & Nth-Party Cascades (EU DORA Art. 29).**
  Models **Time-to-Survive (`TTS`)** vs. **Time-to-Recover (`TTR`)** across a cycle-checked multi-tier
  DAG (`service`, `system`, `process`, `vendor`), propagating upstream outages through `none`,
  `warm-standby`, and `dual-active` substitutability modes to surface common-mode and sub-tier
  choke points (`depth ≥ 2`) and per-currency **Risk Exposure Index (`REI ∈ [0, 1]`)**.
- **Avelino Minimal Hitting-Set Bus Factor & Verification Firewall.** Computes exact minimal
  personnel cut-sets across critical/important capabilities while enforcing an epistemic firewall:
  unverified backups (`verifiedOn: null`) and `trainee` shadows remain `inTraining` and never
  inflate Bus Factor until independent operation or a continuity drill is explicitly recorded.
- **Supplier Concentration (`HHI`), Williamson Hold-Up & Conformal Drill Calibration.** Computes
  DOJ/FTC **Herfindahl-Hirschman Index (`HHI`)** per currency without cross-currency summation,
  scores **Williamson (1985) supplier hold-up** leverage ahead of contract renewals, and calibrates
  `realizedTtrDays ÷ estimatedTtrDays` across continuity drills using split-conformal bands
  (suppressed to counts only below `n = 5`).
- **Zero-Write Counterfactual Stress Lab (`#/resilience?tab=stress`).** Simulates simultaneous
  key-person unavailability and multi-tier vendor/platform shocks without mutating workspace state,
  cross-checking surviving backups against `buildCapacityModel` so backups allocated `≥ 90%` in
  Capacity trigger explicit contention warnings.
- **Six Post-Commit Rules Chaining into Decision Tempo (`RULE-RES-01..06` → `RULE-DLY-03`).**
  Registering or updating a critical dependency syncs typed graph links and derived daily exposure
  (`RULE-RES-01`), opens blameless cross-training delegations and focus-protection 1:1 prompts
  (`RULE-RES-02`), opens DACI continuity trade-off decisions that Session 44's `RULE-DLY-03`
  **atomically prices and proposes a Cost-of-Delay / EVSI timebox for in the same write**
  (`RULE-RES-03`), injects hold-up warnings into supplier negotiations (`RULE-RES-04`), shifts
  underpinned goals to `at-risk` and opens remediation cases on breached drills (`RULE-RES-05`),
  and logs delegation completions without fabricating human verification (`RULE-RES-06`). See
  [ADR-0012](docs/adr/0012-operational-resilience-continuity-terminal.md) and
  [RESEARCH.md](RESEARCH.md) §53.

## Decision Tempo & Timing Terminal — 2026-10-26 (Session 44, Schema v28)

LeadOS now prices the decision nobody made. `#/tempo` treats every open decision as a timed
economic position and answers one question per call: **decide now, or is the option to wait
worth its carrying cost?** The economics are named, closed-form and auditable — no model call,
no simulation, no cloud — so the same numbers appear in the served app and the standalone file.

- **Cost of delay, priced from records you already hold.** Reinertsen's four delay profiles
  (linear, fixed-date, expedite, standard) with a weekly rate derived from *value at stake ÷
  erosion window*, capped at the value at stake. The value itself is assembled from typed
  graph links — PERT case exposure, encumbered budget lines, portfolio value, negotiated
  stakes — split by currency and never summed across currencies. Nothing linked means
  *unpriced*, not zero.
- **The option to wait, priced exactly.** Preposterior EVSI (Raiffa–Schlaifer) on the edge
  between your leading option and the runner-up: `EVSI(t) = E[max(0, posterior mean)] −
  max(0, prior mean)`, which is zero today, rises as evidence arrives at a stated half-life,
  and can never exceed the value of perfect information. Add the carrying cost and the
  evidence cost and you get the optimal decision date, the switch probability and a verdict
  — **gather that evidence first**, or **decide now**.
- **Latency that is measured, not assumed.** Decisions now record `decidedOn` — the moment
  the call was actually made. The workspace's own latency band is a split-conformal order
  statistic with its finite-sample coverage bound, suppressed to counts only below five
  measured decisions, and legacy decided records stay unmeasured rather than inferred.
- **A commitment firewall.** Automation proposes a timebox with the derived money and a
  guardrail date; it never arms one and never records the edge or the uncertainty on your
  behalf. One click pauses all automatic tempo writing while the read-side model keeps working.
- **Five rules, one terminal.** `RULE-DLY-01` settles a timebox and measures the latency
  when the call is made; `RULE-DLY-02` turns an overdue call into exactly one owned, blameless
  delegation to the recorded approver; `RULE-DLY-03` proposes one timebox for a priced,
  untimed decision; `RULE-DLY-04` refreshes the derived value when a linked record moves more
  than 20% without touching your recorded inputs; `RULE-DLY-05` opens one DACI tempo-policy
  decision when a *class* of decisions breaches its own measured p80. `DLY-01..06` surface the
  position on Signals and Today, the queue is ranked by CD3, and the board pack is
  deterministic text you can copy or download. See
  [ADR-0011](docs/adr/0011-decision-tempo-terminal.md) and [RESEARCH.md](RESEARCH.md) §52.

## Natural-Language Intake Terminal — 2026-10-26 (Session 43, Schema v27)

A leader can now paste a situation note into `#/intake` instead of opening a form, and an
on-device triage engine produces a confidence-scored routing plan with full evidence. The
engine is a pure, deterministic ES module — no network, no model download, no data leaves the
device, so it works identically in the served app and the double-clickable standalone file.

- **Fourteen-category weighted-evidence triage** with NegEx-style negation windowing,
  softmax temperature scaling and uniform-prior shrinkage so thin input cannot look certain.
  Four uncertainty controls — completeness, top-1/top-2 ambiguity, high-stakes labels and
  explicit negation — route uncertain cases to human review with the triggering reason shown.
- **Entity extraction with provenance** for roster people (first-name ambiguity is flagged,
  never auto-resolved), money in US/EU/Danish formats with a currency-assumption flag,
  durations and person-days, percentages, recurrence and severity markers, each with
  sentence and character offsets.
- **Human-confirmed, never automatic.** The engine prepares a pre-filled case and a live
  propagation preview (DACI decisions, delegations, capacity reserves, coaching,
  stakeholder schedules); the leader edits and confirms through the standard case dialog,
  which runs the existing event-driven rules engine unchanged.
- **Privacy and safety by rule.** Conflict language hits the RULE-INTAKE-04 privacy wall and
  routes the leader to the confidential conflict workspace without creating operational
  records or graph links; safety/legal stakes force the RULE-INTAKE-05 human review.
- **Calibration ledger (RULE-INTAKE-07).** Every confirmation records whether the primary
  label and entities were accepted or edited. The construct is honestly named *human
  agreement* (not accuracy), counts only below n=5, stale drafts surface as RULE-INTAKE-06
  signals, and the `intakeCalibration` CSV export contains no free text. See
  [ADR-0010](docs/adr/0010-on-device-nl-intake-triage.md) and [RESEARCH.md](RESEARCH.md) §51
  for the 2026 competitive hunt and the on-device decision.

## Forecast Integrity Terminal — 2026-10-26 (Session 41, Schema v26)

LeadOS now treats every promise as one typed **prediction atom** and scores the workspace as a
forecasting system, not a collection of unrelated forms. `#/forecasts` unifies decision
probabilities, plan effort, case exposure/diverted-days/mitigation spend, budget commitments
and negotiated value. Probabilities are scored with **Brier (1950)** and **Murphy (1973)**
reliability/resolution/uncertainty decomposition; magnitude forecasts use dimensionless
actual ÷ recorded-forecast ratios segmented by quantity, currency and deal direction. An
**exact two-sided sign test** separates systematic bias from one ugly outlier, and a
**distribution-free conformal band** (Vovk et al., 2005; Angelopoulos & Bates, 2021) produces
an 80% outside-view range with an explicit finite-sample coverage bound — counts-only below
n=5, marginal coverage only, exchangeability stated rather than assumed silently.

The loop is automated. A new generalized post-commit rules hook
([ADR-0008](docs/adr/0008-post-commit-rules-hook.md)) runs pure domain rules inside the
store's atomic transaction. `RULE-FCI-01` turns a settled outcome into idempotent
outside-view challenges for open forecasts in the same class **and**, where the pooled
evidence is biased, low-confidence challenges in other modules; `RULE-FCI-02` opens exactly
one DACI re-baseline decision per challenged class; `RULE-FCI-03` opens one blameless
measurement-recovery delegation when three settled records lack actuals; `RULE-FCI-04`
feeds `FI-01..05` signals, Today triage, a nav badge and a deterministic board-ready brief.
Every challenge is a separate reviewable record with accept/adapt/dismiss and written
rationale — **no recorded forecast is ever rewritten**.

Verified example: recording the fifth 1.5× budget actual creates one class-specific challenge
on an open budget commitment and one low-confidence mixed-quantity challenge on an open
portfolio estimate, two DACI decisions, typed `forecasts`/`decides` graph links and audit
events in the same transaction; a second scan writes nothing. Ships with an additive
v25→v26 migration, normalizer repair, `clearDemo`/point-in-time rewind parity, a 29-column
formula-safe `forecasts` CSV scope (#26), five-tab terminal UI, JSDOM/axe coverage of every
tab and the response dialog, and 22 new tests. See [RESEARCH.md](RESEARCH.md) §49 for the
2026 AI-forecasting, decision-intelligence and people-analytics hunt, academic sources and
rejected shortcuts.

## Stakeholder Influence Register — 2026-10-26 (Session 40, Schema v25)

LeadOS now keeps one persistent political map across every case, change and negotiation
(`#/stakeholders`). The lightweight embedded stakeholder stubs those modules already carry
are reconciled into a first-class register under **strict matching** — exact normalized
name or internal person link; a near-miss is counted as an unmapped hygiene gap, never
guessed into a relationship. Each record is analyzed through four named lenses that update
live as you edit: **Mendelow (1981)** power × interest quadrants in a 5×5 matrix with
cadence guidance, **Mitchell-Agle-Wood (1997)** all seven salience classes with an
evidence-confidence-adjusted score (×1.0/×0.85/×0.7), **Tsebelis (1995, 2002)** veto-player
change-difficulty bands (stance-distance × power, ≤25 points per gate, +5/+8 cohesion
penalties, feasible/contested/blocked bands, honestly labelled a heuristic, not a spatial
model), and a union-find **coalition network** — bloc leaning from power-weighted stance
centroids, directional opposition/influence edges, centrality and hidden influencers.

Political signals now propagate like everything else: an adverse veto gate on an open
initiative opens **exactly one** DACI alignment decision in the same transaction
(`RULE-STK-02`); an adverse stance shift on an internal high-salience stakeholder queues a
blameless, idempotent 1:1 talking point (`RULE-STK-03`); reconciliation maintains typed
`involves` edges (`RULE-STK-01`); and a write-free cadence watch surfaces contact decay,
urgency-without-plan and low-confidence veto assessments (`RULE-STK-04`, signals
`STK-01..07`). The register dialog shows a dry-run propagation preview before you save and
respects an `autoPropagate` pause. Stances, veto bases and influence notes are
contextual-integrity governed — redaction neutralizes them in CSV/JSON exports with a
scrub count, its CSV scope (#25) runs to 32 formula-safe columns, the v24→v25 migration is
purely additive (no invented actors), and point-in-time rewind rewinds stance/contact
history with an explicit approximate-fidelity note. A 12-record demo reconciles at 100%
coverage and stays automation-silent by design. See [RESEARCH.md](RESEARCH.md) §48 for
the academic sources, 2026 SRM competitive audit and rejected shortcuts.

## Budget & financial commitments — 2026-10-26 (Session 39)

LeadOS now has a finance leg (Schema v24). A **budget envelope** is an approved ceiling in one
currency for one period; its commitment lines follow commitment (encumbrance) accounting —
`planned` → `committed` (budget authority reserved) → `spent` (actual you recorded) or
`released` (authority returned). The headline number is **forecast at completion**: recorded
actuals + open commitments, compared with the ceiling while you can still act. Planned lines
are separate pipeline exposure; a missing actual or an unpriced commitment labels the forecast
*understated* instead of silently counting as zero, and an actual is never pre-filled from the
committed figure. A ceiling is a limit, never a spend target: underspend is not scored as
failure, and the period-end signal says so (Liebman & Mahoney, 2017, on use-it-or-lose-it
surges).

Money now propagates like everything else in the OS. A forecast breach opens **exactly one
DACI trade-off decision** (`RULE-FIN-01`); a line that funds a case, negotiation, portfolio
item, requisition, goal, decision or change creates a typed `funds` graph link, and when that
record completes the encumbrance is marked *actuals due* in the same transaction
(`RULE-FIN-02`); recording a real actual feeds a **fifth calibration ledger** that scores
actual-vs-committed honestly — counts only below n=5, ratios pooled across currencies without
FX, and a calibrated forecast shown *beside*, never instead of, the recorded one
(`RULE-FIN-03`). Signals `FIN-01..05`, a Today card, `#/finance` routes, a `finance` CSV
export scope (#24) and a Settings watch-% convention complete the loop. Conflict cases and
anonymous pulse surveys can never be funding sources. Amounts remain leader-entered evidence —
nothing here reconciles to invoices or a general ledger. See [RESEARCH.md](RESEARCH.md) §47
for sources, boundaries and rejected shortcuts.

## Negotiated-value settlement calibration — 2026-10-26 (Session 38)

The negotiation settlement ledger now closes the fourth forecast-calibration loop without
confusing a signed amount with value actually realised. `negotiationSettlementCalibration`
pairs only agreed records with a positive explicit signed deal value and an explicit realised
value; it segments by currency and issue direction, never converts FX, and keeps other settled
records in a named actuals follow-up list. Cohorts show **counts only below n=5**; at n≥5 a
median shortfall of 20% or more is a **review guardrail**, not evidence of causality or an
individual negotiation/employee score.

`RULE-NEG-07` runs beside existing `RULE-NEG-06` in the `recordNegotiationSettlement`
transaction and records an idempotent derived-calibration propagation. `NEG-09` routes a
qualifying cohort to `#/decisions`; `#/negotiations/:id` shows prior comparable settlements
for preparation while excluding the current agreement from its own reference class and never
changing the current BATNA, target or forecast. The `calibration` CSV now includes settlement
pairs, count-only cohort rows and missing-actual follow-up rows. No schema migration, FX
conversion, inferred value, automatic forecast adjustment or backend was added.

Research triangulated Flyvbjerg's outside-view method, Perold's implementation-shortfall
lens and Deming's PDCA with product patterns from Oracle's plan/actual/forecast workflow,
Coupa's sourcing-to-invoice/value-realisation story, and Suplari's published advice to agree
a baseline before negotiation and validate at invoice/ledger level. These vendor materials are
pattern references, **not independent proof** of efficacy. LeadOS does not claim savings or
invoice verification from manager-entered values. See [RESEARCH.md](RESEARCH.md) §46 for
sources, comparison limits, and rejected shortcuts.

**Verification:** the focused calibration + negotiation suites pass **40/40** tests. Full
`npm run verify:canonical` passes **485/485 tests across 38 suites**, with 0 lint errors,
0 canonical-boundary leaks and **89/89** internal Markdown links resolving. Real-browser
rendering, spoken screen-reader output, source-system validation of financial actuals and
field comprehension remain **[UNVERIFIED]**.

## Returned-commitment recovery & ex-post agreement settlement governance — 2026-10-26 (Session 37)

- **Returned-commitment recovery & immutable lineage (`RULE-NEG-05`)**: When a delegated commitment returns
  to the leader (`status: 'returned'`), the leader can now explicitly recover and re-delegate it from either
  `#/delegations` (*Re-delegate / recover*) or `#/negotiations/:id` (*Recover term*) via
  `redelegateReturnedOutcome` / `recoverNegotiationTerm`. Grounded in **Oncken & Wass (1974)** monkey-management
  control, **Grove (1983)** task-relevant maturity, and **Hollnagel (2014)** closed-loop safety recovery, the
  original returned delegation remains immutable in history (`status: 'returned'`, `returnedOn`, `returnReason`,
  `supersededByDelegationId`, `recoveredOn`) while a successor active delegation is created with
  `priorDelegationId` and a required `recoveryNote` countermeasure. Cycle-safe schema repair
  (`repairDelegationRecoveryChains`) and lineage derivation (`deriveDelegationLineage`) track attempt count and
  prior owners across reloads. `RULE-NEG-05` atomically updates `term.ownerId`, `term.dueOn`, and
  `term.priorOwners`, carries forward `tracks-followup` and `mitigates` graph links, queues a blameless 1:1
  handover talking point on the new owner naming the prior return reason and countermeasure, and clears
  `NEG-07` once an active recovery delegation is in flight.
- **Ex-post agreement settlement & BATNA-breach governance (`RULE-NEG-06`, `NEG-08`)**: Grounded in
  **Williamson (1985)** *Transaction Cost Economics*, **Hart & Moore (1988)** *Incomplete Contracts*,
  **Perold (1988)** *Implementation Shortfall*, and **Raiffa (1982)** BATNA walk-away regret, agreed
  negotiations can now record explicit post-agreement settlement actuals (`recordNegotiationSettlement`:
  `settledOn`, `realisedValue`, `counterpartyDelivered`, `note`, and quantitative per-term `settledValue`),
  never pre-filled or fabricated from signed estimates. `evaluateNegotiationSettlement` computes direction-aware
  implementation shortfall and unit-honest walk-away BATNA breach (`sameUnitDealBatna`). `RULE-NEG-06` cascades
  settlement telemetry to linked goal check-ins and opens a linked DACI settlement review decision when the
  realised outcome breaches the walk-away BATNA, suffers counterparty non-delivery, or experiences material
  implementation shortfall; `NEG-08` surfaces both completed high-stakes agreements awaiting settlement and
  adverse settled outcomes requiring governance action.
- **Store, Rewind & Test Determinism Hardening**: `store.clearDemo()` now scrubs dangling demo references on
  retained user `negotiations`; `reconstructStateAt()` rewinds `negotiations` (including post-cutoff agreements
  and settlements) and delegation recovery lineage as of `asOfDay`; `scale.test.mjs` exercises `delegations`,
  `negotiations`, and `changes` at scale; and `case-calibration.test.mjs` / `calibration.test.mjs` use
  deterministic `app.navigate(...)` + `app.destroy?.()` teardown.
- **Verification this session**: `npm run verify:canonical` passes **483/483 tests across 38 suites (`0 fail`)**,
  `0` ESLint errors, `0` boundary leaks, and `88/88` internal markdown links. Graphical browser rendering of
  the Session 35–37 Negotiation Workbench views, spoken screen-reader output, and field comprehension remain
  **[UNVERIFIED]**.

## Agreement delivery feedback — 2026-10-26 (Session 36)

The Negotiation Workbench shows each current term as **In progress, Delivered,
Returned — needs recovery, or Untracked — gap**, with a link to delegations.
`RULE-NEG-04` feeds completed/returned negotiated delegations back into agreement history
and neutral linked-goal check-ins in the same safe-write transaction. `NEG-07` surfaces
returned commitments for recovery. Neither completion nor agreement fabricates financial
actuals, goal progress, confidence changes or decision outcomes. Source negotiation/term
IDs survive normalization.

## Honest state of this repository

This checkout also contains older React/Next.js applications, consoles, database code and
large historical documents. Their presence is not evidence that those products run. Per
**[ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md)**, they are quarantined as a frozen
historical archive in place, **not rebuilt or deleted**, and enforced via `npm run check:boundary`
so zero canonical `app/**` modules can ever import from them.

| Path | Current status |
|---|---|
| `index.html`, `app/**` | **Canonical product:** 94 native JavaScript modules, CSS and shell; Schema v28; tested below. |
| `scripts/serve.mjs`, `scripts/check-canonical-boundary.mjs`, `scripts/check-docs-links.mjs` | Dependency-free static server + canonical boundary and documentation link gates. |
| `tests/app/**` | Canonical automated suite (`565` tests across `42` suites), run by `npm test` / `npm run verify:canonical`. |
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
  construction and named on the sheet. **Today and the 1:1 due queue now offer `Prepare` as the
  primary action**, opening this sheet directly; the shorter `Log` path remains explicit for
  leaders who need it, and first meetings land on the same preparation journey.
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

### Cross-domain operational cases & parallel rules automation (`#/cases`, `Schema v22`)

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
  residual FMEA verification while appending a resolution check-in on the linked goal. `RULE-COACH-02`
  also turns only that case's tagged 1:1 support topic into a blameless systemic-learning prompt;
  reopening restores active support. Employee-raised topics are preserved, and neither prompt enters
  performance-review evidence.

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

- `npm run verify:canonical`: **`eslint .` (`0` errors/warnings), `check:boundary` (`79` canonical ES modules & `38` test suites, `0` quarantined-tree or network leaks), `check:links` (`0` broken internal links), and `475 passed, 0 failed, 0 skipped` across 38 suites** (up from 457 across 37 before Session 34).
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
- [ADR-0030](docs/adr/0030-coupled-continuity-capacity-simulation.md) — Coupled Continuity-Capacity ("All-Weather") Portfolio Simulation & Cross-Module Governance.
- [ADR-0029](docs/adr/0029-mitigation-robustness-evidence-gate.md) — Mitigation Robustness & Evidence Gate (`RULE-ROB-01`).
- [ADR-0012](docs/adr/0012-operational-resilience-continuity-terminal.md) — Operational Resilience, Dependency Topology & Continuity Terminal architecture decision.
- [ADR-0011](docs/adr/0011-decision-tempo-terminal.md) — Decision Tempo & Timing Terminal architecture decision.
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

## Session 56 (2026-10-28) — Predictive Anomaly Intelligence
- Added #/anomaly terminal with Shewhart XmR, linear prediction bands, Brier-calibrated confidence, and RULE-ANOM-01 event-driven cross-module propagation.

### Anomaly integrity correction (2026-10-28)
The earlier Session 56 description immediately above is **superseded**: the former anomaly rule returned descriptors, not actual cross-module records, and its forecast was not Brier-calibrated. `#/anomaly` now displays descriptive weekly open-case snapshots and exploratory in-sample XmR limits only. No forecast or anomaly-driven records are created. Detected reopenings and missing dates suppress the series; editable dates and the capped event log mean historical fidelity is not guaranteed. Existing operational-case automation remains separate and creates linked decision, delegation, goal, coaching, capacity and communication records when applicable. The canonical schema is now v37 (Session 57, Operating System Dynamics Lab); the anomaly work described here never required a version bump of its own.

## Session 66 (2026-10-28) — Coupled Continuity-Capacity ("All-Weather") Portfolio Simulation ([ADR-0030](docs/adr/0030-coupled-continuity-capacity-simulation.md))

- **All-Weather Continuity-Coupled Portfolio Engine (`app/core/domain/continuityCoupling.js`, `#/capacity`, `#/resilience`, `#/scenarios`):** couples seeded Beta-PERT + Reinertsen CD3 + Goldratt Critical-Chain portfolio simulation with Poisson operational dependency outages (`annualFailureProb`), multi-tier Nth-party cascades, empirical/split-conformal continuity-drill TTR calibration (`declared-point-ttr` below $n = 5$ drills; `empirical-drill-bootstrap` at $n \ge 5$), preemptive steward capacity diversion, and coherent per-currency Expected Shortfall ($\text{VaR}_{90}$ / $\text{CVaR}_{90}$, Rockafellar & Uryasev, 2000; currencies never summed).
- **Generalized Multi-Hop Post-Commit Governance (`app/core/domain/continuityCouplingRule.js`, `RULE-CPL-01..03`, `CPL-01..04`):** registered on the shared `postCommit.js` spine (`DEFAULT_POST_COMMIT_RULES` + `PROPAGATION_CONTRACTS`) and unified in `AUTOMATION_RULES` (`114` total rules). When a fair-weather feasible plan ($\ge 50\%$ fit) suffers a continuity mirage, `RULE-CPL-01` opens one undecided 4-option DACI trade-off decision linked to the shock-driving dependency and funded portfolio item, chaining in the **same atomic transaction** into `decisionTempoRule` (`RULE-DLY-03`) to propose a priced Cost-of-Delay timebox; `RULE-CPL-02` opens one blameless relief delegation and non-evicting `[CPL:<personId>]` 1:1 talking point for contended dual-hat stewards, self-cleaning when contention clears.
- **Counterfactual Hardening Frontier & What-If Sandbox (`rankHardeningInterventions`, `dependencyHardening` levers):** `#/resilience` ranks single-node warm-standby / dual-active + backup-steward upgrades by paired Common-Random-Numbers fit gain, P80 days saved, $\text{CVaR}_{90}$ reduction, and redundancy ROI, deep-linking (`#/scenarios?hardenDep=<id>`) into the non-persisted What-If Scenario Sandbox where `commitScenarioLevers` (`RULE-SCN-01`) atomically commits chosen upgrades. Real-browser visual inspection and assistive-technology speech output remain **[UNVERIFIED]** in this CLI session.

## Session 76 (2026-10-30) — The Structural Design Terminal: measure the shape, then change it (Schema v53, [ADR-0041](docs/adr/0041-structural-design-terminal.md))

Every other screen in this workspace optimises work *inside* the structure. `#/orgdesign` is the
first one allowed to change the structure, and it does it as a measured, reversible, pre-registered
decision rather than a diagram.

- **The structure is a graph, and it is measured, not drawn.** Span is out-degree, layers the longest
  path from the roots, and coordination channels are `n(n−1)/2` per unit with the manager included
  (Graicunas 1933; Brooks 1975) — so the marginal channel cost of one more report is visible per unit
  instead of averaged away. A reporting cycle, a self-managed record and a dangling manager are
  reported and cut; none is silently repaired.
- **The decision queue is built from this workspace's history, not from a guess.** For each manager,
  arrivals come from their own completion count in a declared window (Little's law in steady state),
  `Ts` is the median of their own completed commitment spans, `Cs` their own coefficient of
  variation, and the wait is Kingman's (1961) diffusion approximation
  `Wq = ρ/(1−ρ)·(Ca²+Cs²)/2·Ts`. Below three completions the queue is `insufficient`; at ρ ≥ 1 the
  wait is `null`, because an unstable queue has no finite expectation and printing one would be a
  lie. This is the first place the product answers "why is everything slow now that I have nine
  reports?" with the leader's own numbers.
- **The demo has a real hierarchy now.** The sample roster used to set `managerId: null` on every
  person, so the first thing a new user saw on this page was a dead end. It now carries one line per
  person under the lead — span 4 inside the band, ten coordination channels, $27,750/year priced from
  the FY25 cycle the merit terminal already holds — and the queue still reports `insufficient`,
  because that manager has no completed commitments in the window. A demo that fabricates a measured
  wait would be the first lie in the product.
- **Coordination is priced, or it is absent.** Hours are a declared convention per channel; money is
  derived from the latest effective merit cycle at the manager's loaded hourly rate. A manager with no
  recorded pay makes the unit `unpriced`, and the total prints its priced share — a partial sum never
  reads as the whole.
- **Declaring is free; committing is not.** A design is a draft of proposed reporting lines. Committing
  refuses a missing owner, no moves, a move that changes nothing, an archived or missing person, a
  self-report or a cycle; then it applies every move to `people.managerId` **and** freezes the
  prediction in one transaction. `revertOrgDesign` restores exactly the line recorded at commit and
  leaves alone any line someone changed again, reporting what it skipped.
- **The counterfactual is labelled a model.** A proposed structure scales measured arrivals by the
  ratio of coordination channels before and after. That scaling is a declared convention and it is
  printed beside every number it produced; the module never calls the scaled wait a forecast.
- **Designs are compared as a Pareto set, never a score.** Four minimised objectives — coordination
  hours, units over the band, modelled median P80 wait, and people whose line or depth moves. No
  weighted composite, because it would decide the trade-off the leader has to decide.
- **`RULE-ORD-01..05` on the same spine:** typed `structures`/`resizes` provenance; **one** DACI
  decision about the mechanism when a unit is still over the declared band plus one owned scope task
  on its manager — never a decision that moves one named report to one named manager; at most three
  blameless prompts for the people whose line moved ("what did you lose in this change?"); one dated
  outcome review that restates the frozen prediction; and a scored median absolute percentage error
  once the window closes, withheld below the floor.
- **Telemetry, not a target list.** CSV scope #47 carries counts and ratios under opaque positional
  design codes — no name, identifier, label, note, individual pay or individual wait — and exports a
  live reading when no design exists. The `Structural design` Insights bucket carries `ORD-01..06`.

**Not claimed:** the span band and coordination hours are declared conventions, not validated
instruments; the queue is a single-server approximation and correlated arrivals between two managers
are not modelled; the channel-scaling counterfactual is a convention that can be wrong in either
direction, which is exactly what the calibration card exists to contradict; there is no HRIS or market
pay feed; and nothing here chooses which person should report to which person. Real-browser and
assistive-technology behaviour of this page remains **[UNVERIFIED]**.
