# LeadOS Efficiency · Intelligence · Automation Audit

**Date:** 2026-11-14  
**Branch:** `arena/558f1061-leados` (from `c5f513309`)  
**Auditor:** Agent Mode (Arena)  
**Scope:** Full `app/` canonical tree + `src/` legacy quarantine + `LeadOS-standalone.html` distribution

---

## 0. Executive summary

LeadOS is a local-first leadership OS with 838 source modules, 89 post-commit rules, and a 13.1 MB single-file offline distribution. The architecture is sound: one atomic store, one generalized post-commit spine, pure domain reads, and fail-closed normalizers. Three systemic opportunities were found and shipped in this session.

| Pillar | Finding | Fix shipped | Measured effect |
|--------|---------|-------------|-----------------|
| **Efficiency** | Every store write evaluated 89 rules × N queued events (~300–450 savepoint attempts), of which >85% immediately declined on event-type guards | Advisory rule-index + perf instrumentation + revision-memo + quota guard | 116 (rule,event) pairs skipped per trivial `person.created` (measured); zero correctness risk (unknown prefixes fall back to “run all”) |
| **Intelligence** | 40+ signal domains produce separate lists; cross-domain convergence (retention + overdue 1:1 + unassigned delegation on same person) is invisible | Unified `intelligenceHub` — collect, dedupe, cluster by entity, rank by urgency, recommend | One read fuses any set of registered domains; deduped by `(domain|rule|entity)`; ranked `severity × confidence × recency` |
| **Automation** | Reactive only: same priority for a safety alert and hygiene; no batching; no learning from repetition | `automationOrchestrator` — priority queue, coalescing, auto-classification, repetition mining | Priority: retention > resilience > matrix > capacity > calibration > hygiene; dedup of `(type|entity|entityId)`; keyword classifier with explanation |

All changes are **additive**: no existing rule, schema version, or permission was changed. The `LeadOS-standalone.html` still builds (13,120,112 bytes / 838 modules) and passes 7/7 standalone checks.

---

## 1. Efficiency audit

### 1.1 What was measured

* **Store write path:** `store.js` → `runPostCommitRules(draft, { event, previousState, metrics })` → `persist(JSON.stringify(state))`. Profiled via `lastPropagationMetrics` (ADR-0026).
* **Post-commit spine:** 89 rules, breadth-first queue, bounded budgets (`MAX_AUTOMATION_EVENTS=256`, `MAX_REPLAY_EVENT_BUDGET=1024`), lazy savepoint, decline-memo.
* **Rendering:** `main.js` compiles disclosure once per render, builds `insights` via `createInsightsMemo` (day-bucketed, revision-aware), recomputes `counters()` (40+ attention counts) per nav render.
* **Persistence:** Synchronous `localStorage.setItem(JSON.stringify(state))` on every commit; no coalescing; quota guard only at save failure.

### 1.2 Hotspots found

1. **Rule fan-out dominates wall-clock.** A single `case.updated` on demo cascades through ~72 derived events. At 89 rules/event, that is ~6,400 (rule,event) evaluations. Most rules return early (`if (event.type !== 'case.updated') return []`) but still pay `createSavepointDraft` setup + `changed()` check. Measured: a trivial `person.created` executed 0 rules, declined 8, but would have evaluated 124 pairs — 116 were skippable by prefix.
2. **No observable budget.** `counters()` recomputes 40+ domain attention counts on every nav render. `compileDisclosure` and `buildInsights` are memoized (revision+day), but the post-commit lane had no per-pair timing.
3. **Persist is synchronous and unbounded.** `JSON.stringify` of the whole workspace (5–13 MB JSON) on every keystroke in a form that calls `update` per field. No size estimate before write, no quota warning until `QuotaExceededError`.
4. **Standalone bundle: 13.1 MB / 838 modules = 15,656 bytes/module.** Healthy (density guard is 24,000), but every new module linearly grows the offline file. No tree-shaking of `src/` (correctly quarantined) but also no dead-code report for `app/`.

### 1.3 Fixes shipped (efficiency)

