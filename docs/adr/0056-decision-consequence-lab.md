# ADR-0056 — Trace an unmade decision without inventing its domino effects

**Status:** accepted · 2026-10-31 · Schema v67 · Session 93

## Decision

Add a Consequence Lab to the canonical, local-first `app/**` product. It reads one real open DACI decision, the bounded typed operational graph already in the workspace, the class Kaplan–Meier survival curve and its Cost of Waiting price. It answers two questions separately:

1. **What is recorded as connected to this decision?** A deterministic two-hop breadth-first walk, preserving edge directions, capped at 64 nodes and 2,000 inspected links. It skips people, candidates, confidential conflicts, anonymous pulses, generated measurement edges and any dangling operational endpoints. The displayed path is an *association*, never an estimated causal pathway. First-order and second-order counts, path labels and bridge records are for inspection only. A leader can follow exact deep links to source records.
2. **What would another 1, 2 or 4 weeks of an unmade call cost under the workspace's *own* class history?** Integrate the conditional Kaplan–Meier curve rather than multiplying the **endpoint** probability by the entire horizon:

   ```text
   expected outstanding weeks(h | open at age a)
     = (1 / 7) × integral from 0 to 7h of S(a+t) / S(a) dt
   expected priced wait = weekly price × expected outstanding weeks
   endpoint lower bound = weekly price × h × S(a+7h) / S(a)
   full-wait ceiling = weekly price × h
   ```

   Kaplan–Meier is a step function; integrating exactly over the observed event times is simple, testable arithmetic. The endpoint-only formula used by `#/wait` is a **lower bound**, not the expected carrying cost: a call that closes halfway through the window still waited halfway through it. The Lab prints all three quantities side by side, and tests the invariant `endpoint lower ≤ integrated expected ≤ full-wait ceiling` on hand-calculated and demo cohorts. It refuses a forecast with fewer than `consequenceMinExits` dated exits, below the Survival terminal's at-risk floor, or past the last observation. A price without enough history still yields a labelled full-wait ceiling, never an expected loss. Unpriced stays `null`, not zero; currencies remain separate.

3. **What if other linked work ALSO waits?** For every priced open item reached within two typed hops, print the per-currency, full-horizon sum **only under the explicit condition that all of it is blocked for the full horizon**. This is a bounded worst-case *sensitivity*, not a claim of a causal or incremental loss. Linkage alone cannot supply a probability of blockage. The figure is never added to the root expected cost, and the UI explicitly warns it may overlap with other recorded exposure. No cross-currency sum or invented rate.

A `consequenceReadings` record is frozen *before* the review date with the root decision ID, horizon, frozen conditional still-open probability, root price and integrated expected cost, capped adjacency counts and at most 12 typed first-hop targets. **No titles, notes, personal names, stakeholder stances or source bodies** are copied. After the exact review date the leader grades it once against the original decision's dated `decidedOn` field: still open (`1`) or decided by then (`0`), Brier `(p−y)²`. A chosen option without a date, a missing source, early review or an already graded reading are refusals. Skill against the realised base rate is withheld below five graded readings; nested horizons on the same decision are not independent. `66→67` adds two empty collections and five clamped settings; existing workspaces do not receive a retrospective reading.

## Transactional consequences

`RULE-CSQ-01..05` register with the existing ADR-0008 post-commit engine *before* Decision Tempo. An explicit freeze is a human gate that writes the source `maps-consequence` edge and first-hop `surfaces-impact` edges, **one** leader-owned verification task for watch/breached linked premises, and (only with a real leader and a recorded root weekly price over the convention) **one** DACI call per root per ISO week to sequence linked open decisions. It has three actual options, but chooses none. An explicit scan reconciles only this module's stale edges and opens at most one owned grade task per due reading. A graded surprise with Brier >0.49 opens one blameless learning task when automation is on. The pause switch suppresses automatic grading follow-through; a human-requested freeze/scan always works. Every effect has a marker and an append-only audit event. Decision Tempo sees the new decision on the same transaction but does **not** invent a monetary price for it without its own operational money link.

`#/consequences` has five keyboard-accessible panels and an entry point on every open Decision card. The Insights bucket and nav badge report due grades, material misses and (above the floor) calibration loss. The identity-free board brief intentionally contains no source titles. CSV scope #57 is grouped by horizon × currency: counts always, money/mean probabilities/graph reach only at ≥5 records per bucket, and mean Brier only at ≥5 graded records; there is no individual row or ID. A refused synchronous browser write returns `saved:false` and the UI warns **NOT SAVED — export a backup**; the in-memory reading stays available rather than being falsely claimed durable. The canonical app retains zero backend calls and zero new dependencies.

## Alternatives rejected

- **Sum all two-hop costs into a projected financial impact:** an edge is not a causal dependency, and two priced records may describe the same loss. This would be a fabricated payoff.
- **Treat `price × weeks × P(open at end)` as expected cost:** it silently erases the time spent waiting by items that close before the endpoint. We preserve it as a checkable lower bound in the new terminal rather than secretly rewriting the older certificate's already-frozen convention.
- **Use simulated agents to predict named stakeholder reactions:** no validated behavioural model, no consent, and no evidence that simulation text predicts this leader's coalition.
- **Freeze a probability below the evidence floor or beyond the observed tail:** makes a prediction after model support ends; the full-wait ceiling is a different, explicitly deterministic object.
- **Auto-select a decision option or send a comms draft:** turns a descriptive map into an autonomous manager, violating the human gate.

## Consequences and limits

The root expected cost is *conditional on the class exit model and the linear declared/derived weekly price*, not an estimate of money saved by deciding today. Independent censoring and exchangeability may fail; different decision types in one class can be heterogeneous; prices may double count the same underlying cash flow; a typed graph may be incomplete or wrong. The two-hop map deliberately excludes people as relays, so it can omit a real social dependency rather than guess one. We do not model intervention effects, state-dependent counterfactuals, overlap covariance or calibrated stakeholder reactions. A grade measures the *timing forecast*, not decision quality or causal effectiveness. Real-browser/assistive-technology walkthrough and field validation remain **[UNVERIFIED]**; JSDOM+axe verifies structural accessibility with colour-contrast disabled.

## Validation

`tests/app/consequences.test.mjs` covers hand-computed RMST area (two exits on day 7 and two on day 14), the endpoint/area/ceiling identity, insufficient exits/at-risk/tail refusals, directional two-hop graph with sensitive-type exclusion and truncation, per-currency conditional ceilings, same-transaction freeze→typed edges→premise task→coordination decision, scan idempotency/pause semantics, prospective grade after a *real* `decideDecision` action and persisted reload, demo cleanup, privacy-gated CSV and five axe-clean panels. Full-suite and standalone verification results are recorded in AI-SESSION-LOG.md, not assumed here.
