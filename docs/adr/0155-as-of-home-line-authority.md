# ADR-0155 — As-Of Home-Line Authority & Frozen Structure

**Status:** Accepted (Session 216, Schema v128 unchanged, frozen-snapshot contract v1 → v2)
**Date:** 2026-11-10
**Altitude:** director / VP PRIMARY × matrix (CEO / C-suite and mid-manager read the same lens)
**Surface:** `#/merit?panel=matrix` · CSV scope #116 (extended, no new scope)
**Rule:** none, by design

## The duty

The merit cycle was finalised in November. Sam was paid 2.5%, and Dana held the
`pay` right for that decision. In February the reorganisation moved Sam's home
line to Marcus. In March an auditor opens the November packet and asks the only
question that matters about it: **who held the pay right when that money
landed?**

Before this change, every matrix surface in the product answered from
`person.managerId` — *today's* pointer. The packet therefore credited Marcus
with a decision he had never seen. And nothing anywhere said the answer had
changed since the decision was made, because the frozen `audit` snapshot carried
band integrity, the decomposition and the departure predictions, and carried no
structure at all.

That is not a display nicety. A frozen decision record that cannot reproduce the
authority in force on its own effective date does not support the decision
(COSO 2013 control activities; IIA evidence sufficiency). And the failure is
silent in the worst direction: the packet reads *complete and clear*, with the
wrong manager's name on it.

## The decision

Add **one read model** (`meritStructure.js` + `meritStructureRegistry.js`) and
**one frozen block**, and route the existing merit-parity reader through it.

### 1. Read the home line on the effective date, from the record

The home line for each person is resolved on the cycle's own effective date
through ADR-0149's dated home-line ledger, in **four states that are never
collapsed**:

| State | Meaning | Blocks? |
| --- | --- | --- |
| `observed` | A recorded period covers the day (or is *closed* and reaches it — somebody declared that end date). | no |
| `projected` | An **open** recorded period is read for a day that has not happened yet. The line is presumed to continue. | no |
| `presumed-current` | This person has NO recorded home-line history at all, so nothing says the line ever changed. Today's pointer is used as a **printed presumption**. | no |
| `unrecorded` | Records exist for this person and **none covers the day**. The line that day is not in the record. | **yes** |

A person who had not started yet, or had already been archived, is a **fifth**
fact (`not-on-roster`) and is counted separately: a joiner who did not exist yet
is knowledge, not ignorance, and collapsing the two overstates every denominator.

**Why `presumed-current` is not a hole.** ADR-0149 records *moves*. A workspace
that has never recorded a move has no evidence a home line ever changed, and
treating "no evidence of a change" as "unknown" would blank every existing
workspace's merit reading the day this shipped. So the presumption is printed,
counted and named on every surface. What is refused is the case where the record
**exists and does not reach the day** — that is not ignorance, it is an
unreadable period, and projecting today's chart across it is the exact defect
this ADR removes.

**Why a closed period reaching a future day is `observed`, not `projected`.**
Reading a declared end date is reading a declaration. An *open* period has no
end, so reading it for a day that has not happened is extrapolation — that is
`projected`, and it says so.

### 2. One hierarchy, not two

The as-of reading builds a substituted state (each person's home pointer replaced
by the pointer the record says they had on that day) and hands it to the **same**
`buildMatrix` engine every other matrix module uses, evaluated at the as-of day
so a declared line's window is judged on that day. Cohort classification, cycle
refusal and right presumptions are all derived by one implementation. The
engine's own refusals against the as-of graph are counted and printed, never
dropped: an as-of substitution can close a loop that does not exist today.

### 3. An unreadable home line withholds, it never guesses

A pay row whose home line is `unrecorded` on the effective date:

- reads `authorityState: 'unknown'` — **never** `unowned` (which would claim
  nobody owned the decision) and **never** cleared from today's roster;
- is **excluded** from the cohort arithmetic with `excludeReason:
  'unrecorded-home-line'`, counted, and named in a finding — which withholds the
  cohort medians, the gap and the pool share through the *existing* complete-pool
  gate rather than narrowing the sample quietly;
