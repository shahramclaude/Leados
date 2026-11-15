# ADR-0208: Investment Case Register — What the Money Is Promised to Return, and Whether It Did

Date: 2026-11-15 · Session 277 · Schema v162 (additive: `investmentCases`, `investmentCaseActs`, `investmentCaseMarkers`) · Status: Accepted

## Context

The workspace held every instrument that says whether money **may** be spent —
budget envelopes with encumbrance accounting (Schema v24), span exposure
(ADR-0136), a standing delegation-of-authority schedule (ADR-0174), chargeback
postings (ADR-0194) — and none that says whether it **should** be, or whether it
delivered. The executive altitude's own declared decision form is *investment &
risk appetite* ("what do we fund, what do we deliberately refuse?"), and no
screen could price a single investment: there was no net present value, hurdle
rate, rate of return or post-completion review anywhere in `app/`. Other engines
state explicitly that they assume no discount rate. `#/capital` allocates an
*effort* budget across levers; it is not money appraisal.

The failure this leaves open is the ordinary one. A director says a line "pays
back in three years", a VP with headroom and signing authority approves it, and
nobody opens the file again — so the next request is exactly as optimistic, and
the organisation never learns what its own promises are worth.

## Decision

**A case is a dated promise.** One named benefit owner, one currency, one declared
price basis (nominal or real), one explicit hurdle rate, one review day and a
schedule of dated flows of three declared kinds — `outlay`, `benefit`,
`residual` — in whole cents. It is immutable once declared; a changed promise is
a new case. Three human acts follow: **ratify** (approve / reject), **withdraw**,
**review**. Nothing derived is stored: no value, rate, payback, ratio or status.

**The arithmetic is exact, not floating point.** A discount factor
`(1 + r)^-(days/365)` is irrational, and `Math.pow` is not required to agree in
its last bit across engines, so a value could differ by a cent between the
browser that printed it and the one that exported it. `investmentCaseMath.js`
uses integer cents, integer millionths for rates, integer days (Actual/365 Fixed,
the XNPV convention) and 160-bit BigInt fixed point for `ln`/`exp`. A discounted
sum is snapped to a billionth of a cent, then rounded half away from zero.

