# ADR-0229 — Capability Sourcing & Firm-Boundary Register: the firm decides what it owns, on one exact integer-cent comparison over one declared horizon, with the hold-up exposure printed whether or not anybody decided

- **Status:** accepted and **shipped** — domain kernel, actions, seat rights, `#/sourcing` route, CSV scope #170, schema v182 and the `RULE-SRC-01` spine rule are all wired on this branch.
- **Date:** 2026-11-16
- **Deciders:** CEO / C-suite (rank 5) × matrix and single-chain — the seat that moves the boundary of the firm. Director / VP (rank 3+) records cases and options and reads the register; VP (rank 4+) grades. Frontline and mid-manager read nothing (rank 3 floor).
- **Schema:** **v182** (v181 → v182). Four new collections, all empty at upgrade: `sourcingCases`, `sourcingOptions`, `sourcingActs`, `sourcingMarkers`. Nothing is inferred from existing records. No total, discount factor, premium, verdict or hold-up exposure is **stored** — every one is re-derived on read, so a hand-edited file cannot carry a comparison its own rows do not imply.
- **Surface:** route `#/sourcing`, view `app/views/sourcing.js`, CSV scope `capability-sourcing` (#170, 23 columns), actions `sourcingDeclareCase`, `sourcingRecordOption`, `sourcingDecide`, `sourcingGrade`, `sourcingWithdrawCase`, plus `sourcingReport`, `sourcingAttentionCount`, `sourcingCandidates`, `sourcingScan`, `sourcingMarkers`, `sourcingReadModel`, `sourcingSeesCase`, `sourcingReadCents`.
- **Code:** `app/core/domain/sourcingRegistry.js` (closed vocabulary), `sourcingSchema.js` (fail-closed normalizers + the exact money kernel), `sourcing.js` (pure reader `buildSourcing`, `resolveAuthority`, `priceOption`, `evaluateCase`), `sourcingCsv.js`, `sourcingRules.js` (`RULE-SRC-01`), `sourcingActions.js`
- **Tests:** `tests/app/capability-sourcing.test.mjs` (18, all passing) — migration, money/PV order-independence, mode-line refusal, comparability, safeguard pairing, chief-only decision, authority walk, self-record refusal, grade-once, calibration floor, spine/pause/idempotence/self-close, CSV identity-free, panel displayed == computed, malformed-row refusal.
- **Rule:** `RULE-SRC-01` (post-commit spine, `scansWorkspace: true`, pause switch `sourcingAutoPropagate`)
- **Builds on:** ADR-0140 (matrix accountability: a cross-line capability is not one line's to source), ADR-0192 (asset-specificity hold-up reading — cited, never recomputed), ADR-0218 (Just Culture: counts describe capabilities and decisions, never persons), ADR-0227/0228 (separation of duties: the party that acts does not also grade the act; refusals printed, never applied)

## Context

Every enterprise decides, repeatedly and usually informally, **where the boundary of the firm sits** for a capability: do we own the asset and the know-how, or do we rent an output? A billing engine, a forecasting model, a field-service network, a pricing desk. These decisions are made in decks, in corridors, and in the annual plan — and then the comparison that justified them evaporates.

Three failures recur, and the repository held no record that prevented any of them:

1. **The comparison is never made on one basis.** A five-year build is set against a one-year licence. A euro quote is set against a krone budget. The build is priced at the licence fee and the licence is priced at the build's *whole* cost. Nobody prints that the two sides answered different questions.
2. **The loaded cost is understated on both sides.** The published benchmark literature is unambiguous here: Gartner's 2025 SaaS economics work put hidden integration, training and customisation at 150–200% of advertised price, TrustRadius found licence fees are only ~36% of five-year cost, and vendor-neutral build benchmarks put a mid-size enterprise build at $850K–$1.6M with $480K–$950K/year maintenance and 18–24 months to go-live. A comparison that reads the licence line and the engineering estimate is not a comparison.
3. **The hold-up is invisible.** Williamson's asset-specificity argument, and Hart & Moore's incomplete-contracts formalisation of it, say the same thing: where the asset cannot be redeployed, an unguarded contract is not a price, it is an option written to the other party, exercised at renewal. A register that records "we chose BUY" without recording *what protects us at renewal* has recorded the decision and lost the risk.

The framework vocabulary is settled and closed: Coase (1937) on the boundary itself, Williamson (1975, 1985) on specificity and safeguards, Hart & Moore (1988) on residual control, Penrose (1959) and Prahalad & Hamel (1990) on capability as the unit, Dixit & Pindyck (1994) on the option value of deferral, and the 2026 make-or-buy literature that finds AI has lowered the specificity threshold for "make" and made hybrid the modal answer. A search of `app/` for `firm-boundary`, `make-or-buy`, `sourcing` as a governance register and `hold-up` returned no register — only the *reading* of hold-up exposure inside `resilience.js:202`, `csv.js:753` and `continuityCoupling.js:29`, which this ADR **cites and does not recompute**.

## Decision

1. **A case declares ONE comparison basis, and every option is priced on it.** A case fixes `currency`, `horizonDays` (30–3650) and `discountBp` (0–10000). The comparability key is `CURRENCY|horizonDays|discountBp`. An option recorded on different terms **is stored** — the row is a fact — but it is printed as `not-comparable` with the exact field that differs, and it is never used as a benchmark, never converted, and never pooled. There is no exchange rate in this product and the register refuses to invent one.

2. **Money is whole cents, exactly, and re-proved on read.** Input is major units with at most two decimals; a third decimal is refused at the door (`readStoredCents` refuses floats, strings and negatives). The present value is computed in **BigInt at a 1e-12-cent scale** and rounded half-away-from-zero **once**, at the end. The convention is stated in the code and is deliberately boring: one-time outlay at stand-up (factor exactly 1), recurring cost as a **mid-period annuity** over the declared horizon, Actual/365 Fixed. The proof that this is implemented as arithmetic rather than as hope is a test: **the present value is identical however the cost lines were ordered**, and the annuity factor falls strictly between annuity-immediate and annuity-due.

3. **A comparison needs two SIDES, not two rows.** Four modes are declared: `make`, `buy`, `partner`, `hybrid`. A case carrying four `make` options is one side of a question. It reads state `one-sided` and verdict `not-comparable`, and it prints *which* mode is missing rather than pricing a comparison the firm never made. A `cheapest` figure is not computed at all until a second side exists — with one exception: once a decision is on the record, the premium is measured against the best alternative the firm actually had.

4. **The hold-up exposure is derived from the (specificity, safeguard) pair, and printed regardless of the verdict.** Each option's declared safeguards are matched against the case's declared specificity. A safeguard that **does not answer** that specificity is not credited — an exit plan cannot answer `site` specificity, an escrow cannot move a plant. The exposure is printed on the row whether the case is decided, owed, or one-sided, because the risk does not wait for the paperwork.

5. **Only the chief altitude moves the boundary, and the authority walk proves it.** Authority is resolved over the **union** of the capability's owner and every line the capability touches: joint apex of those managers, then **walk up each branch to the nearest seat at or above rank 5**. A rank-3 director is walked past, never promoted. The workspace apex is a rank-5 seat by construction and is therefore reachable from every branch — so the honest reading of a normal enterprise roster is `chief-queue`: the apex holds the decision, is **asked**, and the register prints that rather than handing a boundary decision to a director. `no-joint-apex` and `no-authority-at-rank` and `no-holder` all print instead of substituting somebody.

6. **The party that decides does not write the comparison, and does not grade it.** The self-record guard applies to the apex as much as to a roster seat: if the apex will decide the case, it may not record the options it decides between. The self-grade guard is proved by actor, not by rank, so the apex — the only seat that may decide — gives up grading to rank 4+. Independence is a property of the record, not a courtesy.

7. **A decision is recorded once, with a basis, and a premium must be explained.** A second decision is refused (`already-decided`): a reconsideration is a new case, so the first decision stays readable. An option dearer than the cheapest comparable option must carry a written basis that says what the premium buys — the door asks for the sentence and refuses a bare preference, because a premium with no reason is indistinguishable from an accounting error.

8. **A grade is recorded once, only after the declared review date, and the delta is computed from the record.** Grading early would reward the assumption rather than test it. The bias per side is `actual − frozen` in basis points, computed, never stored. Calibration is withheld below a declared floor of 5 graded cases, and the withholding is printed with its reason.

9. **The register never rates a supplier or a person.** It counts capabilities, cases and decisions. Ask text is deliberately opaque — no capability name, no currency, no amount, no vendor — because a delegation is readable above the addressee. The typed signature lives only in the `issues-obligation` link.

10. **CSV #170 is identity-free.** `capability-sourcing` exports 23 columns: `as_of`, `row_kind`, `key`, `currency`, counts, `state`, `verdict`, `specificity`, `mode_chosen`, `cheapest_mode`, the three cent figures, `premium_bp`, `safeguard_answers`, `option_count`, `cost_line_count`, `blank_reason`. No title, no person, no id, no vendor, no note. A figure that cannot be computed is **blank with a stated reason**, never `0` and never `NaN`.

## Consequences

- The enterprise can answer "where is the boundary of the firm" and "what did we decide it on" from one page, without a deck surviving anywhere.
- Two-sided comparison is enforced structurally: the product cannot print a premium for a one-sided case, so it cannot be used to justify a decision that was never compared.
- The chief-queue reading is honest but blunt: on a normal roster **every** boundary decision routes to the workspace apex. That is a true reading of this seat model (roster altitude tops out at VP/rank 4), and it is printed rather than worked around. If the enterprise wants a delegated chief altitude, that is a roster-model change, not a sourcing-register change.
- The present-value kernel is the most arithmetic-dense code in the slice and it carries the sharpest test, because a rounding convention that drifts with line order would silently change a decided premium.

## Remainder

None. The slice is complete: schema, migration, four normalizers, seven domain modules, actions with refusal doors, seat rights, the post-commit rule with pause governance, CSV #170, route and panel, and the method figure. The one thing this ADR does **not** claim is the benchmark comparison — see below.

## Benchmark

**`[BENCHMARK-UNVERIFIED]`.** No enterprise make-or-buy product was run side by side. The bar was taken from published guidance (cited in the session log): Gartner's "compare vendor pricing against the resources and cost of building internally" and its governance-capacity framing; the 2025 SaaS-economics finding that hidden costs raise TCO 150–200%; TrustRadius's finding that licence is ~36% of five-year cost; vendor-neutral build benchmarks ($850K–$1.6M build, $480K–$950K/yr maintenance, 18–24 months); and the 2026 make-or-buy literature placing the option set at four modes with hybrid modal.

On that bar the register **matches or exceeds** the guidance on four named dimensions, and each is a property a reader can check in the code:

1. **It refuses to compare unlike things.** The published frameworks say to align horizons and currency; the register makes it structurally impossible to print a premium across a mismatch.
2. **It computes the loaded cost in exact integers.** Every cent is an integer at a declared scale, and PV is order-independent by test. Spreadsheet-based practice is float-based and order-dependent.
3. **It prints the hold-up exposure unconditionally.** The frameworks name specificity as a determinant; the register derives exposure from the (specificity, safeguard) pair on every row and refuses to credit a safeguard that cannot answer.
4. **It prints its refusals.** Where the basis cannot support a verdict — no second side, no authority, unreadable row, calibration below floor — it says so in words instead of leaving a field blank or zero.

It does **not** match: portfolio-level scenario modelling, Monte Carlo on cost ranges, market-data vendor pricing feeds, or a supplier-risk rating. Those are not in this slice and are not claimed.

## Sources

Coase, *The Nature of the Firm* (1937); Williamson, *Markets and Hierarchies* (1975) and *The Economic Institutions of Capitalism* (1985); Hart & Moore, "Property Rights and the Nature of the Firm" (JPE 1988); Penrose, *The Theory of the Growth of the Firm* (1959); Prahalad & Hamel, "The Core Competence of the Corporation" (HBR 1990); Dixit & Pindyck, *Investment under Uncertainty* (1994); Fama & Jensen (1983); Aghion & Tirole (1997); March (1991); Hirshleifer (1956); Eccles (1985); Jaques (1956, 1964). Web sources for the 2026 benchmark sweep are recorded in `AI-SESSION-LOG.md`.