- forces `figuresComplete: false`, because a structure claim the record cannot
  support is not a complete reading.

### 4. Freeze the structure beside the money

`finalizeMeritCycle` builds the frozen structure block in the **same
transaction** as the status change, so the frozen structure and the event that
propagates it cannot disagree. The block carries the effective date it was read
for, the day it was captured, the ledger's coverage start, the four state counts,
the supersession count, the **pool as read on that day** (row counts, the three
authority counts, both medians, the gap, both verdicts), and one row per person
carrying `{ personId, state, managerId }`.

Person-level keys add **no new disclosure**: the cycle already stores
`predictions` keyed by `personId`, and the export carries none of it.

The frozen-snapshot contract bumps **v1 → v2**. A v1 snapshot still loads; it
simply carries no structure, reads `not-frozen`, and claims nothing about the
structure that decision was made under. The bump is what lets a reader tell
*"this record predates the freeze"* apart from *"this record froze a structure
that happens to be empty"*.

A frozen row that cannot be read is **dropped and counted** (`rowsDroppedN`),
never repaired: a manager invented at load time is a past that never happened.

### 5. Compare, report, never correct

`compareFrozenStructure` reports one of four verdicts, declared top to bottom so
the panel, the brief and the CSV cannot disagree about a word:

`not-frozen` → `unreadable` → `drifted` → `identical`

`drifted` names exactly which people changed home line, which states changed,
which people appeared, and which **structure** figure is no longer reproduced.
The frozen record is not edited to match today; the live reading is not
overwritten to agree with the frozen one. Neither is a correction of the other.

There is no fifth verdict in which the comparison silently passes: a failed or
absent comparison is never reported as agreement.

### 6. The export carries counts, never identity

Same CSV scope #116, eleven added columns: the effective date the home lines were
read for, observed / projected / presumed / unrecorded / superseded counts,
whether those states reconcile to the roster, the frozen-comparison status, the
day it was captured and its difference count. **No manager id, no manager name,
no person id.** Who held the line is on the screen and on the brief; it is not in
the spreadsheet.

## What is deliberately NOT built

- **No second hierarchy.** No parallel right model, no re-derived line
  classification, no shadow DAG.
- **No stored derived figure.** Every count, state and verdict is re-derived on
  read. Nothing is written by a read.
- **No correction command.** There is no "reconcile the frozen structure" button:
  rewriting a frozen record to match today destroys the only evidence of what the
  decision was made under. Reopening and re-finalising is the governed path, and
  it supersedes rather than edits.
- **No rule.** A rule that reacted to a drifted structure would open work about a
  decision that has already been paid. The reading is for the human reviewing the
  packet.
- **No historical *declared* line reconstruction.** Declared lines carry their own
  windows and `periodLinesFor` already honours them; the home line was the one
  read from today.

## Consequences

- **Additive and inert by default.** A workspace with no recorded home-line
  history substitutes nothing: every figure in the matrix-merit reading is
  byte-identical to the pre-ADR-0155 reading, and the tab prints the presumption
  so the reader knows why. Eight of the seventeen focused tests exercise the
  unchanged path.
- **A real v1 → v2 snapshot change** that older snapshots survive by design, and
  whose absence is a printed `not-frozen` rather than a confirming blank.
- **The as-of day is now a visible artefact**: it is printed on the panel, in the
  brief, in the export and in the frozen block, so a reader can argue with the
  date rather than with the conclusion.
- **Costs**: one extra `buildMatrix` per merit-parity read and one extra pair of
  reads at finalisation. Both bounded by the roster.
- **Not certified by this slice**: historical reconstruction of *declared*
  (non-home) lines beyond their stored windows; the matrix read-model parity
  audit elsewhere; upstream import/normalisation retention of `structureHistory`;
  and the adjusted Oaxaca–Blinder screening that remains In Progress under
  ADR-0154.
