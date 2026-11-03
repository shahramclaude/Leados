# ADR-0078: Decision Rights Exchange — bounded authority contracts over existing work

**Date:** 2026-11-03 · **Status:** implemented · **Schema:** v84 · **Surface:** `#/mandates` · **Session:** 118 · **Built on:** [0075](./0075-command-chain.md) (reporting tree, five altitudes, LCA), [0076](./0076-operating-seat.md) (acting seat, disclosure ladder, vertical roll-up), [0008](./0008-post-commit-rules-hook.md) / [0026](./0026-propagation-ledger.md) (shared transactional spine), [0006](./0006-canonical-zero-build-app.md) / [0007](./0007-legacy-next-tree-disposition.md) (canonical boundary)

---

## 1. Context — the gap the audit found

Sessions 115–117 built the hierarchy (tree + altitudes), the acting position (seat + disclosure + roll-up) and the bench certificate. What remained missing is the thing a leader actually *does* with authority: **move a bounded decision right to another span and get it back with proof**.

The workspace already had `delegations` (a task handed to a person) and `decisions` (a DACI call). Neither is a contract:

- A delegation says *who does the work*, not *what they may decide, until when, against which budget, and what happens if they cannot*.
- A decision records a choice, not the transfer of the right to make it.
- Nothing reconciled expiry, scope drift, budget drift or a refused handoff. Work could sit "delegated" forever with no recovery owner.
- Executive roll-ups could see counts but had no drill-down into the authority partition that produced them.

Competitive scan (RESEARCH §101, snippet-level, 2026-11-03): Workday approval chains and time-boxed delegations, ServiceNow `sys_user_delegate` windows, Microsoft Copilot Studio agent flows with human approvals and unavailable-approver delegation, Aera decision-intelligence authority thresholds and decision memory, Cloverpop decision flows, Visier hierarchy-derived security and aggregate cuts, Lattice/Culture Amp AI coaching. **Approval chains, delegation windows and decision ledgers are not new.** The defensible slice is a *leadership-specific closed-loop handoff contract* that joins explicit rights, two-sided acceptance, capacity evidence, real budget encumbrance, expiry/recovery and altitude-scoped disclosure to the same operational work graph — not another approval form or analytics score.

## 2. Decision

Add one collection, `mandates`, and one surface, `#/mandates` (nav **Decision rights**; aliases `decision-rights`, `authority`, `handoffs`). A mandate is a **bounded authority contract over an existing open work source**, never a new task inbox and never a confidential record.

### 2.1 Contract shape

Each mandate names:

- `sourceType` / `sourceId` — an open, non-confidential item from the shared `SIGNAL_SOURCES` registry (case, decision, delegation, goal, …). Confidential conflicts, pulses and coaching content are excluded by `sourceFor`.
- `fromSeatId` / `toSeatId` — leadership spans in the reporting tree.
- `outcome`, `stopCondition`, `actions` (`replan`, `spend`, `commit`, `reassign`), `effortDays`, `expiresOn`.
- `capacity` — a measured snapshot from the existing load model (`headroomDays`, `measuredItems`, `openCommitments`). Unknown is `null`, never zero.
- `spendCeiling`, `currency`, `budgetId` — required for the `spend` right.
- `sourceFingerprint` — content hash of the source at offer time (title, people, due, severity; **not** the age-derived required rank, which changes as work sits).
- append-only `history` of transitions.

Statuses: `proposed → active → delivered → completed`, with `returned`, `expired`, `revoked` as loss-of-authority terminals.

### 2.2 Routing (political science + graph theory)

`routeContract` reuses `buildChain` / `buildSeats`:

- Down only if the receiver's span contains every affected person; up only if the receiver is an ancestor of the sender and the source is in the sender's span.
- Cross-span work is refused sideways and pointed at the **lowest common ancestor** (Tarjan LCA / span-of-consequence).
- Rank floors: the source's required altitude, the action's floor (`spend` ≥ 3, `commit` ≥ 2), and the high-consequence safety convention (severity ≥ 3 cannot go below director).
- Real calendar dates only (Feb 31 is refused, not rolled over).
- Spending requires an active, same-currency budget the sender can see in full, whose period covers the expiry, with unencumbered headroom ≥ ceiling and fewer than 120 lines.