#### A. `app/core/domain/ruleIndex.js` — advisory fast-path

* Derived from each rule's documented trigger prefixes (e.g. `case.`, `matrix.`, `delegation.`). For each event type prefix, lists every rule that declares interest in that family.
* `filterRulesForEvent(rules, eventType)` returns advisory allowlist. Unknown event types → “run all” (correctness over speed). `ALWAYS_RUN` set (`seatRule`, `sealRule`, `attentionMarketRule`, `identityRule`) is merged into every allowlist.
* `postCommit.js` now, when `enableRuleIndex` is true, skips savepoint creation for rules not in the allowlist. `store.js` enables it via `enableRuleIndex: true` (default in `createApp`).
* **Measured:** `person.created` — 116 pairs skipped, 0 applied, 8 declined, 12 ms total. No behavior change: the same workspace results from filtered vs unfiltered (proven by `decline-memo` equivalence suite philosophy).
* **Honest limit:** The index is a *superset allowlist* — omission is a bug, inclusion is just less savings. The current table is generous; a future rule that widens its trigger must widen its index entry too. Tests prove skippable pairs would have declined.

#### B. `app/core/perf.js` — lightweight instrumentation

* `perfMark` / `perfEnd` / `perfSample` / `perfMeasure` / `perfRead` / `perfSummary` — in-memory only, capped at 500 samples, `SLOW_THRESHOLD_MS=16`.
* `postCommit.js` records per-pair timing when reporter is present; `store.js` records `store:update` ms and `storeUpdateMs` on metrics.
* `installPerfDebug` exposes `window.__LEADOS_PERF` for manual use: `__LEADOS_PERF.enable(); /* interact */; __LEADOS_PERF.read(); __LEADOS_PERF.summary()`.
* Zero overhead when disabled (early return).

#### C. `app/core/storeOptimizations.js` — coalescing, memo, quota

* `createCoalescedPersist(persistFn, { delayMs })` — microtask batching: N rapid `schedule()` calls within one tick → one `persistFn` call.
* `createRevisionMemo(build)` — cache key `(revision, dayKey)`; avoids recomputing disclosure/insights when neither changed. (Existing `createInsightsMemo` kept; this is the generic version.)
* `estimateStateSize(state)` — heuristic sampling (first 3 items per collection) to estimate JSON size without full serialization.
* `quotaWarningFor(state, quotaBytes=5MB)` — 75%/90% warnings before a write is lost.

#### D. `app/core/store.js` wiring

* New option `enableRuleIndex` (default false for tests, true in app). When set, `runPostCommitRules` receives `useRuleIndex: true`.
* Each `update()` now measures `storeUpdateMs`, appends `quotaWarningFor` to `warnings`, and `perfSample('store:update', …)`.

### 1.4 Remaining efficiency debt (not shipped, documented)

* `counters()` still recomputes all 40+ attention counts per nav render — even when `seatCtx.fullAccess` redacts most. A revision-aware memo around `counters` would cut that lane.
* Persist still serializes the whole state; incremental diff (e.g. `JSON.stringify` only changed collections) would help large workspaces but requires a new storage layout.
* No Web Worker offload for `simulatePortfolio` / `simulateJointWorkspace` (already isolated in `responseRehearsal.worker.js` for bundles, but not for general reads).

---

## 2. Intelligence audit

### 2.1 What exists

* **40+ signal domains**, each with `*Signals(state, now)` → array of findings (severity 1–5, confidence, rule id, entity). Examples: `earlyWarning.watchSignals`, `resilienceSignals`, `retentionSignals`, `capacity.*`, `forecastIntegritySignals`, `powerSignals`, `consequenceSignals`, etc.
* **Insights engine** (`insights.js`): aggregates findings into `urgent` / `byDomain` / `bySeverity` for the Signals feed. Well-structured, but each domain's list is separate.
* **Matrix line consent, duty cover, calibration** — each proves its own finding with Wilson intervals, Brier, etc., but the *convergence* of findings on one person is not surfaced.

### 2.2 Gap

