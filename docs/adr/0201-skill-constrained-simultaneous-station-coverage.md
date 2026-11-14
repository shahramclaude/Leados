# ADR-0201: Skill-Constrained Simultaneous Station Coverage and the Hall-Deficiency Witness

Date: 2026-11-14 · Session 269 · Schema v156 → v157 · Status: Accepted

## Context

ADR-0192 built the manager-attested ILUO register and was careful, in its own
reader, to state what it is not:

> Task coverage is not simultaneous staffing, availability, capacity or consent.

That sentence is true, and until now it was the whole story. The consequence is
a failure a real leader hits on a Monday morning: two stations, each of them
individually "covered" on the skills register, that cannot both be manned
because the one person both of them count on cannot stand at two machines at
once. Nothing in the workspace could say so:

- `buildSkillCoverage` counts qualified people **per task**, over a pool, with
  no notion of *when*;
- the matrix allocation ledger (`allocation.js`) splits a person's declared
  share across **lines**, not across **stations at one moment**;
- `succession.js` runs a max-flow, but over leadership survivor **eligibility**,
  not operating-station skill-and-shift eligibility;
- the goal-commitment register (ADR-0193) compares **promises over a window**,
  not headcount required at an instant.

Two gaps follow, and they are different in kind. The first is arithmetic: the
right object is a **capacitated bipartite feasibility** problem, and the right
answer is not a percentage. The second is epistemic: even the correct arithmetic
cannot produce a *shortage* if the people in the pool have said nothing, because
silence is not a refusal.

The planned gap was logged at Session 260 and named exactly this:

> **Skill-constrained simultaneous station coverage / Hall-deficiency witness**
> … two tasks can each meet their floor using the SAME qualified person,
> although both stations must operate concurrently. Need declared simultaneous
> task/seat demand, dated availability and consent, task-qualified person edges
> and exact capacitated bipartite matching with a shortage witness, plus
> joint-apex governance for competing lines. … Never infer availability or
> auto-assign people; missing evidence refuses feasibility.

## Decision

Add one read model, three append-only ledgers, four rights, one spine rule and
one aggregate export. Nothing is scheduled; everything is proved or refused.

### The unit

1. **Window** (`stationWindows`) — one declared, contiguous, dated span (1–31
   days) declared by a line holder, before it begins.
2. **Station** (`skillStations`) — inside its own holder's window: a title, an
   observable standard, the **ILUO task** that qualifies a person for it, an
   integer headcount **demand** (1–200), and `concurrent` or `sequential`.
3. **Availability** (`stationAvailability`) — a dated statement that a *named
   person* is available for a *named window*, with an integer **capacity** (how
   many stations they can hold at once, 1–10), and a printed **basis**:
   `self` (the person said it) or `manager` (their line holder said it). The two
   are never conflated, and a manager statement about themselves is refused.

Nothing derived is stored — no verdict, matching, deficient set or station
state. A replayed workspace cannot carry a stale proof of feasibility.

### The proof

A person may serve a station only if all three hold:

- a **live, unexpired** attestation of level `U` or `O` on that station's task;
- membership of that station's **holder's** live reporting-line pool (so a
  qualification never transfers between managers' tasks);
- an availability statement **covering the whole window**, with capacity ≥ 1.

Feasibility is then decided by **exact integer maximum flow** on the network
`source → station (demand) → person (1 per station) → sink (person capacity)`.
Feasible means flow = total demand. This is Hall's condition in capacitated
form, and it is not optional: a case exists in the test suite where the **total**
available capacity (4) exceeds the **total** demand (3) and the window is still
impossible, because two stations can only ever be served by one person. Any
check that compares headcounts in aggregate gives the wrong answer there.

When it fails, the min cut names the failing subset. The reader then **shrinks
it to an inclusion-minimal deficient set** — dropping each station in turn while
the subset stays deficient, asserting minimality at the end — and prints:

- which stations are in it,
- their combined declared demand,
- how many people are able to serve any of them and the capacity those people
  carry,
- the **exact integer deficit**,
- and that no person is named to move.

That is evidence a leader can act on. A red badge is not.

### The refusal that makes it trustworthy

A shortage is proven **only when nobody in the pool is silent**. If any
qualified person has made no statement, the window reads `unproven`, the count
of silent people is printed, and no shortage is claimed — because one of them
may simply not have been asked yet. This is the same discipline the bulletproof
mandate applies elsewhere: *"I could not prove it"* and *"it is impossible"* are
different facts and are printed differently.

A `sequential` station is counted against a person's availability but **excluded
from the simultaneous proof**, and the reader says so in words: whether two
sequential demands collide inside the window is a levelling question, not a Hall
question, and pretending otherwise would overstate what was proved.

### Governance

`RULE-SSC-01` is spine rule 125 of 125, registered immediately before
`seatRule`/`sealRule`, with a matching propagation contract. Two conditions,
each idempotent per deterministic `ssc1:` signature and bounded at 6 asks per
commit with the remainder counted:

- **`proven-shortage`** — a proof that no assignment exists. ONE dated ask to
  the **lowest joint apex** of the deficient stations' holders, because no
  single holder can fix a shortage that spans their line. The ask states the
  exact deficit and asks a human to choose: add a qualified available person,
  move or drop a station, reduce the declared demand, or declare in writing that
  the window runs short. It never names a person to move and never suggests one.
- **`unproven-consent`** — qualified people have said nothing. ONE dated ask to
  that **window's own holder** to obtain the statements. The ask is about the
  silence, not about the person.

Neither condition is ever raised for a **past** window: a shift that has
happened is evidence, not a duty. Asks self-close when the condition clears or
its seat moves, and a human answer that closes an ask while the condition stands
is respected rather than overridden. Where no single roster seat holds the
finding — leader-held, unresolved apex, or off-roster — ONE identity-free
`matrixMarkers` observation is recorded and nobody is substituted. The rule is
pausable through `stationCoverageAutoPropagate`, registered on the matrix-reach
pause list, and the pause governs every path including an explicit scan.

### Rights and disclosure

`read-station-coverage` (1–5), `declare-station-coverage` (1–5),
`declare-station-availability` (1–5), `govern-station-coverage` (3–5). The
action — not the rank — narrows each act: a holder declares only inside their
own span, and an availability statement is made by the person or by a holder of
their live line. The access gateway additionally refuses a peer crossing a span
boundary before the action is reached.

Rows are narrowed inside the reader to the seat's reach. Individual station
detail is printed only to the station's holder or the local operator; an
ancestor below the disclosure floor (`stationCoverageDisclosureFloorN`, default
3) sees the station state `withheld` with a reason, never a zero.

### Export

CSV scope **#148** `skill-station-coverage`, aggregate only: one workspace row
plus one row per window verdict and one per station state. No person, manager,
line, station title, task title, note or record id. The test asserts that
neither a name nor a station or task title reaches the file, and that an
unprovable window exports as `unproven_windows_n` — never as a proven shortage.

## Consequences

- A leader can now be told, before the shift, that a set of stations cannot all
  be manned, which subset is responsible, and by how much — with the arithmetic
  printed.
- The skills register's stated boundary is now backed by a second register
  rather than left as a disclaimer.
- A workspace that declares no station reads `inert` with the reason, and the
  v156 → v157 migration adds three empty ledgers: an ILUO register says who
  **can** work a task, never where they must be at 6 a.m., so no window, station
  or statement is inferred.
- Deliberately **not** built, and named here rather than implied: actual
  assignment or rostering, sequence/levelling of sequential stations inside a
  window, shift or holiday calendars, per-person cost, dependent or chained
  stations (a station that only runs when another is manned), and any
  recommendation of *which* person to move. The register proves; a human decides.

## Benchmark

Category: skills-matrix / workforce-scheduling and coverage systems (industrial
training-and-qualification matrices, shift-planning and rostering suites, and
the competence modules inside EHS/MES platforms).

The bar these set is a qualification matrix plus a shift roster that warns when
a required skill is not on shift. LeadOS matches that and exceeds it on five
points:

1. **It decides a subset question, not a headcount question.** A matrix-plus-
   roster check compares totals; this one finds the failing subset, so it
   catches the case where there is spare capacity overall and still no
   assignment. The test pins exactly that.
2. **The witness is minimal and exact.** Stations are dropped while the subset
   stays deficient, minimality is asserted, and the deficit is an integer — no
   rounding, no percentage, no score.
3. **Silence is a named refusal.** Most systems treat an unstated person as
   unavailable (or as schedulable, which is worse). Here an unstated person
   makes the whole window `unproven`, and the count is printed.
4. **Consent is separated from capability and printed.** `basis: self` versus
   `basis: manager` is stored and shown; a manager statement is never presented
   as the person's own.
5. **Governance is matrix-correct.** A cross-line shortage goes to the lowest
   joint apex, not to whichever manager happened to declare a station first,
   and the reader refuses to invent a common apex where the graph has none.

`[BENCHMARK-UNVERIFIED]` for hands-on parity with licensed enterprise rostering
suites (UKG/Kronos, Workforce Software, Rotageek) and for the competence modules
of MES platforms: none was available to evaluate in this session, and this
comparison is from general knowledge of the category. LeadOS deliberately does
not attempt the parts of those products this slice is not: actual rostering,
award/award-interpretation rules, or pay.
