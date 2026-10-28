# ADR-0029: Mitigation robustness and an owned evidence gate

Status: Accepted — 2026-10-28. Schema v43 unchanged.

## Decision and motivation

Extend the existing assurance/rehearsal journey instead of building another terminal.
The previous sensitivity uses an explicitly uncalibrated occurrence-rating/10 proxy.
Keep it for continuity, but add an independent interval analysis that never derives an
event probability from FMEA. A user who cannot support probability bounds should not
receive an invented confidence score.

Use **Savage minimax regret** over a rectangular uncertainty set. Let conditional loss
be `L`, current/proposed event probabilities be `b` and `p`, and additional investment
be `C`. Saving is `L × (b − p) − C`. This multi-affine expression attains its extrema
at the eight corners of the declared probability × probability × loss box, even when
`b − p` changes sign. All loss values between the case's optimistic and pessimistic
estimates are included. The middle estimate is retained as provenance, not assigned a
weight. The illustrative 5×5 frontier does not drive the extrema calculation.

Worst regret for holding is `max(0, maxSaving)`; for investing, `max(0, −minSaving)`.
The lower of these is a **model-only perfect-information ceiling**, not EVSI, an
expected benefit or an authorized research budget. The two-action model omits delay
costs, research costs, changing conditional severity, dependence constraints and
nonfinancial harms. Report them, do not hide them behind a precision badge.

A shared future horizon is required. Inputs remain blank until entered; unknown is
never zero. Classification uses unrounded amounts, with floating-point noise tolerance;
monetary presentation is rounded to cents.

## Architecture

- `mitigationRobustness.js`: pure validation, exact extrema, regret, break-even,
  information ceiling, frontier and narrative-free plain-text brief. Bounded work
  (8 corners + at most 25 cells) needs neither a worker nor a dependency.
- `mitigationReview.js`: one registered rule, `RULE-ROB-01`, for the human-requested
  `mitigation.review.requested` event. It creates one decision, one verification
  delegation and (only when the existing queue has space) one blameless owner topic.
  Typed links join case → decision, case → delegation, decision → delegation and
  case → person. Source case fields are untouched.
- The generalized engine detects the new first-class records and publishes
  `decision.created` / `delegation.created`. Existing subscribers, including
  Decision Tempo, see them in the same transaction. No special tempo call is added.
- `requestMitigationReview` validates the source, active owner, automation pause,
  exact local workspace revision and numeric evidence key. The rule independently
  validates the evidence again rather than trusting a UI report.
- The key is exact canonical numeric JSON, not a collision-prone lossy hash. It is
  retained in the existing decision question to deduplicate the same source facts,
  declared assumptions and owner across reloads. Different numeric assumptions
  create a new decision rather than rewrite the earlier analysis.
- Decision questions are bounded to the schema's **2,000** characters before writing,
  and undecided `chosen` is the normalized empty string. Both were verified by reload.
  Capture lives in an **editable decision record**, not an immutable forensic archive.
- The UI has a human confirmation, resets outputs/commissioning/export when an input
  changes, ignores stale modal confirmations, and links to existing decision and
  verification workflows. Analysis/export contain no case title or employee names.
- Saving follows the actual store contract: plain writes may fail but remain in
  memory; encrypted writes are queued. UI copy distinguishes these states.

## Safety boundaries and rejected alternatives

- Never apply a mitigation, change residual ratings, spend money, send messages,
  infer a person's performance, or treat task completion as effectiveness evidence.
- Respect case automation pause. No active verifier means analysis only, not an
  invented owner. A full topic queue is preserved, with a skipped propagation entry.
- No schema bump, new export scope, network call, backend or runtime dependency.
  Existing decision/delegation exports retain their existing privacy implications.
- Local revision checks **are not cross-tab compare-and-swap**. Existing whole-workspace
  localStorage writes can still race across tabs. Safe adoption remains blocked on
  solving that separate storage problem; this feature deliberately cannot adopt.
- Failure receipts remain content-free and therefore do not retain the numeric
  request payload. Retrying this rule without it cannot reconstruct the request;
  run a fresh analysis and request instead. Failure and success events still use
  the append-only capped audit mechanism already in the store.
- Reject automatic probability inference from ordinal FMEA, Monte Carlo cell shares
  presented as confidence, and EVPI/EVSI claims without a distribution or observation
  model. Reject an LLM simulation of employees as financial evidence.

## Proof

`tests/app/mitigation-robustness.test.mjs` checks exact fixtures, 100 seeded boxes
against 21,600 interior/corner samples, equality/dominance/overlap, missing inputs,
precision, one-write propagation through production subscribers, typed graph integrity,
localStorage reload/idempotence, stale and paused rejection, rollback, full queue
preservation, save failures, encrypted persistence/unlock, UI confirmation/invalidation,
and JSDOM + axe structural accessibility. Real-browser visual/contrast checks and
spoken screen-reader output remain [UNVERIFIED].
