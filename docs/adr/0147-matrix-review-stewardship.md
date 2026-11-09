# ADR-0147: Matrix multi-line review stewardship

- **Status:** Accepted
- **Date:** 2026-11-09
- **Schema:** v122
- **Surface:** `#/reviews?panel=stewardship` (Board / Packet / Method), review packet, CSV scope #109, `RULE-SRV-01`
- **Altitude:** frontline / mid-manager primary (the reviewer and the line holder); the same board is the director's and the VP's roll-up
- **Structure:** matrix; single-chain workspaces remain byte-for-byte inert

## Context

Every other matrix module answers a question about work: who holds which right, which demand
goes first, which charters contradict, which budget envelope two lines both claim. None of them
touches the single most consequential leadership act in the product — the **performance review**,
which is the one record in LeadOS that is a durable claim about a person.

`reviews.js` assembles a packet from `personId` alone. It gathers that person's goals, feedback,
delegations and 1:1 notes *whatever line produced them*, then invites exactly one assessment,
silently attributed to the home line. In a matrix this produces three failures that are
individually invisible and jointly fatal to trust:

1. A project manager's strongest evidence sits in the packet while nobody ever asked that line
   for input, so the functional manager's assessment never meets the delivery view.
2. A line can contribute **nothing at all** and the packet still completes, reading as a complete
   account of the period.
3. The `performance` stewardship right can be **contested** (two lines declared it) or **unowned**,
   and the review completes anyway — so the workspace records an assessment without ever naming
   who was entitled to make it.

A single-chain product cannot see any of this: with one manager there is one line, one opinion,
and the question does not arise.

## Decision

Add one bounded read model (`reviewStewardship.js`) and three commands, and store the two human
acts on the review row itself.

**Derived on every read, never stored:** every period line, every line state, every overdue flag
and whole overdue days, the assessor resolution, the verdict and every total.

**Stored, on the review row so it freezes with the packet:** `stewardship.requests[]` (who was
asked which line, on what date, due when, in what words) and `stewardship.answers[]` (each line
holder's first-person input, or a decline with a stated reason). No new collection is added.

**Seven line states**, because seven different facts must not collapse into "asked" or "not asked":
`assessor` (this line writes the assessment; asking it for input into its own act is not a
question), `answered`, `declined` (settled, and explicitly **not** evidence), `asked` (inside the
declared window), `overdue` (past it, with the days printed), `unasked`, and `excluded` (the line
did not exist inside the period — not a gap and not a zero).

**Seven verdicts with declared precedence** (`contested-assessor`, `unowned-assessor`,
`overdue-input`, `unasked-line`, `awaiting-input`, `settled`, `single-chain`), so the rule, the
panel and the CSV cannot disagree about what a word means. "Settled" means every line is settled;
an ask that is merely outstanding is its own state.

**Three commands**, all dated and span-checked: `reviewStewardshipAsk` (refuses a line outside
the period, a second live ask inside the window, and an answer to a line that has already
answered), `reviewStewardshipAnswer` (enforced to the manager who holds the line — a peer or the
home manager cannot answer for somebody else's line), and `reviewStewardshipScan` (retries
capped work; changes no declaration).

**One rule, `RULE-SRV-01`**, on the shared post-commit spine immediately before the Operating Seat.
It fires only on a completed review or an explicit scan, and issues at most one owned, dated
delegation per unasked line per review, addressed to the manager who holds that line. It issues
**nothing** when the assessor is contested or undeclared: a task addressed to nobody could never
close, so that declaration question stays with the leader. Typed provenance only —
`concerns` per period line, `issues-obligation` per ask, `rolls-up-to` per leadership ancestor in
the matrix DAG. Marker-idempotent per review × line.

## The refusal that is the product

The module does **not** print a per-line contribution share. `feedback`, `recognition`,
`oneOnOnes` and `delegations` record who an item is *about*, never which reporting line produced
it, so any split derived from them would be a fabricated allocation that every downstream figure
inherits — precisely the failure the Bulletproof Reliability Mandate forbids. The report carries
`attribution.lineAttributable = false` with that reason, and the panel and the CSV print it beside
the counts. What *is* attributable is a first-person dated answer, and that is the only thing the
engine counts. The example of "the project manager's evidence" is therefore visible as a **gap in
the process**, named on the right row, rather than as a number nobody could defend.

## Reliability identities

- `accountableN` (lines in force in the period) `= assessorN + answeredN + declinedN + askedN +
  overdueN + unaskedN`. Every one of those is a count of **lines**, never of line-people.
- A person holding two declared lines to the *same* manager is **one relationship**: one manager,
  one opinion, one answer. `buildMatrix` already wires one edge per manager; the engine merges the
  second *kind* onto that one row (from the declarations, and only onto a relationship the graph
  actually accepted) so nothing declared is hidden and nobody is asked twice.
- A line the graph **refused** to wire (duplicate, cycle, impossible window) is never claimed by
  this panel and can never be issued work.
- Reading the report mutates nothing; the displayed state is recomputed from the stored blob and
  asserted equal to it in the test suite before and after a real reload.

## Consequences

A matrix review now has the step it always needed: every line in force is either settled or named
as a gap, and completing a packet with an unasked line issues dated, owned work instead of passing
silently. A contested assessor is printed with every holder rather than resolved by whichever line
happened to write first. A single-chain workspace gains no row, no warning, no edge and no
delegation. Directors and VPs read the same model as a board — one row per packet, worst first —
which is a pattern view rather than a second hierarchy.

Known limits: the home line is treated as in force for the whole period because LeadOS does not
store when `person.managerId` changed, and it says so rather than inventing a date. Line input is
recorded, not scored; the assessor still decides, and this module never sets a rating.
