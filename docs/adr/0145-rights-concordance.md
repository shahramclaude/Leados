# ADR-0145: The Matrix Decision-Right Execution Concordance — what the decision log actually did, against the rights the lines declared

- **Status:** accepted
- **Date:** 2026-11-09
- **Deciders:** LeadOS session 197 (director / VP rotation, matrix structure)
- **Extends:** ADR-0140 (matrix accountability ledger), ADR-0141 (matrix line
  seat), ADR-0142 (matrix budget exposure), ADR-0143 (cross-line priority
  arbitration), ADR-0144 (cross-line contradiction audit)

## Context

ADR-0140 declared the matrix's *structure*: which manager holds which of six
RAPID decision rights over a person, on which declared line, in which date
window. ADR-0143 built the instrument to adjudicate a present contest between
two lines' dated demands. ADR-0144 audited whether two lines' charters make
one another unachievable. All three ask what the organisation *declared*.

None of them ever asked the reverse, dated question about the *decision log
itself*:

> We recorded that this manager decided this, on this day. Did the structure
> we declared — the rights on this person's lines, on that day — actually
> give them the authority to decide it? And were the people the structure
> says must be heard, recorded as heard?

The workspace already holds everything needed to answer it, in records it
already writes: `decisions` with their DACI fields and `decidedOn` dates,
the typed provenance graph (`decide` edges, case owners), and the declared
reporting lines with their windows and rights. A targeted search found no
reader that joins them: the matrix report reads allocations and rights, the
decision log reads participants, and nobody compared the two.

The consequence of not asking is not an inconvenience. A declared right no
decision ever respects is decoration. A decision made by a manager the
structure gave no right to is a bypass that will be re-fought every time,
because the next ruling has no precedent to point at — only the same gap.
The gap is a *structural* fact about the declared lines, which a director can
fix in a minute by declaring a right; a *person* problem, by contrast, is the
one thing the product is forbidden to manufacture.

Session 196's roadmap named this exact gap as its next discovery, with the
claim `[UNVERIFIED]` pending a full repository audit. This session is that
audit: the audit found the gap real, and built the reader.

## Decision

Add the **Matrix Decision-Right Execution Concordance** as an eighth panel of
the matrix report (`#/matrix?panel=concordance`), a pure read model with no
stored collection, no new schema, no new rule and no new CSV columns — every
figure is re-derived on every render from the records the workspace already
writes.

**The join, per completed decision.** A decision names its approver and its
contributors. The *subject* — the person whose lines' rights govern — is
resolved ONLY through typed provenance edges the workspace already writes: a
link to a `person` entity, or a link to a `case` whose recorded `ownerId` is
the person. A decision with no such edge is counted `unscoped` and printed;
it is never attributed to the approver's own span or to a plausible person.
Then, **at the decision date**, the subject's active lines are re-derived by
the real `buildMatrix` at that date — so a line declared after the decision,
or ended before it, is excluded by the same engine the rest of the workspace
uses, and nothing here is a second window implementation. Those lines
attribute six rights to named managers; the concordance then asks four
things about the decision:

1. **bypass** — the recorded decider held no declared right on any of the
   subject's active lines on the decision date. The decision was made outside
   the authority structure the organisation declared.
2. **contested-decided** — the decider held at least one right that two or
   more managers hold. The structure duplicated the authority and this
   decision picked one holder without arbitration — the duplicate-approval
   risk, which will return as a disputed precedent.
3. **unresolved-authority** — a right on the subject's active lines was held
   by nobody on the decision date. The decision itself supplied the authority
   the structure did not have: the gap was filled by the act, not by a line.
4. **consult-gap** — a manager holding an *operational* right (priority,
   assignment, technical) on the subject's lines was not recorded among the
   decision's contributors. RAPID's Consulted role exists precisely so the
   people with a standing right to be heard are heard. Stewardship right-holders
   (pay, performance, absence) are employment-relationship holders and are
   not required to be consulted on a work decision; the convention is printed
   so it can be argued with.

**Findings are about pairs, never about people.** Every finding is a
statement about a decision against a declared line structure, or about a
right the structure attributes to nobody. The module refuses to rank or rate
a manager by how often their decisions sit outside the rights structure: the
fix is a line declaration, and a score would move the argument from the
design to the person. The panel says so where a reader would look for a
rating.

