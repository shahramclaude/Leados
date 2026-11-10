# ADR-0156 — Matrix Authority Continuity: the portfolio of frozen decisions

**Status:** Accepted (Session 217, Schema v128 unchanged)
**Date:** 2026-11-10
**Altitude:** CEO / C-suite PRIMARY × matrix (director / VP and mid-manager read the same lens)
**Surface:** `#/matrix?panel=continuity` · CSV scope #117
**Rule:** none, by design — the remedy is a human act the workspace already records

## The duty

The board asks the portfolio question, not the per-record question:

> "Last month we confirmed the pay cycle was signed by the people who held the
> pay right. Now confirm the same for **our decisions** — the pricing change in
> March, the board pack in June, the arbitration in September. Are they still
> attributable to the authority that made them?"

ADR-0155 answered that question for **one** frozen decision type. A finalised
merit cycle now freezes a `structure` block beside the money and can prove
which manager held the `pay` right on the cycle's effective date. Nothing else
in the workspace can.

But a chief does not hold one kind of frozen decision. They hold a **portfolio**:
a pay cycle, a decided decision record, a board memo. Each is a frozen decision
record. Each names an authority — a home line frozen beside the money, or an
approver's name. **None of the other two types can reproduce its own
authority.** And the portfolio question cannot be answered by adding one
single-type module at a time: it is the portfolio the board is asking about.

The failure is silent in the worst direction. A March pricing decision naming a
CFO who has since left reads *complete and clear* in a pack nobody has ever
re-checked, and the drift is invisible until the day the board asks.

## The decision

Add **one bounded read model** over the frozen decision records the workspace
**already stores** — a finalised merit cycle, a decided decision record, a
committed/frozen board memo — and compare each record's own authority against
the authority that was in force on that record's **own day**.

Nothing is stored. Nothing is frozen. No schema version moves. No rule is
added.

### The three facts kept apart

| Fact | What it is | Where it comes from |
| --- | --- | --- |
| **What the record claims** | The authority the record names, in the record's own words | The frozen `structure` block · the DACI `approver` · the memo's `ownerNodeId` |
| **What was in force** | The authority that held the relevant right on the record's own date | The SAME as-of structure engine (ADR-0155) over the SAME matrix engine (ADR-0140) |
| **What may be claimed** | The verdict, and — separately — whether a portfolio claim may be made at all | Derived |

### Two claims, never collapsed

| Reading | Question |
| --- | --- |
| **Covered agreement** | Do the records this register CAN compare still name the authority in force on their own day? |
| **Portfolio claim** | May that be asserted of the whole population? |

The second is **refused** whenever:

- the covered population is below the declared floor of 3;
- any covered record did not agree;
- **any record could not be read.**

The third is the load-bearing one. An absence is the one thing a continuity
claim must never absorb: a record whose authority cannot be resolved is
**counted**, printed with its reason, and **excluded from the comparison** — and
it refuses the portfolio claim. This is population completeness (AICPA AU-C
500) applied to an audit population: a population-level assertion is only as
good as its coverage.

### The four verdicts

| Verdict | Meaning | Blocks the claim? |
| --- | --- | --- |
| `drifted` | The record names a manager and a **different** manager held the relevant right on the record's own day. | yes |
| `unattributed` | The record names **no** manager. It cannot be attributed to anyone. | yes |
| `unreadable` | The record exists but its authority or its date could not be read. | yes |
| `attributable` | The record names a manager and that manager held the relevant right on the record's own day. | no |

`drifted` is a statement about a **structure moving under a decision** — never
that the decision was wrong. The remedy is a human re-affirming the record, and
this module never makes that note for them.

### Two comparison routes, and the route used is printed

| Route | When | Reading |
| --- | --- | --- |
| `subject` | The record's subject resolves through a **typed** edge (a link to a `person`, or a link to a `case` whose `ownerId` is the person) | The approver must have held the relevant right over the subject's lines on the date |
| `span` | No resolvable subject | The approver must have been a **manager with reports** on that date |

The `span` route is a **weaker** reading — it says the approver had authority
over *something*, not over the thing the record concerned — and the panel says
so on the row. A subject is never guessed from the approver's own span.

### The rights are the real RAPID vocabulary

A merit cycle is a `pay` decision. A decided decision record and a board memo
are approvals over somebody's work, so the right that governs them is
`performance`. Using an invented right name would compare against nothing and
every record would read as `drifted` — a false alarm in the alarming direction.

### Report, never correct

A drifted record is **named**. The frozen record is not edited to match today
and today's reading is not overwritten by the frozen one. The merit type reuses
ADR-0155's own `compareFrozenStructure` contract verbatim, so the two modules
can never disagree about whether a cycle drifted.

