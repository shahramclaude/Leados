# LeadOS pt-14 — Execution Layer

A universal leadership and management operating system. Append-only event log, **129 validated
event types**, **82 pure rules**, and twelve functional modules — correlation, conversation
preparation, decision intelligence, and now execution analytics. Everything derived per read;
nothing derived is ever persisted.

**Run it:** open `index.html` in any modern browser. No server, build step, framework, network,
or CDN. One localStorage key.

**Verify it:** open `#/health` — the authority wall. Where this file and `#/health` disagree,
**`#/health` on your machine wins.**

---

## §0 Claim-vs-inspection audit

| Claim | Status |
|---|---|
| Upstream tree @ `a1ed70f`: 22 flat entries, no `css/`/`js/`, npm scaffold + `rules.js` tombstone, unbootable as shipped | **BYTE-VERIFIED** (pt-7 session, git trees API) |
| `store.js` full read — schema ladder, repair counting, single key, import gate | **BYTE-VERIFIED**, ported near-verbatim |
| `engine.js` fold table / buckets / aliases / open-sets / roster; pt-5 handlers; pt-6 pattern library; upstream heat formula; upstream insight shape; promotion-rule string | **BYTE-VERIFIED (those regions)** |
| `events.js` full registry · `health.js` · `ui.js` · upstream `playbooks.js` · `HOT_SCORE` | **NOT VERIFIED** — beyond fetch truncation; never claimed |
| pt-8 … pt-14 briefs | received in full, implemented literally; every interpretation and every brief-internal conflict labeled below |

No new upstream reads this session. **Registry: 129 contracts** (85 + 2 + 10 + 10 + 11 + 12; the
11th in pt-13 was `decision.outcome`, which R66/R71 require and the brief never contracted).

## Module registry

Three physical files ship (the delivery clause). The brief's script list lives as
`LeadOS.EXPECTED_MODULES`, in load order, enforced by the boot guard and asserted by G10:

`util · events · store · engine · rules · correlate · conversations · decisions · execution ·
health · playbooks · ui`

## Schema v9 — `MIGRATIONS['8>9']`

Backfills `sprintLengthDays` **14** · `blockerResolutionSLADays` **3** ·
`retrospectiveFrequencyDays` **14** · `deliveryCadenceDays` **7**, under the unchanged contract
(leader values never overwritten, every repair counted, idempotent). A v3 store climbs to v9.

## Execution analytics — `LeadOS.execution`

**`velocityTrend(teamId, P)`** — mean of the last 3 velocities, least-squares slope over all
reviews, goal hit rate, capacity-adjusted ratios where `capacity_pts` exists. Under three
reviews it stays **silent and says why** (the ≥3-point trend discipline, unchanged since pt-7).
A negative slope yields a projection labeled
*"LINEAR EXTRAPOLATION of your last N reviews — printed, NOT a forecast; velocity does not
actually travel in a straight line to zero."*

**`blockerNetwork(P, today)`** — open blockers by severity, exact MTTR from
`raisedAt → resolvedAt` with the division printed, chronic blocking teams (≥3 inside a rolling
90d window), escalation rate, and the dependency graph. The graph note is load-bearing:
**no transitive edge is ever inferred** — A→B and B→C does not create A→C (G77).

**`accountabilityIndex(personId, P, today)`** — `kept ÷ made × 100` over 90d with the math
printed, per-period slope only at ≥3 periods, and comparison to the mean of others who have
pulses. Every output names its data source: *self-reported unless `observed: true`*, which is
why R80 is conf MEDIUM.

**`sprintHealth(sprintId, P)`** — scope change, customer impact from the delivery review inside
the window, open blockers at the sprint boundary, and prior-sprint retro-action completion —
whose inference rule (a `note.added` naming the sprint id, or a `plan.checkin` by the owner) is
printed, because **the registry has no retro-action completion event** and that gap is a fact
about the system, not something to paper over.

## Rules R73–R82

