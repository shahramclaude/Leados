# ADR-0092: The Differencing Defender — a table can be safe while a series of tables is not

**Status:** Accepted (Session 132, 2026-11-05) · Schema v96 (additive `95 → 96`) · `#/differencing` · `RULE-DFR-01..04` · CSV scope #87
**Supersedes nothing. Closes the temporal half of the axis [ADR-0091](0091-aggregate-determinacy.md) left open.**
**Serves:** frontline → chief, with an explicit reading at each of the five altitudes.

---

## The gap, in the roadmap's own words

ADR-0091 closed the VERTICAL axis of statistical disclosure control: one published
table, one moment, every printed total checked by exact integer arithmetic. Its
honest-limits paragraph then named what it had not done:

> "the TEMPORAL half of differencing: the same aggregate released again later with a
> different suppression pattern … plus reorganisation comparability across a freeze
> line."

That was not a theoretical remainder. It was a live exposure, and the oldest attack
in the field needs no cleverness from the attacker:

```
Release 1      span A 6 · span B withheld · total 7      7 − 6 = 1
Release 2      span A 6 · span B withheld · total 9      B grew by exactly 2
Child span     span A 6 · sibling withheld · total 6     the sibling is 0
```

Each of those tables can pass a per-table guard, because the arithmetic that breaks
them is spread across PAGES, SEATS, MODULES and DATES. No guard on one page can see
it. LeadOS ships a scoped aggregate renderer at every altitude ([ADR-0086](0086-disclosure-compiler.md)),
so the cross-altitude form of this attack is reachable with two clicks in the product
as it stood.

## The decision

**The release is the unit of disclosure, not the table.**

Every published aggregate becomes a dated, identity-reduced row in a publication
register, and the register is audited as ONE integer system:

- one variable per (span, measure, day);
- every printed cell a constant;
- every withheld cell a box justified only by what the withholding itself reveals;
- every published total one linear equation.

A withheld value the system admits at exactly one integer is **determined** — it was
never printed and arithmetic handed it back, which is the same disclosure with a
longer proof. It is reported as a **coordinate and a proof**, never as the number.

## Why the solver is trustworthy

The decision procedure has two passes:

1. **Bound propagation to a fixpoint.** Substitute pins, tighten every remaining box
   against every equation. Pinning is exact: a collapsed interval leaves no room for
   a second integer.
2. **Bounded integer elimination.** Two equations sharing a variable combine into
   their integer-scaled difference — a valid implied constraint with one fewer
   unknown. This is what collapses a differencing chain (`total₁ − total₂`,
   `parent − child`, `module A − module B`) into a single-unknown equation.

The pass is deliberately **conservative in one direction only**: interval narrowing
over a system can miss a pin, never invent one. A false "safe" is a disclosure; a
false "unsafe" is one suppressed table. That asymmetry is the design.

**It is validated against a brute-force enumerator**, not against intuition.
`tests/app/differencing.test.mjs` enumerates every integer assignment inside the boxes
of 400 random integer systems and requires the solver's every pin to be the unique
feasible value. **This oracle found two real bugs before the feature shipped:**

- the interval formula was applied to negative coefficients as if they were positive
  (334 unsound pins);
- infinite bounds were mishandled under negation once coefficients went negative
  (404 unsound pins).

Both would have produced confident, wrong disclosures. The oracle stays in the suite.

## Time: the modelling decision that made or broke it

A span's record count is a **stock**. "lead2 had 1 open case" on 1 November and
"lead2 had 3" on 8 November are two observations of one span, not a contradiction.
Treating them as one variable let the solver conclude `1 = 3`, declare the register
INCONSISTENT, and conclude nothing — the exact failure the module exists to prevent.
So the variable is `(span, measure, day)`, and the only cross-day relation the auditor
asserts for free is the one a reader can make: **the printed change between two dates**.

- A pin inside one day is `same-day-arithmetic` — textbook subtraction.
- A pin across days rests on continuity and is labelled `cross-day-continuity-assumed`,
  because the exact cross-day relation needs to know nothing closed, opened or moved
  in between. That assumption is printed as a limit, never resolved silently.

A related rule, inherited from ADR-0091: **a determined zero is not a disclosure.**
Nothing about a person is learned from "there were none", so three spans with zero
overdue load must not be reported as three leaks.

## The planner: buy safety at the lowest information cost

Before publication the planner reads the module's own aggregate (ADR-0091's
`moduleAggregate`) and tries suppression patterns from cheapest loss to greatest:

| # | Pattern | What it removes |
|---|---------|-----------------|
| 1 | `stable` | nothing — keep the pattern the module used last time |
| 2 | `cells-one` | one more small cell (complementary suppression) |
| 3 | `cells-two` | two more |
| 4 | `totals` | every published total, keeping all printable cells |
| 5 | `both` | the totals and one further cell |
| 6 | `refuse` | nothing is published |

**`refuse` is a real product outcome, not a bail-out.** Reprinting the same total over
time leaks the change between the dates however the cells are suppressed, and no
suppression pattern can fix a reprinted stock. When the arithmetic says so the honest
behaviour is to stop the publication and hand the leader the structural remedy:
*publish a change instead of a level.*

