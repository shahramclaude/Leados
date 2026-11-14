# ADR-0196 — Cross-Line Work-Reassignment Consent & Receiving-Capacity Gate

Date: 2026-11-13 · Session 264 · Schema v156 · Status: Accepted

## Context

[ADR-0181](./0181-non-promotable-work-turn-ledger.md) can show a manager that
non-promotable work has concentrated on somebody and can issue a dated
`RULE-NPW-01` rotation ask. That reading is evidence of an allocation pattern;
it cannot establish that a different manager agrees to receive a concrete next
piece of work, that a named receiving line has remaining declared capacity, or
that an old delegation's owner should change.

The existing Matrix Line Intake Gate ([ADR-0171](./0171-matrix-line-intake-gate.md))
prices dated declared share-days. It did not reserve capacity for a work-turn
transfer accepted by a receiving manager. Conversely, a generic delegation
completion could close a `RULE-NPW-01` ask with prose alone. That made a
rotation appear served without dated cross-line consent or checkable capacity.

This is a frontline / mid-manager × matrix slice. It also behaves honestly in a
single-chain workspace: an operator or current source/receiving line holder can
use it where there are two distinct active lines; it does not manufacture a
second line from a reporting tree.

## Decision

Add one append-only collection, `workReassignmentActs`, in Schema v156. A
transfer lifecycle is compiled, never stored as a mutable status:

1. a `propose` act names one active `RULE-NPW-01` rotation ask, source person,
   current source line and manager, receiving person, current receiving line and
   manager, human-written next-work title, one calendar-quarter key, and exact
   declared effort in integer hundredths of a person-day;
2. the receiving line records exactly one `accept` or `decline`;
3. either current line holder can record a reasoned `withdraw` while the
   transfer is awaiting or accepted but has not served its rule ask.

A proposal is source-manager-only; an answer is receiving-manager-only. The
undeclared operator view may scribe either statement and is recorded as
`operator`, not as authenticated seat identity. Seat-authored imported acts are
accepted only when their named seat is the source holder for a proposal, the
receiving holder for an answer, or one of the two holders for withdrawal. The
schema rejects malformed, duplicate, orphaned, ordinary-delegation,
out-of-sequence, fake-seat, and invalid-capacity histories rather than repairing
them into consent.

A marker is not, by itself, `RULE-NPW-01` provenance. New rotation markers carry
the explicit rule id and must agree with the rule-written delegation support and
typed `issues-obligation` link. ADR-0181 markers that predate that field remain compatible only where those
independent task/link artefacts corroborate the marker, and only to retain an
already completed accepted transfer as `legacy-attested` history. They cannot
be offered, imported, proposed, or accepted as a current reassignment. If
bounded marker retention later evicts a completed marker, that already-attested
served history may be retained from its persisted rule id plus the same
task/link evidence, labelled `retained-attested`. This compatibility path
retains historical consent; it does not allow a new proposal to turn an ordinary
delegation, title, owner, or loose marker into a rotation ask. A loose marker
also fails the generic completion door closed: it cannot restore the old
prose-only path by making a task look like either ordinary work or a served
rotation.

`155 → 156` adds an empty ledger. It infers no effort, recipient, source line,
receiving line, consent, reservation, or served rotation from an existing task,
work-turn finding, reporting line, title, or intake.

## Capacity gate

An acceptance is allowed only when, on the current day:

- the linked task remains an active recorded `RULE-NPW-01` ask and its source
  still matches the current finding;
- the source and receiving lines still hold the named people;
- the named receiving person remains on the active roster;
- the proposal belongs to the current calendar quarter; and
- `lineCeiling` can prove the receiving line's declared quarter share-days and
  `recorded non-rerouted intakes + accepted transfer reservations + proposed
  effort <= declared ceiling`.

Every calculation is an integer count of hundredths of a person-day. A missing,
ambiguous, stale, defective, or history-gapped line ceiling refuses acceptance;
capacity is never guessed from a title, role, reporting-tree position, or
current workload. An acceptance freezes the checked ceiling, consumed amount,
and projection as a dated historical fact. The read model then re-checks the
live line, intake, reservation, and capacity state after every later write; it
does not rewrite an earlier human answer when conditions later change.

Accepted, unwithdrawn transfers count as capacity reservations in both this
reader and ADR-0171's `lineCapacityUsage`. Thus a later intake or reroute cannot
silently consume already accepted headroom. A declined, awaiting, or withdrawn
transfer reserves nothing. A served transfer remains accepted evidence and
cannot be withdrawn afterwards.

## Completion boundary and post-commit contract

`completeDelegation` now recognizes a rule-owned work-turn ask. It refuses to
mark that ask served unless at least one linked transfer is accepted and still
reads `ready` against live capacity. On success it stamps the precise ADR-0196
transfer id into the completion note. The source manager, who owns the
`RULE-NPW-01` ask, closes it; a receiving manager may accept work but does not
acquire authority to close the source manager's delegation.

A new registered post-commit contract deliberately writes and emits **nothing**
on proposal, answer, or withdrawal. This negative contract is intentional:
accepting a transfer does **not** reassign `delegation.personId`, create
replacement work, change a reporting line, complete a rotation ask, or select a
recipient automatically. It keeps the absence of automatic reassignment
reviewable on the shared spine rather than accidental.

A rule ask that later clears independently may close as cleared, not as served;
the reader labels a linked transfer `rotation-closed` unless the completion note
contains its accepted transfer token.

## Read model, authority, and disclosure

`buildWorkReassignments` is the one reader behind:

- `#/matrix?panel=reassignments` (“Transfer gate”);
- the source/receiving-manager action doors and candidate list;
- the served-completion predicate;
- the identity-free brief; and
- aggregate CSV scope #147, `work-reassignments`.

Detailed transfer rows are shown only to an involved source or receiving manager,
the undeclared operator, or a seat that reaches both named people. An unrelated
seat receives no row and no roster-discovery candidate list; withheld records
are counted internally rather than rendered as a clean zero. Receiving-span
counts obey the active seat's disclosure floor.

CSV is deliberately aggregate-only: it never exports a person, manager, line,
transfer id, rule-task id, work title, note, decline/withdraw reason, date of an
individual answer, or row-level capacity number. It exports workspace and
operation-state counts, total accepted reserved effort, and released/suppressed
span-count totals. A capacity refusal is counted, never represented as zero
headroom.

The raw collection has a `detailCeiling: 0` seat policy and no raw-act surface;
all disclosure passes through the scoped adapter.

## Consequences and deliberate limits

The system can now truthfully distinguish:

- a work-turn finding;
- a source-side proposal;
- receiving-line silence;
- a dated decline;
- an accepted historical capacity statement;
- a presently ready transfer; and
- a rotation actually completed through that transfer.

It still does not automatically move a person, transfer a delegation owner,
assign work, infer consent from a reporting line or from silence, guess effort
or capacity, rate a person/manager, convert effort units, schedule the work,
measure outcomes, or export transfer detail. A later outcome/review of whether
the transfer relieved the original concentration remains a separate follow-on,
not evidence fabricated by this gate.
