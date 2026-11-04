# ADR-0087: The Operating Cadence Clock — the standing-forum calendar as a queueing system, with declared service time, competence routing, and a planning-fallacy correction (`#/cadence`)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 126 (Schema v92)
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0085](./0085-board-room.md), [ADR-0075](./0075-command-chain.md), [ADR-0076](./0076-operating-seat.md), [ADR-0080](./0080-mission-control.md), [ADR-0081](./0081-altitude-router.md), [ADR-0082](./0082-sealed-spine.md), [ADR-0084](./0084-hoshin-catchball-cascade.md), [RESEARCH §107](../../RESEARCH.md)

## 1. Context

LeadOS could say **what** work exists at every altitude (`harvestWork`, the five-altitude command chain) and **how much** work a span can absorb (`load.js`), but it had no model of the *governance calendar itself* — the standing forums where decisions actually get closed. Six seams were missing:

1. **No declared capacity.** A forum was a calendar entry and an agenda, never a measured server: nothing recorded how many decisions it closes per sitting, how long one decision takes, or what happens when arrivals exceed that.
2. **No intake model by input class.** `supply.js` measured evidence starvation and `load.js` measured person-days, but nothing asked whether a *particular* arriving item was reviewable by a *particular* forum — by kind competence and by the horizon that forum is entitled to decide within.
3. **No queueing arithmetic.** Every method in the category (and every "meeting hygiene" feature in every tool) counts meetings, hours in meetings, or attendee cost. None computes utilisation ρ, waiting time, or the point at which a forum is **by construction** unable to keep up.
4. **No planning-fallacy correction.** Plans assume a service time; delivered service times are systematically worse than declared (Kahneman & Tversky 1979; Flyvbjerg 2006). Nothing recorded the gap between the *declared* service time and the *measured* one.
5. **No topology test.** Conway's law is quoted in every org-design deck and tested in no tool: does the membership of each forum mirror the spans whose work it closes?
6. **No graded reading.** Nothing froze a forecast about the cadence system and graded it later, so no claim about a leader's governance design could be falsified.

## 2. Decision

Ship the **Operating Cadence Clock (`#/cadence`)** on Schema v92 as an integrated domain + view + post-commit module family (`app/core/domain/cadence{Registry,Schema,Rules,Actions}.js`, `app/core/domain/cadence.js`, `app/views/cadence.js`): the standing-forum calendar modelled as a **single-server queue with declared service time, class-based intake and competence routing**, escalated onto the shared propagation spine.

### 2.1 Explicit named cross-domain frameworks

1. **Little's law & Kingman's formula (Little 1961; Kingman 1961) — the clock.**
   - Demand per cycle is measured in **service-days** (`Σ serviceDays` of the items the forum is competent for), supply is `decisionCapacity × cycleDays / itemsPerCycle`. Utilisation `ρ = demandDays / capacityDays`.
   - For `ρ < 1`, waiting time is the Kingman heavy-traffic approximation `Wq = ρ/(1−ρ) · S` and flow time is `F = S + Wq`. The **verdict** is one of `slack` / `balanced` / `critical` / `congested` from `UTILISATION_BANDS`.
   - **For `ρ ≥ 1` flow time is refused** (`flowDays: null`, verdict `congested`), never rendered as a large number. A queue whose arrivals exceed service is not slow, it is *infeasible*; printing "41 days" invites the reader to plan against a figure that will never be delivered. This is the single most important honesty rule in the module.
2. **Theory of Constraints (Goldratt 1984/1997) — the named constraint.** Exactly one binding constraint is named per reading (`competence-gap`, `forum-capacity`, `service-time`, `topology-mismatch`, `none`) with a remedy sentence, plus a `secondaryConstraints` list so "everything else that is wrong" is not hidden behind the one headline. Constraint escalation is a *decision*, never an automatic calendar change.
3. **Conway's law (Conway 1968) as a computable topology test.** For every forum the module compares the seats that **own** the arriving items (`ownerNodeId`, resolved through `buildSeats`) against the seats that **attend**. Four patterns: `mirrored`, `narrower-than-work`, `wider-than-work` (Ashby 1956: decision variety exceeding the queue), `disjoint`. A gap writes one `fit-gap` edge to each missing owning seat — the "add this seat to this forum" fix becomes navigable from both ends.
4. **Kahneman & Tversky (1979) / Flyvbjerg (2006) planning fallacy, priced.** `cadencePlanningFactorPct` (default 130) is the declared correction applied to a *planned* service time; the delivered service time is `measured closures-per-sitting` once enough sittings exist. The gap between the two is the planning-fallacy finding: a forum that declares 3 days and delivers 5.4 is printed as such, in days and as a ratio.
5. **Escape ladder (Jaques 1976 time-span of discretion; due-date discipline).** Items are walked up the ladder of **sitting** forums by chair altitude. If even the top competent forum cannot land an item inside the horizon that item's own class demands, the item is `escape`: **certain to miss its horizon**. This is arithmetic on declared dates, not a prediction, and it is the finding that survives every argument about the numbers.
6. **Wilson (1927) intervals, Brier skill, and refusal.** Frozen readings carry a prospective probability for a declared outcome; grading is **once and only once**, `Brier = mean((p − o)²)` against the base rate, `skill = 1 − Brier/Brier₀`. Both the interval and the skill are **withheld below `cadenceFloorN` (default 5)** with the reason printed — never shown as a wide interval dressed as a result.

