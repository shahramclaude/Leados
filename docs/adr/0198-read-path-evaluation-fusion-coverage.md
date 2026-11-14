# ADR-0198 — Evaluation of the running app: the badge strip's cost, the fusion hub's coverage, and the automation claims

Date: 2026-11-14 · Session 266 · Schema v156 unchanged (no new collection,
migration, rule, event, convention or stored field) · Status: Accepted

## Context

This session was asked to *evaluate* LeadOS and improve its efficiency,
intelligence and automation. A previous session
([ADR-0197](./0197-spine-cost-and-clock-fidelity.md)) had already priced the
write path and made it 2.7× cheaper. Nothing had priced the **read path**: the
interaction a leader actually repeats all day — moving between screens.

Because the app is zero-build (native ES modules, no server), the only honest
way to evaluate it is to run it. `scripts/eval-app.mjs` boots the real
`index.html` in jsdom against the real modules and a real demo workspace, walks
every route the shipped `NAV` declares, and records wall clock, DOM size,
repeated work and console errors. Its first run, at the starting commit:

| measurement | value |
| --- | --- |
| routes measured | 118 |
| median cold route change | **493 ms** |
| p95 / max | 691 ms / 1,436 ms |
| total for one pass of every route | **60.9 s** |
| signal families shipped (`*Signals` exports) | 63 |
| families the fusion hub was registered to read | **3** |
| signals fused on the demo workspace | **3** (1 converging cluster) |
| orchestrator helpers wired into any write path | 3 of 6 |

Three defects fell out of that, each of the same shape: **a surface that
reports a capability it does not have**.

1. **The badge strip paid for the whole engine on every render.** About 110
   domain attention reads (retention hazard curves, capacity PERT, the deferral
   option lattice, resilience Bus-Factor) ran on every render including the
   render that navigates. Removing `#sidebar-nav` from the DOM and re-timing six
   routes isolated the cost: **437–528 ms per render**, 80–95% of the
   interaction. `navigate()` also painted twice for one click — set
   `location.hash`, render synchronously, then paint again when the queued
   `hashchange` arrived.
2. **The fusion hub fused almost nothing.** The shell registered three
   hand-picked modules while the canonical engine (`domain/insights.js`) already
   evaluated all 63 families into one merged finding list. The hub screen
   therefore advertised a fusion layer that read 3 of ~63 signal families —
   about 3 signals in a workspace with 213 findings.
3. **The Automation column described work the system does not do.** A priority
   queue, an event coalescer and a repetition miner were exported, tested and
   imported by nothing; the screen printed "derived events are ordered by
   urgency" and an auto-classification demo while the real spine drained a
   breadth-first, budgeted queue in emission order.

## Decision

**Measure the read path, then make the three pillars true rather than
advertised.**

1. **`scripts/eval-app.mjs` is the evaluation instrument and stays in the
   repo** (`npm run eval:app`). It reads the routes from `main.js` so it cannot
   drift from the shipped navigation, and it exits non-zero on a route failure
   or an exceeded `--budget-ms`. It writes `reports/eval-app.json` for trend
   comparison.
2. **The badge strip is memoised on exactly what it depends on.** New
   `storeOptimizations.createKeyedMemo(build)` compares key parts with `===`.
   The shell keys on *(state object identity, calendar day, seat signature)* —
   the store replaces the state object on every committed write, so identity is
   an exact "did anything change?" test, and the calendar day and seat are the
   only other inputs. A hit returns a shallow copy so callers can annotate.
   The computation is wrapped in `perfMeasure('nav.counters')`, so the cost is
   visible in `#/efficiency` and `window.__LEADOS_PERF`.
3. **One navigation paints once.** `navigate()` records the paint it already
   did; the queued `hashchange` consumes that record and renders only if the
   hash, the state or staleness says otherwise. `ctx.refresh()` and externally
   set hashes are untouched — the guard is scoped to the duplicate it was built
   for.
