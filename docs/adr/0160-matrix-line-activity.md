# ADR-0160 — Matrix Line Activity Reconciliation: what each declared line actually did

- **Status:** Accepted (Session 221, 2026-11-10)
- **Schema:** v130 unchanged — no collection, no stored field, no migration
- **Surface:** `#/matrix?panel=activity`; CSV scope #120 (`line-activity`, aggregate-only)
- **Altitude / structure:** frontline / mid-manager PRIMARY × matrix; director, VP and CEO read the same figures as a roll-up; single-chain supported and inert

## Context

ADR-0158 (Session 219) prices what each declared line **was charged** across a named
period, in exact integer share-days, and refuses the figure wherever the retained
record cannot prove the window. It answers the arithmetic question. It does not
answer the human one.

Two structures a matrix creates were therefore invisible everywhere in the product:

1. **A silent line.** Declared at 40% of a person, charged share-days for a whole
   quarter, and it originated **no dated act about her at all**: nobody briefed her,
   no manager answered for the share, no term was re-affirmed, not one obligation the
   line left behind was settled. On paper she is 40% theirs. Nobody is doing anything
   with it.
2. **An over-active line.** Declared at 10%, and it originated a larger share of her
   line-addressed acts than every other line together. Its managerial demands arrive
   far out of proportion with the capacity it holds.

Session 219 named the general shape of this ("allocation-to-output reconciliation")
as a Planned item at director / VP / CEO altitude. Building it revealed a structural
fact that changes the design: **a completed work item names the person, not the line
it served.** A person on three lines makes every item she touches reach all three,
and `matrixWorkReach` reports exactly that (`sites` with more than one entry). There
is no field on a work record that says which declaration funded it. Attributing an
item to one line would therefore be an allocation the product invented — the exact
failure this workspace refuses everywhere else.

What the record **does** say exactly is different, and better: which **manager**
originated each dated act, about which **person**, on which **day**. Four collections
already store that, and nothing had ever read them together:

| Collection | Act | Date |
| --- | --- | --- |
| `onboardingLineBriefs` (ADR-0150) | the line told the person what it expects, or declined | `declaredOn` |
| `lineConsents` (ADR-0148) | a manager accepted/declined the share; the person acknowledged it | `decidedOn` |
| `lineReaffirmations` (ADR-0157) | a term was re-affirmed or released; accepted or objected to | `decidedOn` |
| `lineExitRemedies` (ADR-0152) | an obligation the line left behind was retired or carried | `decidedOn` |

## Decision

Add one bounded, pure read model (`lineActivity.js` + `lineActivityRegistry.js`), one
matrix panel and one aggregate CSV scope. **Nothing is stored.** Every figure is
derived on read from the live matrix, the dated declarations, ADR-0158's own
share-day ledger and these four act collections.

### The two sides

- **Declared** — exact integer share-days per priced line, read from
  `buildLinePeriodAllocation` verbatim. This module re-prices nothing.
- **Observed** — dated acts, whose **own recorded day** falls inside the **same**
  named window, placed against the person's priced lines by originating manager.

Both sides are converted to whole **per-mille** of the person's total by an exact
largest-remainder allocation, so both sum to exactly 1000 and the identity is printed
as a claim. A gap beyond the declared band (±200 per-mille) is a finding on the
**line**: `over-active`, `under-active` or `silent-line`.

### Placement classes, each refusal load-bearing

| Class | Rule |
| --- | --- |
| `line` | the originating manager holds exactly one of the person's priced lines — **the only class that contributes to a comparison** |
| `home` | originated by the home manager: counted, printed, never charged to a line (ADR-0158 prices additional lines only; the home pointer moves, ADR-0149) |
| `ambiguous` | the manager holds **two** of the person's priced lines: never assigned to one |
| `unpriced` | the manager holds a line for this person that the period could not price — **the person's whole comparison is refused**, because a part is never compared to a whole |
| `other` | the manager holds no live declared line for the person (skip-level, or an ended line): counted, printed, not this person's line consumption |

### Verdict ladder (single source of precedence)

`refused` → `insufficient` (below the declared floor of 3 attributed acts) →
`unattributable-dominant` (more ambiguous than attributed) → `silent-line` →
`over-active` → `under-active` → `sole-line` → `aligned`. A person reads the worst
verdict present; the registry is the only place the order is stated, so the panel,
the brief and the export cannot disagree about a word.

### What the module refuses to do

- Retune, clamp or propose a declaration. A declaration is a human agreement between
  two managers and, under ADR-0148/0157, an answer the person is entitled to give.
- Assign an act to one of two declarations held by the same manager.
- Compare a share when the declared side is refused, or when an act reached a line
  the period could not price.
- Print a gap or a holder-level rate below the declared floor.
- Rate a person or a manager. Every verdict is about a line; the observed side counts
  dated acts, and acts differ in weight, so the reading is a screening signal about
  **which lines are being run**, not a measure of managerial effort or quality. This
  limit is printed in the panel, the brief and the export.

## Consequences

- A frontline lead can now see, for their own people, which declared lines are
  actually being run and which exist only on paper — before the quarter closes and the
  observation becomes a story about a person.
- Director/VP/CEO read the same figures as a roll-up through the same seat and matrix
  read model (holder rows count lines and people; they never average shares across
  different denominators).
- No new rule was registered: the finding is a reading, and the governed question it
  raises ("retune this line?") belongs to the intake/declaration path, which already
  has its own acts. Recorded as an In Progress remainder rather than smuggled in here.
- **Allocation-to-output against work items remains Planned and is now known to be
  blocked** on a missing capability: work records carry no line attribution. That
  prerequisite is entered in Planned (see ROADMAP Session 221).

## Alternatives rejected

- **Attribute completed work items to lines via `matrixWorkReach`.** Rejected: a
  person's items reach every line she is on, so the reach is a property of the person,
  not of the work. Building on it would have produced a comparison whose inputs were
  an allocation error.
- **Split shared items between lines in proportion to declared shares.** Rejected:
  dividing one piece of work into fractions of itself manufactures the very drift the
  screen is meant to detect.
- **Treat undeclared/unpriced lines as zero activity.** Rejected: an absence is not a
  zero, and it would report a silent line for a line whose declared side simply could
  not be read.
- **Store an act-count snapshot per period.** Rejected: a stored derived figure can
  disagree with the records it came from; every figure here is recomputed on read.
