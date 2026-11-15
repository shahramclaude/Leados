# ADR-0211: Capital Rationing & Funded-Set Register — Which Set Actually Fits the Money We Have?

Date: 2026-11-15 · Session 280 · Schema v165 (additive: `capitalCeilings`, `capitalRelations`, `capitalRationingMarkers`) · Status: Accepted

## Context

The Investment Case Register (ADR-0208) appraises cases properly. It discounts
every flow at the declared hurdle, computes a net present value to the cent, a
profitability index, an IRR guarded against multiple roots, and it refuses to
guess when a case's flows do not resolve.

Then it stops. Its own panel says so, in the code, at
`app/views/financeInvestmentCasePanel.js:498`:

> proposals are ordered for rationing but not cut off against a declared capital budget

And `app/core/domain/investmentCase.js:452` does exactly that: it orders the
ratified cases by profitability index. Ordering is not selecting. A workspace
could answer "which case pays back fastest per krone committed" and could not
answer the only question a CEO with a fixed envelope actually has:

> **Given this much money, which cases should we fund — and what does each one we
> exclude cost us?**

Every company has a capital budget. Almost every leadership workspace models the
*allocations* and never models the *constraint*. The consequence is familiar and
expensive: the case list is ranked, the top cases are funded in order until the
money runs out, and everybody assumes the result is optimal. It is not. Ranking
by ratio is the greedy heuristic for a knapsack problem, and the greedy heuristic
is provably wrong whenever a case is heavy and slightly efficient, or when two
cases cannot both be funded and one of them is individually cheaper.

And there is a second, sharper failure the ranked list cannot express at all:
**cases are not independent**. Two business lines propose two ways to get the same
extra capacity. One line's warehouse only pays back if the other line's machine is
built. A shared energy saving will be booked by two cases at once. A ranked list
of independent numbers has no way to say "at most one of these two" or "only if
that one" — so it silently funds both, or silently funds neither, and the total it
prints is a number nobody can achieve.

## Decision

Build capital rationing as its own register, with an **exact** solver, an explicit
relation ledger, and a printed refusal where the answer is not knowable.

**The problem is solved exactly, not approximately.** `capitalRationingMath.js`
runs depth-first branch and bound with a fractional (LP-relaxation) bound, in
exact integer arithmetic on `BigInt` scaled values rather than floating point. The
money is whole cents, so an answer is either right or it is not right. A search
that exhausts its declared node budget returns `proved: false` and **no
selection** — a set that a better set might beat is a guess wearing a table, and
the register prints the refusal instead. The one honest claim available here is
"this is the maximum over every feasible set, and here is the bound that closed
the gap", so that is the only claim the screen makes.

The kernel is validated against brute force over 900 randomised problems in the
test suite, including ~450 that carry declared relations. That check found three
real defects while this session was building it; it is the reason the "proven
optimal" label can be trusted.

**Cases are related by human declaration, never by inference.** Three relation
kinds, exhaustive and mutually exclusive:

- `exclusive` — alternatives; at most one may be funded. Symmetric.
- `requires` — the first's benefit is contingent on the second being built.
- `overlap` — a declared share of one case's benefit is also booked by the other,
  stored in whole basis points, deducted **only when both ends are funded**.

An overlap of exactly 100% is refused by name as an alternatives declaration,
because a wholly shared benefit is exclusivity and calling it a share would let
two cases both claim the same kroner. A share of 0% is refused as "not a
relation". A duplicate declaration is refused, because two rows declaring one fact
would each deduct their own share and understate the funded set's value twice.

**Currencies are never pooled.** DKK and EUR are two problems with two ceilings
and two shadow prices. Converting one to the other to make a single table would
manufacture a figure no record supports, so the register solves per currency and
prints the refusal that says so.

**The shadow price is the exact finite difference.** What one more unit of ceiling
is worth is computed by re-solving at ceiling + step and subtracting — not by a
duality estimate. Where the ceiling does not bind, the honest price is exactly
zero, and zero is printed. Where either solve is unproven the price is `null` and
printed as blank, never as a number derived from an unproven pair.

**The register refuses rather than invent the ranking.** Six declared states, one
reason on the screen at a time: `optimal`, `node-budget-exhausted`, `too-many-cases`,
`no-ceiling`, `no-candidates`, `unpriced-candidates`. A currency with ratified
cases and no declared ceiling is `no-ceiling` and prints **no set** — every case
in it fits trivially, which is an arithmetic fact and not a decision. A candidate
whose value cannot be read withholds the whole set rather than being priced at
zero, because a case treated as free is always selected. And where two live
ceilings both cover today and disagree, the register prints both, marks the
constraint ambiguous and sets `figuresComplete: false`, rather than picking the
larger one and calling the result the budget.

**Authority is matrix-native.** Reading is open to every altitude, scoped to the
cases whose benefit owner sits in the seat's span. Declaring a ceiling is a VP /
C-suite act (`declare-capital-ceiling`, minRank 4) — it is a claim on the
enterprise's own money, not a manager's act. Declaring a relation requires a seat
above **both** cases' benefit owners through the tree or a declared matrix line,
resolved once by `buildMatrix`; a seat holding only one side is refused at the
action level even if the rank is sufficient, because the person who can see both
promises is the only one who can rule that they are alternatives.

`RULE-CRS-01` is spine rule 130/130 with its own propagation contract. It has one
condition — `ceiling-missing`, a currency holding ratified candidates with no
ceiling covering today — files at most one dated ask per condition per
(currency, condition) signature `crs1:…`, capped at 4 per commit with the
remainder counted, and sends it to the LOWEST SEAT ABOVE EVERY reporting line that
holds the altitude, never to a candidate's benefit owner. Where that seat is the
workspace leader, the lines share no single apex, or nobody is left on the roster,
it writes one identity-free `capitalRationingMarkers` observation and asks nobody.
It is pause-governed on every path including the explicit scan, it never funds a
case, never declares or retires a ceiling, and never rates a person.

## Consequences

- The workspace can now answer the actual question. On the session's own fixture
  the proven set beats the shipped profitability-index ranking by 319,073.98 DKK
  — 51.7% more value from the same ceiling — and that gap is *printed*, as
  `rank_order_gap_cents`, rather than left for the reader to discover.
- "Optimal" is a load-bearing word here, so it costs something: a node budget, a
  certified size limit, and a refusal path that the screen shows instead of a
  table. The register is slower than a sort and honest about when it cannot be.
- The relation ledger is a new place for humans to be wrong. Declaring a relation
  is an authority act; it is audited, dated, retired with a reason and never
  toggled. Nothing infers one.
- Migration `164 → 165` adds three EMPTY collections and two conventions. No
  ceiling is inferred from the budget envelopes an upgraded workspace already
  holds, because a budget envelope is a plan and a capital ceiling is a
  permission, and inventing one would silently start rationing money nobody said
  could be rationed.

## References

- ADR-0208 — Investment Case Register (appraises the candidates; this register
  selects among them)
- ADR-0210 — Conflict-of-Interest & Recusal Ledger (rule 129/129; this is 130)
- `app/core/domain/capitalRationingMath.js` — the exact kernel
- `app/core/domain/capitalRationingRules.js` — `RULE-CRS-01`
- `docs/adr/TEMPLATE.md`
