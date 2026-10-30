# ADR-0049: Governed operating agreements (Autopilot Studio)

## Status

Accepted — 2026-10-30. Implements Schema v58.

## Context

LeadOS automation has always been developer-authored: every post-commit rule
(`RULE-DEC-01`, `RULE-ATT-01..05`, …) is code, reviewed and shipped with the
app. Leaders benefit from the propagation but cannot state their own standing
instructions — "when a delivery risk over $10k opens, make sure there is one
accountable response" — without filing a feature request. Enterprise
decision-intelligence vendors moved toward user-authored governance in 2026:
Aera's October 2026 release describes Policy Studio (plain-language rules a
person approves, tested against live decisions before enforcement) and a
Decision Ledger recording policies evaluated per decision; Cloverpop describes
zero-code playbooks over a decision graph; WorkBoard ships conversational
portfolio agents. Those are vendor claims, not validated comparisons
(see `RESEARCH.md` §84).

A first-time leader must not be handed an autonomous manager. The failure modes
of user-authored automation are well known: rules that fire on misunderstood
state, silently duplicate work, guess owners, message people, or make
personnel decisions. Any agreement system must therefore make the *approval*
the central artifact, not the rule text.

## Decision

**Autopilot Studio (`#/autopilot`) lets a leader declare operating agreements
in a closed vocabulary, rehearse each one against current records, and
activate it only by approving that exact rehearsal.** The components:

- **Registry (`autopilotRegistry.js`).** Four source adapters (case, decision,
  delegation, goal) exposing 14 events and typed facts; five actions
  (decision, delegation, coaching, premise, comms); seven template tokens. No
  eval, no property paths, no user code. New sources plug into the same
  compiler, rehearsal, executor and ledger.
- **Contract (`autopilotSchema.js`, Schema v58).** Additive collections
  `autopilotPolicies` and `autopilotRuns`. Anything invalid fails closed: a
  stored active agreement that cannot prove its approval, owner and budget
  pauses on load.
- **One executor (`autopilot.js`, `RULE-AP-01`).** The same pure function
  powers rehearsal (disposable copy, nothing written) and the post-commit
  rule. Activation binds a digest of the definition, the workspace revision
  and the rehearsal; any later change voids the approval.
- **First position on the spine.** The rule evaluates before built-in
  propagation, against the record as the triggering action left it. Built-in
  rules mutate the triggering record mid-transaction (RULE-DEL-01 flips
  open → mitigating), so a later position would make "created while open"
  unmatchable and contradict the rehearsal. Agreement-created records still
  emit derived events that every built-in rule processes normally — verified
  by test: the agreement's decision satisfies RULE-DEC-01's idempotency
  guard, and RULE-DEL-01 still advances the case in the same transaction.
- **Desired-state markers.** One record per (agreement, version, source,
  action), stable across re-fires. Identical facts reuse silently; changed
  facts open a new run that reuses instead of duplicating; a new version
  starts fresh.
- **Hard refusals.** No message is ever sent; no decision option is ever
  selected; no rating, pay, hiring or termination effect exists in the
  vocabulary. A missing owner or a full 1:1 queue blocks the whole run,
  records the refusal and pauses the agreement. One event can create at most
  24 records across all agreements or nothing applies. Agreement output
  cannot trigger another agreement (derived-event guard); human actions
  still can.
- **Ledger and governance telemetry.** Bounded run history (400), per-policy
  budgets, `AP-01` Signals integration, `Autopilot` nav badge, CSV scope
  #50 (codes and counts only), and a plain-language brief.

## Consequences

**Benefits**

- Leaders state standing instructions once, in words they chose, and the
  workspace follows them with typed `automates` provenance on everything.
- Rehearsal makes every approval informed: matches, creates, owner load,
  blockers and threshold sensitivity are shown before anything can run.
- All existing guarantees compose: savepoint rollback, failure receipts,
  propagation lineage, redacted export (policies carry prose and stay out
  of operational scopes), and the axe-gated terminal.

**Accepted costs / limits**

- Rehearsal is current-state only — never a historical backtest or forecast.
  For `*.created` triggers it cannot show the record that does not exist yet.
- The vocabulary is deliberately small (4 sources, 5 actions). Personnel,
  finance and hiring effects are excluded by design, not by omission.
- The agreement's comms draft may be superseded by the built-in outbox pass
  in the same transaction when stakeholder scheduling lands afterwards.
  Supersession is honest versioning; nothing is sent either way.
- The approval digest is a non-cryptographic content hash: an optimistic
  concurrency token, not a signature. It prevents accidental staleness, not
  a malicious workspace edit — and the threat model for a local-first
  single-user app treats the workspace file as already trusted.

## Alternatives considered

| Alternative | Disposition |
|---|---|
| Free-text / LLM-authored rules | Rejected. Non-deterministic, untestable, and every failure mode the product doctrine forbids. |
| Agreements evaluated after built-in rules | Rejected. Built to that position first; `status=open` on `case.created` could never match, contradicting both intuition and rehearsal. |
| One record per firing (event sourcing) | Rejected. Every edit would duplicate responses until the budget died. Desired-state markers reuse instead. |
| Auto-activation without rehearsal | Rejected. The approval is the product; a rule that runs before it is seen is an autonomous manager by another name. |
