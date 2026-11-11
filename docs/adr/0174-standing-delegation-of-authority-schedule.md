# ADR-0174 — Standing Delegation-of-Authority (DoA) Schedule & Cross-Line Limit Conformance

- **Status:** Accepted
- **Date:** 2026-11-11 (Session 237)
- **Schema:** v137 → v138 (`doaSchedule`, `doaMarkers`, `settings.doaAskDueDays`, `settings.doaAutoPropagate`)
- **Rule:** `RULE-DOA-01` (`doaScheduleRules.js`)
- **CSV Scope:** #128 (`matrix-doa`, aggregate only)
- **Route:** `#/matrix?panel=authority`
- **Altitudes & Structure:** Director, VP, and CEO / C-suite (`single-chain` and `matrix`)

## Context

In corporate governance, internal controls, and financial operations, **standing signing authority** (*Delegation of Authority*, DoA) is distinct from ad-hoc spending mandates (`mandates`), budget envelopes (`budgets`), and Segregation of Duties (`ADR-0170`). A seat may be completely independent of the initiator (`RULE-SOD-01` clean) and stay inside an overall budget envelope, yet exceed the **standing per-commitment financial ceiling** granted to that seat for that currency, expenditure class, and reporting-line axis.

In a matrix organization, two failure modes compound this:
1. **Cross-line authority shopping / anti-splitting:** a commitment touching a shared report is routed through a functional, project, or dotted line whose ceiling differs from the home line, or exceeds a second line's explicit ceiling.
2. **Nemo dat quod non habet:** a manager grants a subordinate a standing schedule ceiling or ad-hoc spending mandate (`spendLimit`) exceeding the grantor's own standing authority on that date.

Previously, LeadOS had no standing DoA schedule, no *nemo dat* verification across mandates and schedule grants, and no deterministic one-over-one covering principal resolution across `buildMatrixAsOf` / `matrixJointApex`.

## Decision

1. **Exact Integer-Cent Append-Only Ledger (`doaSchedule`, Schema v138):**
   - Stores three append-only human act kinds: `declare` (`seatId`, `lineKind` in `'any-line' | MATRIX_LINE_KINDS`, `scopeClass` in `'general' | 'opex' | 'capex' | 'headcount' | 'vendor'`, 3-letter ISO `currency`, integer `limitCents` in `[0, 10^14]`, `effectiveFrom`, optional `effectiveTo`, `decidedBySeatId`, `decidedOn`, `reason`), `retire` (`targetLimitId`, `retiredOn`, `reason`), and `price-decision` (`decisionId`, `scopeClass`, `currency`, `amountCents`, `reason`).
   - Migration `137 → 138` initializes `doaSchedule: []` and `doaMarkers: []`. No limit is ever inferred from rank or job title, and no implicit FX conversion is performed.
   - Non-operator principals (`!seat.fullAccess`) cannot grant or retire their own limits (**anti-self-grant**), may only declare limits for seats strictly inside their downward DAG span (`targetNode.ancestors.has(acting.id)`), and cannot grant a ceiling exceeding their own active standing limit on `effectiveFrom` (**grant-time *nemo dat***).

2. **Pure As-Of Conformance & Covering Principal Read Model (`doaSchedule.js`):**
   - Evaluates three commitment populations against the as-of reporting DAG (`buildMatrixAsOf`) on each commitment's own date:
     1. Spending mandates (`state.mandates` with positive `spendLimit`), checking both grantor standing (*nemo dat*) and receiver standing on `proposedOn`.
     2. Committed or spent budget lines (`state.budgets.lines` where `max(committed, actual) > 0`), checking the budget's `sponsorSeatId` on the line's date.
     3. Decided decisions (`state.decisions` with `chosen`), priced only via single-currency linked budget lines/mandates or explicit `price-decision` acts; non-monetary decided calls are counted in `untypedDecisionsN` without prose parsing, while broken/mixed-currency financial links enter `recordRefusedN`.
   - Specificity precedence on `(seatId, lineKind, scopeClass, currency, asOf)` is strict: `(exactLine, exactScope)` > `(exactLine, general)` > `(any-line, exactScope)` > `(any-line, general)`. Contradictory active entries at the winning tier refuse evaluation (`structure-unreadable`).
   - Cross-line anti-splitting evaluates every active reporting line of a multi-line commitment subject: if a second line carries an active explicit limit below the commitment (`second-line-limit`), the commitment breaches even when the authorizing home line's ceiling would cover it.
   - Every breach resolves its minimal covering ancestor(s) along the as-of DAG: `unique` (exact minimal ancestor whose active limit covers `amountCents`), `matrix-tie` (incomparable covering ancestors across lines, plus `matrixJointApex` when unique), `above-apex` (no ancestor holds a covering limit — board/charter ratification required), or `unreadable`.
   - `countsReconcile` (8 exact partition identities) and `figuresComplete` (zero record refusals, unscheduled items, currency mismatches, or unreadable dates) are computed and rendered separately. `conformancePermille` is `null` below `testedN >= 3` or whenever `figuresComplete` is false.

3. **Shared Post-Commit Rule (`RULE-DOA-01`) & Aggregate CSV (#128):**
   - `doaScheduleRule` fast-exits in $O(1)$ when `doaSchedule` is empty (unless `doa.scan`), closes superseded asks, issues at most 12 marker-idempotent ratification `delegations` per commit to the unique covering seat or unique `matrixJointApex` with `issues-obligation` and DAG `rolls-up-to` provenance, and abstains cleanly on diamond ties, `above-apex`, or `unreadable` breaches.
   - CSV scope #128 (`matrix-doa`) exports 4 identity-free aggregate rows (`workspace`, `mandate`, `budget-line`, `decision`) with blank withheld rates when refused.

## Consequences

- Zero limits are fabricated on upgrade; unscheduled or cross-currency commitments refuse cleanly with printed reasons rather than defaulting to `0` or unlimited.
- Single-chain workspaces evaluate direct `managerId` chains seamlessly without matrix noise, while multi-line matrix workspaces catch cross-line authority shopping and *nemo dat* breaches automatically.
