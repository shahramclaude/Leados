# LeadOS canonical architecture

**Current as of 2026-10-31.** The canonical product is the local-first, zero-build browser app rooted at `index.html`. It is not the older Next.js starter under `src/**`. Do not use legacy-tree descriptions as evidence of the running product. The active boundary is checked by `scripts/check-canonical-boundary.mjs` and recorded in [ADR-0006](docs/adr/0006-canonical-zero-build-app.md) and [ADR-0007](docs/adr/0007-legacy-next-tree-disposition.md).

## Runtime shape

```text
index.html
  └── app/main.js              hash routing, navigation, render orchestration
       ├── app/views/**        feature screens and destination focus
       ├── app/ui/**           shared DOM, dialogs, components, charts, downloads
       ├── app/actions.js      validated application commands and read APIs
       └── app/core/**         state, schema, domain calculations and automation
```

The browser loads native ES modules directly. Canonical `app/**` imports are relative `.js` paths; the app has no server-side application layer and makes no outbound network calls. `scripts/build-standalone.mjs` creates the single-file offline distribution from the same canonical sources; the generated HTML is an output, not a second hand-maintained implementation.

## State and write path

- **`app/core/store.js`** owns the browser workspace lifecycle: load, normalize, transact, persist, import/export and explicit demo-data cleanup.
- **`app/core/schema.js`** is the data contract. It defines the current schema, version-by-version additive migrations, normalization and typed-link validation. The current schema is **v66**.
- **`app/actions.js`** is the command boundary used by views. Mutations validate inputs and commit through the store rather than writing from a screen.
- **`app/core/domain/**`** contains domain calculations, rule logic, read models and link resolution. **`app/core/domain/postCommit.js`** runs the synchronous event-driven rule chain in savepoints, commits only successful effects, and records failures separately as propagation receipts.
- **`app/views/**`** renders local state and links to records through typed resolver routes. Query parameters focus an exact destination record; opening a deep link does not itself apply a domain mutation.

The normal flow is:

```text
view → action/API → store transaction → post-commit rules → persisted workspace
     → derived read model → view

The versioned schema normalizer runs when workspaces are loaded or imported; an ordinary write keeps its validated draft and its post-commit effects within the same store update before persistence.
```

## Cross-module relationships and automation provenance

`LINK_ENTITY_TYPES`, `LINK_ENTITY_COLLECTIONS` and `LINK_RELATIONS` in `app/core/domain/cases.js` define the allowed typed graph. One resolver maps a valid type/ID pair to its owner and route. Confidential conflicts and anonymous pulse responses are not general graph nodes.

Schema v48 adds `propagationLineage`, a bounded record of successful event-driven effects. A transaction stores the source event, applied rule steps, changed collection/type/ID references, newly created typed edges and emitted event types—not record bodies, titles, notes or score inputs. It is capped at 250 transactions, 32 steps and 48 target/link/event references per transaction. No pre-v48 success history is inferred. `propagationReceipts` remains the distinct failure/retry record. Demo cleanup scrubs deleted IDs; candidate-linked transactions are omitted from redacted exports; CSV scope #43 is counts/types-only.

Schema v49 adds a frozen `executionSnapshot` to an Impact study when it is scored. It matches exact typed source IDs in retained lineage root/step events from the declared start through scoring, preserves aggregate counts and at most 12 navigation references, and leaves v48 studies unbackfilled. The snapshot is not an outcome, fidelity or causal claim. Demo cleanup clears removed source pointers without rewriting frozen counts; redacted export removes navigation IDs for omitted traces; Impact CSV scope #32 exports aggregate status/counts only.

