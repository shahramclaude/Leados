# ADR-0149 — Matrix Reorganisation Reconciliation & As-Of Structure Reads

**Status:** Accepted (Session 206, Schema v124)
**Date:** 2026-11-09
**Altitude:** director / VP PRIMARY × matrix (all altitudes read the same ledger)
**Rule:** `RULE-SHR-01`
**Surface:** `#/structure-history` · CSV scope #111

## The duty

On 1 March a director moves eleven people between teams. In April a VP opens the
matrix ledger and asks a question no screen in this product could answer:

> "Priya accepted 40% of Sam on the 12th of February. On that day Sam was on
> Dana's line. Dana is no longer Sam's manager. Which manager was Sam's manager
> on the day Priya said yes — and is the acceptance I am reading against the
> structure that existed, or against today's?"

`person.managerId` is a **pointer**. It holds where a person sits now, and the
workspace stores no record of where they sat before. Every stored act that names
a manager — a line acceptance, a review's line set, an arbitration's arbiter, a
declared line — is therefore re-read against the present, silently, on every
render.

That is not a display bug. It is the difference between an audit trail and a
story told about the present, and a director cannot make a comparability call on
it. Three consecutive sessions (203, 204, 205) named this as the outstanding
gap and none could close it, because it requires a new kind of record rather
than a new read over the existing one.

## The decision

Store **dated home-line periods** and read the structure **as of a day** from
them; never project today's roster backwards.

### What is stored

One row per **observed home-line period**:

```
{ id, personId, managerId, fromISO, toISO|null, recordedOn,
  recordedBySeatId, source, reason, at }
```

`fromISO`/`toISO` are **valid time** — the days the line was true. `recordedOn`
is **transaction time** — the day somebody wrote it down. They are separate
fields on purpose: conflating them is how a back-dated correction silently
rewrites a period that other acts were judged against (Snodgrass, *Developing
Time-Oriented Database Applications*, 1999).

Also stored: `structureHistoryMarkers`, `RULE-SHR-01`'s idempotency ledger.

### What is never stored

A span, a depth, a subtree, a changed/held verdict, a comparability verdict, or
a corrected history. Every one is derived on read. A stored span is a number
waiting to disagree with the structure it describes.

### The three refusals that are the product

1. **A day the ledger does not cover is `unknown`, and every derived figure is
   withheld.** Not "probably like today". A workspace upgraded to v124 has no
   recorded past at all, and the honest reading of every earlier day is
   `unrecorded`. Back-filling today's pointer across history would manufacture
   exactly the lie this module exists to catch, and it would be invisible
   because it would look complete.

2. **A partial reading is `partial`, and the spans are withheld.** A span
   computed over the people the ledger happens to cover would understate the
   structure while reading as complete. The refusal names the fraction:
   `3 of 4 person(s) have no recorded home line covering <day>`.

3. **Drift is reported, never corrected.** An act that names a manager who was
   not part of that person's structure on the act's own day is counted as
   `drifted`, with the named manager and the recorded one printed side by side.
   Nothing is re-pointed, migrated or withdrawn. `RULE-SHR-01` issues one dated
   reconciliation ask to the manager who holds the line *now*, and a human
   decides what the act means.

## Three facts kept apart

The Bulletproof Reliability Mandate requires that distinct claims never be
collapsed into one reassuring word. This module prints four:

| Claim | Where |
|---|---|
| "The structure on this day is recorded" | `reading.verdict` ∈ `observed` / `partial` / `unrecorded` / `future` |
| "The figures below are derived from it" | `reading.readingRefused` + `spans` |
| "The counts add up" | `acts.actsReconcile` |
| "No act drifts" | `acts.clean` |

`actsReconcile` and `clean` are different facts and are printed as different
facts: the four buckets summing to the act count says nothing about whether any
of them is non-zero.

## The four act states

| State | Meaning |
|---|---|
| `consistent` | The named manager was part of the person's structure on that day. |
| `drifted` | The named manager was NOT — the structure moved underneath the act. |
| `unverifiable` | The act's own day falls in a window the ledger does not cover. |
| `undated` | The act carries no readable date, so there is no structure to read it against. |

`unverifiable` is deliberately not `consistent`. A record that cannot be checked
is not evidence, and treating an unrecorded window as agreement is the
fail-open direction.

## The diff: three counts, never collapsed

`appeared`, `disappeared` and `moved` are three different figures. A person who
joined between the two dates did not change manager; a report that lumps them
together overstates reorganisation and understates turnover. A person with an
unrecorded structure on *either* date is `uncomparable`, counted and printed,
and no change is claimed for them.

## The writer

`structureRecordMove` moves `person.managerId` **and** appends the period in the
same `store.update`, so the pointer and the ledger cannot disagree even for one
revision. It closes the superseded period the day before the new one starts —
the only way two home lines cannot both be true on one day — and keeps the old
row, because a period acts were judged against is evidence.

Refused: a future-dated move (it would make today's reading wrong), a no-op, a
move with no stated reason, a move by a peer, a person moving their own line,
and a move onto a **closed** recorded period (that is history; overwriting it is
the silent rewrite this module prevents).

`structureSeedCurrent` is the honest escape from the empty state: it records the
structure **as it stands today** for people with no recorded line, writing a
period that starts today and claims nothing about yesterday. It is not a
back-fill and is named so.

`structureImportDesign` imports the before/after evidence a *committed* design
already froze (ADR-0099), so a rehearsed-and-committed re-org does not leave the
ledger with a hole exactly where the comparability question is hardest. A
rehearsal or a reverted design writes nothing: it is a plan, not a past.

## Consequences

- Every workspace upgraded to v124 reads `unrecorded` for every past day until
  somebody records a period. That is correct, and the panel says so.
- The freeze-line audit (ADR-0099) no longer has to rely on a design record
  being present for a comparability claim.
- `RULE-SHR-01` is inert when nothing drifts: a reorganisation that re-pointed
  no act gains no task, because a task nobody needs trains people to ignore the
  queue.
- CSV scope #111 is aggregate-only. No person, name, manager id, act id or free
  text. A refused figure is a blank cell with its reason, never a zero.

## Honest limits

- The ledger records what was **recorded**, not what **existed**. Where the two
  differ, that difference is what the `unrecorded` verdict is for.
- Seats remain workflow declarations, not authentication.
- Historical *roster membership* is still not reconstructed: a person who was
  archived before v124 has no record of having been on the roster, so they are
  absent from every as-of reading rather than shown as `not-on-roster`.
- Real-browser assistive-technology verification is **[UNVERIFIED]**.
