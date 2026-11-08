# ADR-0136: The span budget exposure roll-up — money is a position per currency, an authority per branch, and a queue, not a list

- **Status:** accepted
- **Date:** 2026-11-08
- **Deciders:** LeadOS session 183 (director / VP rotation)

## Context

`#/finance` renders `budgetsRollup(state)`: a flat, enterprise-wide list of every
budget envelope the acting seat can read, each card printing its own ceiling,
recorded actuals, open commitments, planned pipeline and forecast at completion.
That is the right instrument for **one** envelope. It is the wrong instrument for
the altitude that holds a *set* of them.

The director's real duty is not "which envelopes exist". It is
**"where is the money, in each currency, across the teams I answer for — and which
team is carrying the overrun?"** A VP asks the same question one level up, across
divisions, and adds "what is my quarterly exposure, and is the ledger sound
enough to forecast from?" Neither question had an answer anywhere in the product:

- **No span position.** There was no total of declared ceilings, actuals, open
  commitments, planned pipeline or forecast for a span, and therefore no headroom
  to compare against anything. The stat row counted *envelopes*, not money.
- **No currency separation above the envelope.** Currencies are correctly never
  pooled inside `evaluateBudget`, and the view therefore printed N envelopes in N
  currencies with no position in either.
- **No branch attribution.** A budget envelope is an authority grant to a cost
  centre (`budget.ownerId`), and nothing rolled that grant up the reporting tree.
  A director saw five envelopes and could not say which of their four branches
  held the breach without opening each one.
- **No bounded triage.** The list sorts breaches first, but it is the whole list.
  There is no queue, no cap, and no printed remainder.
- **No honesty about coverage.** An envelope with no ceiling (`limit: null`), an
  envelope with no owner, and a peer division's envelope all looked like rows in
  the same list. Above the declared detail ceiling the seat is owed counts and
  rates, not item detail; nothing enforced that on this screen beyond the
  render-time projection's per-record `full`/`aggregate` verdict.

Two further defects sat in the same path and were reproduced with a probe before
any change:

1. **An absent amount was normalised into zero.** `normalizeBudgets` used
   `nonNegativeOrNull`, which is `Number.isFinite(Number(v))` — and
   `Number(null) === 0`. The write path stores a blank actual as `actualAmount:
   null` and a blank commitment as `committedAmount: null`, so **the first reload
   turned both into `0`**. Consequence: `evaluateBudget`'s `missingActualLines`
   ("spent with no recorded actual") and `unpricedOpenCount` ("open line with no
   committed amount") branches became unreachable for any state that had been
   round-tripped, the rRULE-FIN-03 signal stopped firing, and the commitment
   calibration ledger scored a **fake perfect underspend** (actual ÷ committed =
   0 ÷ C) into the median a leader is asked to trust. This is the defect class
   ADR-0130 fixed in `fit` and ADR-0135 fixed in `boardContinuity`: a withheld
   figure frozen as a number. Here it was worse than "frozen": it was created, on
   every save.
2. **The detail ceiling was not applied to the money surface.** `RECORD_CLASSES.
   portfolio` declares `detailCeiling: 4`, and `canSee` returns `aggregate` above
   it, so a chief received no budget record in the projection — and therefore saw
   *nothing* about the enterprise money position at all, on the one screen built
   for it. Counts, shares and currency totals (the aggregate disclosure the class
   promises) had no renderer.

## Decision

Ship a **derived read model**, not a new store: `app/core/domain/budgetExposure.js`,
`buildBudgetExposure(state, { now, seat, built })`.

1. **Currency is the only summation boundary.** Every total is computed inside one
   currency and one currency only; there is no FX assumption, no cross-currency
   sum, and no field that mixes two. Of a currency's position, the module reports
   the envelopes, the count with a declared ceiling, the ceiling total **with its
   coverage** (`n of m envelopes`), recorded actuals, open commitments, planned
   pipeline, forecast at completion, breaches, watches, evidence debt and
   untracked envelopes.
2. **Headroom is BLANK, never zero,** when any active envelope in that currency
   carries no ceiling: a ceiling total that covers only part of a currency is not
   a ceiling for the rest, and treating the missing part as zero spend would
   invent headroom. The reason prints in the panel, the ledger and the brief.
3. **Authority is attributed, exactly once.** Each envelope is bucketed to
   exactly one of: a direct child branch of the acting seat (the owner resolves to
   exactly one child span), the acting seat's own desk (the seat itself, or a
   direct report with no leadership seat beneath them), `unowned` (no `ownerId` —
   the enterprise root's own envelope, which the access gateway already refuses to
   let a subordinate mutate), `out-of-span`, or `ambiguous` (an owner resolving to
   more than one direct branch). The last three are **counted and excluded** with
   a printed reason; none of them enters a span total. Nothing is guessed into a
   branch.
