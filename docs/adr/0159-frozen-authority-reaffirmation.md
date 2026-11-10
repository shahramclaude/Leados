# ADR-0159: Frozen Authority Re-Affirmation & Drift Settlement

- **Status:** Accepted
- **Date:** 2026-11-10
- **Session:** 220
- **Schema:** v130 (`authorityReaffirmations`, `authorityReaffirmationMarkers`)
- **Rule:** `RULE-ACR-01` (`app/core/domain/authorityContinuityRules.js`)
- **Surface:** `#/matrix?panel=continuity` (`app/views/matrixContinuityPanel.js`)
- **Export:** `authority-continuity` (CSV scope #117 extended additively)

## Context

ADR-0156 built the Matrix Authority Continuity Register (`#/matrix?panel=continuity`): it reads the workspace's frozen decision portfolio — finalised `meritCycles`, decided `decisions`, and committed/frozen/superseded `boardMemos` — against the structure of each record's own effective date and refuses `populationClaim` whenever any record is `drifted`, `unattributed`, or `unreadable`.

Reporting drift without a governed settlement act left the chief and matrix principals with a permanent alarm and no clean way to act on it without rewriting history. Worse, in a multi-manager matrix a naive "approve drift" flag would fail in three predictable ways:

1. **Rewriting the structural measurement:** flipping `verdict` from `drifted` to `attributable` or flipping `populationClaim` to `true` after a human click would erase the structural fact that authority moved.
2. **Unilateral sign-off across contested lines:** when a subject's RAPID right (`pay` for `merit-cycle`, `performance` for `decision` / `board-memo`) is contested across two matrix lines or spans recipients under multiple managers, letting one line manager sign off unilaterally would silence the peer line.
3. **Silent inheritance across subsequent re-orgs:** if Manager B stands behind a drifted decision today and the matrix moves tomorrow to Manager C, a stored boolean `"settled: true"` would credit Manager C with an agreement Manager C never gave.

## Decision

1. **Append-only human settlements (`Schema v130`):**
   - `authorityReaffirmations` stores only dated human acts (`outcome: 'stand-behind' | 'refer-reopen'`, `decidedOn`, `decidedBySeatId`, `via`, non-empty sorted `underAuthorityIds`, stated `reason >= 8` chars, and optional `referralDecisionId`). Malformed rows are dropped with explicit warnings on load — never repaired.
   - Frozen records (`meritCycles`, `decisions`, `boardMemos`) are **never edited** on read or on settlement.
2. **Two distinct portfolio claims, never collapsed:**
   - `populationClaim` / `populationClaimReason` (ADR-0156) remain untouched: structural continuity without human intervention.
   - `reconciledClaim` / `reconciledClaimReason` (ADR-0159) are derived alongside it and granted only when `coveredN >= populationFloor`, `uncoveredN === 0`, `unattributedN === 0`, and every drifted record has a current, non-stale `stand-behind` (`unsettledDriftedN === 0`, `staleN === 0`, `referredN === 0`).
   - `unreadable`, `unattributed`, and already `attributable` records are refused by both settlement commands.
3. **Live matrix standing & `matrixJointApex` enforcement (`canSettleAuthority`):**
   - Single live holder `[M]`: only `M` or a DAG leadership ancestor of `M` (or full-access/apex leader) may settle.
   - Contested or multi-manager live holders `[M1, M2, ...]`: no single peer line holder may sign off unilaterally; only a common DAG ancestor above **all** holders (starting at `matrixJointApex`) may settle.
   - Unowned live right: no subordinate manager may claim it; only the workspace apex may act.
4. **Derived staleness on subsequent drift:**
   - Every read compares `act.underAuthorityIds` against today's live `underAuthorityIds`. Any change in the live right-holder set immediately renders the prior settlement `stale` and re-opens the question for the new authority.
5. **Governed automation (`RULE-ACR-01`):**
   - On matrix/structure/freeze commits (in matrix workspaces) and on explicit continuity resolutions or scans, `RULE-ACR-01` issues one idempotent `delegation` (`issues-obligation` + `rolls-up-to` DAG edges) to the unique live right holder or unique `matrixJointApex` principal, closes superseded tasks once settled, and refuses to guess when joint principals tie in a matrix diamond (`ambiguousApexN`).
   - `authorityReaffirmRefer` opens an undecided DACI `decision` wired to the drifted source and its subjects via typed provenance links.

## Consequences

- Zero silent rewrites of frozen decisions or structural continuity claims.
- Exact conservation across portfolio and per-type buckets: `settledN + referredN + staleN + unsettledDriftedN === driftedN`.
- Single-chain workspaces remain completely inert on automatic commits while retaining full explicit continuity scan and settlement support.
- Outside-span current-authority and settler names are withheld under scoped seats while preserving exact verdicts and counts; CSV scope `#117` and the brief remain strictly identity-free.