| Rule | Fires | sev / conf |
|---|---|---|
| **R73** | velocity slope < −0.5 over ≥3 sprints; projected zero < 4 sprints | 3 → 4 / MEDIUM (trend) |
| **R74** | goal hit rate < 60% over last 3 sprints; < 40% | 3 → 4 / HIGH |
| **R75** | blocker sev ≥3 past `blockerResolutionSLADays` (clamped 3–4); **sev 5 past 4h** | 3–4 → 5 / HIGH |
| **R76** | same `blockingTeamId` causes ≥3 blockers in 90d | 4 / HIGH |
| **R77** | at-risk dependency due in <7d; **past due + not delivered** | 4 → 5 / HIGH |
| **R78** | retro action past due with no note naming the sprint and no owner check-in | 2 / MEDIUM |
| **R79** | sprint ended, no review within `retrospectiveFrequencyDays` | 3 / HIGH |
| **R80** | accountability hit rate < 60%; < 40% | 3 → 4 / MEDIUM |
| **R81** | Σ `delta_headcount` ≤ −2 in 30d with no `ops.capacity.logged` since | 4 / HIGH |
| **R82** | no review past `deliveryCadenceDays` → 2 · on-time < 70% → 3 · < 50% → 4 · **`customer_impact` ≥ 4 → 4 regardless** | 2 / 3 / 4 / HIGH |

## New playbooks (6)

`sprint-plan` · `sprint-review` (**live** goal hit rate + velocity delta) · `blocker-escalation`
· `dependency-review` · `capacity-replan` · `accountability-checkin`. All prefill from the live
log and emit **event specs you review before anything is appended**. Several refuse bad input
rather than writing it: a sprint with no goals, a review with nothing scored, `kept > made`,
a miss acknowledged without an impact score.

## Views

`#/today` · `#/signals` · `#/insights` · `#/heatmap` · `#/benchmarks` · `#/conversations` ·
`#/org` · `#/decisions` · **`#/execution`** (sprint board with velocity sparklines and hit-rate
gauges · blocker tracker by severity × age with MTTR · dependency graph · accountability table ·
delivery history with on-time sparkline) · `#/dossier` (now also velocity where the id is a
team, accountability index, blockers caused and received) · `#/playbooks` · `#/health` · `#/data`.

## Health wall

**T1–T47** · **G1–G10 · G31–G79** · **claims C1–C17**.

> **ID maps, printed because ids are the contract:** this brief numbered its checks T41–T45, but
> T41/T42 were taken in pt-13. They ship as **T43–T47** (brief T41→T43 … T45→T47). G71–G79 keep
> the brief's ids; **brief G80 is folded into G40**, which now asserts all **82** rules fire.
>
> **Brief-internal conflict, resolved in the open:** the brief's R74 text says *"< 60% → sev 3,
> < 40% → sev 4"*, while its G71 line says *"2/4 = 50% → sev 4."* 50% is below 60 and not below
> 40, so both cannot hold. **The rule text wins** — it is the contract; the golden line was an
> example — and G71 asserts 50% → sev 3, 60% quiet, 20% → sev 4, with the resolution printed in
> the check itself.

## Explicit non-claims

- **The browser is the grader.** No JS runtime at authoring time; correctness is by construction
  and fixture tracing. Every count is executable in `#/health`; none is claimed observed.
- **Labeled interpretations:** CONF_FACTOR values · findings suppression · ENG-fault embodiment ·
  `playbook.completed`/`plan.checkin`/`decision.outcome` shapes · R48 "same period" · R50/R53
  roster proxy (**no `reportsTo` contract**) · conflict pairs from `mediation.held` alone
  (**no `conflict.raised` contract**) · culture 2× weight · betweenness and bridges as
  approximations · R67's scenario-count proxy for decision severity · R78's retro-completion
  inference (**no completion event exists**).
- **Velocity projections are extrapolation, not forecast.** Culture and heat scores are composite
  observations, not measurements. The network graph is only the edges you logged.
- The seed is a fixture, not a diagnosis. Nothing here is legal, HR, or financial counsel.
- No accounts, no sync, no network, permanently. Data leaves only when you export it.

## Ranked next

1. **`conflict.raised` / `conflict.resolved`** and **`retro.action.completed`** — two missing
   contracts that currently force printed inferences (R61/G48 and R78 respectively).
2. **`reportsTo` + 1:1 cadence contracts** — retires the roster proxy in R50/R53 and the heritage
   proxies in LEADERSHIP_VACUUM.
3. **Exact Brandes betweenness** — would let R62 and `#/org` drop the approximation caveat.
4. **`production-stop` interactive brief** (requested pt-9, still outstanding).
5. **Byte-verify the unread upstream bodies**; reconcile registry counts honestly.
6. **Executive/board pack** (upstream queued #1, carried since pt-7).