Schema v50 adds `fidelityPlans`: a declared delivery denominator, five weighted stages, and two readings that are never merged. Four stages are derived from dated typed collections by `app/core/domain/fidelity.js` (1:1s, feedback, delegations, goals) with an explicit per-instrument standard; adaptation has no instrument and is attested only. Exposure is the product reach × dose × quality; grading is refused below 60% coverage. `app/core/domain/fidelityRules.js` runs `RULE-FID-01..05` on the same spine: typed `measures-delivery` links, a disagreement prompt, one repair decision plus one owned delegation per under-delivered settlement, one overdue-checkpoint task per plan, and a frozen `implementationSnapshot` on a scored Impact study. The snapshot carries ITT, the Bloom/LATE per-complier estimate and the inflated MDE as `null` when no counterfactual was fitted, and `RULE-IMP-02` branches on measured exposure when a contradicted study was materially under-delivered. The plan is a graph node (`fidelity` → `fidelityPlans`, route `#/fidelity?plan=<id>`), so an intervention record and its delivery reading are navigable from either end.

Schema v51 adds `compBands` (a declared level range) and `meritCycles` (a declared budget, one comparison dimension, an owner, nested pay rows, a frozen `audit` and resolved `outcomes`). `app/core/domain/comp.js` is a pure read model: band positioning and integrity, relative-pay findings, a twofold log-pay Oaxaca–Blinder decomposition with an adjusted-gap interval from the group coefficient's standard error, a four-fifths screen over the decision, a printed four-term retention hazard, a replacement-cost model weighted by the succession bench, three priced policies with regret, and Brier-scored calibration once departures resolve a frozen prediction. `app/core/domain/compRules.js` runs `RULE-COMP-01..05` on the same spine: typed `compensates` provenance, exactly one DACI *mechanism* decision (never an individual adjustment) plus one owned evidence task when the audit is flagged, one relative-pay task per cycle, one dated outcome review, and a resolved prediction on `person.archived`. The cycle is a graph node (`merit` → `meritCycles`, route `#/merit?cycle=<id>`). No protected characteristic is stored anywhere in the workspace, which is why the audit runs on a declared, non-sensitive comparison and says so.

Schema v53 adds `orgDesigns`: one record per declared structural design, holding the proposed
reporting moves, the conventions the reading used, the previous reporting lines captured at commit
and the frozen prediction the design is later graded against. `app/core/domain/orgDesign.js` is a
pure read model over the roster, the decision record, recorded pay and each person's own completion
history: span and layers from the reporting graph, coordination channels as `n(n−1)/2` per unit,
priced coordination from the latest effective merit cycle (absent, never zero, where no pay exists),
and Kingman's (1961) diffusion approximation per manager with `λ`, `Ts` and `Cs` measured from that
manager's own completed commitments. `app/core/domain/orgDesignRules.js` runs `RULE-ORD-01..05` on
the same spine: typed `structures`/`resizes` provenance, one residual span decision plus one owned
scope task when a unit remains over the declared band, at most three blameless prompts for the
people whose line moved, one dated outcome review, and the score that grades the queue model out of
sample. Committing applies the moves to `people.managerId` in the same transaction that freezes the
snapshot; `revertOrgDesign` restores exactly the recorded line and refuses to overwrite a later
decision. The design is a graph node (`orgdesign` → `orgDesigns`, route `#/orgdesign?design=<id>`).

Schema v57 adds `attentionPlans`: one record per committed weekly allocation, holding the frozen
optimisation result (the bought set, the forgone set **and its price**, the LP or exact bound, the
finite-difference price of the next hour), the review that grades it, and marker keys for rule
idempotency. `app/core/domain/attentionMarket.js` is a pure read model over the records the leader
already typed — a case's three-point cost estimate, a funded item's effort and value, a negotiation's
stakes over its BATNA, a dependency's measured daily impact, an overspent budget and a priced decision
frame — and solves a multiple-choice knapsack with two resource constraints: the leader's hours and a
delegate pool. Groups are pruned to their upper convex hull; small markets close exactly by branch and
bound, larger ones by Dyer's relaxation with a Lagrangian dual minimised by golden-section search and a
printed gap to a proven bound. Nothing is invented: a record with no money is `unpriced` and listed with
its hours, and the one derived hour — the share of a TEAM effort estimate that lands on the leader — is a
declared convention printed beside every figure it produced. `app/core/domain/attentionMarketRules.js`
runs `RULE-ATT-01..04` on the same spine: typed `allocates`/`forgoes` provenance, one owned dated
delegation per named hand-off, exactly one DACI decision carrying the whole forgone list with its price,
and an attribution decision plus an owned re-planning task when a reviewed plan misses. The plan is a graph
node (`attention` → `attentionPlans`, route `#/attention?panel=plan&plan=<id>`), and `forgoes` is a
first-class relation so a record can be navigated to the plan that consciously refused it.

