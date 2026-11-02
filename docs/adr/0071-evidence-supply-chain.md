# ADR-0071: The Evidence Supply Chain — refusals as work orders, the constraint, and the price of waiting

Date: 2026-11-01 · Status: implemented · Schema: v79 · Surface: `#/supply`

## Context

By Session 110 this application had become unusually honest about small samples, and
that honesty had a cost nobody had counted. Session 99's Signal Integrity Board refuses
a family below its floor. Session 100's Borrowed Evidence Engine refuses a unit below its
sample floor and prices what it cannot measure. Session 103's Delivery Survival Terminal
refuses a class below its at-risk count. Session 108's Counterfactual Policy Terminal
refuses a family below ten decision points and returns `refused-unidentifiable`. Session
109's Measurement Reliability Terminal refuses to separate two people when the instrument
cannot carry the signal. Session 110's Coupling Ledger refuses a band below its pair floor.

Every one of those refusals is correct. Together they produce the worst possible first
quarter for a leader who has never managed anyone: sixty screens, each of which says
*ask again later* in a different vocabulary, and none of which says **which** of those
gaps is worth closing, **how long** the record would take to close it on its own, or
**whether** it should be closed at all. A refusal that cannot be priced is indistinguishable
from a defect.

Sessions 108, 100 and 104 each independently named the same follow-up — "borrowing as a
service: every *too few to judge* refusal should register with one shared registry so a
refusal is a first-class object with one repair route". That instinct was right and the
framing was too small. Registering refusals produces a list. The thing a leader needs is
a *production system*: a refusal is a work order, evidence is the input, and the workspace
manufactures evidence at rates that are already measurable from its own dated records.

The competitive picture, surveyed 2026-11-01 (RESEARCH §95): every vendor in this category
publishes a **confidence floor** and then a suppression rule — Viva Glint, Lattice, Culture
Amp, Leapsome, 15Five and Visier all hide a small group behind "not enough responses".
None of them publishes what the floor *costs*, when it would be met, or what gathering it
would be worth. None treats evidence as a throughput problem with a bottleneck. The
supply-chain and operations vocabulary exists in analytics engineering (data-quality SLAs,
coverage SLOs) and in finance (information value, optimal stopping) — and it does not
exist in any leadership, people-analytics or decision-intelligence product.

## Decision

Add `#/supply`, a six-panel Evidence Supply Chain, as a **derived read model over the
workspace's existing dated records plus one frozen commitment** (a plan). It is the first
surface in the app whose subject is the app's own ability to judge.

### 1. Six evidence lines, harvested from records that already exist

A **line** turns dated records into a judgeable quantity. The registry
(`supplyRegistry.js`) is the whole vocabulary; the harvesters (`supply.js`) are adapters
over collections the workspace already keeps:

| line | unit | consumer that cannot judge without it |
|---|---|---|
| `premise-outcome` | conclusive assumption settlement | Borrowed evidence & premise calibration |
| `decision-resolution` | call with a recorded decision day | Counterfactual policy |
| `delegation-delivery` | delegation that closed (delivered or returned) | Leadership parity |
| `review-observation` | completed review observation | Measurement reliability |
| `case-resolution` | resolved operational case | Outcome attribution |
| `forecast-grade` | graded forecast (any frozen ledger) | Forecast integrity / confidence transport |

The review line calls the reliability terminal's *own* harvester, so the two surfaces can
never disagree about what counts as one observation. Adding a seventh line is one registry
entry plus one harvester; the report, plan, rules, view, signals and CSV scope all iterate
the registry.

### 2. The rate is measured; the wait is a closed-form posterior predictive

For `n` units inside a declared window of `W` weeks, with a Jeffreys prior on the arrival
rate, the posterior rate is Gamma(n + ½, W) and the predictive count of arrivals in `t`
more weeks is negative binomial with `r = n + ½`, `p = W/(W + t)`. Therefore

