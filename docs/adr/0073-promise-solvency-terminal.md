# ADR-0073: The Promise Solvency Terminal — dated promises as a liability book, delivery record as capital, and a copy of the count

Date: 2026-11-02 · Status: implemented · Schema: v80 · Surface: `#/solvency`

## Context

This application has, for a hundred and twelve sessions, measured everything about
leadership *except the one thing a leader spends every day doing*: making dated
promises to other people, and then living with the arithmetic of having made them.

Delegations carry `dueOn`. Decisions carry `reviewOn`. Goals carry `dueDate`.
Feedback carries `followUpOn`. Stakeholders carry `nextContactOn`. Requisitions carry
`targetStartOn`. Six collections, six date fields, and every one of them is a promise
somebody else is counting on. The workspace already knows each individual date. It has
never once looked at them **together**, which is the only way a leader actually
experiences them: as one book of obligations, owed against one fixed capacity, that can
fail as a portfolio rather than one item at a time.

Worse, it has never asked the question that a first-time leader most needs answered:
*how much of this am I going to break?* Not "which one is late" — that is a queue. The
portfolio question is a distribution, and with a distribution you can decide in advance
which promises to renegotiate instead of discovering, one apology at a time, that the
book was never deliverable.

The competitive picture, surveyed 2026-11-02 (RESEARCH §96): every task and OKR tool in
this category — Asana, Monday, ClickUp, Notion, Linear, Lattice, Workboard, Perdoo,
Ally.io/Workfront, Viva Goals — computes an *on-time completion rate*, a percentage of
things done by their date. Not one of them prices the **forward** book. Not one of them
says "given how this workspace actually settles its promises, 16 promises due in the
next eight weeks imply 4.73 breaches, a 29.6% share against your own 30% alarm, and 21
promises fall due in the next four weeks against a measured settlement rate of 2.9 per
week, so coverage is 0.56×". Not one converts "which promise should I renegotiate this
week" from a feeling into a comparison of two printed costs. The finance industry has
done all of this for decades — credit portfolios, PD term structures, Vasicek's
one-factor copula, Tasche's risk contributions, Little's Law — and the leadership
category has none of it.

The second observation is about honesty, and it cost this session's design a revision.
The obvious headline — "the probability that at least one promise breaks" — is
**arithmetic theatre**: with sixteen independent promises averaging 30% each it reads
99.9%, and with a declared ρ of 0.3 it reads 97.7%. It saturates for any real book. A
number that is 97.7% every week teaches nothing, cannot be improved, and would make the
terminal look rigorous while being uninformative. The same is true of the assumption-free
Fréchet ceiling: `min(1, Σpᵢ) = 100%` for this book, and scoring a constant 100% against
a book that broke yields a perfect Brier score of zero. **A grader that flatters the
assumption-free bound is worse than no grader.** Both findings changed the design in
this session, and both are documented below as reversals.

## Decision

Add `#/solvency`, a six-panel Promise Solvency Terminal: a **derived read model** over
dated records the workspace already keeps, plus frozen readings that commit the leader
to being graded.

### 1. The book: six sources, one liability portfolio

`solvencyRegistry.js` holds the entire vocabulary — six promise sources, four source
verdicts, five promise states, four repair verdicts, three relations, five rule ids,
seven signal ids, and every declared limit with its clamp. `solvency.js` harvests each
source into one shape, `{ id, label, obligationOn, openedOn, settlementOn, open }`,
and nothing is inferred: **a record with no obligation date is not a promise**, and a
promise whose record cannot be found at grading time is dropped rather than imputed.

Each source is scored on its **own** settlement record, measured over the leader's
declared window (default 180 days): the offset between the day the promise was
obligated and the day it was actually settled, right-censored at today for promises
still open, with a Jeffreys-smoothed on-time share and a Wilson interval. Four verdicts
carry printed reasons:

- `reliable` — on-time share at or above the declared bar (default 80%);
- `watch` — measured, but below the bar;
- `unreliable` — most promises settle late: the book is being priced off a habit;
- `unproven` — below the declared history floor, and it **prices nothing**.