**A rate of return is printed only where it is provably unique.** A dated stream
is a generalised polynomial in the discount factor; by Descartes' rule of signs
(Laguerre's extension) one sign change in the dated net flows means exactly one
rate. Money-out-first with one sign change is searched by integer bisection and
floored, so a printed rate never overstates. Several sign changes, none, or
money-in-first print the reason instead.

**Payback is read on the dated flows**, without interpolation: the first flow day
the running total stops being negative. The **residual** is kept apart: its share
of the promised return and the value without it are printed.

**Decision control is separated from decision management** (Fama & Jensen 1983).
The benefit owner can never ratify or review their own case. Both acts belong to
a seat that holds the owner in its reporting tree or on a declared matrix line,
and the act records which route carried it. The loader enforces the same rule,
so a hand-edited file cannot manufacture a self-approved case. Ratifying a case
worth less than zero at its own hurdle is permitted — and refused without the
reason in writing.

**A review is compared with the dated promise** at the same rate, to the same
valuation day. The benefit ratio compares actual benefits with benefits
*promised by the cut-off*. The cost ratio and the evidence-based value are
printed only when the review declares the outlay complete. Whatever is not yet
evidence is carried at exactly the promised figure; no forecast is invented.

**The track record is the organisation's own outside view.** Medians of the cost
and benefit ratios of the latest review of every case *declared on or before its
first outlay day*, floored at five (the workspace's standing calibration floor,
raised to a seat's own disclosure floor). Each open promise is re-read at those
medians, **beside** the promised figure, never instead of it.

### The refusals are the design

- Currencies are never pooled, and net present values valued on different days
  at different rates are never added: the book is read per currency, as counts
  and as promised outlay.
- No cost ratio while the outlay is open: spending less than planned *so far*
  cannot be told apart from running late, and the register holds no progress
  measure that could.
- A case declared after its money moved was written with hindsight; it is
  printed and left out of the track record.
- A final review that stops short of the declared review day is refused; an
  outlay declared complete is never re-opened.
- Below the floor the track record is counts only. A refused figure is `null` /
  BLANK with its sentence — never zero.

### One ask, to decision control, that closes itself

`RULE-ICA-01` acts on one condition: a ratified case has reached a declared
review day with no review recorded up to it. The ask goes to the seat that
ratified while it is on the roster, holds the altitude to ratify and still sits
above the owner; otherwise to **the lowest seat above every one of the owner's
active reporting lines** that holds that altitude — in a matrix, the joint apex
of the owner's managers, never one line's manager on behalf of the other. The
benefit owner is never asked. Leader-held control, a diamond with no single
apex, or nobody left on the roster produce one identity-free
`investmentCaseMarkers` observation and no ask. Asks are idempotent per (case,
review day), bounded at four per commit with the remainder counted, self-closing,
and pause-governed on every path including the explicit scan.

**Matrix.** A case has one owner and is counted once. An owner on several lines
makes it visible to every line holder (`tree` or `line` is printed on the row);
it is never split and never double-counted in a total or in the export.

## Benchmark

- **Verified this session.** Against 90-digit `mpmath` arithmetic on 400
  randomised streams: every money figure to the cent, every index to the
  permille, every rate state and millionth — 0 mismatches. Against `pyxirr`
  0.10.8: XNPV within half-a-cent rounding on all 400, XIRR within 1e-6 on all
  260 unique-rate streams. The documented spreadsheet example (XNPV 2,086.65,
  XIRR 0.373362535) reproduces. Ten vectors are frozen in the suite.
- **Where it is stricter than the tools.** For the Lorie–Savage stream
  (−1600, +10000, −10000), `numpy-financial` 1.0.0 and `pyxirr` both return 25%
  and say nothing about the second root at 400%. This register prints no rate
  and prints the value at the hurdle.
- **[BENCHMARK-UNVERIFIED].** Commercial capital-planning suites (capex
  approval workflow, portfolio optimisation, ERP integration) were not
  accessible; no claim is made against them. Framework citations are from
  memory and were not re-fetched.

## Consequences

- Schema v161 → v162: three EMPTY additive ledgers and two conventions. No case
  is inferred from an envelope, a commitment or a priced decision, and no hurdle
  rate is assumed. CSV scope #150; rule 127; four declared rights.
- Six domain modules, one panel (`#/finance?panel=cases`: Register, Track record,
  Method), one generated illustration (`app/assets/investment-case-appraisal.jpg`).
- **Not done.** Three limits are printed on the Method view itself: a
  ratification is not tested against the ratifier's standing delegation limit
  (ADR-0174); a case is not tied to the envelope that funds it; proposals are
  ordered by profitability index but not cut off against a declared capital
  budget. Two more are recorded here and in the roadmap: there is no sensitivity
  reading (the same case at a moved hurdle or a slipped schedule) and no
  branch-by-branch roll-up — the book is read per currency only. Entered flows
  are reconciled to no ledger. Each is a slice of its own.
- **Cost, measured.** Exact arithmetic is not free: about 1 ms per eight-flow
  case and 13 ms per sixty-flow case on the development box, memoised by case
  content (a case is immutable, so it is appraised once per session). Opening
  the register cold took 40 ms for 12 cases, 0.2 s for 100 and 0.5 s for 400
  eight-flow cases; at the ceiling of both limits at once (400 cases × 60 flows)
  it took 5.4 s. The navigation counter, the finance tab count and the review
  rule read lifecycle and reach only and appraise nothing (11 ms for 400 cases),
  so no other screen pays for it. Narrowing the rate search before the exact
  bisection would cut the ceiling case; it is not done.
- **Verification boundary.** The suite pins every printed figure against an
  independent recomputation and drives the real dialogs in jsdom. No real-browser
  or assistive-technology walkthrough was run.
