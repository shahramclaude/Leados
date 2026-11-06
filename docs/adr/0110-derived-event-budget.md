# ADR-0110 — Derived-event budget: production cap 64 → 256

**Status:** Accepted · Session 150 · Schema v111 (no bump — no schema change)
**Scope:** `app/core/domain/postCommit.js` (the shared spine) · **Rules:** all 89
**Altitudes:** frontline, manager, director, executive, chief (all five — the spine is what every altitude's automation runs on)

## Context

`MAX_AUTOMATION_EVENTS = 64` was set when the engine was small. Session 149
measured its failure on the shipped demo: an ordinary `case.updated` cascaded
through 63 engine-authored `decision.created` and 7 `delegation.created`
lifecycle events (plus the root event and queue bookkeeping). Every
`(rule, event)` pair after queue slot 64 — notably the epistemic rule's
(`RULE-EPI-02`) governed work for the demo's accumulated stale-signal backlog —
was rolled back with `Automation event limit (64) reached`, recorded as 57
`automation.rule_error` events and **56 engine-authored decisions silently
missing from the record**. A/B-confirmed pre-existing at v110 with
`jurisdictionRule` removed. This is a P0 silent-failure defect on the spine,
not a missing feature: downstream rules never ran, and the leader was never
told the cascade had been truncated.

An earlier fix (Session ~143) gave explicit read-only replays a clamped
`eventBudget: MAX_REPLAY_EVENT_BUDGET = 256`. That repaired the assurance
rehearsal but left ordinary production writes truncating the same cascade —
the wrong place to stop.

## Decision

Raise the production cap and the replay ceiling, keep both finite, keep tuple
deduplication as the cycle bound:

| Constant | Before | After |
|---|---|---|
| `MAX_AUTOMATION_EVENTS` (ordinary production writes) | 64 | **256** |
| `MAX_REPLAY_EVENT_BUDGET` (explicit whole-workspace replays, clamped) | 256 | **1024** |

Measured on the shipped demo (`case.updated` on an open case, fresh demo seed):

- **Before:** 64-slot truncation → 57 rolled-back rules, 0 epistemic decisions
  committed from the backlog.
- **After:** full cascade commits — 399 logged entries, **0** `automation.rule_error`
  events. The queue itself settles near ~72 slots on this workspace; 256 keeps
  headroom for larger real workspaces while remaining a hard, finite bound.

The ~72 distinct queue slots (root `case.updated` + 63 `decision.created` +
7 `delegation.created` + 1 `automation.step`) are enumerated, with event-type
totals, in the session log. The deduplication set still guarantees termination
of rule-to-rule event cycles; the cap is a backstop, not the primary cycle guard.

## Consequences

- One-time behaviour change: the **first** write on a demo-seeded workspace now
  commits the entire pending epistemic backlog (one governed decision per stale
  DANGER/DEFECT unknown, marker-idempotent, ever). That flood is the workspace
  paying down a backlog that was previously being silently discarded on every
  write. If the backlog per transaction proves too large for single-writer UI
  latency in practice, the follow-up is a *bounded-backlog policy* inside
  `RULE-EPI-02` (e.g. N per span per week with the remainder deferred and
  printed) — deliberately **not** done here, because it changes module
  semantics and needs its own ADR.
- `case-rehearsal.test.mjs` worker timeout re-baselined 15 s → 120 s (a correct
  full cascade off-thread takes ~63 s on the reference machine). Failure
  assertions unchanged — `failureCount` is now genuinely 0.
- `confidence-transport.test.mjs` "a declaration was NOT rewritten" assertion
  tightened to the 60 seeded declarations (it previously compared the whole
  decisions array, which now legitimately grows with other rules' decisions).
- `action-bundles.test.mjs:158` over-budget preflight test made symbolic
  (`MAX_AUTOMATION_EVENTS + 1`) instead of a pinned 64.
- No schema change; no collection, setting, rule or contract changes; 89 rules
  unchanged.

## Honest limits

Raising the cap does not make the demo's first real transaction cheap — the
~35 s full cascade is real work the engine was already designed to do, now
visible instead of discarded. Real-browser behaviour under the raised cap and
the full 155-suite run remain [UNVERIFIED] this session (see AI-SESSION-LOG.md).