```
P(T_k > t) = P(N(t) ≤ k − 1) = Σ_{j<k} C(j + r − 1, j) p^r (1 − p)^j
```

evaluated term by term (no factorials, no incomplete-beta calls, exact for the ranges this
app can reach). The 10th, 50th and 90th percentiles of `T_k` are solved by bisection over a
bounded bracket.

Two refusals are built into the estimator:

- **A line that has never produced a unit gets no quantile at all.** The prior is proper, so
  a number exists — roughly sixteen years for a typical shortfall. Printing it would read
  like a schedule. The page says "no finite wait" instead.
- **The expected wait is `W·k/(r − 1)`, which does not exist when fewer than one unit has
  been observed.** That is not pedantry: an expected wait that does not exist *is* what a
  starved line looks like.

### 3. Five verdicts, each with a printed reason

`met` (the floor is already reached), `filling` (it reaches the floor inside the horizon
with at least the declared probability), `starved` (below it), `retire` (starved **and** the
open work the line feeds is older than the retirement bar), and `unobserved` (no unit of
this kind has ever existed). The last two are separated on purpose: one is a slow line, the
other is a line that does not exist, and no amount of waiting distinguishes them from the
outside.

The `retire` verdict is the module's stance and its most contestable one. It applies the
sunk-cost rule (Arkes & Blumer 1985) to *questions*: time already spent waiting is
unrecoverable, so it must not influence whether to keep waiting. A question the record
cannot answer before its own demand goes stale should be closed or re-scoped — with the
reason recorded — rather than left open as ambient guilt.

### 4. The constraint is named, and the word is earned

Pressure per line = open demand × (1 − P(fill inside the horizon)). The constraint is the
line with the most pressure. It is called **binding** only when the share of open demand
sitting on starved lines clears the leader's declared bar; below the bar the page says
"the biggest queue, not a binding constraint", because lending it the authority of the word
would be exactly the kind of rhetorical upgrade this app has spent a hundred sessions
refusing to make.

A separate diagnostic applies **Little's Law** (L = λW) to the whole chain: open items
against measured output implies a clearance time. The assumption (demand constant, no
re-work) is printed with the number, because a queueing identity is not a forecast.

### 5. Capture versus wait is priced, and the exchange rate is declared

The engine can measure the wait. It cannot price the leader's hour. So it asks for the one
input it cannot derive — `supplyMinutesPerUnit`, the minutes one more unit costs — and then
prints the exchange honestly: `weeks saved per hour = median wait ÷ capture hours`, against
a declared bar (`supplyCaptureRatio`). Below the bar the verdict is `wait`; above it,
`capture`. Both numbers are shown, so a leader can disagree with the exchange rate rather
than with a hidden assumption.

### 6. The schedule is bounded, and its optimality gap is printed

Candidates are ranked by pressure per hour and filled greedily inside the declared weekly
evidence hours — the **rope**, in drum–buffer–rope terms: no plan may commit more than the
leader said they have. The fractional (LP-relaxation) value of the same ordering bounds the
integer optimum from above, and the gap is printed. Greedy is not optimal and the page says
so; the same discipline that keeps a heuristic out of a proof keeps a heuristic out of a
schedule.

Lines with no open demand are never scheduled. Evidence nobody is waiting for is inventory
with no buyer, and buying it is the most common way a careful manager wastes a week.

### 7. One probability, and it is the assumption-free one

A frozen plan quotes the probability that **at least one** planned line clears by its review
date. The headline is the Fréchet lower bound `max(pᵢ)` — valid with no independence
assumption whatsoever, therefore incapable of being optimistic. The independence value
`1 − Π(1 − pᵢ)` is printed beside it and explicitly labelled as an assumption; the
difference is stored as `reservePct` so the cost of the assumption is a visible number.

The plan stores the members' required counts and observed counts **as frozen**, so grading
cannot drift with a later convention change. It grades once, from strictly later evidence,
by Brier. A window that closes with nothing cleared is graded, not excused; a plan graded
twice is refused.

