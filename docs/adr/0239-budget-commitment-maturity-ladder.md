# ADR-0239 — Budget commitment maturity: when recorded encumbrances are expected, without calling them cash

- **Status:** built — `#/finance?panel=maturity`, aggregate CSV scope #180; no schema change or automation rule.
- **Date:** 2026-11-17
- **Scope:** CEO / C-suite primary; director / VP finance readers; matrix and single-chain workspaces. Read-only derivation over the existing shared budget ledger.
- **Decision:** show exact, per-currency time buckets for active committed and planned budget lines, based on their recorded `expectedOn` dates. This is an encumbrance planning lens, not a cash forecast.
- **Code:** `app/core/domain/budgetMaturity.js`; `app/views/budgetMaturityPanel.js`; Finance route in `app/views/finance.js`; aggregate-only CSV registration in `app/core/csv.js`.
- **Tests:** [`budget-maturity.test.mjs`](../../tests/app/budget-maturity.test.mjs), focused pass recorded in Session 318.
- **Visual:** `app/assets/budget-commitment-maturity-method.jpg`, an explanatory method image, not source evidence.

## Context

The workspace records active budget envelopes and line-level commitments, including declared expected-spend dates. Existing budget and finance views explain amounts, statuses, forecasts and calibration, but do not provide a thirteen-week, overdue-first distribution of what open committed and planned lines owners expect to fall due. Targeted searches of the finance domain and roadmap found no existing commitment-maturity report. This is a reading of stored expectations, not a claim that the organisation's future cash position is known.

## Decision and boundaries

1. **One source of truth.** Recompute on read from active `state.budgets` and open lines (`committed`, `planned`). No new records, schema migration, saved report, inferred dates, or copied totals. `spent` and `released` lines are excluded.
2. **A declared expectation is not a settlement date.** Bucket only by valid `expectedOn`. Use one overdue bucket and thirteen consecutive seven-day buckets beginning on the as-of day. A missing/unreadable date, duplicate source reference, malformed identity, invalid currency, out-of-horizon line or unpriced amount is counted and prevents a complete-reading claim; never guess a bucket.
3. **Keep units and statuses honest.** Committed encumbrances and planned pipeline occupy separate rows. Each currency is reported separately. Amounts are parsed to integer cents and summed with `BigInt`; there is no FX, cross-currency grand total, per-envelope attribution, or removal of repeated underlying obligations across envelopes. Totals are gross declared encumbrances.
4. **Privacy floor and refusal.** A bucket with one or two lines withholds both its amount and count. Ambiguous placement and unreadable inputs withhold affected figures; the view prints placement/completeness separately, and the CSV includes a per-cell reason. Zero is not used to disguise an incomplete source. The CSV emits no budget name/id, line id/title, person/owner, note, source id, or free text.
5. **No implied treasury claim.** The view explicitly says this is not cash flow, liquidity, solvency, bank-balance, payment-term or treasury advice. It does not infer receipts, payroll, taxes, recurring obligations, payment timing, cash availability or vendor settlement.
6. **Visual method aid.** The generated diagram communicates only the bucket/status model and its limits. It is not populated with operational data, an evidence source, or an independent verification of the calculation.

## Alternatives considered

- **Call `expectedOn` a due date or cash date:** rejected. The field is an owner-declared expected-spend day, not a payment promise or bank settlement.
- **Add each line's amount to a cross-currency total:** rejected; no FX policy/rate/vintage exists, and different currencies are not additive.
- **Expose budget names or line descriptions for actionability:** rejected for this aggregate export; those fields can disclose parties and commercial detail, and their inclusion would change the read's privacy boundary.
- **Infer dates or smooth unknowns into a monthly bucket:** rejected. Unknown is not zero, and an out-of-horizon item is not silently absent from the completeness claim.
- **Create a separate forecast ledger or change the budget schema:** deferred. The current item is fully derived from existing declarations; users have not declared a cash forecast policy or collection/obligation source set.

## Consequences and remaining limits

A leader can see the stored timing distribution without mistaking it for a bank balance. Missingness and small cells remain visible as refusals. Because the source model does not identify a consolidated obligation across envelopes, the report cannot deduplicate the same underlying commitment when repeated in different envelopes. It has no incoming-cash, payroll/tax, recurrence, contract-term, payment-rail or settlement evidence; it cannot establish liquidity runway or recommend financing. A new gap hunt found that recurring contractual obligations (for example renewals/subscriptions) have no schedule of their own in the budget domain; targeted searches found no matching schedule or roadmap entry, while broader repository-wide absence is **[UNVERIFIED]**. That separate gap is added to the roadmap and is not partially implemented here.

Benchmark **[BENCHMARK-UNVERIFIED]**: the conceptual bar is a treasury cash-position/maturity worksheet and enterprise planning products such as Anaplan or Oracle NetSuite planning. No hands-on vendor execution, parity assessment, market-current feature check or independent finance review was performed. The product distinction is deliberate: this is a simple, exact read of stored budget expectations and refuses to represent itself as a liquidity forecast.

## Verification and blockers

The focused test pass and its actual result are recorded in `AI-SESSION-LOG.md` for Session 318. Full-suite, browser/assistive-technology and production deployment checks are **[UNVERIFIED]**. Arena's built-in image generator supplied the explanatory JPEG; a specialized external diagram/asset tool was not exposed in this session, so specialist-tool validation is a **blocker / unavailable**, not claimed. No external specialized finance-tool benchmark was run.
