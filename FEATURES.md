## Canonical app — Session 125 (Schema v91, additive `90 → 91`)

### Value Stream Exchange (`#/valuestream`, [ADR-0085](./docs/adr/0085-value-stream-exchange.md), RULE-VS-01..03, CSV #80)

- ✅ Bilateral peer supplier–customer SLAs with append-only counters, supplier actuals, consumer verification and LCA-mediated breach governance.
- ✅ Real CPM longest path, slack, downstream blast radius and explicit cycle refusal over agreed hand-offs.
- ✅ Stop-rule carryover preview/commit: only invalidated settled pacts and open committed lines; same currency, measured effort, stale-digest and budget checks.
- ✅ One receipt, one proposed receiving Catchball pact, at most one planned Finance line; acceptance commits it once and withdrawal cannot reopen sources.
- ✅ Same-transaction Strategy, Finance, Catchball, two-branch hierarchy and typed Cases lineage on the existing spine; 65 rules / 65 contracts.
- ✅ Five altitude-specific panels, scoped disclosure, identity-free brief and aggregate-only CSV #80.
- ⚠️ Local seats are not authentication; planned lines are not FAC; unknown actual effort releases zero person-days; suppression is not differential privacy.

## Canonical app — Session 123 (Schema v89, additive `88 → 89`)

### Expectation Concordance Terminal (`#/concordance`, [ADR-0083](./docs/adr/0083-expectation-concordance.md), RULE-ECN-01..03, CSV #78)

- ✅ **The word is the instrument.** Six declared expectation dimensions (definition of done, quality bar, priority order, latitude, escalation threshold, pace) on a five-point bar, each with written anchors so both people can recognise their own view without being told they are wrong.
- ✅ **Two sealed sides.** A round is opened for a real reporting pair inside the leader's span; both sides answer independently; nothing is revealed until both are in; a sealed side cannot be revised; a closed round cannot be reopened or withdrawn. A reporting-path fingerprint marks an open round stale after a reorganisation.
- ✅ **Four agreement statistics, none alone.** Quadratic weighted κ (Cohen 1968) on the fixed scale, Gwet's AC1 (2008), PABAK (Byrt et al. 1993) and Bland–Altman bias with 95% limits of agreement (1986). The prevalence paradox is printed when κ and AC1 disagree by more than 0.4.
- ✅ **Refusals are first-class.** Below the six-item instrument floor, with degenerate marginals, or below the span cell floor, the figure is withheld with a printed reason. A refused figure is blank in CSV, never zero.
- ✅ **Agreement is not correctness.** Perfect agreement prints a shared-error warning: two people can agree precisely on the wrong bar.
- ✅ **Exact partition + suppression.** A pair counts once at its leader's node and is inherited by ancestors by addition; span rates are withheld below the declared cell floor; the headline is the share of pairs above the agreement floor with a Wilson 95% interval plus a 10–90 percentile range.
- ✅ **One transaction, modules × hierarchy.** `RULE-ECN-01` writes typed `rolls-up-to` edges to every leadership ancestor for every closed round and `re-tests` provenance to the decision a later round tests; `RULE-ECN-02` opens one governed DACI re-contracting decision per pair per ISO week on divergence and places one generated agenda line on the pair's most recent 1:1; `RULE-ECN-03` writes one advisory maturity marker. 63 rules / 63 contracts.
- ✅ **Closed loop, labelled honestly.** Re-contracted pairs' before/after κ change is compared with breached-but-not-re-contracted pairs, printed as an association and refused below the cell floor.
- ✅ **Disclosure ladder.** Pair detail and both gauges at ranks 1–2 and always for the leader's own pairs; span rates plus the org-wide **dimension profile** at director rank and above; identity-free brief and aggregate-only CSV #78 at the top.
- ✅ **Wiring.** Schema v89 with an additive `88 → 89` migration, two collections, six clamped settings, a `concordance` graph node with two relations, one API right group (`close-expectation-round`, rank 1–5), five safe reads, five axe-clean panels, aliases/badge/title, CSS, pausable auto-propagation with an always-available explicit scan.
- ⚠️ The seal is a read-model and UI guarantee that prevents anchoring — not encryption against a backup file. Local seats remain declarations, not authentication; six items is the instrument, not a sample; the re-test comparison is an association, not an effect.
## Canonical app — Session 122 (Schema v88, **no additional bump**)

### The Sealed Spine (`#/seal`, [ADR-0082](./docs/adr/0082-sealed-spine.md), RULE-SEAL-01/02)