### 8. RULE-SUP-01..05 on the shared post-commit spine

- **SUP-01** — a frozen plan opens at most `supplyMaxTasks` leader-owned capture tasks (one
  per planned line, each stating the missing count, the measured rate, the median wait and
  the hours), writes `supplies-evidence` edges from the plan to each task, and
  `unblocks-judgement` edges to the open records the line's output is for. It never
  manufactures a unit.
- **SUP-02** — a scan turns a *binding* constraint into exactly one governed capacity DACI
  decision per ISO week, with the three Theory-of-Constraints moves printed as options
  (feed / elevate / subordinate).
- **SUP-03** — a scan opens one blameless retirement task per starved line per 30-day bucket
  (capped at two), linked `retires-question` to the open records it would close.
- **SUP-04** — a scan announces a line that has just reached its floor while work still
  waits on it, **once per line ever**. This is the cross-module unlock: the refusal that was
  a dead end becomes a clickable destination.
- **SUP-05** — a scan queues grading for a plan whose window closed ungraded, and reconciles
  stale plan edges.

All five are marker-idempotent, pausable by `supplyAutoPropagate` (an explicit scan always
runs), and never rate, rank or name a person.

### 9. Surface, export, and the wiring that proves it is registered

Six axe-clean panels, twelve route aliases, `SUP-01..06` signals in a new **Evidence supply**
insights bucket, a nav badge that counts only decision-shaped signals, an identity-free
brief, aggregate-only **CSV scope #69** (one row per line, one per plan; blanks, never
zeros), the `supplyplan` entity type with three new relations and a resolver route, a demo
seed that freezes a plan from a truncated copy of the state and grades it out of sample, and
an additive `v78 → v79` migration that invents no plan, task or grade.

## Consequences

- Refusals stop being dead ends. Every "too few" in the app now has a place where it is
  counted, priced in the leader's own hours, scheduled, or retired.
- A leader can now ask the question no vendor's product answers: *what is my evidence debt,
  what is it costing me in decisions that stay unmade, and which single line is holding the
  rest of my judgement hostage?*
- Two new numbers are declared rather than derived (minutes per unit, weeks-saved-per-hour
  bar). Both are printed, both are clamp-ranged, and both are labelled as conventions —
  the same treatment the Cost of Waiting terminal gives its weekly prices.
- The module adds a **maintenance surface**: a new evidence line must be one registry entry
  plus one harvester, or it is not part of the chain. That is a deliberate tax; the
  alternative is the per-module glue this codebase has spent a hundred sessions removing.

## Explicitly not built

- Auto-manufacturing evidence, or editing any record to make a line look healthier.
- Scoring, rating or ranking a person anywhere in the module, its export, its brief or its
  signals. The only person-shaped objects are open review observations, as instrument units.
- Machine learning of arrival rates (a non-homogeneous Poisson or Hawkes process was
  considered: with the sample sizes this app actually sees — single-digit counts — a
  constant-rate posterior predictive is already at the edge of what the data supports).
- Cross-currency value pooling of demand.
- Reading `conflicts`, `pulses`, `candidates` or `messages` as evidence lines.

## Tests

`tests/app/evidence-supply.test.mjs` — 22 tests, all passing: the migration and its
refusals, the predictive's exact anchors and monotonicity (`S(0) = 1`, `√p` for `n = 0`,
`k = 1`), quantile ordering, the two estimator refusals, per-line harvesting, all five
verdicts on constructed states, constraint selection and the binding bar, the schedule's
budget respect and printed upper bound, the plan's Fréchet/independence inequality and
demand ids, freeze/grade-once semantics including a graded empty window, all five rules
with their caps and idempotency, pause-vs-scan, signals into the insights roll-up, the link
registry and post-commit registration, CSV scope #69's aggregate-only contract, and the demo
seed's real out-of-sample receipt.
