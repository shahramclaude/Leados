# ADR-0053: The Cost of Waiting terminal (pricing the queue the workspace already keeps)

## Status

Accepted — 2026-10-31. Implements Schema v64, RULE-WAIT-01..05, signals WAIT-01..06, CSV scope #54.

## Context

Session 89 (ADR-0052) made the queue answer *how long work like this takes here*,
with censoring and competing risks handled explicitly, and refused to print a
probability below the at-risk floor. The natural next question is the one a
leader asks on a Monday: **what is that wait costing, in money, this week — and
what does waiting two more weeks add?** Cost of delay is a mature discipline
(Reinertsen 2009; WSJF = cost of delay ÷ job duration), but every tool that
ships it — Productboard, Aha!, Airfocus, roadmap tooling — prices a *product
backlog item* from a leader-declared cost of delay per feature. None of them
prices the leader's own cross-module operational queue (cases, hiring, change
programmes, delegations, decisions, funded work) from the workspace's own
records, and none scenario-simulates "wait N more weeks" against a
censoring-aware curve.

This workspace already has both halves: the survival engine estimates
P(item still open | waited w more weeks) = S(age + w) / S(age) from the leader's
own closed records, and decision tempo / the attention market already price
delay in money. What was missing is the multiplication of the two over the
open queue, per currency, with the wait-horizon scenarios printed beside it.

## Decision

Build the **Cost of Waiting terminal (`#/wait`)**, Schema v64:

- **Prices.** A leader declares one weekly price per class of work
  (`waitPrices`, cap 24, amount > 0 and ≤ 1e12, 3-letter currency). A decision
  with linked committed money is priced *derived*: dominant value at stake ÷
  the declared erosion window (12 weeks, linear Reinertsen CD3). An item with
  no price is **unpriced, never zero**, and the queue says so.
- **Reads the curve.** `stillOpenProbability(curve, age, extraDays, minAtRisk)`
  = S(age + Δ) / S(age) — the censoring-aware conditional from ADR-0052. Below
  the at-risk floor it refuses with the at-risk count and a reason; past the
  longest observation it is flagged `beyondEvidence`, not drawn silently.
- **Scenario-simulates the wait.** Per open priced item, for each declared
  horizon (1/2/4/8 weeks): P(still open), expected additional cost =
  weekly price × weeks × P, coverage and extrapolation flags. Totals are
  **per currency and never pooled**. Rows are ranked priced-overdue first,
  then priced, then unpriced by age; "overdue" means past the class's own
  completion median.
- **Freezes weekly exposure certificates** (`waitExposures`, cap 60,
  newest first): the priced queue, totals and scenarios, frozen with a review
  date — the money-side analogue of a survival reading.
- **Rules.** RULE-WAIT-01..05 on the shared spine, marker-idempotent per ISO
  week (`waitCostMarkers`, cap 400). A scan or a price change reconciles stale
  `prices-delay` edges, freezes the weekly certificate (bounded), writes
  `exposure → item` links for the priced-overdue queue (≤ 40, the price in the
  edge summary), opens **exactly one triage DACI decision per currency per
  week** above the declared threshold, one owned delegation per top
  priced-overdue item (≤ 5, due +3 days, recorded owner only), and one
  declare-a-price task per unpriced overdue class (≤ 3, due +7 days, to the
  leader). `waitAutoPropagate=false` pauses automatic events; an explicit
  scan always runs and reconciles.
- **Signals.** WAIT-01 (unpriced overdue class), WAIT-02 (priced overdue
  items), WAIT-03 (unpriced queue share), WAIT-04 (wait-horizon growth over
  overdue exposure), WAIT-05 (big-bet decision past its guardrail), WAIT-06
  (concentration: one item's share of overdue exposure) in the
  `Cost of waiting` insights bucket.

### New graph relation

`exposure` → `waitExposures`, relation **`prices-delay`** (exposure → any open
work item). SYSTEM_GENERATED only — a leader cannot assert it manually. The
resolver routes to `#/wait?panel=certificates&exposure=<id>`, so a priced item
is navigable back to the certificate that priced it.

## Consequences

- The workspace gains a money-denominated answer to "what is waiting costing",
  per currency, recomputed on every read; only the weekly certificate is
  persisted, and an empty certificate list is the correct upgrade state for the
  same reason as ADR-0052: freezing one on the leader's behalf would be a
  price asserted after the queue was already known.
- A price is a declaration, not a measurement — the page labels declared and
  derived prices separately, and the derived decision price is linear CD3, not
  a fitted curve. That limit is printed.
- No person is priced. Prices attach to classes of work; delegations carry the
  recorded owner only. The triage rule opens a *decision*; it never reorders
  the queue itself.
- Currencies are never pooled, scenarios are never printed below the evidence
  floor, and the CSV export (#54) is aggregate per class × currency under
  opaque codes, with scenario figures blanked when coverage is below the floor.
- The independence-of-censoring and exchangeability assumptions inherited from
  ADR-0052 apply unchanged and are stated on the Method panel.