4. **The fusion hub reads the canonical engine.** New
   `registerInsightsSource(name, findingsFn)`; the shell registers
   `() => getInsights(state, at).findings`. One computation, two readings: no
   extra engines run, and coverage becomes every family that produced a finding.
   `registerIntelligenceDomain` remains as the escape hatch for a future domain
   and for tests. Coverage is printed, not assumed (`intelligenceCoverage`,
   `hubHealth.ok` is false when nothing is registered).
5. **Fusion now affects ordering.** `rankSignals(signals, now, clusters)` adds a
   bounded convergence boost — `1 + 0.15 × (independent domains − 1)`, capped at
   1.6 — to `severity × confidence × recency`. Severity itself is never
   rewritten; only the ordering carries the fusion, and the Boost is printed
   beside the signal. Repeats from one domain are not convergence.
6. **Deduplication no longer deletes facts.** The key was
   `(domain, rule, entityId)`, which collapsed every workspace-level finding
   from one rule into one row — 18 of the demo's 213 findings disappeared. The
   key now includes the title; a real duplicate still keeps its highest
   severity.
7. **Dead automation code is deleted, and the screen tells the truth.** The
   spine and the diagnostics now share one `eventKey`; the spine counts the
   duplicate deliveries it suppresses (`reporter.duplicates`) so coalescing is
   measured rather than asserted. `#/efficiency`'s Automation column prints that
   ledger, the open failure receipts, and an explicit *"Not built (stated, not
   implied)"* list for priority ordering, template mining and write coalescing.
8. **The size estimate is close enough to warn honestly.** Sampling the first
   three rows of every collection over-estimated the demo workspace by **15.1%**,
   which fires a storage-limit warning long before the limit. The estimate now
   samples five evenly spaced rows per collection and lands within **1.8%**; it
   is still labelled an estimate wherever it is printed.
9. **The outline is swept, not sampled.** Removing the duplicate render exposed a
   real accessibility defect the race had been hiding: `#/coupling` (and the
   focused `#/decisions` reading) went `h1 → h3` with no `h2` between, which axe
   reports as `heading-order` and a screen reader announces as a gap. New
   `scripts/check-headings.mjs` (`npm run check:a11y`) sweeps **all 118 routes**
   with axe-core and now passes clean; both defects are fixed with a real
   second-level section heading (read aloud, not drawn). Before this, only three
   routes had ever been through axe, each in its own test.
10. **Unused speculative helpers are removed.** `createCoalescedPersist`,
   `createRevisionMemo`, `isStateDirty`, `createPriorityQueue`, `coalesceEvents`
   and `scheduleDerivedEvents` had tests but no callers. Nothing in the store's
   write path changed: the plaintext save is synchronous and ordered on purpose,
   and the encrypted path already serialises and collapses concurrent writes.

## Results (measured, same sandbox, same demo workspace)

| measurement | before | after |
| --- | --- | --- |
| median cold route change | 493 ms | **21 ms** (23×) |
| p95 | 691 ms | **136 ms** |
| one pass of all 118 routes | 60.9 s | **5.2 s** |
| state estimate error | +15.1% | **+1.8%** |
| signal families fused | 3 | **59** (of 63 shipped) |
| signals fused on the demo | 3 | **213** |
| converging clusters | 1 | **8** |
| superseded/dead helpers | 3 | **0** |
| routes with a broken heading outline | 1 of 118 (unswept) | **0 of 118** (swept) |

Correctness is asserted, not inferred: the badge the leader sees after a write
is the recomputed badge (a test commits a person and asserts the visible badge
moves in the same render), a route change over an unchanged snapshot prints
byte-identical badges, an external hashchange still renders, and every fused
finding is accounted for (`dedupedCount === findings.length` on the demo).

### Where the remaining time goes: the write path

A route change is now cheap; a **write** is not, and the harness measures that
too so the next person does not have to guess. Committing a person
(`app.api.addPerson`, three times, demo workspace) costs a median **1 962 ms**
(before this change: 1 998 ms — unchanged, so the memo did not move the cost
from the read path into the write path, it only stopped paying it twice).

A V8 CPU profile of those three commits names the bill: the badge strip runs the
heavy simulation models to produce one integer each.

