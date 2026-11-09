# ADR-0152 — Matrix Line-Exit Obligation Register

**Status:** Accepted (Session 210, Schema v127)
**Date:** 2026-11-09
**Altitude:** frontline / mid-manager PRIMARY × matrix (every altitude reads the same register)
**Rule:** `RULE-LEX-01`
**Surface:** `#/matrix?panel=exit` · CSV scope #114

## The duty

Priya's project line for Sam was dated out on 31 October. The review input ask we
sent her in February is still open, and Sam never acknowledged the project's
onboarding brief. Nothing in the workspace tells a leader whether those asks are
still owed by anyone, or whether they are looking at work that structurally
cannot close.

Every matrix module before this one reads the **live** line set:

| register | asks | reads |
| --- | --- | --- |
| ADR-0148 line consent | the manager a line was given to | the declaration, while it is in force |
| ADR-0147 review stewardship | the manager who held the line during a period | the live line set of that period |
| ADR-0150 onboarding completeness | the manager who holds the line in the window | lines in force in the window |

The moment a line is dated out, all of that work keeps its addressee and its
roll-up edge while the line that justified it no longer exists. A person is
chased about a job they no longer hold, a manager carries an ask about a project
that ended, and a director reads an open-work figure that can never move.

This is not a reporting defect. It is a **closure** defect: a matrix organisation
loses more work to lines that ended than to lines that were never declared,
because nobody's checklist owns the work an ended line left behind.

## The decision

Add one bounded read model over the obligations the workspace **already stores**,
matched against the lines that have actually ended, plus exactly one dated human
command that settles one obligation. Change nothing about a single-chain
workspace and nothing about the registers that own live lines.

### What is stored

One new collection, `lineExitRemedies` — one row per **dated human act on ONE
open obligation left by an ended line**:

```
{ id, obligationKey, source, personId, lineKey, lineRole, lineKind, managerId,
  outcome: 'retire' | 'carry', reason, carryToManagerId,
  decidedOn, decidedBySeatId, decidedSource, reviewOn, at }
```

`lineExitMarkers` is `RULE-LEX-01`'s idempotency ledger.

### What is never stored

No obligation row, no state, no window verdict, no day count, no total and no
copy of the original ask. Every one of those is derived on read from the stored
asks plus the dated declarations. That is what makes *what the panel showed* and
*what the record says* the same claim: the panel has no second copy to drift
from — and an obligation the person answered after a remedy was recorded stops
being an obligation on its own, leaving the remedy readable as history.

Nothing is retired or carried by the migration. An upgraded workspace starts with
an EMPTY remedy ledger, which reads as "no ended line has been adjudicated yet".

### Which obligations are read

Only records that carry the **line key** they were addressed to. Two qualify:

1. **An unacknowledged line onboarding brief** (ADR-0150) — the current brief per
   `(plan, line)` where the person has never acknowledged it.
2. **An unanswered review input ask** (ADR-0147) — a request on a review row with
   no matching answer on that line key.

A third family is deliberately **not** read: a line-consent acknowledgement ask is
a generated delegation naming a person and no line, so joining it to a line would
be a guess. The panel prints that limitation rather than guessing.

### The arithmetic that is the product

For each obligation the register compares **two dated windows** and never reads
prose:

* the **work window** the ask is about — the plan's 90-day horizon, or the
  review period;
* the **line window** — the days the declaration was in force.

| verdict | meaning | what the register does |
| --- | --- | --- |
| `overlaps` | the windows meet; the line could genuinely have owed the work | prints it; a human settles it |
| `after` | the work window falls entirely outside the line's life | **flags** it for retirement; never retires it |
| `unknown` | one side is undated | prints that it cannot tell, never the reassuring answer |

Three obligation states (`open`, `retired`, `carried`) and five line verdicts
(`vanished`, `open-obligation`, `carried`, `remedied`, `no-obligation`) with
**declared precedence**, so the rule, the panel and the CSV cannot disagree about
a word.