Frameworks: principal–agent alignment (Jensen & Meckling 1976), residual control rights (Grossman–Hart–Moore), Jaques time-span of discretion, Mendelow stakeholder salience for the affected span.

### 2.3 Two-sided lifecycle (operational)

1. **Offer** (`proposed`). No authority granted. Capacity plan required when headroom is unknown/insufficient.
2. **Accept** (`active`). Receiver acknowledges outcome/limits/return trigger in their own words; capacity and budget headroom are re-checked; source fingerprint must still match. Opens one DACI decision and, below the workspace root, one owned `recommend`-authority task. **Silence is never consent.**
3. **Deliver** (`delivered`). Receiver records observable evidence, at least one existing visible evidence record (the acceptance task is automatic), and actual spend within the ceiling. Delivery is **not** verification.
4. **Verify** (`completed`) or **reject** (`returned`). Only the sender verifies. The acceptance decision is graded `good`/`bad`.

Return, revoke, expiry, source/scope drift and budget drift all open a **named recovery path** (`RULE-MND-03`): a task at the sending span, or a DACI call at the workspace root. The acceptance decision is graded `bad` rather than left pending.

### 2.4 Finance (commitment accounting)

`reconcileBudget` (`RULE-MND-02`) writes real budget lines:

- Acceptance encumbers the ceiling (`committed`, `actualAmount: null`).
- Verification posts the recorded actual (`spent`).
- Loss of authority releases the encumbrance **only when no actual was recorded**; a recorded actual survives revocation/return/expiry (money already spent is not erased by a rejected outcome).
- Unknown actual is never inferred as zero.

### 2.5 Disclosure and roll-up (statistics + hierarchy)

- `authority` record class: `detailCeiling 5` so executives still see rows, but rank ≥ 4 non-parties get redacted title/outcome/evidence/history/capacity/close notes and a method-only source route.
- `rollupMandates` partitions by **receiving span**: a parent is the exact sum of its own receipts and disjoint child spans. No ancestor double counting. Drill-down via `?panel=rollup&span=` never changes the enterprise total.
- Below five contracts: counts only, no acceptance rate or performance claim (small-cell discipline).
- CSV scope `decision-rights` (#74) and the plain-text brief are aggregate-only: no ids, names, titles, notes or money.

### 2.6 Propagation

`mandateRule` (`RULE-MND-01..03`) is registered before the Attention Market and the final `seatRule`, so the acceptance task and recovery work fan up every leadership ancestor through the existing `RULE-SEAT-01` typed `rolls-up-to` edges **in the same atomic transaction**. Typed edges: `authorizes`, `binds-receiver`, `tracks-followup`, `decides`, `funds`, `recovers-authority`. Automatic reconciliation is pausable (`mandateAutoPropagate`); explicit **Reconcile now** always runs.

## 3. Storage and safety

- Schema v84, additive `MIGRATIONS[83]` → `mandates: []`. No existing record is rewritten.
- `normalizeMandates` is fail-closed: incomplete, duplicate, unknown-status or spending-without-currency rows are dropped with a warning; no authority is inferred.
- All mutations go through `store.update` (clone → mutator → audit → rules with savepoints → persist). Mutators use the transaction `draft`, never `store.state`.
- The local seat is a **workflow declaration, not authentication**. The surface and `index.html` meta say so. Full workspace backups still contain the whole workspace.

## 4. Consequences

- A leader can move a decision right down or up with an explicit boundary, and the workspace reconciles what happens when it is refused, expires, drifts or overspends.
- Executives get an exact authority partition with drill-down, not a repeated ancestor count.
- The feature is honest about what it is not: no tenant isolation, no cryptographic identity, no external notification, no autonomous spending.

## 5. Verification

`tests/app/decision-rights.test.mjs` (10 tests) pins schema, routing refusals, the two-sided lifecycle with cross-module + vertical propagation, capacity/fingerprint re-checks, budget encumbrance/actual/release, recovery, permissions, roll-up/redaction/aggregate export, pause/scan, axe-clean panels and the succession brief download regression. Full suite, boundary, links, lint and standalone results are recorded in `AI-SESSION-LOG.md` (Session 118).