- ✅ One `audit.seal` event per committed transaction, appended by `sealRule` registered **last** on the shared post-commit spine (62 rules): `seal = sha256(prev ‖ digest ‖ revision)`, genesis 64 zeros, digest over the transaction's fresh events in canonical JSON.
- ✅ HMAC-SHA256 keyed by a PBKDF2 256-bit session key (domain `leados-seal-v1:`) when the vault is unlocked; plain SHA-256 otherwise; the mode is printed on every surface. Session key is memory-only and cleared at every lock site.
- ✅ Genesis-walk verification with typed failures (`chain-break`, `seal-mismatch`, `content-mismatch` at the exact revision), trailing-unsealed events and retention-evicted blocks reported honestly.
- ✅ Seal events exempt from the 600-event retention cap (own cap 5000); eviction reported, never hidden.
- ✅ Span attestation roll-up: sealed transactions counted at the owning span AND every leadership ancestor in the same transaction; out-of-subtree spans collapse to `__out-of-scope__` under a declared seat.
- ✅ Gateway: `audit-seal` right (ranks 1–5) for `sealScan`; `sealRead`/`sealVerify`/`sealBriefText` are safe reads; enable/disable/pause fail closed under a seat (operator-only).
- ✅ Identity-free integrity certificate download; four axe-clean panels; `seal` nav badge counts chain breaks only.
- ✅ Altitude-routed NL intake (intake `v2`): LCA-based owning-seat resolution with `ownerId`/`ownerBasis` and an altitude-routing card on `#/intake`.
- ✅ **No new collection and no migration of its own** — `SCHEMA_VERSION` is 88 after Session 121's additive bump; three settings default when absent (`sealEnabled`, `sealAutoPropagate`, `sealMode`).
- ⚠️ Not authentication, not a multi-user boundary; plain-hash mode is tamper-evident, not forgery-proof; no external timestamping; verification is on demand, not continuous.

## Conflict integration — Session 45 retention (Schema v86, additive `85 → 86`)

### Retention Intelligence & Talent Economics (`#/retention`, [ADR-0012](./docs/adr/0012-retention-intelligence.md), RULE-RET-01..04, CSV #76)

- ✅ Kaplan–Meier tenure survival with censoring and Greenwood bands; penalised hazard model that stays on declared priors until its evidence floor is met.
- ✅ Recorded-cost-only expected-loss ranges; currencies remain separate; no confidential conflict or anonymous pulse data enters the model.
- ✅ Departure ledger and governed retention plans. Automation proposes work but does not commit money; late or post-cutoff records rewind honestly.
- ✅ Schema v86 uses a new additive `85 → 86` migration so the old v29 slot stays owned by the existing continuity feature.
- ✅ PR #84 comparison: current `#/merit` already owns the pay-equity terminal; no duplicate pay feature was imported.

## Canonical app — Session 118 (Schema v84, additive `83 → 84`)

### Decision Rights Exchange (`#/mandates`, [ADR-0078](./docs/adr/0078-decision-rights-exchange.md), RULE-MND-01..03, CSV #74)

- ✅ Bounded authority contracts over existing open work (case/decision/delegation/goal/…); confidential sources excluded.
- ✅ Two-sided lifecycle: offer → explicit accept → evidence deliver → sender verify; return/revoke/expiry/scope/budget drift open a named recovery path and grade the acceptance decision.
- ✅ Capacity evidence from the measured load model; required capacity plan when headroom is unknown/insufficient; unknown is never zero.
- ✅ Real budget encumbrance on acceptance, recorded actual on verification, release only without an actual; same-currency/period/headroom/line-cap guards.
- ✅ Reporting-tree routing: down/up only, LCA for cross-span, rank floors, high-consequence safety, real calendar dates.
- ✅ Receiver-partitioned roll-up with drill-down; rank ≥4 non-party redaction; aggregate-only CSV #74 and brief; small-cell refusal below five contracts.
- ✅ Wiring: schema v84, fail-closed normalizer, `mandate` graph node + 3 relations (100 total), 3 action rights, `authority` record class, nav/badge/aliases, four axe-clean panels, pausable automatic reconciliation + explicit scan.
- ✅ Fixed succession brief download contract + blocked-download fallback (regression-tested).
- ⚠️ Local seat is a workflow declaration, not authentication; no tenant isolation, external notification or autonomous spending.

# LEADOS — Feature Status

Honest status of what is actually implemented in this workspace.

## Canonical app — Session 117 (Schema v83, additive `82 → 83`)

### The Succession Terminal (`#/succession`, [ADR-0077](./docs/adr/0077-succession-terminal.md), RULE-SUC-01..05, CSV #73)

