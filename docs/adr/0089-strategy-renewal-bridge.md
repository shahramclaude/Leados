# ADR-0089: Strategy Renewal Bridge — freeze the Catchball-to-bet cohort, make each altitude a different renewal decision, and grade only the outcomes inside that cycle (`#/strategy-cycle`)

- **Status:** Accepted
- **Date:** 2026-11-04
- **Session:** 129 (Schema v94, CSV #85)
- **Related:** [ADR-0008](./0008-post-commit-rules-hook.md), [ADR-0027](./0027-strategy-coherence-terminal.md), [ADR-0075](./0075-command-chain.md), [ADR-0076](./0076-operating-seat.md), [ADR-0080](./0080-mission-control.md), [ADR-0084](./0084-hoshin-catchball-cascade.md), [RESEARCH §110](../../RESEARCH.md), [ROADMAP](../../ROADMAP.md)

## 1. Context

The Hoshin Kanri & Catchball Cascade (ADR-0084) closed the vertical deployment path: a strategy bet could become a bilateral, capacity-priced commitment at a named operating seat. It still left a renewal gap. A frozen decision was not yet a durable, identity-reduced record of *which commitments and bets were in scope*, what happened to that exact cohort by its review date, or what different operating decisions each altitude should make from the evidence.

The competitive scan found mature adjacent patterns, not an empty category. Cascade advertises hierarchical objectives, alignment, linked live metrics, initiative roll-ups, reports, and scheduled cadences. WorkBoard describes long-range strategy connected to annual/quarterly OKRs, plan-versus-actual scorecards, and operating reviews. ClearPoint emphasizes scorecards, dashboards, named initiative owners, and reporting. The bilateral, capacity-aware Catchball constraint is an existing LeadOS design decision in ADR-0084; it is not a finding attributed to the Lean Enterprise Institute, whose strategy-deployment page was identified during research but not verified. The other market observations are source-page descriptions and vendor claims, not independent product verification; this ADR makes no claim that a named competitor lacks a particular feature. See RESEARCH §110 for sources and the altitude assessment.

## 2. Decision

Ship a bounded, seat-aware Strategy Renewal Bridge on Schema v94. It joins existing Strategy Bets (`strategyBets`), Catchball commitments (`catchballPacts`), operating seats, typed links, and the post-commit spine. It is a review and evidence workflow—not an optimizer, causal model, spending engine, or substitute for Catchball consent.

### 2.1 Five altitudes, five different decision objects

The five playbooks are a contract, not five skins on a common dashboard:

| Rank / altitude | Distinct useful decision | Boundary |
| --- | --- | --- |
| 1 — frontline | Recover one feasible next commitment: finish, renegotiate, or stop work before the next hand-off; surface a blocker and next review date. | Exact local Catchball work is visible; never a person score. |
| 2 — manager | Balance span capacity, overdue promises, carryover, and available effort before accepting another cascade. | Named work in the manager's own span; sibling and higher-altitude detail withheld. |
| 3 — director | Test bet-to-delivery coherence: compare each in-scope strategic bet's declared effort weight with observed commitment effort and propose a transparent effort-weighted counterfactual after a stop-rule/retirement. | Bet-level data only; small cells suppress the full related breakdown. No allocation is applied. |
| 4 — executive | Make a portfolio-renewal gate from privacy-safe cross-span aggregates and uncertainty. | No local pact or bet detail; primary and complementary small cells are withheld. |
| 5 — chief | Decide what to renew, revise, or retire across the enterprise and carry a dated learning line into the next cycle. | Aggregate-only, all-altitude comparison; no causal attribution. |

The distinctness is directly encoded in `STRATEGY_CYCLE_PLAYBOOK` and verified at ranks 1–5. Whether each job produces durable customer value remains a usability hypothesis; RESEARCH §110 names observable validation signals rather than treating feature presence as proof of value.

### 2.2 Prospective, bounded, identity-reduced readings

- `strategyCycleFreeze({ reviewOn })` freezes one reading per seat/scope per day (repeated same-day calls return the existing reading). `periodStart` advances from the previous reading's review date when that date is strictly earlier than today; it does not backfill history.
- A reading captures the source revision, reporting scope, dated review window, five-altitude counts, bet-level aggregate rows (director only), historical reference, and up to 48 cohort pact IDs. A cohort above 48 is refused; evidence is never silently truncated. The reading ledger is capped at 180, history display at 40, marker ledger at 720, and lineage links at 120 per reading.
- The schema normalizer drops titles, notes, names, arbitrary nested values, and bet titles from persisted readings. Raw `strategyCycles` and `strategyCycleMarkers` are `detailCeiling: 0` in declared-seat projections. The report API is the intended reader; general typed-link resolution returns neutral fields and no cohort IDs.
- The additive 93 → 94 migration creates empty collections and defaults only. It fabricates no prior cycle or grade and preserves existing records.

### 2.3 Evidence, suppression, and counterfactuals

- The live “delivery reference” is computed from strictly-prior settled Catchball outcomes. It is an empirical historical reference, not a forecast, causal estimate, or generated recommendation. Below the configurable evidence floor (default 5), rate and interval are refused. Brier is separately withheld until its own explicit-confidence sample meets that floor; missing confidence is not coerced to 0%. When released, the descriptive interval is Wilson 95%.
- A frozen reading is graded only after its review date, from its exact frozen cohort and only for settled outcomes dated from `frozenOn` through `reviewOn`. It is graded only above the configured evidence floor; otherwise it lapses without a grade. Outcome grading never changes a Catchball pact.
- At rank 3+, a positive cell below the default floor of 3 suppresses the related aggregate and complementary altitude/bet/span breakdowns, sensitive historical metrics/grades, and small historical denominators. A bounded CSV is built from the same scoped report. Suppression reduces simple differencing; it is not differential privacy, and repeated releases/reorganizations remain a privacy review item.
- The director scenario reallocates only *displayed effort days* against declared active strategy weights. It changes no budget, bet, owner, date, or pact. An explicit stop-rule verdict still belongs to the human strategy owner; Catchball owners retain consent over their commitments.

### 2.4 Cross-module, cross-altitude propagation

`strategyCycleRule` runs immediately after `catchballRule` and before `sealRule` in the existing transaction spine. `RULE-SCR-01` writes bounded, idempotent typed provenance from a cycle to its frozen Catchball cohort, linked strategic bets, and reporting ancestors; creates one human renewal decision when carryover or stop-rule exposure is actionable; and grades the exact cohort in-window. `RULE-SCR-02` opens one owner-consent reconciliation decision when a human stop-rule verdict retires a bet that still has active Catchball work. If that scope exceeds the 48-link bound, the rule records a bounded refusal marker and creates no partial decision; a narrower explicit scan can be retried. Markers make scans repeatable. Explicit scans are seat-scoped (all cycles only for full-access operator); pausing automatic propagation does not disable an explicit scan.

Neither rule silently closes or reassigns work, edits a strategy bet, changes a budget, or changes an owner/date. Both use existing human decision and bilateral Catchball records. The route and reads go through the access gateway; export `strategy-renewal` is a separate seat-scoped CSV, not a full-workspace dump.

## 3. Rejected alternatives

- **Another goals tree or executive dashboard:** commodity patterns are already present in the category and do not by themselves close the local Catchball consent-to-renewal loop.
- **Automatic reallocation or “AI” recommendation:** released effort is scenario math only; the data do not establish causality, feasibility, or authority to move a commitment.
- **Call the historical rate a forecast:** the evidence is selected from strictly-prior settled records, with a denominator floor and uncertainty; it is not an outcome model.
- **Store a copied narrative snapshot:** names, pact text, and decision notes increase exposure and make the learning line stale; typed edges provide navigable provenance instead.
- **Treat a local seat as authenticated security or small-cell suppression as a privacy guarantee:** both claims are explicitly out of scope.

## 4. Consequences and follow-up

LeadOS now has an end-to-end strategy renewal path across five operating altitudes, including prospective cohort freezing, human-governed reconciliation, safe history/export, and in-window grading. The remaining work is authenticated identity/tenant isolation; formal review of repeated-release and reorganization differencing; stronger data-quality/settlement signals; and user validation that the five decisions are useful without duplicating a generic status meeting. These are carried in ROADMAP.md.

## 5. Verification

Before mainline integration, the focused Strategy Cycle, typed-link/navigation, and Catchball suites passed (28/28); the Action Bundles + standalone + Strategy Cycle suites passed after rebuilding the offline artifact (36/36); `npm run lint`, `npm run check:boundary`, and `npm run check:links` passed. Those results predate the v94 integration and are not a claim about the merged tree. The full test matrix exceeded the 30-minute local command window; CI should provide the final complete result.