Counterparty-class pooling is the one exception, and it is a declaration: a source with
no history of its own may borrow its class's settlement curve (people / organisation /
outsiders), the promise is labelled `pricedBy: 'pool'`, and the decision can be refused
in the conventions dialog. Unpriced promises are never assumed safe — they are listed and
counted out loud (12 of 39 in the demo).

### 2. PD as a survival-probability ratio, with a virtual on-time settlement

The probability that a promise breaks is the ratio of two survival probabilities of its
own source's settlement-offset distribution:

```
PD(t) = S(1) / S(today − obligationOn),        S(x) = P(offset > x)
```

with a Jeffreys (½, ½) prior over the offset grid and exactly **one virtual on-time
settlement at offset 0**. That one observation is the honest part of the estimator: a
leader who has settled ten promises has demonstrated that they *can* settle a promise on
time at least once, and a Jeffreys prior with no on-time mass would otherwise price every
future promise from a source that has only ever been late as a near-certainty. The
virtuality is printed in the method panel. Promises already past their date get PD = 1
by construction, because the breach has happened; they are reported as overdue and never
folded into a forward probability.

### 3. The joint claim is a copula, printed beside its bounds

One-factor Gaussian copula (Vasicek 1987; Merton 1974), the Basel II IRB form:

```
PD_i(z) = Φ( (Φ⁻¹(PD_i) − √ρ·z) / √(1−ρ) )
P(any)  = 1 − ∫ Π_i (1 − PD_i(z)) φ(z) dz
```

integrated by Simpson's rule on [−8, 8] (where φ < 1e-15), with Euler/Tasche marginal
contributions computed in the same pass by prefix/suffix products. At ρ = 0 it equals
the independence value exactly; at ρ → 1 it approaches `max(PD)`. The Fréchet (1951) /
Hoeffding (1942) interval `[max pᵢ, min(1, Σ pᵢ)]` is printed beside it, the declared ρ
is swept 0–90% to show how much the choice matters, and the alarm is set on the **share
of the book expected to break** rather than on P(any), because P(any) saturates and the
share does not.

`E[N] = Σ PD_i` needs no dependence assumption at all — linearity of expectation holds
under every copula — and it is the number the terminal leads with.

### 4. The count distribution, and the scores the terminal actually uses

Under the same model, conditional on the common factor the promises are independent
Bernoullis, so the count has a mixture-of-Poisson-binomials law:

```
P(N = k) = ∫ [z^k] Π_i ((1 − PD_i(z)) + PD_i(z)·z) φ(z) dz
```

computed by convolving the conditional probability generating functions across the same
Simpson grid, and at ρ = 0 by the exact Poisson-binomial convolution (no quadrature).
Then:

- **every priced promise is one forecast–outcome pair.** Brier loss is the mean squared
  error over those pairs, with the bookmark's own observed breach rate (climatology) as
  the reference — the Brier skill score of Murphy (1973), withheld below five readings.
- **the count is scored** with the ranked probability score (Epstein 1969) and the
  logarithmic score, each compared against the same marginals under independence. Both
  are strictly proper: hedging cannot improve them, and being wrong by three breaches
  costs more than being wrong by one.
- **the binary claim is scored but never the headline**, and **the Fréchet ceiling is
  not scored at all** — see the reversals below.

### 5. Capacity: Little's Law, coverage, and a stress curve

`serviceRate` measures settlements per week over the declared window; `arrivalRate`
measures promises opened per week; the coverage ratio is *capacity ÷ demand* over the
same 28 days (`servicePerWeek × 4 / dueNext28`), with `utilisation = λ/μ` and the
book clearance time `L/λ` from Little (1961) printed with its constant-demand assumption
beside it. A ratio of zero is refused where the truth is "unmeasurable", and an infinite
ratio is never printed where nothing falls due. Stress re-runs coverage at 100 / 80 / 60 /
40% of measured capacity (10 → 12 → 14 → 17 promises short in the demo).

### 6. The repair queue prices two costs, and caps the date

For each exposure: `leaveLoss = PD × breachMultiplier × weight` (a declared convention
grounded in trust-repair asymmetry — Robinson & Morrison 1995; Kim et al. 2004) against
`askCost = weight`. `renegotiate` when leaving is dearer than asking; `watch` otherwise;
`decide` when the promise has already reached the leader's move cap, because a further
date is not a plan. The verdict carries a printed script — the sentence to say, not a
label.