- ✅ **Flow feasibility, solved and certified.** A real Dinic maximum flow `source → item → survivor → sink` over a span's dated obligations and the holder's peers; the assignment is read from the residual graph; on failure the **minimum cut** is printed with each blocked item's due date and eligible-survivor count. Cross-checked in tests against brute-force enumeration of every assignment on a fixed small shape.
- ✅ **Span as the unit; peers as survivors.** Direct reports partition the roster (every obligation tested exactly once, counts roll up by exact addition); the span lead is never a survivor; `empty-span` and `span-of-one` are drawn and refused rather than reported covered.
- ✅ **Five graded eligibility sources** (`covered-before`, `delegated-together`, `shared-goal`, `shared-review`, `same-team`) — each an edge earned by a record, with `unlinkedPairs` printing the blind spot.
- ✅ **Declared overload rule** `⌊factor × median(load) − load⌋ + 1` floored at 0, printed everywhere it is used, tested in both directions.
- ✅ **Collective blanket** (dated union) with independent thread count; recurring cadences excluded; no future-dated obligation → refused, not infinite.
- ✅ **HHI concentration** with inverse-HHI effective holders and Shannon entropy; absent holders stay in the denominator.
- ✅ **Lindley–Smith single-sample acceptance** prices an untested bench at 50%; Jeffreys posterior once above the floor.
- ✅ **Bounds pair** at enterprise level (`∏(1−p)` upper, `max p` lower), 5% floor inside the cap, `p = 1` for an infeasible span; diffusion index refuses below its span floor.
- ✅ **Per-currency declared deprivation cost**, exact binomial shortfall tail, equal-marginal figure labelled an upper bound, unpriced work counted and never valued.
- ✅ **Freeze / grade / lapse / delete.** One prospective probability plus its lower bound; refuses to freeze with no measurable span or twice in a day; graded once later by re-running the structural test; deleted member = unmeasurable; completed obligation = span succeeding; skill withheld below five readings; `Number(null)` guarded at every numeric boundary.
- ✅ **RULE-SUC-01..05 on the shared spine** (55th of 56, before `seatRule`): notice tasks, one governed DACI decision per span per 30-day bucket with the certificate as `certifies-gap` edges and three options including accept-in-writing, a development commitment per 90-day bucket for concentration, grading work, and dead-edge revocation that leaves other rules' edges untouched.
- ✅ **Five altitudes, five questions**, names withheld above director; one surface, not five dashboards.
- ✅ **Wiring:** Schema v83 (`successionReadings`, `successionMarkers`, 12 conventions), `successionreading` node, 4 relations (97 total), 8 actions, 13 aliases, nav badge, SUC-01..08 signals, insights bucket, identity-free brief, CSV #73, six axe-clean panels.

**Not claimed:** no measured skill until five readings are graded; eligibility is only as good as the record of who has worked with whom; the overload rule is a convention, not the measured capacity of ADR-0018; real-browser assistive-technology walkthrough **[UNVERIFIED]**.

## Canonical app — Session 116 (Schema v82, **no version bump**)

- **Operating Seat / Altitude Lens (`#/seat`)** — ADR-0076. The enforcement half of §0.3, built ON ADR-0075's reporting tree rather than replacing it. `settings.activeSeatId` declares the acting leadership position in an append-only `seat.switched` handover; `null` is the undeclared operator view (the exact pre-0076 behaviour). `buildSeats` derives six seats over five Jaques altitudes from `person.managerId`; `scope` is the node's `subtreeIds`. Real-browser walkthrough **[UNVERIFIED]**.
- **Deny-by-default ABAC/RLS** — `canSee` / `canAct` / `routeVerdict` over four sensitivity classes (`individual` 1–2, `unit` 1–5, `portfolio` 3–5, `enterprise` 4–5) with detail ceilings 2/3/4/5 and ~40 governed collections in one declarative `RECORD_POLICIES` row map. Refuses upward detail leakage (counts survive, names do not), downward portfolio/enterprise leakage, and sideways peer-span leakage. Unlisted collections fail closed to `unit`; undeclared actions are refused. Every non-full outcome prints its reason in the transparent enforcement ledger (`projectForSeat`), and `RULE-SEAT-03` writes `seat.access_denied` audit events.
- **Role-tiered shell** — nav filtered by `routeVerdict`, a direct hash navigation to a forbidden route refused at render time with the verdict's reason and three exits, topbar seat chip, static quick-action row hidden while a seat is enforced, and a nav badge counting withheld records rather than work.
- **Vertical roll-up on the shared spine** — `seatRule` registered last among 55 `DEFAULT_POST_COMMIT_RULES`; `RULE-SEAT-01` fans one typed `rolls-up-to` edge per leadership ancestor for every `SIGNAL_SOURCES` work item (idempotent by exact-edge uniqueness), `RULE-SEAT-02` opens one governed hand-up delegation per seat per ISO week. One committed frontline case reaches manager → director → VP → CEO in the same atomic transaction as every other module's propagation.
- **Composition-safe digests** — exact counts; pooled vs mean-of-unit horizon-debt rate with spread, materiality bar and directly standardised comparison; evidence-floor refusal (unit rates too); severity × age risk heatmap; ≥4-week arrival-trend anomaly with an `unmeasured` verdict; altitude duties whose routes are filtered by the permission engine; disclosure ladder; generated board-ready line with unverified figures marked and no person named. All derived live — no stored copy.
- **Zero-migration architecture** — `SCHEMA_VERSION` stays 82; no `COLLECTIONS` or `MIGRATIONS` change; seat declaration is a whitelist-normalised setting, handovers/refusals are events in the existing append-only log, provenance reuses existing typed relations/entity types. Automatic pass inert until a seat is declared; explicit `seat.scan` always runs. `tests/app/operating-seat.test.mjs` — 13 tests.
- **Limitation, stated plainly:** this is not authentication. One browser, one local store, no server: a seat is an auditable declaration, not an identity proof. Exported backups are whole-workspace. Cryptographic seat attestation and per-seat export redaction are on `ROADMAP.md`.

