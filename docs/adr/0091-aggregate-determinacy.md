# ADR-0091: The Subtraction Test — a withheld cell is only withheld if it cannot be recovered, and the check is exact

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 131 (no schema bump, no new rule, no new collection: this changes a computed read model only)
- **Related:** [ADR-0086](./0086-disclosure-compiler.md) (the Disclosure Compiler and the aggregate), [ADR-0076](./0076-operating-seat.md) (the seat), [ADR-0090](./0090-programme-federation.md) (programme federation suppression), [ROADMAP](../../ROADMAP.md)

## 1. Context

The Disclosure Compiler replaced 84 blanket refusals with a per-route posture. Above its detail ceiling a route becomes an **aggregate**: counts and loads per child span, a total, and small cells withheld below `disclosureCellFloor`. The complementary suppression rule was this:

```js
const visible = spans.filter((b) => !b.withhold);
if (suppressed.length && visible.length > 1) {
  visible[visible.length - 1].withhold = true;   // hide one more
}
```

That rule was believed to make the total non-differenceable. It does not, and the failure is not exotic. With **one** sub-floor cell and **one** printed cell, `visible.length > 1` is false, so nothing further is hidden — and the published total silently returns the withheld value:

```
span total 7  − printed cell 6  = the withheld cell        1
severity 57   − printed 48      = the withheld cell's      9
```

A withheld count of one beside a severity of nine is a person. The value was never printed; it was **determined**, which is the same disclosure with a longer proof. Reproduced against the shipped code before writing a line of this ADR (a director seat, one six-record span, one one-record span).

Two further properties of the counting rule are wrong in the same direction:

- It counts cells, not arithmetic. Three cells withheld at 4, 4, 4 against a floor of 5 and a printed total of 12 are **all exactly 4** — no cell is "one more to hide" because every cell is already hidden, and the counting rule has no idea the table is fully pinned.
- It protects one measure and publishes three. The aggregate prints the record count **and** open load **and** overdue load, each with its own total. Hiding a cell's count does not hide its open load: `totals.open` is one equation over the same unknown.

## 2. Decision

The published surface is now modelled exactly, and the suppression pattern is derived from that model rather than from a count of cells.

### 2.1 The model (what a reader legitimately has)

For each printed measure *m* ∈ {record count, open load, overdue load}:

- every **printed cell** contributes a known constant — its printed value;
- every **withheld cell** contributes an unknown integer in a box that the withholding itself reveals: a sub-floor cell has `count < floor`, and `open ≤ count`, `overdue ≤ count` because an open record is a record;
- the **printed total** is one equation `Σ_m = total_m` over that disjoint group.

Because each measure is one equation over a disjoint group of independent integer boxes, recoverability is closed-form and exact — no solver, no floating point:

```
lo_min = max(lo, S − Σ(hi of the others))
hi_max = min(hi, S − Σ(lo of the others))
recoverable  ⇔  lo_min == hi_max  and  that value > 0
```

A pinned **zero** is not counted. "Nobody was overdue" discloses nothing about a person, and treating it as a leak would suppress a table to protect nothing.

### 2.2 The policy (what the guard does about it)

`planAggregateSuppression` hides the **smallest surviving cell** first — standard complementary suppression, and the cell whose printing costs the reader least — and keeps the published total, because the total is the number a leader actually asked for. Only when nothing printable is left (the 4/4/4 saturation above) does no partner help; then the **total** is withheld, because a withheld total cannot be subtracted from anything. A total that disagrees with the cells beneath it is withheld rather than resolved by guessing which side is wrong.

### 2.3 The proof is separate from the decision

`moduleAggregate` re-audits exactly the figures it is about to print, from the rows as they now stand, and ships the verdict on the object:

```js
guard: { verdict, recoverableN, inconsistentN, checkedMeasures, withheldTotals, line }
```

The console prints `N cell(s) withheld, 0 recoverable by subtraction` beside the aggregate and repeats the sentence in the notes; the downloaded brief carries the same sentence. If the planner and the audit ever disagree, the screen prints the disagreement instead of calling the table safe.

## 3. What this changes, and what it deliberately does not

**Changed:** `app/core/domain/aggregateDeterminacy.js` (new, pure); `moduleAggregate` in `app/core/domain/disclosure.js` now decides suppression through the guard and returns `guard`; `disclosureBriefText` states the determinacy result; the console's aggregate subtitle shows withheld vs recoverable. No stored shape, setting, rule, collection or CSV scope changes — the read model moved, so `SCHEMA_VERSION` stays 95 and no migration is needed.

**Not changed, and stated rather than implied:**

- **Extremum disclosure.** `oldestDays` is a maximum, not a sum. With one withheld cell it can reveal that some withheld span holds the oldest record — a dated attribute, not a cell value. It is outside the additive model and is documented here rather than silently treated as safe.
- **Money.** Currency totals are additive, but per-cell money is never printed, so no currency total can be differenced. The model accepts a money measure for the day a surface starts printing it.
- **Other modules' local suppression.** `#/escalation`, `#/measurement`, `#/cadence`, `#/concordance` and `#/survival` each carry their own small-cell rule. They are not routed through `moduleAggregate`, so they are **not covered** by this ADR. [UNVERIFIED] individually; the next slice is to route them through the same guard.
- **Temporal (repeated-release) differencing.** This ADR closes the **vertical** axis (a parent aggregate against its children). The **temporal** axis — the same table released again later, with a different suppression pattern — is not addressed here. Audit note from this session: the programme federation's release line is currently **not** differenceable on counts, because every suppressed row still prints its state and no additive total over counts is published; but the same line prints `lastCarriageOn` for suppressed rows, which is a *timing* disclosure for a small span and is now recorded on the roadmap.
- **This is not differential privacy.** It removes exact arithmetic recovery from the printed figures. It says nothing about auxilliary information, and the app does not claim it does.

## 4. Verification

`tests/app/aggregate-determinacy.test.mjs` (10 tests): the oracle names both measures of the pattern the old rule shipped, and the naive subtraction reaches the same number; the shipped aggregate never reproduces it; complementary suppression keeps the total when a partner exists; 4/4/4 saturation withholds the total and the audit proves the total really does pin all three; a table with no total is not over-suppressed; a determined zero is not a leak; the audit is independent of the planner and refuses an inconsistent total; every aggregate on every route at five altitudes compiles with `recoverableN === 0`; the brief and the console print the verdict.

The existing disclosure suite (21 tests, including its leak oracle and axe-clean panel checks) passes unchanged.

## 5. Consequence

A leader can now read "3 cells withheld, 0 recoverable" and mean it, and the workspace can defend the sentence with arithmetic rather than with a comment. The cost is honest: where complementary suppression was previously skipped, one more cell is now blanked or the total is, and the screen says which.