`RULE-SLV-01..05` run on the shared post-commit spine, marker-idempotent, and they
**never move a date**:

- **SLV-01** on a freeze: at most `solvencyMaxTasks` repair tasks (each carrying the
  script), up to 8 `endangers-promise` edges from the reading to the promises it priced,
  and exactly one governed DACI capacity decision per ISO week when coverage < 1, edged
  `underwrites-commitment`;
- **SLV-02**: one acknowledgement task per overdue promise ever (capped at two per scan)
  and one governed decision for a promise at its move cap;
- **SLV-03**: one blameless process question per 30-day bucket when the expected breach
  share crosses the alarm;
- **SLV-04**: grading work for a frozen reading whose window closed ungraded;
- **SLV-05**: reconciliation — stale reading edges are dropped when a reading is deleted.

### 7. Freezing, grading, and the one write into another module

A freeze captures the book at a moment: the named exposures, their PDs, their
contributions, the copula claim, the ceiling, the independence and comonotonic values,
the coverage ratio and the expected breach count. One freeze per day — a second freeze
cannot count as a second independent claim — and an empty book refuses to freeze, because
a reading with no exposure is a quote with no claim. Grading happens once, only after the
window closes, and **lapses** rather than being excused if every frozen promise was
deleted. A graded reading cannot be deleted: it is part of the calibration record.

The one action that writes into another module is `renegotiatePromise`: it changes the
date on the real source record (a delegation's `dueOn`, a decision's `reviewOn`, …),
appends an immutable row to `solvencyRenegotiations` with the reason verbatim, and edges
the new row to the promise it moved with `renegotiates`. It refuses an earlier or equal
date, a date more than a year out, a reason under eight characters, and any move past
the leader's own cap — at which point the honest answer is a decision, and the terminal
says so on the record rather than in a warning.

## Consequences

- `#/solvency` is the first surface in this product, and in the surveyed market, that
  prices the **forward** promise book rather than the completed one.
- The terminal's own grading is a copy of the number the leader signed, and it can come
  out negative: the demo's single graded reading scores RPS 1.136 against 0.826 for
  independence. That is printed, not hidden, because a model that cannot lose is not
  being tested.
- `cases.js` gains `solvencyreading` and `solvencyrenegotiation` nodes with three
  relations (`endangers-promise`, `underwrites-commitment`, `renegotiates`), so every
  promise the terminal prices is reachable from the reading that priced it, and every
  moved date is reachable from the row that moved it.
- Nine new aliases (`#/promise`, `#/commitments`, `#/book`, `#/coverage`, `#/liability`,
  `#/trust`, `#/renegotiate`, `#/breach`, …), an Insights bucket `Promise solvency`, CSV
  scope #70 (aggregate only, blanks for every refusal), a nav badge that counts only
  decision-shaped signals, and an identity-free brief.
- **No person is rated, ranked or named.** A counterparty is a class; a breach is a
  property of a promise, never of the person who owed it.

## Reversals recorded this session

1. **The Fréchet ceiling is no longer graded.** It was implemented as a second scored
   claim and reverted within the session: `min(1, Σpᵢ)` reads 100% for any book of more
   than a dozen promises, so scoring it against a book that broke returns a perfect zero
   — the assumption-free bound would have "won" every comparison by construction. The
   ceiling is still stored and printed; it is never scored.
2. **Global cross-source pooling was replaced by counterparty-class pooling.** Pooling
   every source together made a hiring requisition borrow the on-time record of internal
   follow-ups. The class is the exchangeability argument, and the decision can be refused.
3. **The naive `S(1)/S(−r)` term with a silent zero offset was replaced** by a Jeffreys
   prior plus one virtual on-time settlement at offset 0, because the naive form declared
   a source with no on-time record incapable of ever being on time.
4. **The Brier score moved from the joint binary claim to the individual promises.** A
   single Bernoulli per reading, at ~97.7% every time, is not a measurement; sixteen
   promise-level forecasts against sixteen outcomes is. The binary score survives as a
   secondary line, and the count now carries RPS and log scores.