## What is never built

- **No second hierarchy.** The as-of reading is ADR-0155's `buildMeritStructure`,
  which substitutes each person's home pointer with the pointer the record says
  they had on the day, and then runs the SAME `buildMatrix` engine over that
  substituted state.
- **No stored derived figure.** Every count and every state is re-derived on
  read from records the workspace already holds. A read writes nothing, so a
  printed finding cannot drift from the rows it describes.
- **No person scored.** Every verdict is about a **pair** — a record and the
  authority it names. There is no authority score and no league table.
- **No manager invented.** A record that names nobody is `unattributed`; a
  record whose approver does not resolve to the roster is `unreadable`.
- **No identity in the export.** CSV scope #117 carries counts, verdicts and the
  population-claim reason. Never a record id, a title, a person id, a manager
  id, a name, or the date of any individual decision.
- **The authority NAME is scoped, not just the record.** A record can be in
  scope because it *concerns* someone in the seat's span while the authority it
  names sits outside it. The concordance module withholds exactly that name,
  and this register does the same: the name prints as `outside this seat`, the
  verdict and the counts survive untouched. A line manager cannot learn who
  approved a decision about their person by opening a panel they may open.

## Consequences

- A CEO / C-suite leader can now answer the board's portfolio question from one
  screen, and the screen refuses to answer it when the population is
  incomplete.
- The other matrix registers are unchanged. This register **reads** them; it
  does not extend them.
- A workspace that has finalised no merit cycle, decided no decision record and
  committed no board memo reads empty — with the claim refused and the reason
  printed. That is honest, not broken.

## Frameworks encoded

- **Audit evidence sufficiency** (COSO 2013 control activities; IIA Global
  Internal Audit Standards): a frozen decision record must be able to reproduce
  the authority in force on its own effective date.
- **Bitemporal records** (Snodgrass 1999): the day a fact was true and the day
  it was recorded are different facts. Every comparison is made on the record's
  own date.
- **Population completeness** (AICPA AU-C 500): the covered population and the
  uncovered population are two separate figures, and a claim over the whole
  population is refused when anything is uncovered.
- **RAPID decision rights** (Rogers & Blenko 2006): the right that governs a
  decision is a real right, not an invented label.
- **Statistical disclosure control** (house convention, ADR-0139 / ADR-0126): a
  withheld figure is BLANK with its reason, never a zero.

## Verification

`node --test tests/app/authority-continuity.test.mjs` — 23/23 PASS: the register
reads every frozen decision type and not only the easy one; a decision is
compared against the authority on its **own** day, not today's; a decision whose
approver did not hold the line on that day reads `drifted`; a record whose
authority cannot be read is **counted** and refuses the portfolio claim; the
claim is refused below the declared floor; a complete population grants it; a
record that names no authority is `unattributed` and never filled in; a record
whose subject cannot be resolved falls back to the approver's span and PRINTS
that it did so; an approver who managed nobody on the record's own day reads
`drifted`; the register writes nothing; every printed figure equals the
recomputed blob after a real reload; the verdict counts and the type buckets
reconcile to the population; the export carries no identity; the registered CSV
scope carries the same figures as the panel; the brief names nobody; a
single-chain workspace with no frozen decisions reads empty rather than broken;
an authority OUTSIDE the seat's span is withheld while its verdict survives;
the schema is unchanged; and a JSDOM render prints the computed claim reason
and refuses an incomplete population.

**The cross-module integration is proven through the real API.** A merit cycle
finalised through the actual `finalizeMeritCycle` action — which freezes the
structure block beside the money — enters the register and is compared against
the live as-of reading through ADR-0155's own `compareFrozenStructure` contract,
so the two modules cannot disagree. Two cases are asserted: a home-line move
effective **after** the cycle does **not** drift the record (a later move
cannot unmake the decision), and a move recorded **after** the freeze but
effective **before** the cycle **does** drift it — with the frozen block left
byte-identical.

**Two defects found by the first run and fixed in place.** (1) The register
compared decision approvals against a right named `approval`, which does not
exist in the matrix vocabulary — so every record compared against nothing and
read `drifted`, a false alarm in the alarming direction; the rights now use the
real RAPID vocabulary (`pay`, `performance`). (2) The span route read
`directN`/`treeSpanN` on the MATRIX node, which carries the DAG wiring but not
the span; the direct-report count lives on the CHAIN node and the route now
reads it there. A third defect was found by reading the board-memo schema: a
board memo has **no `approver` field** — its authority is its `ownerNodeId` —
and the reader now resolves that, with a memo naming neither an owner node nor
an owner seat reading `unattributed` rather than being assigned one.