Schema v58 adds `autopilotPolicies` and `autopilotRuns`: a leader-authored operating agreement in a closed vocabulary (4 sources, 14 events, 5 actions, 7 template tokens, no eval or property paths), a rehearsal computed from current records on a disposable copy, and an activation bound to a digest of the definition, the workspace revision and that rehearsal. `app/core/domain/autopilot.js` runs the single executor behind both rehearsal and `RULE-AP-01`, which sits first on the spine so conditions see the record as the triggering action left it. Stored agreements that cannot prove their approval pause on load; agreement output cannot trigger another agreement.

Schema v62 adds `performanceConcerns`: a due-process record of a gap in someone's work — the declared expectation and its source/date, dated observations scored for SBI answerability, conversations, support actions, the seven Mager–Pipe analysis answers, a plan with a frozen probability, and a single scored outcome. `app/core/domain/performance.js` is a pure read model (evidence audit, six procedural-justice rules, cause analysis, remedy adequacy, cost of delay with an explicit unpriced verdict, Brier-scored calibration withheld below five resolved plans, a no-name brief), and `app/core/domain/performanceRules.js` runs `RULE-PERF-01..05` on the same spine as support work only: one owned task and one blameless prompt for a missing expectation, the two-way conversation when the evidence floor is met without it, one DACI decision on the support mechanism plus typed `concern→person` and `decision→concern` edges and a dated check-in at adoption, exactly one decision about the next *process* step on a not-met review with no exit option, and one task per passed review on an explicit scan. The module records no rating, potential score, ranking or sentiment, takes no adverse action, and says in as many words that it is not legal advice. CSV scope #52 exports codes, counts and the scored prediction only. The same migration splits `coupledLoadAutoPropagate` out of the continuity module's `couplingAutoPropagate`, so pausing one module no longer pauses the other.

Schema v59 adds `signalClasses`, `signalProbes` and `signalLevers`: a declared escalation channel priced as a series of relays over the reporting graph, the probe ledger that grades that declaration after the fact, and the levers adopted against it. `app/core/domain/signalPath.js` is a pure read model — reach and false-alarm rates as series/parallel products, arrival-conditional latency, expected loss, Shannon mutual information, d′ with a log-linear correction, Wilson intervals and a Brier score — and `app/core/domain/signalPathRules.js` runs `RULE-SIG-01..04` on the same spine: typed `reaches`/`involves` edges per committed chain, exactly one redesign decision plus one owned probe task when the ledger contradicts the frozen declaration, a link from any case that lands on a path below the blind floor, and owned dated work for an adopted lever. A committed reading freezes at four decimal places and the exposure it priced cannot be rewritten, because that is the number the probes grade. Below six settled probes the page withholds a verdict. The class is a graph node (`signal` → `signalClasses`, route `#/signal?panel=path&class=<id>`), and CSV scope #51 carries class codes, ratios and counts only — no label, name or absolute amount.

The trace establishes *what the rule committed*, not causality or effectiveness. A typed edge proves provenance/association as recorded by the app; it is not a claim that the downstream intervention worked. Historical events are not replayed from this ledger.

## Enforced canonical boundary

`npm run check:boundary` verifies that:

1. The canonical entry point is `index.html` → `app/main.js`.
2. Canonical modules do not import from quarantined legacy trees, use bare package imports or make outbound network API calls.
3. Canonical tests and the serving script do not pull the quarantined legacy implementation into the running product.

`npm run verify:canonical` adds ESLint, internal documentation-link checking and the app test suite. `npm run verify:standalone` rebuilds and tests the self-contained offline file. These checks do not certify real-browser assistive-technology behavior or audit every historical source file; those remain explicit manual-review responsibilities.

## Legacy and non-goals

- **`src/**` and other quarantined trees are non-canonical.** Their prior Next.js/TypeScript architecture notes were retired because they contradicted the running app. The legacy implementation is not asserted to be production-ready or fully audited.
- This architecture does not imply hosted accounts, a backend, cross-device synchronization, telemetry, a distributed job runner or external tracing integration.
- Local JSON backups can carry workspace IDs and prose by design. “Content-free lineage” means the lineage row does not copy record prose; it does not make all workspace identifiers anonymous. Users remain responsible for the sensitivity of full backups.

Schema v63 adds `survivalReadings` and `survivalMarkers`. The Delivery Survival Terminal (`#/survival`) is a **derived read model with a frozen commitment**: `app/core/domain/survival.js` harvests dated items from six existing collections (portfolio, cases, requisitions, changes, delegations, decisions) and recomputes Kaplan–Meier survival, the Aalen–Johansen cumulative incidence of completion, the Nelson–Aalen hazard by elapsed-time bucket, a Mantel–Cox log-rank comparison and an empirical age percentile on every read, so no stored statistic can drift from the records that produced it. Only the *prediction* is persisted — per-item probabilities, the at-risk counts they were conditioned on, the curve digest and a review date — and it is graded once, afterwards, with Brier against the class's own base rate. `app/core/domain/survivalSchema.js` is the persisted contract; `survivalRules.js` runs `RULE-SURV-01..05` on the shared spine (typed `endangers` edges plus one owned task per doomed item for its recorded owner only, one repair task after a reading loses to its base rate, exactly one DACI decision per class per week when abandonment reaches the declared share of exits, one task per returned delegation with no recorded reason, one grading task per stale reading). The `reading` entity type joins the shared link registry with an `endangers` relation, so a prediction is navigable from, and back to, the work it named. CSV scope #53 exports aggregate columns only, blanked below the evidence floor.

Schema v64 adds `waitPrices`, `waitExposures` and `waitCostMarkers`. The Cost of Waiting Terminal (`#/wait`) is a **derived money read model with weekly frozen certificates**: `app/core/domain/waitCost.js` prices the six harvestable classes — a declared weekly price per class (fail-closed), a derived price for decisions with linked committed money (value at stake ÷ 12-week erosion window, linear CD3), and *unpriced, never zero* otherwise — then multiplies each open item's weekly price by the censoring-aware still-open probability S(age+w)/S(age) from the Session 89 curve, refused below the at-risk floor and flagged past the longest observation. Wait-horizon scenarios (1/2/4/8 weeks) are printed per row with expected additional cost; totals are per currency and never pooled; rows are ranked priced-overdue first. Only the weekly **exposure certificate** is persisted (cap 60), navigable through the SYSTEM_GENERATED `prices-delay` edges from the new `exposure` entity type. `waitCostRules.js` runs `RULE-WAIT-01..05` on the shared spine before decision tempo (stale-edge reconciliation, the certificate, ≤40 links, one triage DACI decision per currency per week, ≤5 owned delegations, ≤3 declare-a-price tasks), all marker-idempotent; CSV scope #54 exports aggregate per class × currency rows under opaque codes, blanked below the evidence floor.