4. **No netting, printed.** A breach in one branch is not offset by headroom in
   another, and never across currencies. Offsetting either one is a transfer of
   authority nobody approved; the reading refuses it explicitly instead of
   quietly netting to a comfortable total.
5. **Constraint-first, bounded triage.** Attention rows are dispatched by reason
   family (breach → pipeline breach → watch zone → evidence debt → unpriced →
   overdue → tracking-only), then by utilisation (dimensionless, so ordering is
   safe across currencies), then currency, then id — a total order, independent of
   storage order. The queue is capped at 24 rows and the remainder is **counted,
   never dropped**.
6. **Disclosure by altitude, as the record class declares.** Rank 3–4 read full
   detail: envelope names, per-envelope forecast against ceiling, and the branch
   that holds the authority (org structure a director already reads on the People
   screen). Above the detail ceiling the reading is counts, currency totals and
   bands: no envelope name, no per-envelope amount, anonymous branch positions.
   Below the portfolio floor the reading is **refused** with the policy reason.
   The undeclared operator view reads the whole workspace and says so.
7. **One evaluator, two readings.** The roll-up calls `evaluateBudget` with the
   same watch convention and the same day the envelope list uses, so the position
   and the cards cannot disagree. No number is copied or stored.

### Wiring (not an isolated panel)

- Computed from `buildSeats` / `activeSeat`, i.e. the same reporting tree, span
  scope and rank window the rest of the hierarchy uses.
- Rendered as a second panel on the existing terminal: `#/finance?panel=span`,
  with a `tablist` switch beside the envelope list (the envelope list is
  unchanged and remains the default).
- Three seat-scoped safe reads on the existing command bus:
  `budgetExposureRead`, `budgetExposureText`, `budgetExposureBriefText`, all
  registered in `SAFE_READS` and scoped on the **raw** store through `canSee`, so
  an API caller and the view see one filtered set.
- The ledger text is downloadable from the panel (with the standard copy
  fallback) and the brief sentence is identity-free by construction — counts,
  currency totals, bands and refusals only — so an upward brief can consume it
  without ever carrying a branch or a person.
- **No CSV scope, deliberately.** The `finance` CSV is operator-only (a declared
  seat cannot export at all), and it already carries per-envelope amounts at
  operator detail; adding a second, seat-shaped export would create a scope no
  enforced seat can use. The ledger text is the exportable artifact.

### Defect repairs on the path

- `moneyOrNull` in `normalizeBudgets`: an absent money field stays `null` instead
  of becoming `0`, for `limit`, `committedAmount` and `actualAmount`. With it,
  "spent with no recorded actual" and "unpriced open line" survive a reload, the
  RULE-FIN-03 prompt keeps firing, and the commitment-calibration ledger stops
  scoring a fake 0× underspend. No migration: existing zero rows are history and
  are not rewritten.
- The above-ceiling disclosure gap is closed by decision 6: the chief now reads
  what the record class always promised — counts, shares and currency totals.

## Consequences

- A director can answer the allocation question in one screen: position per
  currency, which branch holds the overrun, which branch is sitting on headroom,
  and the bounded queue of what needs a decision, worst first.
- A VP reads the same roll-up across divisions; a chief reads the enterprise money
  position as counts and totals without item detail.
- Nothing is stored, so nothing can go stale, and there is no second source of
  truth for a figure the finance terminal already shows.
- Honest limits, printed: an envelope whose owner is ambiguous is excluded rather
  than attributed; a span with no ceiling in a currency has no headroom; closed
  envelopes are counted and never summed; the queue is capped and the remainder
  counted; the reading is a position at a date, not a forecast of commitment
  behaviour (that is `commitmentCalibration`'s job, and it now has the debt rows
  it was silently missing).
- Seats remain workflow declarations, not authentication. `[UNVERIFIED]` real
  browser / assistive-technology walkthrough beyond the jsdom + axe-structural
  render, and the full canonical suite in-session.
