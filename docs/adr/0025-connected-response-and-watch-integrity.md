# ADR-0025 — Connected response, bounded event delivery and Watch evidence integrity

- **Status:** Accepted
- **Date:** 2026-10-28
- **Related:** ADR-0008 (post-commit rules), ADR-0010 (savepoints and assurance), ADR-0024 (historical Watch design, corrected)

## Problem and decision

An alert promoted to a case or a continuity drill opening a case created records but did
not execute the normal case-creation cascade. The original runner accepted only the source
event; rule-created decisions and delegations could also miss their own subscribers. In
parallel, Watch's step-up ranking was described as a false-discovery guarantee despite
in-sample limits, approximate scores, dependent windows and repeated looks. Its demo replay
reconstructed historical inputs from today's mutable workspace and was not out-of-sample
validation. We choose useful connected workflows and explicit epistemic limits over broader
but unsupported claims.

## Delivery and savepoints

`runPostCommitRules` processes the root and derived events synchronously in breadth-first
order. Each rule runs against a JSON clone of the last successful draft; its audit events,
warnings and explicitly emitted events publish only on success. Failure drops that rule's
candidate, records `automation.rule_error` and continues other subscribers. A source action
is not rolled back merely because a subscriber failed. There is a maximum of 64 events per
transaction including the root, deduplicated by `(type, entity, entityId)`; a producer that
would overflow is rolled back and a warning recorded. Newly created case, decision,
delegation and portfolio records are inferred at successful rule boundaries and at the
source-action boundary. Source-action overflow records omissions and a warning rather than
rolling back the already-mutated source. Rule contexts do not expose the previous workspace.

The shared case-lifecycle subscriber runs opening-snapshot and ordinary case fan-out for
`case.created` and `case.automation.refresh`. Direct case options are retained; a Watch
response's explicit decision opt-in controls its case-created path. Assurance rehearsals
use the refresh event on a disposable clone, and live refresh recomputes from current state. Decision Tempo scopes derived case/decision
creation to related decisions rather than sweeping unrelated overdue schedules and class-wide
policy; ordinary root events and explicit scans retain their existing behavior.
Retry is targeted, not durable event sourcing or global exactly-once delivery. Re-triggering
the case subscriber follows existing idempotence markers; downstream effects can be blocked
by missing context, validation, queue bounds, explicit settings or other rule failures.
Only selected record creations have inferred events; not all sources, changes or deletes
are represented. Some legacy action-level effects still execute before the subscriber
savepoint. JSON cloning per subscriber per event increases synchronous cost; large-workspace
latency has not been benchmarked this session **[UNVERIFIED]**. There is no network or new
runtime dependency. Persistence errors are reported by the existing store separately from
rule warnings; in-memory acceptance does not prove an asynchronous write reached disk.

## Human response and privacy

Schema v40 keeps an optional validated response on a confirmed Watch alert so that retry can
use the original human context. Existing active people, goals and stakeholders may be
selected; FMEA must be a complete 1–10 triple. Any explicit three-point financial or capacity
estimate requires complete ratings under the existing valuation model. Unrated case PERT
magnitudes remain available, but probability-dependent losses, ROI, occurrence calibration and
scenario/Pareto values are withheld; later ratings do not backfill unknown opening forecasts.
The FMEA occurrence ÷ 10 and projected residual models are conventions, not validated event
frequencies. New-case and resolution dialogs no longer prefill human ratings. Missing inputs are
not treated as facts. A resilience drill breach no longer manufactures estimates, ratings or
an owner from recovery hours or a service steward. A response may create an ordinary case,
linked decision, delegation, goal check-in, opening forecast, capacity reserve, proposed
Decision Tempo timebox and unsent comms, only when the relevant inputs and policies permit.
No outcome is selected and no message is sent automatically.

The one-way verdict stays recorded on rule failure; Watch exposes promotion retry or
follow-through refresh with warnings. Automatic Watch sensing can be paused without blocking
an explicit scan or human confirmation. Conflict and anonymous-pulse entities remain out
of the generic typed relationship graph. Watch CSV contains opaque identifiers, numeric
scores and forecast provenance; response details and verdict notes remain local. This is
not a claim that every other export or feature was freshly privacy-audited **[UNVERIFIED]**.

## Statistical correction

The Shewhart/BH-style step-up operates on nominal scores. The required p-value validity,
dependence and sequential-testing conditions are not established; `m × q` is not an
expected false-discovery count. The budget, cooldown and demotion are workload governors,
not proof of detection precision. Human verdict precision and its Wilson interval describe
the judged subset, not objective truth or all suppressed alerts. Governance decisions for
stale alerts, budgets and low measured precision may be opened independently of a verdict.

New forecasts are issued before an entire future Monday–Sunday target and deduplicated by
series/target. After the target week, the next scan freezes the first available aggregate;
first capture after the following day is shown but excluded from skill. Later source
revisions are flagged without rewriting that capture. Legacy or demo replay rows are
preserved but excluded; comparisons are reported within each series only, after five timely
observations and nonzero total naive error. Adjacent weekly outcomes are rolling 28-day
aggregates, so they overlap history and each other; backdated/revised records before capture
cannot be detected. These diagnostics are descriptive, not immutable vintage evidence, a
causal finding or a predictive-performance guarantee. Historical demo scores are withdrawn.

## Verification and follow-up

Integration tests cover real-store Watch → case → connected artifacts, drill promotion,
source-created events, savepoint rollback, deduplication, event limits, retry and privacy.
Watch integrity tests exercise target timing, deduplication, frozen outcomes, revisions,
late/demo/legacy exclusion and per-series scoring. See `AI-SESSION-LOG.md` for final test,
build and repository status. Next: broader event coverage/durable receipts, immutable
historical input vintages and rigorously evaluated sequential procedures, and accessibility
and large-workspace performance checks; audit mixed-currency case rollups. Full repository and production outcome audits were
not performed **[UNVERIFIED]**.