Schema v65 adds `parityAudits` and `parityMarkers` ([ADR-0054](docs/adr/0054-leadership-parity-consistency-terminal.md)). The Leadership Parity & Standard Consistency Terminal (`#/parity`) is a **pure read model over dated leader-side records with frozen falsifiable audit commitments**: `app/core/domain/parity.js` harvests 1:1 cadence/duration/notes, SBI-complete feedback, GROW/stretch delegations, recognition, succession bench development, formal performance concerns, and review ratings across active direct reports, decomposes leader investment via finite-sample Gini, Atkinson ($\varepsilon=0.5$), and additive Theil $T = T_{\text{between}} + T_{\text{within}}$ entropy across `role × tenureBand` cohorts (protecting early-ramp reports during `parityRampDays` from disparity flags), tracks leader-owned 1:1 commitments with Wilson 95% score intervals, checks open performance concerns for peer-threshold inversions and longitudinal rating concordance (tie-adjusted Kendall $\tau_b$), and solves a bounded 14-day counterfactual rebalancing plan. `app/core/domain/paritySchema.js` fail-closed normalizes `parityAudits` (cap 60) and `parityMarkers` (cap 400). `app/core/domain/parityRules.js` runs `RULE-PAR-01..05` on the shared spine before decision tempo: one process-level DACI standard-consistency calibration decision with typed `audits-consistency` edges (`RULE-PAR-01`), blameless 1:1 cadence/SBI prompts plus leader-owned tasks with `rebalances-attention` edges (`RULE-PAR-02`), leader-promise recovery tasks/decisions with `repairs-contract` edges (`RULE-PAR-03`), overlooked-bench sponsorship prompts (`RULE-PAR-04`), and stale-audit grading work (`RULE-PAR-05`, `parity` entity type, resolver `#/parity?panel=rebalance&audit=<id>`). CSV scope #55 exports opaque cohort and channel aggregates only.

Schema v66 adds `evidenceReviews` and `evidenceMarkers` ([ADR-0055](docs/adr/0055-evidence-terminal.md)). The Evidence Terminal (`#/evidence`) is a **synthesis read model with frozen falsifiable reviews**: `app/core/domain/evidence.js` harvests two families from records the workspace already keeps — the standardized ITS level shift of every scored, locked impact study (as a percentage of the pre-period mean, so different metrics can be pooled, oriented so positive always means better), and every declared probability that has since resolved across three sources (a study's expected confidence, a premise prior, a frozen support-plan probability) — and pools each with **DerSimonian–Laird random effects**, computing both the z and the Hartung–Knapp interval and reporting the wider of the two. Refusals are part of the design: no pooling below `evidenceMinPoolStudies` (counts only), no τ² or I² below `evidenceMinHeterogeneity` (three studies cannot separate real variance from noise), no Egger below ten, no cross-source Brier below six resolved predictions. `overlappingPairs` counts studies of the same metric whose windows share observations, because pooling non-independent estimates understates the standard error; `leaveOneOut` names any study whose deletion moves the answer. Recommendation ranking is the lower credible bound plus the priced value of one more trial, with both EVPI/EVSI limits asserted by test. `app/core/domain/evidenceSchema.js` fail-closed normalizes `evidenceReviews` (cap 40, aggregates only — no title, hypothesis, note or identifier, so a review cannot become a second unredacted copy behind the export boundary) and `evidenceMarkers` (cap 400). `app/core/domain/evidenceRules.js` runs `RULE-EBM-01..05` on the shared spine before decision tempo (one DACI decision per pooled cell ever when the interval stays on the harmful side of zero, with `grounds-practice` edges; one replication task when a supported result stands alone, counted on independent roots; one pre-registration task where information value exceeds expected effect; `recommends-for` edges from the newest frozen review to open cases plus one owned delegation; stale-edge reconciliation and grading work). The `evidence` entity type joins the shared link registry with `recommends-for` and `grounds-practice` relations, resolver `#/evidence?panel=reviews&review=<id>`. CSV scope #56 exports opaque intervention, outcome and source codes with every figure blank below its floor.