## Canonical app — Session 115 (Schema v82)

- **Command Chain (`#/chain`)** — the first surface in the workspace that treats the hierarchy as a **model** rather than a filter (ADR-0075). The reporting tree is read from `person.managerId` as a tree (cycles, orphans, self-managers and inverted titles reported, never repaired) and every node is assigned an **altitude defined by its time span of discretion** (Jaques): 7 d frontline, 30 d manager, 90 d director, 180 d executive, 365 d enterprise. `person.level` supplies the altitude where it exists; a person with direct reports and no leadership title is escalated to the frontline altitude with the reason printed, and an IC with no reports gets `null` rather than a courtesy rung. **Responsibility is derived, never assigned**: an open item names the people it concerns and its owner is the **lowest common ancestor** of their managers, so cross-unit work rises to the smallest span containing everyone it touches. **The clock is per altitude**: `requiredAltitude = max(by consequence, by age)`, every escalation row prints the day it crossed (`openedOn + ownerHorizon`), and an item whose requirement is above the highest altitude the roster contains is reported as demanding a level that does not exist — no director, VP or CEO is ever invented, and empty rungs are drawn empty with their duties and no incumbent. **The roll-up is printed twice**: exact sums for counts (the leader's rolled-up count *is* the item count) and, for rates, a pooled rate beside the naive mean of unit rates with a `compositionSensitive` flag and a directly standardised comparison past the materiality bar; below the evidence floor a cell is withheld with its reason. Altitude drift is measured in both directions against a declared bar. Survival and the escalation forecast read the ages at which this workspace's items actually closed, refuse below the floor, and quote the assumption-free Fréchet bound with the independence value beside it. A disclosure ladder (names / unit leaders only / counts) is enforced in one function and printed as a rendering contract, never claimed as access control. Frozen readings carry one probability, are graded once after their review date, and refuse to score a reading that quoted none. `RULE-CHN-01..05` on the shared post-commit spine (capped escalation tasks with `escalates-to`/`rolls-up-to` edges, weekly hand-up per span, one structural decision, one drift decision, grading work) are marker-idempotent, pausable, and never edit, close or re-type the item they report. Two graph nodes (`chainreading`, `chainMarkers` markers), two relations, CHN-01..08 signals in a *Command chain* bucket, a nav badge counting only decision-shaped work, an identity-free brief, aggregate-only CSV scope #72, fourteen aliases and six axe-clean panels. No person is rated, ranked or scored; `conflicts` and `pulses` are never read. Real-browser walkthrough [UNVERIFIED].
- **Two-tree friction removed (documentation, not code)** — `CONTRIBUTING.md` rewritten canonical-only, `docs/LEGACY-TREES.md` authored, `docs/INDEX.md`/`docs/README.md` rewritten, in-tree quarantine markers added, 30 archive pages bannered historic, the Next.js toolchain namespaced `legacy:*` (`dev`/`start` now serve the canonical app, `npm run typecheck` **refuses** instead of reporting an empty pass), and the boundary gate now checks 23 documentation assertions. See the ADR-0007 amendment.

## Canonical app — Session 114 (Schema v81)

- **Cross-Examination Terminal (`#/sceptic`)** — the only surface in the workspace that argues against the record it reports on (ADR-0074). Twelve structural detectors over six claim families (completion, assessment, prediction, diagnosis, alignment, capacity) compare records the workspace already holds, or a record against a hole where another should be; every finding carries the single observation — its *refuter* — that would settle it. Verdicts are a human act with a required reason (refuted / held / dismissed); refuted and held are scored, a dismissal never is. A family's contradiction rate is a Jeffreys `Beta(½ + refuted, ½ + held)` posterior with a 90% interval by bisection, refused below a declared scored floor, and computed over every verdict ever recorded so a repaired claim cannot make its family look better. Coverage is discovery sampling over records actually read, and the terminal's own false-alarm bound is Clopper–Pearson `Beta(1−α; h+1, k−h)` — the rule of three at `h = 0` — printed at 100% when nothing has been examined, with the examinations needed for a 10%/25% bound. Freezing refuses to price a claim whose family has no measured rate; grading scores only verdicts recorded after the freeze, by Brier and log loss against the round's own base rate, allows a negative skill figure and prints it, and marks an empty window **lapsed** rather than excused. `RULE-SCP-01..05` open capped cross-examination tasks with `cross-examines`/`finds-against` edges, one governed process decision per failing family per 30-day bucket, a `records-verdict` edge per verdict, grading work and a blameless question when the dismissal rate crosses the leader's own cap. Two graph nodes (`scepticround`, `scepticdisposition`), three relations, SCP-01..07 signals in a *Cross-examination* bucket, a badge counting only decision-shaped work, an identity-free brief, aggregate-only CSV #71, fourteen aliases and six axe-clean panels. No person is rated, ranked or named; exposure is stake-weighted units, never money. Real-browser walkthrough [UNVERIFIED].

## Canonical app — Session 113 (Schema v80)

- **Promise Solvency Terminal (`#/solvency`)** — every dated promise the workspace already holds, read as one liability portfolio against the leader's own measured settlement record (ADR-0073). Six sources harvested from existing collections (delegation due dates, decision reviews, goal dates, feedback follow-ups, stakeholder contact cadences, hiring start dates); per-source Jeffreys-smoothed on-time share with a Wilson interval and four verdicts that print their reasons, where `unproven` prices nothing and counterparty-class pooling is a declaration that can be refused; `PD(t) = S(1)/S(today − obligation)` with one virtual on-time settlement at offset 0; a one-factor Gaussian copula with Euler/Tasche marginal contributions, the Fréchet–Hoeffding interval printed beside it and a 0–90% ρ sweep; the full count distribution `P(N = k)` by convolving conditional Bernoullis across the common factor; measured coverage, utilisation, Little's Law clearance and a 100/80/60/40% stress curve; repair economics (`PD × breachMultiplier × weight` versus the cost of asking) with a printed script and a move cap that becomes a decision; freeze-once readings graded once on the count (RPS, log score) and on every individual promise (Brier against the book's own breach rate), with the assumption-free ceiling never scored; `RULE-SLV-01..05` on the shared post-commit spine; two graph nodes (`solvencyreading`, `solvencyrenegotiation`), three relations, CSV scope #70, an Insights bucket, thirteen aliases and six axe-clean panels. No person is rated, ranked or named.

## Canonical app — Session 111 (Schema v79)

- **Evidence Supply Chain (`#/supply`)** — treats every judgement the workspace refuses to make as a work order in one production system. Six evidence lines (assumption settlements, calls with a recorded decision day, closed delegations, completed review observations via the reliability terminal's own harvester, resolved cases, graded forecasts) harvested from dated records; rate = units ÷ declared window; wait to the next `k` units from the Jeffreys Gamma posterior's negative-binomial predictive (`r = n + ½`, `p = W/(W+t)`, `P(T_k > t) = P(N(t) ≤ k − 1)`), percentiles by bisection, quantiles withheld for a never-productive line and the expected wait refused when `r ≤ 1`. Five verdicts with printed reasons (met / filling / starved / retire / never produced); pressure = demand × (1 − P(fill in horizon)) names the constraint, called **binding** only above the leader's declared demand share; Little's Law reads the queue as a clearance time. Capture vs wait priced through one declared exchange rate; a greedy weekly schedule inside declared evidence hours with the LP upper bound and gap printed; no demand ⇒ never scheduled. A frozen plan quotes one assumption-free Fréchet probability (`max pᵢ`) with the independence value beside it and grades once by Brier. `RULE-SUP-01..05` (capped capture tasks, `supplies-evidence`/`unblocks-judgement`/`retires-question` edges, one capacity DACI decision per ISO week, monthly retirement prompts, one unlock task per line ever, grading work), `SUP-01..06` signals, Evidence supply bucket, nav badge, identity-free brief, aggregate-only CSV #69, six axe-clean panels, twelve route aliases, `supplyplan` node. No person is scored, rated or named; no unit is ever manufactured by a rule. Real-browser walkthrough [UNVERIFIED].

## Canonical app — Session 110 (Schema v78)

- **Coupling Ledger (`#/deferral?panel=coupling`)** — reads a leader-declared pairwise correlation ρ back against the realised joint timing of the calls that declaration coupled. The Deferral Portfolio has priced a correlated joint tail on a typed ρ since Schema v69; this panel is the only place the record answers back. Estimand: among declared pairs where **both** calls carry a decision date, how often did the two resolutions land in the same 30-day calendar block — co-resolution *given that both resolved*, never co-movement of value, never a probability that either resolves. A pair with an open member is refused with its reason and never counted as a non-coincidence; a pair whose whole common window fits in one block is refused because a coincidence there is arithmetically certain. The null is a structure-preserving cyclic rotation of each call's resolution block inside its own at-risk window, so marginals survive, a call in several pairs keeps one placement across all of them, and the family is deterministic — the p-value never moves between machines. Both tails are read: with zero coincidences the upper test returns p = 1 forever, so the deficit tail is the only one that can report an over-declaration. Declared ρ is mapped to a coincidence reference through a bivariate-normal copula and printed under **both** τ = ρ and τ = 2·sin(πρ/6) conventions, with a mapping-dependent magnitude flagged and no work opened on it. Six verdicts (insufficient / unidentifiable / inconclusive / independent / coupled / hedged) and six assessments; a band below the pair floor prints **no assessment at all** — a thin band reads *unresolved*, never *independent*. Materiality `max(5 pp, 20% of the model figure)` gates every size claim; the implied ρ is advisory with an explicit `identified` flag. Frozen reviews store band aggregates, the rotation summary and member ids only, carry one prospective probability from a Laplace-smoothed commitment hazard re-based to the review's own window, and grade exactly once — a later contradicted declaration appends a challenge note and never rewrites a frozen figure. `RULE-CPL-01..03` write `calibrates-coupling` / `measures-coupling` edges, open at most one owned reconciliation task per contradicted band, at most one governed re-declaration decision per ISO week, and at most one advisory task per band per week. Five signals, a Coupling ledger insights bucket, a nav badge, route aliases, six axe-clean panels, an identity-free brief and CSV scope #68 (band aggregates only — no decision id, no band label, no title). **No person field is read anywhere**, and the module has no write path to `correlationDeclarations`: the leader declares, the record comments. Real-browser walkthrough [UNVERIFIED].
- **Measurement Reliability Terminal (`#/reliability`)** — Schema v77, ADR-0069. See the session entry below.

## Canonical app — Session 100 (Schema v71)

- **Borrowed Evidence Engine (`#/credibility`)** — partial pooling for every small sample the workspace keeps: signal families (actionable precision vs the Signal Integrity Board's floor), assumption criticality classes (settled hold rate) and delegation authority classes (on-time delivery with censoring). Beta-binomial hierarchy by full Bayes on a deterministic grid (BDA3 hyperprior); per-unit borrowed estimate, 90% interval, own weight Z, exact P(below floor), graduation dates, exact what-if and break-even counts; χ²/I² heterogeneity and SD-relative influence. `RULE-CRE-01..03` open outside-view decisions at premise registration, checkpoint tasks for late-running authority classes and re-tune tasks for thin families, govern exchangeability by written ruling, and grade every frozen borrowed claim against the unit's own record by Brier. Six panels, CSV scope #61, Insights bucket *Credibility*. No person is a unit; refused groups are never pooled. Real-browser walkthrough [UNVERIFIED].

## Canonical app — Session 97 (Schema v68)

- **Deferral Option Terminal (`#/deferral`)** — prices one open decision's American option to wait from the leader's own records: stake from typed decision value terms, commitment cost from budget lines pointed at the call (reversible calls pinned to `K = 0`), carry from the workspace's 12-week erosion price charged as a cash outflow, and σ from the robust log-scale dispersion of settled realised ÷ assessed ratios (withheld below the observation and σ floors; a declared σ is accepted only when labelled). Cox–Ross–Rubinstein lattice with an exercise boundary, flexibility premium, commit probability, expected wait, and break-even carry / break-even σ solved by bisection. Verdicts: commit now, waiting pays, indifferent, act or drop, withheld. Frozen frames carry one prospective `P(commit by deadline)` claim, graded once against the recorded decision date; `RULE-DRO-01..03` write typed links, one boundary watch, weekly expired-window decisions and blameless process tasks on the shared spine. CSV scope #58 is aggregate-only. The premium is never added to EVSI or to the cost of waiting, and the numbers are decision-analysis values on a real-world measure, not market prices.
- The sections below this point describe the **quarantined legacy `src/**` tree** and its Next.js API, not the canonical zero-build app in `index.html` + `app/**`; `LEADOS-STATE.md` is the current inventory.

> **Read this first.** The canonical, runnable product is the **zero-build static app** at
> `index.html` + `app/**` (start it with `npm run app`, open `#/today`; `npm test` runs **1,623 tests
> across 91 test files**). It covers: Today triage; people and roster; 1:1s, prep sheets and feedback;
> goals and execution tracking; delegations; DACI decisions; reviews and growth; onboarding and
> role transitions; conflict and pulse (private); cross-domain **Operational Cases** with
> FMEA/PERT/Mendelow/5-Whys analysis and an event-driven propagation engine; **Capacity, flow &
> portfolio allocation** (`#/capacity`); **Selection & hiring** (`#/hiring`); organizational design,
> team topologies and Shewhart XmR change control (`#/changes`); seeded Monte Carlo portfolio and
> J-curve simulation, counterfactual scenario sandboxing with Pareto/tornado analysis
> (`#/scenarios`); forecast calibration; the case-cost ledger; the **Negotiation Workbench**
> (`#/negotiations`); **budget envelopes and financial commitments** (`#/finance`); the
> **Stakeholder Influence Register** (`#/stakeholders`); the **Forecast Integrity Terminal**
> (`#/forecasts`); the **Natural-Language Intake Terminal** (`#/intake`); the **Decision Tempo &
> Timing Terminal** (`#/tempo`) — per-decision cost of
> delay with Reinertsen's four delay profiles, closed-form preposterior EVSI for the option to
> wait, an optimal decision date with a switch probability, value at stake derived from typed
> graph links with currencies never summed, measured decision latency with a split-conformal
> class band (counts-only below n=5), five post-commit rules (`RULE-DLY-01..05`) that settle,
> escalate, propose, refresh and govern but never arm a timebox, `DLY-01..06` signals, a
> deterministic board brief and a data-minimised CSV scope #28; and, newest in **Schema v38**, the **Structural Capital Allocation** terminal (`#/capital`) —
> a fixed effort-week budget allocated across six structural levers by marginal return with
> budget feasibility, exact Shapley attribution over every coalition of the funded levers, a
> substitute/complement pair table, seeded Savage minimax regret against the named playbooks and
> doing nothing, and a trust ladder (`unvalidated → refuted → provisional → backtested → validated`)
> that only calls a recommendation *actionable* after out-of-sample validation; RULE-SCA-01..04
> propagate a priced DACI commitment decision, an owned checkpoint delegation, typed scoring lineage
> and a re-baselining decision, with `SCA-01..05` signals and CSV scope #39.
> 39 formula-safe CSV scopes, schema migrations from v1, and an append-only action log.
>
> Verified this session: **1,580 tests across 90 test files, 0 failing**, including the 39-test capital suite with a
> JSDOM + axe-core UI workflow over all four tabs and the adopt-from-terminal path; `npx eslint
> app/ tests/app/`, the canonical boundary check (222 app modules / 90 suites, 0 leaks) and the
> docs-link check are clean; the standalone artifact rebuilds at schema v38 (2,741,516 bytes).
> **Not** verified: real-browser rendering, screen-reader output, or manager comprehension — no
> browser engine or assistive technology can run in this container, so those remain
> **[UNVERIFIED]**; capital effort costs are declared conventions, the objective weights are a
> leader-declared value function, and lognormal parameter stress is not a calibrated posterior.
>
> The sections below describe the **legacy Next.js/Drizzle experiment** (`src/**`, root `*.tsx`),
> which is kept for history only and has not been executed or verified this session
> (**[UNVERIFIED]**). See `LEADOS-STATE.md` for the full continuity record.

## Live
- **Multi-tenant storage** — every business table (`leads`, `decisions`, `knowledge_entries`, `entities`, `events`, `users`) carries `tenant_id`; queries are scoped per tenant via `src/lib/tenant.ts`.
- **Deterministic, explainable lead scoring** — `src/lib/scoring.ts` computes a 0–100 score from named, weighted criteria and returns the full contribution breakdown with every score.
- **Append-only, hash-chained evidence ledger** — `src/lib/ledger.ts` writes every scoring and stage-change decision to the `decisions` table with a SHA-256 hash chained to the previous entry. `/api/decisions/verify` recomputes the chain and reports whether it is intact.
- **Knowledge substrate with honesty labels** — every knowledge entry and every ledger entry carries a `confidenceLabel` of `measured`, `estimated`, `association`, or `effect` — nothing is asserted more strongly than its evidence supports.
- **REST API** — `/api/leads`, `/api/leads/[id]`, `/api/decisions`, `/api/decisions/verify`, `/api/knowledge`, `/api/stats`, `/api/health`.
- **Executive dashboard UI** — overview KPIs, top-scoring leads, recent ledger entries, full leads board with inline score breakdown, ledger explorer with chain verification, knowledge board.

## Absent
- Authentication / authorization (no login, no RBAC, no session).
- Event-sourcing is seeded (`events` table exists) but not yet the system of record for every mutation — reads still go through normal table queries.
- Automated test suite (vitest/playwright) — not present in this workspace yet.
- Multi-tenant switching UI (schema supports it; no tenant picker exists).
- Everything described in Parts 02–139 of the supplied LEADOS Integration
  Master beyond what is listed above (causal engines, agent orchestration,
  design bible, workflow engine, etc.) — none of that is built in this
  workspace. Do not assume otherwise; see `LEADOS-STATE.md`.

## Roadmap (natural next extensions of this exact codebase)
- Wire `entities`/`events` as the actual source of truth, with `leads` as a projection.
- Add auth (e.g. email/password or OAuth) and tenant-scoped sessions.
- Add a vitest suite for `src/lib/scoring.ts` and `src/lib/ledger.ts` (pure functions, easy to test).
- Add a tenant switcher once a second tenant is needed.

Schema v63 adds `survivalReadings` and `survivalMarkers`: the Delivery Survival Terminal (`#/survival`) estimates how long work of a given kind actually takes from records the workspace already holds across six modules — funded portfolio work, cases, requisitions, change programmes, delegations and decisions — with no new data entry to get a first reading. Kaplan–Meier (Greenwood variance, log–log band) keeps open items in the risk set instead of dropping them; the Aalen–Johansen cumulative incidence treats abandonment as a competing risk, so the page prints both the naive "eventually completes" figure and the corrected incidence and says why they differ; Nelson–Aalen hazard by elapsed-time bucket, Mantel–Cox log-rank between two classes, conditional completion over a forward window and an age percentile (a share of past exits, explicitly not a probability) complete the read model. A reading freezes per-item probabilities, the at-risk counts they were conditioned on, the curve digest and a review date, and is graded once afterwards with Brier against the class's own base rate — a skill score, withheld below five settled items. `RULE-SURV-01..05` run on the shared spine: typed `endangers` edges plus one owned task per doomed item (recorded owner only, maximum five), one repair task when a graded reading lost to its base rate, exactly one DACI decision per class per week when abandonment reaches the declared share of exits, one task per returned delegation with no recorded reason, and one grading task per stale reading. The module asserts no person-level claim, refuses a probability below the at-risk floor, never extrapolates a median or a tail, and states its own assumptions — independence of censoring, exchangeability within a class, no Fine–Gray subdistribution model. CSV scope #53 exports 34 aggregate columns with every figure blanked below the evidence floor. Two later additions (no schema change) guard the curve's transportability: a fixed-cohort calendar-drift check on time to any exit (RULE-SURV-06), and its **competing-risk decomposition** (Session 94, ADR-0057, RULE-SURV-07), which differences each cause's day-30 Aalen–Johansen incidence between the cohorts — so a slowdown is attributed to finishing less or giving up more, a silent one-for-one substitution of abandonments for completions at unchanged speed is named instead of staying invisible, and the week's drift decision is framed as an intake review or a completion review accordingly.


Schema v64 adds `waitPrices`, `waitExposures` and `waitCostMarkers`: the Cost of Waiting Terminal (`#/wait`) prices the open queue in money. A leader declares one weekly price per class of work across the same six modules the survival terminal harvests (cap 24, fail-closed); a decision with linked committed money is priced derived (value at stake ÷ 12-week erosion window, linear CD3); anything unpriced is reported as unpriced, never zero. Each open item is multiplied by the censoring-aware still-open probability S(age+w)/S(age) from the leader's own closed records, refused below the at-risk floor and flagged past the longest observation, and wait-horizon scenarios (1/2/4/8 weeks) print probability plus expected additional cost per row. Totals are per currency and never pooled; rows are ranked priced-overdue first. Weekly exposure certificates freeze the priced queue and are navigable through SYSTEM_GENERATED `prices-delay` edges. `RULE-WAIT-01..05` run on the shared spine before decision tempo: stale-edge reconciliation, the certificate, ≤40 links, exactly one triage DACI decision per currency per week, ≤5 owned delegations and ≤3 declare-a-price tasks. Signals WAIT-01..06, CSV scope #54 (aggregate per class × currency, opaque codes, scenario figures blanked below the evidence floor). The module prices classes of work, never people, and cannot reorder or close anything itself.
