# ADR-0089 — The Operating Model: measure the position, not the person in it

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 124
- **Schema:** v94 (additive `93 → 94`)
- **Route:** `#/operating-model` (aliases: `operating-model`, `operatingmodel`, `position-design`, `displacement`, `utilization`, `utilisation`, `spans-of-control`, `work-design`, `lever-book`, `labour-model`)
- **Rules:** `RULE-OMD-01` (governed design decision per congested span), `RULE-OMD-02` (typed vertical roll-up), `RULE-OMD-03` (continuity certification + one governed continuity decision)
- **New relations:** `relieves` (decision → position design); vertical fan-out reuses `rolls-up-to`
- **CSV:** scope #79 `operating-model` (aggregate-only)

## The problem

Every attendance and workforce system in the market measures what a company spends **on** people.
Almost nothing measures what a **position** spends on time — and time is the only input a leader cannot
buy more of.

The competitive field splits the question and drops the interesting half. **Orgvue, Visier Org Design,
Workday Adaptive Planning and Anaplan** model the *shape* of an organisation (layers, spans, cost) at
programme scale, usually with the CHRO and CFO in the room and a six-figure contract, and they model a
*future state* rather than the live design a frontline manager is standing inside. **Lattice,
15Five, Culture Amp, Leapsome** measure engagement and goals — attitudes, not hours. **Microsoft Viva
Insights** is the closest to hours, and it does it by reading the calendar and the mailbox: an
attendance instrument wearing an analytics coat, which is exactly what this product will not become.
**Quinyx, Legion, Float, Runn** price labour *hours* for hourly and project work, per shift and per
booking, and say nothing about the design of a supervisory position.

And the standard answers to "this manager is overloaded" are all capacity answers: hire, or cut. Both
are wrong more often than the market admits, for two reasons no product models:

1. **Much of a leader's week is not their work.** It is work that arrived from below, work that was
   routed up because the assignment is not trusted to hold it, and the re-reporting the seams create.
   An attendance system cannot see the difference between a busy position and a badly drawn one.
2. **Some spans cannot be relieved by adding a person.** Below a small number of direct reports, one
   absence stops the work. Adding a lead to a one-report span makes the fragility *worse*, and every
   capacity-only tool recommends it anyway.

## The decision

Ship a screen whose subject is a **POSITION DESIGN**, computed from records the workspace already
holds plus a small number of **declared** numbers, and whose output is the cheapest **structural** change
rather than a headcount request. Five measurements, all named:

### 1. Displacement — how far below its own job a position sits

Jaques' time-span of discretion (1956, 1964) already drives this codebase's altitude model (ADR-0075):
every open obligation carries `requiredRank`, the altitude its *age* demands. A position whose work is
older than its own horizon is spending its week below its altitude — a fact about the record's clock,
not a self-report. Displacement is that share plus the declared below-altitude commitment.

### 2. Abstention — work that exists only because a call is not trusted

The only abstention the workspace can **prove** is a decision whose `driver` is a report of the span
holder: the call sits above the person doing the work. That is priced at a declared hours-per-decision
figure and split by **SMED**'s internal/external distinction (Shingo 1985): a 14-minute triage is the
job; a four-hour document is a routing defect. The panel prints the distinction, so the reader cannot
mistake one for the other.

### 3. Congruence — does the position do its own job at all?

Drucker's management by self-control (1954) reduced to a boolean with a printed threshold: a position
holds its altitude when at least half its capacity is still spent there. The threshold is a **declared
convention** printed beside the figure, not a hidden constant. There is no percentage ranking of
managers, and no comparative roster is computed anywhere in this module.

### 4. Continuity — relief that creates a single point of failure is not relief

Below the declared continuity floor (default 3 direct reports, the low end of the
Graicunas/Urwick band), a span has a structural defect: one absence stops the work. The lever engine
therefore **refuses to price a hire** for such a span and says why, and the continuity summary reads
the same way. This is the mechanism the market does not model, and it inverts the most common
recommendation in the category.

### 5. Coupling — Graicunas, made computable

`n + 2·n(n−1)/2` relationships per span (Graicunas 1933), stated against the number of collaboration
edges actually **declared**. The ratio is the model's own efficiency measure, and the cross-unit share
is printed as the seam cost: an edge count below the cell floor is refused rather than zeroed.

### The constraint, and the answer that is not a hire

Each position is a **station** on a line: committed hours against the hours its own design contains.
Utilisation above the declared ceiling is treated as a queue, not a plan (Kingman 1961) — past that
point an extra hour of commitment buys more waiting than work. Where a station is over the ceiling,
`congestionReport` opens with a **diagnosis** (*over-routed*, *over-spanned*, *over-committed*) and the
**lever book** prices nine named structural patterns, ranked by hours relieved per unit of design cost,
with every continuity-unsafe option marked and every hire that would break the floor refused.

