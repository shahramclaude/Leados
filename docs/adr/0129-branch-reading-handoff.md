# ADR-0129 — The branch reading hand-off (Schema v118, Session 175)

**Status:** Accepted · **Date:** 2026-11-07 · **Supersedes:** nothing · **Extends:** ADR-0126, ADR-0127, ADR-0128

## Context

ADR-0126 put a disclosure floor on the direct-branch comparison. It works: a
cell describing fewer contributing seats than the declared floor prints
`WITHHELD` with its reason, one further released cell is withheld beside it so
the blank cannot be recovered by subtraction, the pooled rate is refused
outright whenever anything is withheld, and the CSV exports BLANK rather than
zero. The chief's table became safe to hand to a board.

It also became blind. A withheld branch now carries **no continuity signal at
all**: the chief reviewing cross-division exposure either guesses, walks the
corridor, or asks an analyst to read the file out of band — which is exactly the
disclosure the floor was built to stop, minus the record of who asked.

ADR-0126's own flagged limitation said so: *"A withheld branch's continuity
problem is invisible in that table, and there is no in-product route from a
withheld cell to that branch's own register yet."*

The missing piece is the one the floor forces into existence: a **governed
hand-off**. Suppression protects the figure by destroying the reader's access to
it; the standard remedy in disclosure control is a coarser release, requested
and granted through a channel — with the requester and the releaser kept apart.

Named frameworks:

- **Primary + complementary cell suppression** (Willenborg & de Waal 2001) —
  protects the figure and destroys analytic value; a governed coarser release is
  the release-side remedy, not a way around the floor.
- **Subsidiarity** (Aghion & Tirole 1997; the ADR-0075 ladder) — the seat that
  holds the detail answers for releasing it. The chief never reads the cell; the
  branch's own leader states its condition.
- **Kahn (1990), Weick & Sutcliffe (2007)** — a signal nobody is asked for is a
  signal nobody gives. A blank cell and a healthy branch looked identical.
- **Edmondson (1999)** — a decline that is safe to give is why a published
  reading can be believed.

## Decision

Add a **branch reading** as a two-sided, dated, append-only exchange between the
seat whose table withholds a cell and the leader of the branch that cell
describes.

### What is stored

Two new collections (Schema v118, additive; both start EMPTY at upgrade):

`branchReadingAsks` — the chief's act: the target seat (a **direct** branch,
one level down), the asking seat, the day and instant, the asking words, and
`open` / `withdrawn` with the withdrawal day and reason.

`branchReadings` — the branch leader's answer: the ask it answers, the branch it
is about, the answering seat, `published` or `declined`, the **derived band**
frozen on the day (published only), the answerer's own words, and
`active` / `revoked` with the revocation day and reason.

Never stored: a count, a rate, a percentage, a per-duty figure, the derived
state, or a reminder. The band is the whole disclosure; the counts behind it
stay in the branch's register, which is the reason the cell was withheld.

### The band is derived, never typed

`branchReadingPublish` **accepts no band at all**. It computes the band from the
acting seat's own register at that instant —

- `exposed` — at least one duty line has nobody answerable or a cover that
  cannot answer at this altitude;
- `thin` — every line has an eligible cover, but at least one has no recorded
  exercise inside the declared window;
- `holding` — every line carries an eligible, exercised cover;
- `unknown` — the seat declares no register at all.

— and freezes it with the day. A form cannot set a reassuring band, and the
publisher is shown their own counts before publishing so they know exactly what
they are reducing to one word.

### The states are derived, never stored

`not-asked` · `asked` · `overdue` · `published` · `declined` · `lapsed` ·
`withdrawn` are re-derived on every read from the two ledgers, the declared
windows and today:

- the ask is `overdue` after `dutyCoverageReadingResponseDays` (default 5);
- a published band `lapses` after `dutyCoverageReadingValidDays` (default 30) —
  a reading about July is not a reading about September, and a stale band is
  more dangerous than a blank because it looks like a signal;
- a **revoked** answer is invisible: the cell falls back to `asked` or
  `overdue` rather than keeping a band nobody still stands behind.

Both conventions are printed, clamped, and re-declarable only by the rank-4+
**full-access** seat that declares the disclosure floors — they are the same
governance question.

### Refusals, printed

- The ask goes **one level down** to a direct branch: a chief asks the director,
  the director asks the manager. Skipping a level asks a person who does not hold
  the numbers to answer for them (`subsidiarity`).
- The **requester cannot answer their own ask**, a peer cannot answer a
  sibling's, and the full-access operator cannot answer at all — it has no
  register of its own. Enforced in the action **and** again by the fail-closed
  schema on reload, which drops a third-party answer, an orphaned answer, an
  answer dated before its ask, a published reading with no band, an invented
  band, a refusal carrying a band, and a wordless answer — each with its reason
  printed.
- **One open ask per branch per seat.** A second ask is a duplicate, not a
  reminder; withdraw first.
- A **decline opens no governed decision.** A refusal that escalates itself is
  not a refusal, and a director is allowed to say "not this one, ask me
  directly". The chief's cell prints `DECLINED` with the reason and the day, and
  the brief counts it — never a blank.
- No reminder, no chase, no auto-reassignment, no lift of the floor.

### Wiring

One atomic `store.update` per act:

- ask → row + `requests-reading-from` edge to the branch leader + one
  `rolls-up-to` edge per span above the **asker** + audit event;
- answer → row + `answers-reading-ask` edge to the ask + one `rolls-up-to` edge
  per span above the **branch leader** + audit event.

Both node types (`branchask`, `branchreading`) are first-class graph types in the
shared link registry, so the hand-off travels the general propagation spine
rather than a private table.

The register carries the derived state on the withheld cell (`branches[].reading`
plus `branchCoverage.readings` counts), the upward brief carries a counts-only
line with no figure and no name, the CSV gains four per-cell columns and five
summary counts (BLANK, never zero), and `dutyCoverageAttentionCount` adds an
overdue ask the acting seat **owes** and a **lapsed** reading on its own table —
an ask still inside its window is a normal Monday and is not counted.

## Consequences

- A withheld cell is no longer a closed question: the chief has a route, the
  branch leader has a surface, and the exchange is dated and auditable.
- The withheld figure stays withheld. A band is a statement about a branch, not
  a rate about people, and the counts never cross.
- The signal can still be refused. That is a feature: the alternative is a chief
  who assumes silence means healthy.
- Structural inference is unchanged: a roster holder can still map "Branch 2" to
  a unit. This is suppression plus a governed release channel, **not**
  differential privacy.
- Seats remain workflow declarations, not authentication: a local operator can
  switch into the branch chair and publish. The schema refuses that answer on
  reload for every other seat, and the act is audited — it is not cryptographic.
- The shared `resolveLinkedEntity` resolver has no case for the coverage-family
  node types (including these two), so a propagation row naming one renders as
  an unresolved reference. Pre-existing for ADR-0121/0122/0127/0128; flagged, not
  hidden.
