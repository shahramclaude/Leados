# ADR-0114 — Reviewed command editing inside Command Flow; the manager-premise authority alignment

- **Status:** Accepted — 2026-11-06 (Session 155, Schema v112 unchanged)
- **Deciders:** LeadOS product architecture
- **Supersedes / extends:** ADR-0105 (Mission Command Flow), ADR-0107 (Outcome Learning Loop), ADR-0081 (Operating Seat authority model)

## Context

ADR-0105 shipped Command Flow: one reviewed note → one case + coordinated
actions + typed hierarchy provenance, adopted in a single atomic transaction.
The proposal words — the decision's question and options, the delegation's
expected outcome, the premise's statement and signpost, the coaching prompt —
were authored by the engine from templates (`proposeBundle`) and could not be
edited before rehearsal. A leader approving an adoption was approving words a
classifier had never seen, written into records whose shelf life is the rest of
the quarter. The roadmap carried this as the largest UX gap since Session 106.

Session 154 attempted the premise slice and was blocked by a latent authority
contradiction: the rank-2 Mission profile offers `premise` (ADR-0105, README —
"manager adds premise"), while the shared `test-assumption` right read
`minRank: 3`, so a manager's rehearsal died at the adoption transaction with
`Manager may not “Register a testable operating assumption”. Its rank window is
3–5`. Policy and implementation had drifted; the seat model (ADR-0081) makes
the shared right the single source of truth, so fixing the Mission profile or
special-casing the capture path would have hard-coded a one-off exception.

## Decision

1. **Authority aligned to declared doctrine.** `test-assumption` now reads
   `minRank: 2, maxRank: 5` — identical to ADR-0105's "manager adds premise".
   Frontline (rank 1) is unchanged everywhere: the rank-1 profile never offered
   `premise`, and the shared right still refuses rank 1. Every premise action
   (`addPremise`, `updatePremise`, `recordPremiseEvidence`, `reviewPremise`,
   `recordPremiseOutcome`, `withdrawBundlePremise`) is a manager-and-up act.
   No new right, no per-module exception.
2. **Reviewed, per-action edits travel on the capture.** A new optional
   `commandEdits` object on the capture row (`{ decision: {...}, delegation:
   {...}, premise: {...}, coaching: {...} }`) carries the reviewer's exact
   words: decision name/question/2–5 named options; delegation name/expected
   outcome; premise name/statement/signpost; coaching subject/prompt. Unknown
   kinds and malformed entries are dropped fail-closed by
   `normalizeCommandEdits`; an option list with an unnamed option is refused
   outright (`field: 'options'`), never silently replaced by a default.
3. **Edits never bypass validation.** `prepareCapturePlan` applies the edits on
   top of the proposal, then the whole list passes through the unchanged
   `validateBundleCommands` → adapter `validate` → rehearsal → adoption chain.
   An edit replaces what the proposal would have said; it cannot weaken any
   constraint.
4. **The fingerprint covers the reviewed words.** `captureInputFingerprint`
   now includes `commandEdits`, so editing a word after a rehearsal invalidates
   the stored rehearsal and adoption refuses until re-rehearsed (the
   fingerprint parity is asserted by deep-equal round-trip tests through
   `normalizeMissionCaptures` and `normalizeActionBundles`, now extended to
   carry `signpost` and decision `options`).
5. **The rehearsal prints what adoption freezes.** The approval card lists each
   command with its reviewed question/outcome/statement/prompt and option
   labels, so the human reads the actual artifact before adopting. The decision
   is still never chosen by adoption (`chosen: ''`).
6. **No schema bump.** `commandEdits` is an optional, fail-closed field on an
   existing collection; historical captures normalize unchanged. `SCHEMA_VERSION`
   stays 112.

## Consequences

**Positive.** A manager can now adopt a premise-bearing response end to end —
the exact Session 154 blocker, reproduced and closed. Adoption freezes words a
named human actually read. The edit surface is the same reviewed transaction
model as everything else in Command Flow, not a side channel.

**Honest limits.** Edits are stored on the capture record, which stays with the
preparing seat (existing disclosure model). No length limits beyond the declared
bounds (title 180, statement/outcome/question 1000, signpost 400, prompt 180);
no rich text; no simultaneous multi-seat rehearsal. Real-browser and
assistive-technology walkthrough is [UNVERIFIED]; automated jsdom + axe-core is
what ran. Seats remain workflow declarations, not authentication.

**Rejected.** (a) Keeping `test-assumption` at 3–5 and giving Command Flow a
private premise path — a second authority for the same act, against ADR-0081.
(b) Letting rank 1 edit premises — no doctrine supports it. (c) Silently
defaulting an unnamed option — a quiet fallback the reviewer cannot see.
