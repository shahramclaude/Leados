# ADR-0026 — The Propagation Ledger: measured automation, copy-on-write savepoints and durable receipts

- **Status:** Accepted
- **Date:** 2026-10-28
- **Related:** ADR-0008 (post-commit rules), ADR-0010 (savepoints and assurance), ADR-0025 (bounded event delivery)
- **Research:** `RESEARCH.md` §65

## Problem

ADR-0008 gave LeadOS one generalized rule spine, and ADR-0025 made it deliver derived
events breadth-first inside the source transaction. By Session 60 fourteen rules hung off
that spine. Three problems had accumulated and none of them were visible from inside the
product:

1. **The savepoint cost was proportional to the whole workspace.** Every rule received
   `JSON.parse(JSON.stringify(draft))` — a full deep copy — once per rule per event. At
   5,792 records a single write spent ~1.45 s copying data the rules were about to ignore.
2. **Expensive scans ran unguarded and produced nothing.** On one `case.created` event the
   chain attempted 42 invocations and 5 applied; `earlyWarningRule`, `dynamicsRule` and
   `loadRule` spent ~198 ms of a 305 ms write concluding there was nothing to do.
3. **A failed propagation was silently lost.** A rule that threw was written to the audit
   log, shown as a warning, and the transaction carried on. The decisions, delegations and
   goals it existed to create were simply absent forever, with no way to ask for them again.

Session 60 correctly filed these as its top priority but measured the symptom (a slower
benchmark) rather than the cause. This session measured the cause first.

## Decision

Four changes, in one coherent unit, because they are all the same claim: **automation that
cannot be priced, cannot be trusted.**

### 1. Copy-on-write savepoints (`app/core/domain/savepoint.js`)

A savepoint materialises a private deep copy of a top-level collection the first time a
rule **reads** it, and nothing else. A rule that returns early on its event-type guard — which
is the first line of every rule in this codebase — now copies nothing at all.

Rollback semantics are unchanged and are proved so: the proxy is the only route a rule has
to the workspace, and nothing is written back until the rule returns without throwing. Copies
are made on write as well as on read, so a rule can never hand the committed workspace an
object it still holds a reference to.

The pre-existing strategy is preserved verbatim behind `savepoint: 'clone'` as a test seam,
so equivalence is checked against the real old behaviour rather than against a description
of it.

### 2. Decline collapse with a proof obligation

A scan rule that declined at workspace version V for event type T will decline again for a
later T at the same V. The engine records that verdict and skips the re-run.

This is a claim about the rules, so it is not assumed:

- Membership in `DECLINE_MEMO_RULES` is **opt-in per rule**. A rule not listed is never
  skipped, however expensive.
- `tests/app/propagation-ledger.test.mjs` probes the actual property: for every declared
  rule, two different entities of the same event type at the same version must produce an
  identical verdict. A rule that starts branching on the entity fails the test rather than
  silently losing work.
- Collapse applies **only** to an invocation that produced no write, no emission, no audit
  entry, no warning and no effect list.
- `declineMemo: false` is a test seam that proves collapsing changes the resulting workspace
  by zero bytes.

Declared trigger lists are deliberately **not** duplicated into a registry. Trigger prefixes
live in each rule module and already drift as features land; a second copy would be the exact
silent divergence this codebase keeps failing itself for. The engine never uses the contract
registry to decide whether a rule runs.

### 3. The Propagation Ledger (`app/views/propagation.js`, `#/propagation`)

Every `(rule, event)` pair records an outcome and a duration. The ledger reports:

- **Price** — invocations attempted vs applied vs declined vs collapsed, total rule time,
  wall clock, and the difference (engine overhead) reported separately rather than folded
  into a rule's share.
- **Waste** — rules invoked with zero applications, ranked by measured cost.
- **Coverage** — which event types moved the workspace, and which were delivered to zero
  applying rules.
- **Failures** — the receipt ledger, with retry.

Measurements are instrumentation, never state: they are not persisted and never exported,
because they describe one write on this device rather than anything about the workspace.

### 4. Durable receipts (Schema v41)

A rule failure writes a `propagationReceipts` record into the live draft — outside the failed
rule's savepoint, because the savepoint is exactly what was rolled back. The receipt holds
the event that triggered it (type, entity, entity id), the rule name, the error and a bounded
retry history (50 receipts, 20 attempts each).

`retryPropagationReceipt(id)` re-runs **only the failed rule** against current state. Replaying
the whole chain would duplicate the effects that already succeeded. The seam it needs is
`store.update(mutator, event, { rules, ruleEvent, suppressReceipt, afterRules })`:
`ruleEvent` lets the retry replay the original event while auditing `propagation.retried`;
`suppressReceipt` stops a retry filing a second receipt for a failure already recorded;
`afterRules` records the outcome on the receipt in the same transaction that ran the rule, so
a successful retry cannot leave a receipt saying "open".

Receipts are deliberately **content-free**. They record that a propagation was lost and which
event caused it — enough to re-run it, not enough to become a second copy of the workspace
outside the export-redaction and conflict-privacy boundaries.

## Consequences

**Measured** (demo workspace, one machine, median of 3–5 runs, `scripts/bench-savepoint.mjs`):

| Scenario | Baseline | After | Gain |
|---|---|---|---|
| Single `case.created`, 362 records | 233.1 ms | 138.5 ms | 1.7× |
| Single `case.created`, 5,792 records | 4,254.1 ms | 2,943.5 ms | 1.4× |
| Four-event cascade, 362 records | 369.6 ms | 54.0 ms | 6.8× |
| Four-event cascade, 5,792 records | 5,532.0 ms | 1,284.4 ms | 4.3× |

**Accepted costs and limits:**

- The proxy adds per-property overhead. It is a net win only because most rules read few
  collections; a rule that reads the whole workspace gains little. This is the published
  `proxy-clone` caveat and it was reproduced here (a first, unfair benchmark showed 0.7×).
- Collapse removes *duplicate* scans within a transaction, not the first one, and does
  nothing for a cascade of all-distinct event types — which is why the single-event gain
  stays at 1.4–1.7×.
- The dominant remaining cost is genuine analytical work in `earlyWarningRule`,
  `premiseRule` and `dynamicsRule`. That is now *visible* with a name and a number instead of
  being an unexplained regression; reducing it needs either incremental scans or a
  transaction-scoped scan cache, and neither was attempted here.
- A retry re-runs one rule outside the original transaction. If that rule depends on state
  another rule produced later in the original chain, the retry may still decline; the
  receipt records the attempt rather than claiming success.
- Receipts are bookkeeping. A resolved receipt means the rule ran without throwing against
  the workspace as it was at retry time — not that the resulting artifacts were correct.
- No browser-timing, large-workspace or real-assistive-technology profiling was performed
  **[UNVERIFIED]**.
