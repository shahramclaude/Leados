# Current-state audit — 2026-10-28, mitigation robustness session

## Identity and scope

First command: `git remote get-url origin && git status --short --branch`.
Verified origin `https://github.com/shahramclaude/Leados.git`, clean required branch
`arena/5fd3de44-leados`, starting at `3efdf9d`.

The starting tracked inventory contains 3,870 files, including **3,643 source files /
448,294 lines**. Of these, canonical `app/` has **148 tracked JS modules / 114,275
lines** before this feature. A mechanical file-content inventory is not a personal
line-by-line code review. This session **does not claim to have manually read every
source file**, or to have verified the thousands of quarantined TS/Next modules.
Those remain [UNVERIFIED]. This is a deliberate deviation from the standing exhaustive
read request, not an assertion that it was completed.

Reviewed in detail: package scripts, root entry point, canonical boundary checker,
store transaction/persistence/encryption paths, action/API conventions and complete
case-edit path, generalized post-commit runner, savepoint contract, propagation
contracts/ledger, assurance graph and preview logic, full action-level case rehearsal
service/view/worker, relevant case/decision/delegation schema normalization, learning
rule construction conventions, case detail/actions, decision routes and Decision Tempo
subscriber. Existing README/roadmap/research/log entries are historical claims unless
rechecked here. No rebuild is warranted.

## Blunt assessment before implementation

**Real, not a stub:** local-first ES-module app; versioned migration/normalization;
protected unsupported/corrupt-state handling; encrypted queued writes; generalized
bounded event queue and per-rule rollback; automatic derived record lifecycle events;
content-free failure receipts; typed operational graph with conflict/pulse exclusions;
action-level mitigation rehearsal in disposable stores with worker execution; one-on-one
prep and follow-through; operational finance/capacity, strategy and learning modules.
Focused tests verify actual record creation and saved reload, not mock action success.

**Shallow gap selected:** rehearsal economics still depend on a declared uncalibrated
FMEA occurrence/10 proxy. There was no independently entered event-probability range,
continuous uncertainty envelope, information ceiling or owned path to obtain missing
mitigation evidence. Keeping loss scenarios fixed did not test the assumption most
likely to reverse the recommendation.

**Integrity debt:** existing ordinary store writes adopt in-memory state even when
persistence fails; encrypted success is initially queued, not durable. Whole-workspace
localStorage has no durable cross-tab transaction isolation. Generic failure receipts
omit payloads, so not every rule can be reconstructed from a receipt. Decision questions
are editable and normalize to 2,000 characters; calling them immutable would be false.
The repo still includes a large legacy application and stale historical claims (for
example superseded anomaly/market-first assertions). No empirical outcome calibration
or market-first status was established this session.

**Dependency debt:** `npm ci --ignore-scripts` succeeds; npm audit reports **4 moderate
findings** in the legacy Drizzle tooling → esbuild-kit → old nested esbuild chain.
No dependency was added, updated or force-downgraded. The canonical browser module
boundary imports none of that tooling. This is not a claim that the repository has
zero dependency vulnerabilities.

**Missing / not verified:** cross-tab safe adoption; immutable prospective numerical
provenance; real employee intervention effects; dependent-range constraints; future
risk-rate calibration; loss severity changing under the intervention; actual
screen-reader usability, real-browser responsive layout and rendered contrast.

## Selected leap and rejection

Build an exact interval Savage regret analysis **and** a human-requested evidence gate
that propagates across case, DACI, owned delegation, coaching, typed graph and the
existing derived Decision Tempo subscriber. Reject another static dashboard and reject
applying a preview snapshot before cross-tab isolation exists. Quantitative ambition
is justified only if the assumptions are inspectable and uncertain evidence becomes
owned work, not a pseudo-AI score.

See [ADR-0029](./adr/0029-mitigation-robustness-evidence-gate.md) for calculation,
privacy boundaries, data-integrity contract, rejected alternatives and proof scope.