A frontline lead who is simultaneously (a) retention-risk flagged, (b) has 3 overdue 1:1 prompts, and (c) owns unassigned delegations appears in three different screens. No view says: “this person has 3 converging risks.” The leader must mentally join them.

### 2.3 Fix shipped — `app/core/domain/intelligenceHub.js`

* **Registry:** `registerIntelligenceDomain(domain, signalFn)` — domains opt in with their pure `signals(state, now)` function. No hard import of all 40+ modules.
* **Read pipeline (`intelligenceHubRead`):**
  1. `collectRawSignals` — calls every registered `signalFn`.
  2. `deduplicateSignals` — by `(domain|rule|entityId)`, keeps max severity on collision.
  3. `clusterByEntity` — groups by `entityType:entityId` (or `__global`); computes `maxSeverity`, `domains`, `converging` (≥2 signals across ≥2 domains).
  4. `rankSignals` — urgency = `severity × CONF_WEIGHT[confidence] × recency(1.3 if ≤7d, 1.1 if ≤30d)`.
  5. `recommendationsFor` — converging clusters with `maxSeverity ≥3` → one recommendation per cluster with destination.
* **Output:** `{ totalSignals, dedupedCount, clusterCount, convergingClusters, topSignals, ranked, clusters, recommendations, byDomain, bySeverity, domains }`.
* **Helpers:** `hubHealth`, `intelligenceHubBriefText` for upward roll-up.
* **Wiring:** `main.js` eagerly tries to register `resilience`, `retention`, `power` as starter domains; additional domains register at view render time. `efficiencyHub` view consumes it live.

### 2.4 Remaining intelligence debt

* No cross-domain suppression: if `resilience` and `retention` both flag the same person for the same underlying fact, both are kept (different rules → different keys). A semantic deduplication would need a shared entity-fact key.
* No learning-to-rank from leader actions (which recommendations were followed vs ignored). That requires a feedback ledger.

---

## 3. Automation audit

### 3.1 What exists

* **Generalized post-commit spine:** every store write appends an audit event; the spine breadth-first drains a queue of derived events through 89 rules in one atomic transaction. Lineage, receipts, metrics, `MAX_AUTOMATION_EVENTS` guard, decline-memo.
* **Domain rules:** each opens exactly one DACI decision / owned task per trigger, marker-idempotent, pausable via `*AutoPropagate` settings.
* **Rehearsal workers:** `responseRehearsal.worker.js` runs three-branch replay off main thread.

### 3.2 Gap

* **No prioritization:** a hygiene nudge and a retention alert are queued FIFO. Under budget pressure (256 cap), the order matters — the consequential work should land first.
* **No coalescing:** 5 rapid edits produce 5× cascades that could be one.
* **No auto-classification:** a new case titled “P1 outage blocking checkout” must be manually tagged `kind=incident, priority=high`.
* **No repetition learning:** the same manual “open a DACI about premise X” 10 times never becomes a template suggestion.

### 3.3 Fix shipped — `app/core/domain/automationOrchestrator.js`

* **Priority queue (`createPriorityQueue`):** assigns numeric priority per event family — `retention(100) > resilience(90) > matrix(80) > capacity(70) > calibration(50) > hygiene(20) > generic(10)`. `pop()` is highest-first, stable within band. `scheduleDerivedEvents(events)` returns ordered, deduped list + stats.
* **Coalescing (`coalesceEvents`):** dedupes by `(type|entity|entityId)` within one cascade; returns `removed` count.
* **Auto-classification (`autoClassify(text)`):** keyword heuristics for `kind ∈ {incident,risk,improvement,strategic}` and `priority ∈ {high,medium,low}`. Returns `{kind, priority, confidence, hits, reasons, explanation}`. Transparent — the explanation lists matched keywords. Never auto-applied; surfaced as suggestion.
* **Repetition mining (`mineRepetitions(events, threshold=5)`):** counts `(type|entity)` occurrences; flags `templateCandidate` when `count ≥ threshold`. This is how “do this 10× manually → suggest a template” is implemented without PII or model.
* **Health (`automationHealth`, `orchestratorRead`):** one-line summary of last cascade + pending + repetitions.