**Scope limits, counted and never guessed.** A decider name that does not
resolve to the roster (or resolves ambiguously to two people) is a counted
`unresolved-decider` limit — DACI names are free text by design, a decision
may be made with someone outside the roster, and the comparison says so
rather than mapping it to a person. A subject on a single line is counted
`single-line-subject` and audited nothing: the matrix module's own scope for
the rights question is people on MORE than one line. A dangling link target
is counted and dropped. Every count the panel prints is one of the identities
asserted in the suite — `audited = withFindings + clean`,
`totalFindings = shown + withheld`, `queue = shown + remainder`,
`completed = audited + unscoped + singleLine` — and the CSV exports those
identities as numbers beside their labels, never as zeros.

**Seat scope, the way the matrix report does it.** The concordance runs
inside `buildMatrixReport`, which injects the acting seat and its scope set;
findings whose subject sits outside the seat's span are counted `withheld`
and never shown — the audit widens a seat to its own people, never sideways.
A full-access seat sees every finding. Nothing is written: the state is
byte-identical after a read (pinned by test), so a printed finding cannot
drift from the rows it describes.

**The one module-level defect found and fixed by building this.** The matrix
module gates every one of its commands — reads included — on the declared
right `declare-matrix-line`, but that right was never registered in
`ACTION_RIGHTS`, the seat spine's single source of truth. The consequence
was not theoretical: the live API refused `matrixReport`, `matrixBriefText`,
`matrixCsvRows` and `matrixCandidates` for **every** seat, including the
undeclared operator view — the whole matrix terminal was unreachable through
the shipped application. The right is now registered (rank 1–5, every
leadership seat, the same window as `declare-line-mandate`), with the
comment recording why an unregistered right fails closed for everybody.

## Consequences

- **The decision log becomes self-auditing.** A chief or director can ask
  what the structure actually permitted last quarter and get a dated,
  count-reconciled answer from the records — no new declaration, no new
  process, nothing stored.
- **The matrix report gains a panel with no new schema.** `concordance` is
  added to the existing report object; the brief carries one identity-free
  clause; CSV scope #108 exports the counts. No collection, node, relation,
  rule, event, action or setting changes; `SCHEMA_VERSION` stays 121.
- **The matrix terminal is reachable again.** Registering the missing
  right fixes a shipped defect that made the module's reads refuse for every
  seat, not just for the ones a test happened to exercise.
- **Honest limits, printed where a reader needs them.** The panel prints the
  scope counts before any finding, states which conventions it applies (the
  operational-rights consultation rule, the multi-line subject scope, the
  roster-as-of-today caveat), and refuses to guess a subject or map a name
  it cannot resolve.
- **What this does not do.** It does not check the *quality* of a decision,
  does not reconstruct historical roster state, does not read decisions made
  outside LeadOS, and does not widen a seat sideways. Seats remain workflow
  declarations, not authentication.
- **What would make us revisit this.** A declared convention that operational
  consultation should also cover stewardship rights, or a subject-resolution
  route through a record type the graph does not yet write, would change what
  the module reads; both are conventions to decide in the open, not silently
  in a patch.

## Evidence

`tests/app/rights-concordance.test.mjs` — **27/27 PASS** (`node --test`),
covering the four identities on a mixed workspace, subject resolution through
typed edges (case owner and direct person link), the unscoped / dangling /
ambiguous / unresolved-decider limits, the single-line scope boundary,
date-windowed line rights (declared-after and ended-before exclusions, and
the presumed home rights), all four findings with their exact negative
cases, seat withholding and the full-access seat, the byte-identical
no-write check, CSV round-trip equality with no person, name or id in any
cell, the inert single-chain workspace, the axe-clean JSDOM panel render,
panel registration, and the store-backed API carrying the concordance.

The build pass caught two real defects, both fixed in place: the CSV export
indexed the finding rows' kebab-case keys against the counts' camelCase
accumulators (only `bypass` matched by coincidence; the other three kinds
printed 0 — the mapping is now declared once, with the comment recording
that the export must never print a zero for a kind that fired), and the
missing `declare-matrix-line` registration above.