| frame | self time (3 commits) | samples |
| --- | --- | --- |
| `americanCommitOption` (`deferralOption.js`) | 1 144 ms | 1 004 |
| `pertTriple` / `sampleBetaPert` (`capacity.js`, `simulation.js`) | 1 298 ms | 1 072 |
| `scanForPeople` (`orgNetwork.js`) | 423 ms | 350 |
| `monteCarloOverload` (`load.js`) | 219 ms | 179 |
| `bootstrapDelta` (`counterfactualPolicy.js`) | 123 ms | 84 |
| `dayKey` / `startOfDay` / `toDate` (`time.js`) | 451 ms | 344 |

(each sample is ~1 ms of wall clock; the profile also contains the first render
and the jsdom harness, so shares are relative, not additive-to-1 962 ms)

Two conclusions, both deliberately **not** acted on in this change:

1. **The date helpers are called from inside sampling loops.** `dayKey` and
   `startOfDay` are pure per-day normalisations, but they show up 344 times in a
   three-commit profile, which means they are being recomputed per
   path/step inside a Monte Carlo. Hoisting them is safe in principle and
   unmeasurable from the outside, but it edits the pricing core, so it wants its
   own change with its own numbers rather than a rider on this one.
2. **Deferring the badge pass to idle would cut time-to-paint after a commit
   dramatically** and keep every number exact (the badges would paint one frame
   later). Rejected here: the nav's numbers are read synchronously by existing
   tests, and a one-frame window where the strip disagrees with the record is a
   correctness question, not a performance one. That trade needs to be made
   explicitly, in its own ADR.

What the write path *does* already gain: `navAfterWriteMedianMs` is **24.9 ms**,
i.e. moving to another screen straight after a save is now instant instead of
re-running the badge strip.

## Alternatives considered

- **Lazy badge counters (compute only what the visible badges need).** Rejected:
  with full access the sidebar shows nearly every badge, so it saves little, and
  it would make the nav's own numbers order-dependent.
- **Memoise on `meta.revision`.** Rejected: a revision counter cannot tell two
  snapshots apart after an import, a reset or a demo reload, and it says nothing
  about the day or the seat. Identity plus explicit day/seat is exact.
- **Give the spine a priority pass.** Rejected for now: it would reorder audit
  entries and lineage steps for every event, and the truncation it would help
  under is already bounded and counted. Printed as *not built* rather than
  shipped half-way.
- **Keep the helpers and mark them experimental.** Rejected: the hub screen was
  already describing them as live. Dead code that a dashboard vouches for is
  worse than no code.

## Consequences

- The write path is still bounded by the badge strip (1 962 ms per commit in
  jsdom, unchanged by this change and now measured so it cannot drift silently).
  A leader pays it once per save; the profile above is the map for whoever
  attacks it. Until then, moving to another screen right after a save costs
  24.9 ms — the strip is not recomputed twice.
- The read path is bounded by the view, not by the engine: a route change now
  costs what the screen costs (median 21 ms; the heaviest screens —
  `scenarios` at 1.1 s, `premises` at 0.46 s — are now the only work in the
  interaction and are the next targets if this is continued).
- Any new badge read must be pure over `(state, day, seat)`. A read that depends
  on the wall clock, random state or module-level mutable state would be cached
  incorrectly; the seam is documented at `navCounters` and covered by tests.
- The hub can only fuse what a registered source returns. When a new signal
  family lands in `insights.js` it is fused for free; a family that lives
  elsewhere must register itself, and `intelligenceCoverage` will show it as
  unwired until it does.
- `#/efficiency` now has no number it cannot source. Anything still missing is
  listed as not built.
- A whole-document property can no longer be hidden by a render race: the
  heading sweep runs the real app over every route, so a new screen that skips a
  level fails a check instead of shipping quietly.
- Revisit the moment the render budget is exceeded again (`eval:app
  --budget-ms`), when a badge read becomes non-pure, or when a second consumer
  needs the priority ordering the spine deliberately does not do.
- `[UNVERIFIED]`: the wall-clock figures are jsdom on this sandbox with the
  full suite competing for CPU, not a browser benchmark; per-route numbers move
  with the machine. The full canonical suite result is reported from the run in
  the session log.