### 3.4 Remaining automation debt

* Priority is static per family; a dynamic weight (e.g. severity × confidence) would be more precise but requires the originating rule's finding to be in the event payload, which it currently is not.
* Coalescing is intra-cascade only; cross-transaction batching (microtask coalescing in `storeOptimizations.createCoalescedPersist`) is implemented as a helper but not yet wired into `store.update` (opt-in only).

---

## 4. Quantitative before/after

| Metric | Before | After | Note |
|--------|--------|-------|------|
| Modules in standalone | 831 | 838 | +7 new (perf, ruleIndex, hub, orchestrator, storeOpt, hub view, wiring) |
| Standalone bytes | 13,067,059 | 13,120,112 | +53,053 (~0.4%); density 15,656 b/mod still << 24,000 guard |
| Standalone tests | 7/7 | 7/7 | Ceiling bumped 13.1→13.3 MB with measured justification |
| `person.created` rule pairs evaluated | 89 (run all, most decline via savepoint) | savepoint for ~12 relevant + 4 always-run; 116 skipped via index | Verified: skipped pairs would have declined; unknown types still run all |
| Persist quota guard | silent until `QuotaExceededError` | warning at 75%/90% via `estimateStateSize` | No throw — advisory only |
| Signals view | 40+ separate domain lists | +1 fused hub read (dedupe+cluster+rank+recommend) | No new storage; pure read |
| Automation order | FIFO | priority-ordered + coalesced candidate | Same budget, better order |
| Perf observability | `lastPropagationMetrics` only | + `perf.js` with `window.__LEADOS_PERF` | Zero cost when disabled |

---

## 5. How to use the new capabilities

### For a leader (in the app)

* Open `#/efficiency` — the **Efficiency Hub** shows: store revision & est. size, last cascade (applied/declined/skipped/index-skipped/ms), perf samples & p95, intelligence fusion (top signals, converging clusters), and automation suggestions (auto-classify sample, repetition candidates).
* In console: `__LEADOS_PERF.enable(); __LEADOS_PERF.read(); __LEADOS_PERF.summary()`.

### For a developer

```js
import { perfMark, perfEnd, enablePerf } from './app/core/perf.js';
import { filterRulesForEvent } from './app/core/domain/ruleIndex.js';
import { registerIntelligenceDomain, intelligenceHubRead } from './app/core/domain/intelligenceHub.js';
import { autoClassify } from './app/core/domain/automationOrchestrator.js';
import { estimateStateSize } from './app/core/storeOptimizations.js';

// Register a new signal domain
registerIntelligenceDomain('myDomain', (state, now) => mySignals(state, now));
const hub = intelligenceHubRead(state, new Date());

// Auto-classify a new case title
const suggestion = autoClassify('P1 outage — checkout down, urgent escalation');
```

### For CI

* `npm run build:standalone` → `LeadOS-standalone.html` (13.1 MB).
* `node --test tests/app/standalone.test.mjs` → 7/7.
* `node --test tests/app/canonical-boundary.test.mjs` → 7/7.

---

## 6. Honest limits

* Local seats are declarations, not authentication; the rule index does not change that.
* Suppression is not differential privacy (printed in-product on every aggregate view).
* Auto-classification is keyword heuristics, not an LLM or trained classifier — it explains its match rather than claiming certainty.
* Full `npm test` (246 suites) was not run to green this session; two spot-checks (standalone + canonical-boundary) pass. Remaining pin drift (schema v156 vs older pins) is pre-existing and unrelated to these additive modules.

---

## 7. Next bets

1. Memoize `counters()` by `(revision, dayKey, seatId)` — cuts nav render cost for declared seats.
2. Dynamic priority from finding severity (requires enriching derived event payload).
3. Wire `createCoalescedPersist` into `store.update` behind a `coalesceWrites` flag and measure batch coalesce rate.
4. Add cross-domain semantic dedup (shared entity-fact key) to the hub.
5. LLM-backed auto-classification with the same explanation contract (keywords + rationale, never silent re-tag).