A second release of the same table on the same day from the same seat is **refused by
construction** — that is the pairwise differencing attack, and it is not something to
audit afterwards.

## Cross-module and cross-altitude propagation

`RULE-DFR-01..04` run on the shared post-commit spine ([ADR-0008](0008-post-commit-rules-hook.md)):

| Rule | Effect |
|------|--------|
| `RULE-DFR-01` | The release becomes a graph node with `summarizes-span` edges to the seat that published it **and to every leadership ancestor above it**, in the same atomic transaction. A publication nobody above can see is a publication the house cannot defend. |
| `RULE-DFR-02` | A determined value opens **exactly one** governed decision per module per ISO week, owned at the altitude that can change the publication practice, carrying the coordinate and the proof — **never the value** — with `proves-release` provenance to every release that took part and `rolls-up-to` edges to every ancestor. |
| `RULE-DFR-03` | A protected release owes one owned task explaining which figure was removed and which spans it protected. |
| `RULE-DFR-04` | A non-stationary published series opens the publication-rhythm decision, with both stationarity statistics printed. |

Altitude is therefore another dimension of the existing event-driven architecture,
not a second system — which is the §0.3 mandate expressed in code.

## The diagnosis, and why it is not a bigger floor

When repeated publication is what leaks, raising the small-cell floor does nothing.
The module reads the module's published totals with two named tests:

- **Wald–Wolfowitz runs about the median** — catches monotone drift and clustering.
- **Buishand range** — catches a single level shift (a reorganisation, a policy change).

Both refuse below a declared point floor rather than printing a confident trend from
three points. They are deliberately different tests because they fail differently: a
steady ramp has no *step*, and Buishand correctly declines while the runs test fires.
A first implementation of the Buishand statistic divided by the sum of squared
deviations, which *shrinks* as a series lengthens and gets trendier — a ramp scored
lower than noise, exactly backwards. The tests caught it; the statistic is now the
standard range-over-standard-deviation form whose published 5% bound is printed
beside it.

## Five altitudes, five questions

| Altitude | The question | What they may hand upward |
|---|---|---|
| Frontline | "Did I just put a number in a deck that hands back a blanked cell?" | A table that states what it withheld and why |
| Manager | "Across my last several releases, does any pair determine a value?" | The module to change, with the proof |
| Director | "Which modules published the same day at two altitudes, and which sibling does the gap expose?" | A dated statement of which practices are safe |
| VP/exec | "How much of the portfolio's published surface is provably free of inferential disclosure?" | A bounded share with its interval, refused below the floor |
| Chief | "Is every figure this house publishes provably undetermined by arithmetic?" | A dated, aggregate-only certificate |

## Rejected alternatives

- **Differential privacy / noise injection.** The workspace's promise is exact
  arithmetic over its own records. Adding noise to a board figure trades a proof for
  an ε nobody in the building can interpret, and it does not answer "is THIS number
  recoverable".
- **Per-table guard only.** It is what shipped, and it is the bug.
- **Assuming continuity across days to claim a cross-day leak.** Inventing evidence.
  The assumption is printed instead.
- **Printing the recovered value on the warning screen.** It would make the screen the
  disclosure it is warning about. The screen prints the coordinate and the proof.
- **Auto-reprinting a protected table.** The engine proposes; a human publishes.
- **Rating or naming anyone.** A finding is about a PUBLICATION.

## Honest limits

1. **Not authentication.** Local seats are auditable declarations, not identity. The
   register covers publications made inside THIS workspace; a figure published from
   the same data elsewhere cannot be seen or defended by it.
2. **Not differential privacy.** This is exact integer determinacy over what was
   published. It says nothing about auxiliary data, timing side channels or external
   releases.
3. **Conservative by construction.** A value that a cleverer proof would pin but
   interval narrowing misses is reported as undetermined. The audit is sound in the
   direction that matters and incomplete in the direction that suppresses a table.
4. **Non-linear statistics are outside the model.** `oldestDays` is a max, not an
   additive cell; it is excluded and documented rather than treated as safe.
5. **Cross-day inference beyond a printed change needs its continuity assumed**, and
   every such finding says so.
6. The full application was not semantically re-read line by line; untouched surfaces
   remain `[UNVERIFIED]`.

## Consequences

- `SCHEMA_VERSION` 95 → 96, additive, with no publication invented for an existing
  workspace. An empty register means "nothing has been published from here yet",
  which is *not* the claim "nothing published was unsafe", and the screen says so.
- Two new collections (`differenceReleases` and `differenceMarkers`),
  one graph node (`differencingrelease`), two relation types (`proves-release`,
  `protects-release`), two action rights (`publish-aggregate` at every rank,
  `govern-differencing` at director+), one manifest row, one CSV scope (#87).
- The module catalogue and the shell stay 1:1 at 101 routes, and the
  [ADR-0086](0086-disclosure-compiler.md) leak oracle now paints sentinels through
  this surface at four altitudes.
- **A pre-existing defect was repaired in passing:** `LINK_ENTITY_TYPES` declared
  `carryover` twice, so the types-↔-collections exhaustiveness invariant ADR-0090
  asserts had been silently broken on `main`. The registry is now 90 ↔ 90 with no
  duplicates.
