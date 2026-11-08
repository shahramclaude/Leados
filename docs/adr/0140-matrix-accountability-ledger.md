# ADR-0140: The Matrix Accountability Ledger

- **Status:** accepted
- **Date:** 2026-11-08
- **Deciders:** LeadOS session 189 (matrix-structure rotation)

## Context

LeadOS modelled an organisation as a **tree**. `person.managerId` is a single
pointer, `buildChain` reads it into a rooted acyclic graph, and every roll-up in
the workspace is a property of that tree: ownership by lowest common ancestor
(`responsibleNodeId`), span of control, the seat's disclosure ladder, the
automation fan-out (`RULE-SEAT-01`), the Jaques altitude clock.

A tree cannot express the structure most organisations above a few hundred
people actually run. An engineer with a functional manager, a project manager
and a product lead is not an edge case — she is the normal case in any matrix,
and she has been invisible to every roll-up in the product.

Measured against the shipped code before this change:

- `grep -i matrix` over `app/core/domain/` returns only linear algebra
  (Cholesky, design matrices), 2×2 grids (Mendelow) and the Hoshin X-Matrix.
  There is no second reporting line anywhere in the model.
- Every module resolves "who owns this" through `buildChain`, whose answer is
  unique **because a tree has exactly one path to the root**. Add a second line
  and the same question has two defensible answers.

The three questions that follow, none of which the workspace could ask:

1. **For the person:** "I am accountable to three people. Does it add up to more
   than me?"
2. **For each manager:** "She is mine — but she is three other people's too.
   What share of her do I actually hold?"
3. **For the enterprise:** "Add up every manager's span. Does it equal the
   headcount, or did the matrix count the same person twice?"

The third is the one no single-chain tool can answer, and it is the one that
decides whether the first two can be trusted.

## Decision

Add a **matrix layer over the existing tree**, not a second hierarchy engine.

- `person.managerId` remains the home line and the source of truth. It is not
  copied, not re-declared and not migrated. A workspace that declares no
  additional line gains no edges, no decisions and no behaviour change of any
  kind — verified by test ("a single-chain workspace is untouched").
- `reportingLines` (Schema v119) stores **only** the human act: this person is
  also accountable to that manager, on this kind of line, for this many
  hundredths of their capacity, holding these decision rights, from this day
  until that day. `matrixMarkers` is the rule's idempotency ledger.
- Every total, every span attribution and the reconciliation itself are
  **derived on read**. Storing a roll-up is how a number drifts from the number
  it reports.

### Allocations are integers

A share is declared as a whole percentage and held as **whole hundredths**.
Every sum in the engine is therefore an integer sum. This is not a stylistic
choice: a ledger a chief will act on is not allowed to be off by a rounding
error it cannot show.

### Two claims, never one word

The reconciliation publishes two **separate** booleans:

- `balances` — the allocations **add up**: every attributable person's shares
  total exactly 100, so declared accountability equals headcount.
- `auditClean` — what is **printed** is what is **computed**: the headline net
  error equals the sum of the printed per-person deviations, and the manager
  fan-out equals the person total exactly.

An earlier draft exposed a single flag named `reconciles`. That name let a
reader hear "it adds up" from a ledger whose net error was `+0.30`, because
`auditClean` was true while `balances` was false. Two facts, two words.

### Attribution is all or nothing

- A person on **exactly one** line owns the whole person to that one manager.
  100 is derived by arithmetic, labelled `sole-line`, and printed as derived.
- A person on **two or more** lines with any allocation missing is attributed to
  **nobody**. Filling the hole evenly would be inventing an agreement; and
  attributing the lines that *do* carry a number would give a manager a figure
  the ledger has already refused to support. This was a real bug caught by the
  suite and fixed.

### Decision rights are attributed, not assumed

Six rights (priority, assignment, technical direction, performance assessment,
pay, absence approval) after RAPID (Rogers & Blenko, 2006) and RACI. A right
held by two managers is `contested`; a right held by nobody is `unowned`. The
register records both and adjudicates neither — both are properties of the
structure, not of any individual.

The home line is **presumed** to hold pay, performance assessment and absence
approval (`MATRIX_HOME_RIGHTS_DEFAULT`). This is a declared, printed convention:
forcing a leader to re-declare those three for every dual-line person would
guarantee the register is never filled in, and an empty register is worse than a
declared presumption. The presumption is labelled on every row it affects and is
outvoted into a contest the moment any line declares one of those rights.

## Consequences

### What the engine refuses

- **Netting.** Over-allocation on one line is never offset by under-allocation
  on another. A test pins this: Sam at +40 and Kim at −40 sum to zero, and the
  ledger still reports one over-committed person and one under-allocated person.
- **Guessing an owner.** Work touching a person with three managers is fanned to
  all three (`RULE-MTX-01`). Choosing one silently is a decision the system is
  not entitled to make, so the ledger names the ambiguity instead.
- **Repairing a bad line.** A self-line, a duplicate home declaration, an
  unparseable allocation and a line that would close a loop are each refused
  with a printed reason. Inventing a reporting line is inventing an
  accountability.
- **Deleting a row.** A semantically impossible row (a person reporting to
  themselves, a line ending before it starts) is **kept in storage** and
  reported on the Review panel. Deleting it at load time is data loss, and it
  would vanish with only a console warning.

### Disclosure

Above the declared detail ceiling (rank 4) a manager row is disclosed as counts
and a band, never as a named person with a named allocation. In the CSV and the
brief, a manager row below the cell floor is withheld with its reason. **No
person is ever named in an export row** — an individual's allocation is item
detail about an individual.

### Integration

`matrixRule` (RULE-MTX-01) is registered on `DEFAULT_POST_COMMIT_RULES`
immediately **before** `seatRule`, so one atomic transaction carries both the
primary-tree fan-out and the additional-line fan-out, and `sealRule` attests
both in one seal. It is marker-idempotent, pausable by `matrixAutoPropagate`,
and **inert in a single-chain workspace** (pinned by test). A confidential
source contributes a count and never an edge: a second manager is not a wider
audience for a sensitive people record.

## Verification

New suite `tests/app/matrix-accountability.test.mjs`, **23/23**, including the
display-versus-stored-data check the standing brief requires:

- Both reconciliation identities as exact integer equalities, including the
  case where the audit is clean and the ledger still does not balance.
- The CSV's `attributed_h` and `net_fte_error_h` equal the report's computed
  values, and no export row names a person.
- The brief never says "reconciles exactly" when the net error is non-zero.

Adjacent suites across everything the change touched (schema, store, CSV,
command chain, operating seat, propagation ledger, cases automation, workspace
navigation, typed links, disclosure compiler, export disclosure): **142/145**,
with the 3 failures **re-confirmed pre-existing on a clean worktree of the base
commit** (`schema v82 is additive`, `savepoint: copy-on-write`,
`collapse: the whole real chain`).

`npm run check:boundary` PASS (595 modules / 186 suites / 23 doc checks, 0
leaks). `npm run check:links` PASS.

## Honest limits

- The allocation is a **declaration**, not a measurement. The engine does not
  check it against anyone's calendar, and it says so.
- A person with no declared allocation contributes nothing to any manager. The
  workspace total therefore under-reports where leaders have not filled the
  register in — deliberately, and the undeclared count is printed on the desk.
- `balanceHundredths` (5) and `expiringDays` (14) are declared conventions,
  printed and re-declarable, not measured optima.
- Seats remain workflow declarations, not authentication.
