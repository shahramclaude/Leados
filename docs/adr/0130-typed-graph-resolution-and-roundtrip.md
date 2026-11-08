# ADR-0130 — Thirteen link types nobody could follow, and a record that vanished on second load (Schema v118 unchanged, Session 176)

**Status:** Accepted · **Date:** 2026-11-07 · **Supersedes:** nothing · **Extends:** ADR-0008, ADR-0104, ADR-0110

## Context

The typed link registry (`LINK_ENTITY_TYPES` / `LINK_ENTITY_COLLECTIONS` in
`app/core/domain/cases.js`) is the shared spine's entity vocabulary. Every
cross-module edge, every `rolls-up-to` carrier, the cross-module link CSV and the
propagation-lineage labels are keyed on it, and a single resolver
(`resolveLinkedEntity`) is the only thing that turns a stored `(type, id)` pair
into something a leader can read and click.

Two defects in that contract were live on `main`, both found this session.

**1. Thirteen registered types had no resolver case at all.** Registration and
resolution had drifted apart: `dutycover`, `absenceplan`, `standbyanswer`,
`rehearsal`, `branchask`, `branchreading` (the ADR-0121–0129 coverage family),
`fitSnapshot`, `fitproposal`, `fitreading` (ADR-0110), `jurfinding`, `jurreading`
(ADR-0109) and `spanreading` were all declared first-class graph nodes, written
onto the spine by real rules, and **unreadable**. A propagation row naming one
rendered as a broken reference, and the cross-module link CSV dropped the whole
edge — so a director opening the lineage of a cover declaration saw a gap where
the governed act was.

**2. `normalizeFitProposals` failed its own round trip.** It wrote
`predictedSaving: null` for a proposal with no declared saving, then re-read that
`null` through `Number(null) === 0`, which made the row "a predicted saving of
zero with no currency" — and the fail-closed normalizer (correctly) dropped it.
The record survived the first load and disappeared on the second. This was
invisible because the only exhaustive sweep that would have caught it
(`tests/app/typed-links-lineage.test.mjs`) never reached the analytics family:
its fixture had no rows for those collections, and its `targetIdFor` helper
asserted that every type *had* a row, so the test failed before it could check
anything about them. It had been recorded for four sessions as a
"pre-existing 3/8 failure" and left alone.

## Decision

**Every registered type must resolve, and resolution must be disclosed.**

**1. One resolver case per registration, written to the same disclosure rule.**
Each new case projects the record's **shape** — its kind, its dates, its state,
its counts — and never the content that made it worth protecting. No duty free
text, no cover's name, no absence reason, no answerer's words, no recorder's
note, no objective title, no member record ids, no per-person figure. Where the
underlying row is already identity-reduced by its own ADR (the branch reading
hand-off), the graph label follows it: a **branch ask carries no seat id and no
position**, because ADR-0129 keeps seat ids off branch rows precisely so a
withheld cell cannot be re-identified by walking the graph.

**2. A resolver case may not invent a focus the terminal cannot honour.** The
coverage family and the analytics family resolve to the panel that owns the
record (`#/duty-cover?panel=register`, `#/fit?panel=book`,
`#/jurisdiction?panel=drift`, `#/span-calibration?panel=readings`). Those panels
address "which branch / which duty line / whose span" against the **acting
seat**, not against a record id. A fabricated `?record=` there would be a
decorative parameter that scrolls the reader to a table and highlights nothing —
exactly the defect the sweep's exact-focus assertion exists to catch. The
premise assessment, the mission capture, the comparison and the escalation
record *do* address a frozen record by query, and those are pinned exactly.

**3. The sweep must be able to fail.** The exhaustive test now:

- resolves every type the fixture can populate and asserts exact focus where a
  focus contract is declared, panel ownership where it is not;
- receives a `t` diagnostic reporting its real coverage (101 of 115 registered
  types this session);
- pins the **uncovered set as a literal**, so a newly registered type cannot
  appear without a fixture and pass unnoticed, and a type that gains a fixture
  fails until the list is corrected.

**4. Absent is absent.** `finite()` in the decision-fit schema no longer coerces
`null`/`undefined`/`''` to `0`. A normalizer's **output must survive its own
input**, and that is now the shape every fail-closed normalizer here is read
against.

Two test artefacts were also repaired at the root rather than papered over: a
fixture that minted ids from an independent counter (so `createScorecard`
collided with an id the store had just issued, the create was quietly refused,
and an absolute `length === 1` pin only "passed" because a real transaction was
missing); and a `clearDemo` assertion that looked its trace up by `entityId`,
which matched the CREATE transaction instead of the COMMIT transaction it had
been scrubbing. Both now assert against the transaction they mean.

## Consequences

- A leader following the lineage of any coverage or analytics record lands on
  the panel that owns it, with the edge's shape on the label.
- The cross-module link CSV no longer silently drops edges for these types.
- The sweep reports what it does not cover instead of asserting a fiction, and
  the pinned uncovered set is the mechanism that keeps it honest.
- No schema bump, no new collection, no new rule id, no new stored field.

## Known gaps (honest)

- **Five coverage-family types still have no record focus.** The duty register,
  the absence plan, the acknowledgement board and both reading panels do not
  accept a record id; a leader can reach the owning panel but cannot jump to the
  exact row. This is a **view** gap, not a graph gap, and it is the natural next
  slice: `?duty=` / `?cover=` / `?ask=` focus parameters on those four panels.
- Fourteen registered types remain uncovered by the sweep fixture (pinned in the
  test). Each is proved by its own module suite; none is proved *here*.
- Seats remain workflow declarations, not authentication.
- The full canonical suite is not run in-session; the focused pass is recorded in
  `AI-SESSION-LOG.md`.