### 2.2 Cross-module & cross-altitude spine (`cadenceRule`, `RULE-CAD-01..04`)

Registered on `DEFAULT_POST_COMMIT_RULES` **immediately after `catchballRule`** and before `concordanceRule`, `boardRule`, `attentionMarketRule`, `seatRule` and `sealRule` — **66 rules / 66 contracts**, `sealRule` still last, so one seal covers every edge written here in the same atomic commit.

- **`RULE-CAD-01` — queue provenance.** Each reviewable open item attributed to a competent forum gets exactly one idempotent `queued-for` edge to that forum, and one `rolls-up-to` edge per leadership ancestor of its owning span (rank-tiered disclosure note: `names` ≤ rank 2, `unit` = rank 3, `aggregate` above). A sensitive source (a performance concern) contributes **no edge at all** — routing a confidential people record into a governance graph is a disclosure failure.
- **`RULE-CAD-02` — constraint escalation.** One governed DACI decision per **ISO week per signature** (`[CAD-SIG:type:forum:week]`, read from `question` + `rationale`, so a renamed title cannot defeat idempotence), with three concrete options derived from the constraint type, opened at the altitude that can relieve it and fanned up every ancestor. A congested forum therefore becomes a board-reportable decision, not a red badge.
  - **Feedback-artifact refusal.** Decisions this rule opened are excluded from the demand pool. Otherwise relieving congestion mints a decision that re-congests the forum, week after week, and the constraint becomes self-reinforcing. This was found and fixed inside this session by test 16.
- **`RULE-CAD-03` — agenda fit.** One `fit-gap` edge per missing owning seat (capped at 8) for `disjoint` / `narrower-than-work` forums.
- **`RULE-CAD-04` — grading & maturity.** Grades a due frozen reading exactly once (a grade is never rewritten) and records a maturity marker the first time a forum has enough settled sittings for its closures-per-sitting figure to mean anything.

### 2.3 Five-altitude role tiering & disclosure contract

| Altitude | Sees | Cannot do |
|---|---|---|
| **Frontline / team lead** | Its own forums, their clock, escape count, and the agenda it must prepare | Read another span's forum register; declare a forum above its rank |
| **Manager** | Chair/attendee view of forums inside its span, `queued-for` items at `names` disclosure, the escape ladder | Conscript a peer span as an attendee (must escalate to the common leader) |
| **Director** | Span roll-up with `unit` disclosure, topology fit, capacity verdicts | See individual people records above its span |
| **VP / executive** | `aggregate` roll-up, ρ and flow, constraint decisions it owns | Read item titles from below its span |
| **CEO / chief** | Workspace ρ, the one named constraint, the escape count, the identity-free brief | Read any individual item, person, or forum title from a scoped export |

Access is the existing deny-by-default gateway (`run-cadence` right, `SAFE_READS` for the reads) plus `seatRegistry` rank bounds. **Local seats remain auditable declarations, not authentication** — stated here, in the UI, and in the CSV.

### 2.4 Export boundary

CSV scope **#81 `operating-cadence`**: 13 aggregate-only columns (`row_kind`, `altitude`, `horizon_days`, `cadence`, `forum_kind`, `items`, `demand_days`, `capacity_days`, `rho`, `flow_days`, `verdict`, `topology`, `closures_per_sitting`, `suppressed`). No person name, forum title, or item title crosses the boundary. Cells below `cadenceCellFloor` (default 3) are **blanked with the reason in `suppressed`**, never zeroed and never rounded into significance.

## 3. Rejected alternatives

- **Counting meetings and hours.** The whole category does this; it is a cost measure that says nothing about whether the forum can close the work it receives.
- **Auto-declaring or auto-rescheduling forums.** A calendar change is a decision with an owner and an audit trail. The module may open that decision; it may not take it.
- **Rendering flow time at ρ ≥ 1.** See 2.1(1). A large finite number would be a lie with a decimal point.
- **A "meeting effectiveness score".** Unfalsifiable, person-shaped, and impossible to grade. The frozen reading with a prospective probability is the honest replacement.
- **Reusing `load.js` person-day saturation or `supply.js` evidence starvation.** Those measure people and evidence; this measures the *decision server*. Overlap was audited and rejected in the session log.

## 4. Consequences

- The governance calendar becomes a **measurable system**: declared capacity, measured closures, ρ, flow, and an escape count that is arithmetic rather than opinion.
- Every claimed improvement can be **falsified later**: freeze a reading, grade it once, get a Brier skill or a refusal.
- Congestion now produces **governed decisions** on the shared spine, sealed in the same transaction, instead of a dashboard warning.
- Two failure modes are now impossible by construction: a forum that reports a finite flow time while its utilisation exceeds 1, and a cadence escalation that feeds itself.
- Costs: one more migration entry (`91 → 92`), four collections, six clamped settings, one spine rule position, one CSV scope, and ~90 test files' version pins swept across two sweeps (v91 for main's Board Room, v92 for this session).

## 5. Honest limits

Local seats are workflow declarations, not authenticated identity; the CSV suppression is small-cell withholding, not differential privacy; the Kingman approximation is exact only in heavy traffic and is labelled as an approximation wherever it is printed; a forum whose sittings have never been recorded has **no** next-sitting date (it is an intention, not a cadence) and the module says so instead of returning today. Real-browser screen-reader and contrast walkthrough remains `[UNVERIFIED]`.