### What a remedy may and may not do

* **Retire** — "nothing was owed, and here is why." Requires a stated reason
  (minimum 12 characters), is final, and never deletes the original ask.
* **Carry** — "it is still owed, and this named manager owes it." The named
  manager must hold a **live line** for that person today (or their home line).
  The action refuses the person herself, the manager whose line ended, and any
  third party; the panel's picker offers exactly the set the action accepts.
* **Nothing re-points.** Moving an ask from one manager to another is fabricating
  an accountability nobody accepted — the shadow accountability ADR-0148 exists
  to prevent.
* **Nothing overwrites an answer.** An obligation the person or the line has
  already answered is not in the register, and a remedy naming it is refused with
  that reason: the answer is the record.

### The two refusals that keep it honest

1. **A line key that resolves to nothing reads `vanished`.** The line was deleted
   rather than dated out, or never existed. The obligation is printed and counted
   as unsettled; the register will not invent an end day or an heir, and the rule
   issues no work against it — a task addressed to nobody could never close.
2. **The HOME line is handed over, not adjudicated.** `person.managerId` has a
   recorded history (ADR-0149), so home-keyed obligations are counted, the count
   that predates a recorded home-line move is printed, and the reader is sent to
   the structure reconciliation. Inventing a home-line end from a pointer would be
   exactly the drift ADR-0149 exists to catch.

## The rule — `RULE-LEX-01`

Fires on `matrix.line.ended`, on `review.completed` (a completed review can
itself leave an input ask open on a line that already ended) and on an explicit
scan. Never on a read.

For every ended line that still carries open obligations it issues **one** owned,
dated delegation to the manager who held that line: settle each obligation —
retire it with a reason, or carry it to a named manager — by the declared window
(7 days by default, clamped 1–30). Typed provenance only (`concerns`,
`issues-obligation`, `rolls-up-to` per leadership ancestor in the matrix DAG). No
typed work is issued for a vanished line, for a manager no longer on the roster,
or for the home line. Idempotent through a marker keyed on the **line plus the
exact open-obligation set**, so a settled obligation is not re-chased and a newly
opened one on the same line is. Capped at 8 per transaction with the remainder
counted and retried by a scan.

## Frameworks applied

* **Orphaned work-in-process accounting** (Goldratt 1984; APICS WIP close-out) —
  work whose cost centre has closed keeps consuming capacity until somebody
  closes it; the register prints every such ask with its age in whole days.
* **Valid time versus transaction time** (Snodgrass 1999) — the line carries the
  days it was in force, the obligation carries the days the work was possible, and
  only their overlap can support a claim that the work was owed.
* **Exit-criteria hygiene** (PMI PMBOK project closure) — a project closes when
  every open action has an owner or a written retirement, not when its date passes.
* **Accountability without authority** (Martin 1993; consent-based RACI) — why a
  carry must name a live line holder rather than reassign silently.

## Consequences

* A single-chain workspace is **inert**: no row, no ask, no remedy, no change to
  any existing reading.
* `SCHEMA_VERSION` moves 126 → 127, additively: two collections and one clamped
  convention.
* CSV scope #114 is **aggregate only** — one workspace row plus one row per ended
  line identified by kind and position; no person, name, manager id, declaration
  id or free text.
* The register is a **reader** of the shared spine, not a second hierarchy: it
  reuses `buildMatrix`, the typed provenance engine and the matrix roll-up, and
  adds no parallel ledger of who owns what.

## Honest limits (printed on the panel)

* Retiring records a reason; carrying names a live line holder. Neither edits or
  deletes the original ask.
* An `after` window is flagged, never retired automatically — the register does
  not decide that an ask was unnecessary.
* A line with no recorded start or end day cannot be classified; its obligations
  are counted and read `unknown`.
* Line-consent acknowledgement asks are not read (no line key on the record).
* Seats remain workflow declarations, not authentication; a seat check is a
  routing control, not an identity boundary.
