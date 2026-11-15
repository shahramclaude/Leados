# ADR-0206: Goal Attainment Period Close — the Reported Figure Is a Fact, the Restatement Is Dated

Date: 2026-11-15 · Session 274 · Schema v160 (additive: `goalAttainmentClosures`, `goalAttainmentNotes`, `goalAttainmentMarkers`) · Status: Accepted

## Context

Every matrix screen in this workspace re-derives its figures from today's record.
That is the right default — it is why a roll-up can never drift from the data it
describes. It is the wrong behaviour for a **reported** period.

Once a quarter's attainment has been reported upward, quoted in a board pack or
used to set the next quarter's target, the reader needs the number that was
reported, not the number that the record would produce now. The workspace holds
goals, dated check-ins, dated completions and an append-only structure ledger,
and ADR-0149 already establishes that a span is resolved as of a date rather
than from today's pointer. What was missing was the closing act: a declared,
already-ended period whose figures are frozen, and — after any later edit — a
counter that says, in the open, that the frozen figure no longer reproduces and
exactly which bucket or span moved.

The failure this prevents is quiet. A late check-in dated inside September, a due
date corrected from October into September, or a goal re-owned after the close
all move what a September report *would* say. Without a frozen baseline the
September report silently becomes a different number, and the trend it was
supposed to support is meaningless. With one, the change is a named, dated
restatement the joint apex of the moved spans is asked about once.

## Decision

**The reported figure is frozen; the difference is printed, never written over.**

A closing act (`close-goal-attainment`, rank 4) declares a label and an already-ended
period, bounded at 400 days. The engine derives the population, the buckets, the
spans and the entries from the record as it stands, **refuses** to close if any
goal it must report cannot be placed, and stores that derived set. The stored
closure is re-proved on load: its bucket counts must add up to its own goal count
and its entries must agree with them, or the closure is dropped with a warning
rather than re-totalled. Two closed periods may not share a day.

- *Population* is every goal whose **due date** falls inside the period, inclusive.
  An undated goal belongs to no period and is counted apart.
- *Bucket* is `achieved` where a dated completion falls on or before the period
  end, `dropped` where the goal was dropped before it, otherwise the confidence on
  the **last check-in dated on or before** the period end; `no-checkin` and
  `unknown-confidence` are their own buckets. Pace-derived health is never used:
  pace is a function of today.
- *Span* is the owner's home line **as recorded** on the period's last day. A
  reorganisation after the close therefore does not restate the period; an edit to
  the goal's own `ownerId` does, because the record of who owns it changed.
- *Matrix rule*: one goal is counted exactly once, in its owner's home line. A
  person's additional reporting lines never receive a share — splitting one
  objective across lines would invent an allocation no human agreed to. A
  multi-line owner is printed and counted; an ownerless team objective is counted
  apart and never charged to a span.

Every read re-derives the same period from the record as it stands and compares it
goal by goal with the frozen set, attributing each movement to exactly one cause:
`added`, `removed`, `bucket-changed`, `span-moved`, `bucket-and-span-changed`. The
difference is fingerprinted as `gar1:<16 hex>` over the frozen buckets, the causes
and the per-span frozen/live counts — **no person, goal id, title or label**. A
written acknowledgement of *that* fingerprint is a dated human decision that the
restated basis stands; a different fingerprint is a different restatement and needs
its own. A restatement that disappears because the record was repaired reads
`faithful` again, with the repair as history rather than as cover.

### The refusals are the design

`structure-unproven` — a goal whose owner has no home line recorded on the period
end — makes the whole period `unprovable`. An aggregate over the attributable part
would read as complete and be wrong, so the register prints no restated figure at
all for that period, and the rule asks nobody about it. A closure whose counts do
not reconcile refuses the same way. A period that has not ended, a period with
nothing due inside it, a second close over a shared day, and an acknowledgement of
a fingerprint that is not the live one are all refused at the door with a printed
reason.

### One ask, at the joint apex, that closes itself

`RULE-GAR-01` sits immediately before `seatRule` on the post-commit spine. When a
close restates, it files **at most one** `docs-obligation` ask per commit — to the
lowest joint apex of the spans that moved, stating counts and the live fingerprint,
never span names — plus an `issues-obligation` link and an `acts-on-behalf`-free
marker if nobody holds that apex. The ask states that no goal is being questioned:
the register charges every movement to the record, never to a person or a span. A
written acknowledgement closes the ask with `Goal-attainment restatement acknowledged: `
and nothing else can. `goalAttainmentAutoPropagate: false` pauses the rule through
the pause-permit matrix; a pause writes nothing at all.

## Consequences

- Schema v160 is additive; a workspace opened at v159 gains three empty collections
  and two declared conventions (`goalAttainmentAskDueDays` 7, propagation on).
  No existing closure is reconstructed: a period nobody closed stays unclosed.
- `#/matrix?panel=attainment` prints what was reported, what it says now, the exact
  cause and span of every movement, the refusals, the framework the register applies
  (IAS 8 / ASC 250, COSO 2013 §10, Kaplan & Norton 1996, provenance, Deming) and one
  dated limitation: this workspace does not date a drop, so a goal dropped after a
  close restates the periods it was due in.
- CSV scope #149 (`goal-attainment-closures`) is aggregate-only: no goal id, title,
  person, span name or label leaves the workspace, and a sub-floor span exports a
  **blank with its reason**, never a zero.
- `unprovable` periods print `figures_complete: NO` and blank every restatement
  number rather than a partial total.
- The nightly seal and every other rule are untouched; the register reads the store
  and writes only its own notes, markers, links and at most one ask.