The ordering is mathematical, not editorial. `raise-wip` (Little 1961) and `raise-abstention` beat
`add-lead` because they relieve the same hour for less design cost, and `remove-seat` is offered *only*
where congruence fails — the definition of a relay layer.

### The input gates (R&R on the model itself)

Before a single rate is printed, three gates run. If the number of measured positions is below the
declared cell floor, **every span rate is refused**, the count is printed, and the refusal names the
exact number of splits that would lift it. A split that does not sum to 100 is rescaled **and
reported**. A workspace with no declared split measures nothing at all and says so.

### Cross-module and cross-altitude in one transaction

On the shared post-commit spine (ADR-0008), in the same atomic commit:

- `RULE-OMD-01` opens **one governed DACI design decision per congested span per ISO week**, addressed
  to the nearest ancestor whose altitude can author the change, with the options being the levers the
  engine actually priced. The subject is the design; the question says so.
- `RULE-OMD-02` writes typed `rolls-up-to` edges from the congested span to **every leadership
  ancestor**, so a frontline position's displacement is visible at director and VP altitude with zero
  re-entry — altitude as another dimension of the same engine, not a second one.
- `RULE-OMD-03` certifies the fragile set with a **fingerprinted** marker (never a second unredacted
  copy of the reading) and opens at most one governed continuity decision per ISO week.

**The opt-in gate.** Until one work-type split is declared, the rule returns immediately. This is not
politeness: on a spine shared with 63 other terminals, a new rule that fires on an undeclared workspace
is a regression in forty other suites. The gate was found by a failing legacy test during this session
and is now asserted directly.

## Disclosure

The unit changes with the reader's altitude and the change is stated on the panel. Frontline and manager
read their own span's design; director and above read span rates and the bottleneck ranking; **every
level more than one below the reader collapses into one aggregate row per level**, so no top-level
screen can be used to read a distant team's week. Executive and chief read attributable labour cost,
the abstention flow and first-design-decision risk; position detail never climbs. Authoring the model
is `author-operating-model` (rank 3–5, the org-design window) and the route is portfolio material — a
frontline seat cannot open it. Every new API method is declared; an unknown name still fails closed.

## What it is not

- **Not an attendance system.** No calendar, badge, keystroke, door or clock. Capacity is two declared
  numbers; the three prices that turn records into hours are declared conventions printed beside every
  figure they produce. The workspace can prove *which records exist and who they wait on*; it cannot
  prove how long a conversation took, and where the second is needed the module refuses instead of
  pretending the first is the second.
- **Not a performance score.** No person is measured, ranked, scored, percentiled or compared. The
  subject of every figure is a span, a design, a record or an edge. Utilization is a property of a
  DESIGN.
- **Not an HRIS.** No connector, no sync, no employment-law claim. Local seat selection remains an
  auditable declaration, not authentication.

## Migration

Additive `93 → 94`: four collections (`omWorkSplits`, `omEdges`, `omDecisions`, `omMarkers`), eighteen
clamped settings, one CSV scope, one relation, one route, one nav entry, one action right, four record
policies. No existing record is rewritten, no hour is inferred, and an older workspace opens with
`unmeasuredPositions > 0` and a single clear next step rather than a fabricated split.

## Alternatives rejected

- **Infer the work-type split from the records.** Tempting and dishonest: the workspace holds open work
  and decisions, not a time study. A guessed split would produce a precise-looking utilisation figure
  resting on nothing, which is worse than the refusal this module prints.
- **Read the calendar.** It would make the numbers look measured. It would also make this an attendance
  product, which is precisely the category this screen exists to be the opposite of.
- **Recommend a hire on the utilisation number.** The most common recommendation in the market, and the
  one that destroys continuity on a thin span.
- **Score managers on congruence.** A boolean with a printed threshold is auditable; a percentage is a
  league table waiting to happen.
- **One aggregate "operating health" index.** It would hide the dimension-level finding (displacement
  vs abstention vs span) that makes the levers choosable.
- **Per-person declarations.** Measuring the design per person would turn the screen into a clock; the
  unit of declaration is the level, and the panel says why.

## Consequences

A leader can now answer "is this position badly drawn, and what is the cheapest honest fix" without a
consultancy, and the answer is arithmetic they can check. The workspace gains a fifth cross-module
write path and a fourth way for altitude to enter the transaction, both on the existing spine. The cost
is eighteen new declared conventions: they are visible, editable, and printed beside the figures they
produce, which is the only honest form for a number about a person's week that no record can prove.
