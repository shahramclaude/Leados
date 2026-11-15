# ADR-0212: Temporary Standard Waiver Register — a departure with a name, a date and an end

Date: 2026-11-15 · Session 282 · Schema v166 (additive: `standardWaiverRequests`, `standardWaiverGrants`, `standardWaiverDecisions`, `standardWaiverMarkers`, plus seven conventions) · Status: Accepted

## Context

Leader standard work (ADR-0190) records what a person declared they will do, the
first-person check that says they did it, and the escalation that follows a lapse.
It models a standard in force and silence about that standard. It models nothing
in between.

Real operations run in that in-between space constantly. The relief operator does
not arrive and the line still has to ship. A supervisor short-cuts the changeover
check for a week because the fixture is at the integrator. A tier huddle is
suspended during a stocktake. Every one of those is a *deliberate, authorised,
temporary* departure from a written standard — and every one of them is the exact
mechanism Diane Vaughan named **normalization of deviance**: each departure is
small, each is justified on the day, and nobody ever totals them. Challenger,
Bhopal, the Boeing door plug: the pattern is never one bad exception. It is a
chain nobody counted, ending in a standard that was never decided.

The industry answer to this problem is not a better exception, it is a *record*:
permit-to-work and bypass management (ISA-84 / IEC 61511) require a named
authoriser, a written reason, a declared safeguard, a first and a last day, and a
closing decision; management-of-change systems (ISO 9001:2015 §8.5.6, OSHA
1910.119) require that a temporary change is time-limited and reviewed, and that
repeated renewal is itself the signal that the standard or the practice has to
change; concession control (ISO 9001:2015 §8.7, ICH Q7) requires that a
concession is bounded and that the product/process returns to the standard
afterwards.

Before this session a targeted search of `app/` for `waiver`, `deviation`,
`concession` and `normalization` found nothing that records a temporary departure
from a declared standard. Session 281 identified the gap and shipped nothing.
Wider absence across every other tool this workspace integrates with is
**[UNVERIFIED]**.

## Decision

A **temporary standard waiver** is a dated human decision that one named
standard-work routine may be set aside for a declared window, by the holder of the
line the routine is owed under, with a written reason, a declared safeguard, and
an explicit closing decision. Schema v166 adds four append-only collections and
seven conventions. Nothing is inferred at upgrade: an existing workspace starts
with every routine in force, because a departure nobody asked for is not a
departure.

**The door refuses, and it refuses by name.** Thirty named refusals. The
load-bearing ones:

- **Only the person who owes the routine may ask.** Nobody authorises somebody
  else's standard to be set aside on their behalf: a manager asking for a
  subordinate turns a departure into an instruction.
- **Only the holder of the line the routine is owed under may answer** (minRank
  2). Never an ancestor above that line, never the acting seat itself, never the
  workspace leader by virtue of being the leader. The routine's line is resolved
  through `buildMatrix`, so a declared matrix line is authoritative and an ended
  line authorises nobody.
- **A waiver authorised by the person it excuses is not an authorisation.** This
  is checked *before* the line check, so the refusal the reader sees is the true
  one: "the acting seat is the person who owes the standard", not a rank message.
- **A window never starts in the past.** A departure authorises what is about to
  happen; one dated backwards is a pardon, and the refusal says so in those words.
- **A window is bounded twice**: by the declared maximum (default 30 days, hard
  cap 90 in the registry) and by a guard at *both* doors. A departure that needs
  longer is a change of standard — a different decision with a different record.
- **The authoriser may narrow, never widen.** A grant covering more days than the
  request asked for is refused; a grant covering fewer is accepted and printed.
- **One routine, one authority.** Two live windows on the same routine are refused
  at request *and* at answer, and the refusal prints the standing dates. Overlap
  is how a chain becomes permanent by accident.
- **A renewal must continue a GRANTED, same-routine, same-owner waiver** and must
  start no later than the day after its predecessor ends. A two-day gap means the
  standard was back in force; that is a new departure, and the register says so.

**Ten derived states, in a fixed precedence**, so one request is counted once:
`refused` → `lapsed-request` → `requested` → `revoked` → `restored` →
`ended-with-routine` → `renewed` → `in-force` → `pending-start` →
`expired-unrestored`. A request nobody answered is a **lapsed request**, never a
departure. A grant whose window ended without a restoration decision is
**suspended by silence** — the state this register exists for, and the one the
suite pins by name.

**Coverage is a fact about days, not a label.** A closed owed slot counts as
waived only when *every* day in it lies inside an authorised window. One waived
day does not waive a week, and the register prints `coverageDaysN`, `owedSlotsN`,
`waivedSlotsN` and `waivedSlotKeys` separately so a reader can check the
arithmetic. The share is withheld, with its counts printed, below the declared
`minOwedSlots` floor — an unsupportable percentage is refused, never rendered as
zero.

**`RULE-TSW-01` is spine rule 131/131** with its own contract, two conditions and
no third: a lapsed departure becomes ONE dated ask to the authoriser who granted
it; a contiguous chain at the declared threshold becomes ONE dated ask to the seat
**above** the renewing manager on their home line. Where the addressee would be
the workspace leader, is off the roster, or no seat above exists, it writes one
identity-free marker and asks nobody. Asks self-close; a human-closed or returned
ask counts as answered, so the rule never re-asks what a person already handled.
Pause-governed on every path including the explicit scan (`standardWaiverAutoPropagate`
is on the matrix-reach list, read literally as well as through the registry).

**Matrix correctness.** Reading is scoped to the seat's span and the register says
so: `figuresComplete` is false and the count of routines *and* requests outside
the seat's reach is printed. A routine the seat cannot reach is a figure the
reading does not contain even if nobody ever asked about it — counting only
dropped requests would let a scoped seat print "whole record" while its board was
missing routines. That defect was found by this session's suite and fixed.

**CSV #154** carries 49 identity-free columns: no person, manager, routine id,
routine title, reason, safeguard or basis text. Rows are positional
(`R01`, `R02`, …), a withheld share exports BLANK with its reason, and never zero.

## Consequences

- The workspace can now answer "how far has this standard actually drifted, and
  who said so?" — and it can answer it in counts, without naming anyone.
- Renewal chains are a first-class figure (`chainsN`, `longestChainN`,
  `chainReviewDueN`). The register does not call a long chain bad; it makes the
  chain visible at the threshold a human declared, which is the whole point of a
  review condition.
- The rule can ask a named person for a dated answer. That is new pressure, and
  it is deliberately narrow: one condition, one ask, capped at four per commit,
  self-closing, and pause-governed.
- Migration `165 → 166` adds four EMPTY ledgers and the conventions. No waiver is
  inferred from an existing lapse, because a lapsed check is evidence that
  something stopped, not evidence that somebody authorised it.
- A waiver is an authorisation inside the workspace. It is **not** a legal permit,
  a management-of-change record or a safety bypass: the panel says so in its own
  method tab rather than letting a badge imply regulatory cover.

## References

- ADR-0190 — Leader standard work register (the standard this register departs from)
- ADR-0210 — Conflict-of-Interest & Recusal Ledger (rule 129; this is 131)
- ADR-0211 — Capital Rationing (rule 130, CSV #153; this is 131 / #154)
- `app/core/domain/standardWaiverRegistry.js` — engine, states, refusals, frameworks
- `app/core/domain/standardWaiver.js` — the pure reader
- `app/core/domain/standardWaiverActions.js` — the dated doors
- `app/core/domain/standardWaiverRules.js` — `RULE-TSW-01`
- `docs/adr/TEMPLATE.md`
