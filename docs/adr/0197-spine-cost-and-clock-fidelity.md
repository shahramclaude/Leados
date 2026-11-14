# ADR-0197 — Automation Spine: Measured Cost, Frozen Pass Inputs, and Clock Fidelity

Date: 2026-11-14 · Session 265 · Schema v156 unchanged · Status: Accepted

## Context

The post-commit spine (`app/core/domain/postCommit.js`) is the one path every
LeadOS mutation runs through. By Session 264 it carries 124 rules, and a single
ordinary write considers thousands of `(rule, event)` pairs. `propagationLedger.js`
has priced that since ADR-0026 and its own docblock names the risk precisely:

> It is also the reason a store write can cost seconds on a large workspace, and
> until now nothing in the product said so.

Measuring the shipped demo workspace this session made the cost concrete, and
found four defects that are all the same defect: **a rule pays for work it has
already done, and in one case writes a fact the transaction cannot support.**

Measured on the demo (`buildDemoState`, 25 premises, 131 decisions, 78 typed
links), one `case.updated` transaction:

| | pairs | declined | rule time |
|---|---|---|---|
| before | 3,813 | 3,732 (98%) | 25,919 ms |
| after | 3,813 | 3,732 (98%) | 6,000 ms |

**89% of all rule time was spent in invocations that produced nothing.** The
largest single contributor was `premiseRule`: 12,099 ms of pure waste.

1. **A per-premise recomputation of a per-pass fact.** RULE-PREM-02's
   `load-saturation` sensor reads `buildLoadReport`. That report is a seeded
   Monte Carlo over every active person, and `premiseRule` rebuilt it once per
   premise — 25 identical reports per pass, plus a re-derivation of every other
   sensor's scope against the same inputs.
2. **The same comparison twice, per pair.** `savepoint.changed()` was called
   twice for every applied pair — once by the engine to snapshot collection
   identity for the lineage step, once inside `commitInto`. Each call
   re-serialised the base value of every touched collection.
3. **A whole scan recomputed inside one rule invocation.**
   `earlyWarningRule` calls `scanWatch(draft, now)` and then, one line later,
   `buildWatchReport(draft, now)` — which calls `scanWatch` again. The whole
   12-series × 26-bucket reconstruction (with its SPC statistics) ran twice to
   produce the same figures.
4. **A rule stamping the wall clock into the record.**
   `signalPathRules.js` wrote `at: new Date().toISOString()` into every channel
   class note and history entry, ignoring the transaction's injected `now`.

## Decision

### 1. One evidence snapshot per `premiseRule` pass

`collectPremiseObservations` accepts an optional `snapshot`. `premiseRule` builds
one (`createEvidenceSnapshot`) and passes it to every premise in the pass. The
snapshot memoises the load report for the pass.

**The claim, stated so it can be falsified.** A `premiseRule` pass derives every
premise's evidence from `people`, `settings`, `portfolio`, `dependencies` and
`links` as they stood when the pass began. It then writes `premises`,
`premiseOutcomes`, `people.talkingPoints` and `links`. Of those, only `links` is
an input to a sensor (`buildPremiseScope`); the load report reads none of them.
The sensors never read the premise ledger, never read evidence appended earlier
in the same pass, and never see a derived event from this rule (it emits none).
The report is therefore fixed for the pass, and freezing it is observationally
free.

`tests/app/premises.test.mjs` asserts that equivalence directly: a snapshot pass
and a rebuild-per-premise pass produce **byte-identical** observations for every
premise on the demo, including while the rule's own `talkingPoints` writes are
interleaved between premises. The snapshot is per-pass, not a cache across
transactions: the next `premiseRule` invocation builds a new one, so a capacity
or decision write is read on the very next write, exactly as before.

### 2. `savepoint.changed()` answers once

The result is memoised and an empty answer is a shared frozen `[]`. The engine's
two calls describe the same instant — a rule has returned and nothing can mutate
either side — so the second comparison was measuring the same bytes.
`discard()` clears the memo. A guard-only rule still touches nothing and still
pays nothing: the memo is only reached for keys a rule actually touched.

`tests/app/propagation-ledger.test.mjs` asserts both halves: the second call
returns **the same array** (not a second identical one), the empty case allocates
nothing, and the pre-existing byte-equivalence proofs between the copy-on-write
and eager strategies still hold.

### 3. A caller that holds the scan passes it in

`buildWatchReport(state, now, precomputedScan)` accepts the scan it was about to
perform. `earlyWarningRule` passes the one it already holds. The scan is a pure
function of `(state, now)`, so omitting the argument is identical to before.
`tests/app/early-warning.test.mjs` asserts the full report is byte-identical
either way.

### 4. Every rule writes on the transaction clock

`signalPathRules.js` threads `ctx.now` through `note()` and `history()` and
formats it with a fail-closed `isoNow`. A missing clock writes the epoch, never
the wall clock.

This was not only a performance defect. It made two runs of the same transaction
over the same workspace produce different bytes — which is exactly what the
savepoint equivalence proof compares — and it let a restored or replayed
workspace carry notes claiming a time the action did not happen at. It was found
*because* fix 2 made a pre-existing equivalence test fail. The test in
`tests/app/signal-path.test.mjs` asserts a note carries the injected time, that
it moves when the injected clock moves, and that it is not `new Date()`.

### 5. The ledger draws the distinction that makes its waste figure actionable

`rankWaste` prices rules that applied nothing. That is honest but not actionable:
most of them are guards, and a guard declining is free by design. `scannerWaste`
(and `ledger.scanners`, `totals.scanWasteMs`, `totals.scanWastePct`) separates
out the rules whose **own declared contract** says `scansWorkspace: true` and
which then still declined. Those read the record to discover there was nothing to
do, and the leader paid for that read on every event that woke them.

The figure is designed to refuse rather than guess: a rule with no declared
scanner contract is never assumed to be one, a partly-productive scanner is never
reported as wholly idle, and the share is always of the rule's **own** time, not
of the chain. The Propagation Ledger renders it as its own card
(`#/propagation?tab=price`), because the fix belongs in the rule's inputs, not in
the declaration.

## What this does NOT claim

- **No rule was removed, reordered, or made to skip an event.** Pair counts are
  unchanged (3,813 on the measured transaction). The spine's dispatch model is
  untouched: the decline memo is still opt-in, still proven per rule by test, and
  no new rule joined it this session.
- **No state, schema or stored record changes shape.** `SCHEMA_VERSION` stays
  v156; no migration; no normaliser.
- **These figures are the demo workspace on this sandbox**, measured with the
  engine's own `metrics` recorder, not a production benchmark. The per-rule
  milliseconds will differ on another machine; the *proportions* are the claim,
  and they are reproducible with the harness described in the PR.
- **The two remaining large scanners are not yet optimised.** After these fixes
  `earlyWarningRule` and `premiseRule` are still the two most expensive rules on
  a `case.updated`, and both are now visible in the new card with measured
  numbers rather than an opinion.

## Consequences

- Four realistic transactions (case update, settings write, decision create,
  delegation update) went from **46.0 s to 16.9 s** of rule time on an idle
  sandbox — 2.7×, and 19.8 s with the full test suite competing for the same
  CPU, so ~2.3× under load. Workspaces are identical either way; pair counts are
  unchanged.
- The product can now name the automation cost a leader is paying and separate
  the part a code change can remove from the part that is a guard doing its job.
- Clock fidelity is a testable property of the module rather than a convention.
  Any future rule that reaches for `new Date()` now fails a named test.
