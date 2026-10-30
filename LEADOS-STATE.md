# LeadOS — current program state

**Snapshot:** 2026-10-30 (Session 81, Schema v56). This file describes the repository that is present now; it is not a speculative product brief or a history of work that has not been verified.

## Canonical product

- **Runtime:** `index.html` → native browser modules in `app/**`; a local-first, zero-build application with a separately generated single-file offline build. Records stay in the browser unless the user exports them. There is no application backend or telemetry path in the canonical app.
- **Architecture:** `ARCHITECTURE.md` is the current map. `src/**` and other quarantined trees are legacy/non-canonical; their implementation and old architecture claims are not treated as current behavior.
- **Verification:** `npm run verify:canonical` runs ESLint, the canonical boundary check, internal documentation-link checking and app tests. `npm run verify:standalone` builds the single-file artifact and runs its portability tests.

## Current data and automation

- **Sequential investigation planner (Session 81, ADR-0046; no schema change).** `app/core/domain/sequentialInvestigation.js` is a read model that solves the order of declared investigations exactly by backward induction (up to three stages and six tests), conditions the belief by Bayes' rule after each settled test, and refuses explicitly when inputs cannot support a plan. `RULE-SEQ-01..03` write one advisory note, one revisable commit decision and one owned next-test task, all marker-idempotent. Conditional independence of tests is assumed and stated, not checked.
- **Schema v54.** The additive `53 → 54` migration adds empty `voiDecisions` and `voiStudies` collections and seven clamped conventions: no decision frame, no state, no payoff, no probability and no investigation is invented for an existing workspace, because a frame pre-filled with someone else's beliefs would answer a question the leader never asked. **Schema v53.** The additive `52 → 53` migration adds an empty `orgDesigns` collection and five clamped structural settings: no design, no move and no prediction is invented for an existing workspace, because a reorg inferred from the current manager column would invent the rationale and the claim. **Schema v52.** The additive `51 → 52` migration adds an empty `transitionPrograms` collection and eight clamped transition settings: no programme, no candidate, no target and no salary is invented for an existing workspace, because a reduction that arrives pre-filled is a plan someone else already made. **Schema v51.** The additive `50 → 51` migration adds empty `compBands` and `meritCycles` collections: no band, no cycle and no salary is invented for an existing workspace, because a band derived from current pay is a mirror and a cycled budget entered after the fact is a rationalisation. Schema v50's additive `49 → 50` migration still adds an empty `fidelityPlans`, Schema v49's `48 → 49` still initializes Impact `executionSnapshot` values to `null`, and Schema v48's still adds an empty `propagationLineage`.
- **Typed relationships.** `app/core/domain/cases.js` is the shared registry for allowed link types, relations, collection owners and destination routes. Destination views accept focused deep links, including encoded IDs, without writing the linked record.
- **Event-driven propagation.** `app/core/domain/postCommit.js` runs synchronous rule effects using savepoints. Successful changed effects can append a bounded, content-free lineage transaction; failed rules continue to use the separate `propagationReceipts` path. Every registered rule declares its purpose and writes in `app/core/domain/propagationContracts.js`, and the contracts test fails when an unregistered rule joins the chain.
- **Lineage bounds:** at most 250 transactions; 32 rule steps; and 48 targets, new typed edges and emitted event references per transaction. It stores identifiers and type/provenance fields, not titles, notes, score inputs or record bodies. IDs are still workspace data and are not claimed to be anonymous.
- **Privacy/lifecycle:** conflicts and anonymous pulse responses are excluded; candidate-referenced transactions are omitted from redacted exports; `clearDemo` keeps history while scrubbing references to removed records. CSV scope #43 is counts/types-only; a full JSON backup preserves the bounded ledger.

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
