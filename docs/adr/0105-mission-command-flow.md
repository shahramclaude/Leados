# ADR-0105 — Mission Command Flow: one reviewed note, one atomic response

- **Status:** Accepted (Session 145, 2026-11-06)
- **Schema:** v107, additive migration `106 → 107`
- **Surface:** Mission Control → Command Flow (`#/mission?panel=capture`)
- **Supersedes nothing.** Composes Intake, Cases, Action Bundles, Operating Seat and the shared post-commit spine.

## Context

Mission Control already had altitude-specific duties, scoped reads and coordinated interventions. Intake already classified natural language locally. Action Bundles already rehearsed and adopted closed-vocabulary commands atomically. The missing product seam was the **handoff between them**: a leader still had to classify a note, create a case, build a bundle, rehearse it and adopt it as separate transactions. A failure between those steps could leave a case without its response, or a response whose source case had changed.

The blunt audit finding: the engines were real; the end-to-end leadership loop was shallow at the joins.

## Decision

Add a bounded `missionCaptures` ledger and a single transaction, `transactMissionCapture`, used by **both** the disposable rehearsal worker and live adoption.

1. **Describe.** The leader writes a note (≤8,000 chars), chooses an accountable owner, review date, severity and permitted action kinds. The existing local classifier proposes evidence; it is a weighted-lexicon/NegEx heuristic, not a calibrated model.
2. **Review & rehearse.** `prepareCapturePlan` derives the exact closed-vocabulary commands against a projected `@case` sentinel. The worker runs the same transaction in disposable storage and returns the operational diff, typed relationship changes and rule ids.
3. **Adopt together.** Live adoption requires `reviewed === true`, the current revision, the same calendar day, matching input/source/plan fingerprints and a failure-free rehearsal. It reserves the case and bundle ids, creates the case through the existing `addCase` API, stages the bundle through the existing adapters, delivers every source event to the generalized spine, and checks the live footprint against the rehearsal. Any command, rule, target or footprint failure rolls back the whole write.
4. **Follow through.** The receipt links the case and bundle. Withdrawal delegates to the existing untouched-only compensation; the source case and audit history remain.

`RULE-MIS-01` handles `mission.capture.adopted` on the shared spine: `responds-to` the case, `coordinates` the bundle, and one `rolls-up-to` per leadership ancestor. No second hierarchy engine is introduced. The rule count remains 85; the existing mission contract is widened rather than duplicated.

## Privacy and altitude

- The raw note and classifier evidence are readable **only by the preparing seat** (`ownerSeatId`). Generic projections zero `missionCaptures`; the gateway and mixin both enforce ownership.
- The resulting case summary does **not** copy the raw note. It names the reviewed title and heuristic class and points back to the preparing seat.
- Individual detail stops above rank 2. Above that, named `involvedPersonIds` are emptied and fuzzy goal links are dropped.
- Command vocabulary is rank-filtered: frontline decision/delegation/coaching; manager adds premise; director adds comms eligibility (still refused until stakeholders exist); VP/CEO add budget. Budget requires an explicit positive amount and eligible envelope; extracted money is PERT loss evidence, never approved spend.
- Confidential conflict language is refused before any write.

## Engineering frameworks

- **Unit of Work / transactional outbox-style event delivery:** one store write, source events delivered to the existing spine, no nested persistence.
- **Saga compensation, bounded:** withdrawal only while every target fingerprint is untouched; later work protects the whole bundle.
- **Optimistic concurrency:** revision + input/source/plan fingerprints + calendar-day expiry.
- **Jaques time-span:** altitude ladder and horizon debt remain the existing Mission Control convention.
- **FMEA / PERT:** triage severity and extracted money are disclosed as heuristics/defaults, not evidence of probability or approved spend.
- **PDCA / assumption-based planning:** decision, owned checkpoint, testable premise and coaching prompt are one reviewed loop.

## Rejected alternatives

- **A chatbot that writes directly.** Rejected: no closed vocabulary, no rehearsal, no atomic receipt.
- **A second workflow engine for captures.** Rejected: duplicates Cases/Bundles/spine and creates drift.
- **Auto-adopting high-confidence classifications.** Rejected: the classifier is not calibrated; safety/legal stakes require human review.
- **Copying the note into the case for convenience.** Rejected: ancestors would receive raw intake through the normal case disclosure ladder.
- **Main-thread fallback when workers are unavailable.** Rejected: freezes the page; the UI refuses instead.

## Consequences

- Schema v107 adds one empty collection on upgrade; no historical note is reclassified.
- `createStagedStore` and `cleanBundlePreview` are extracted/shared so capture and bundle rehearsals use the same seams.
- A frontline self-profile access bug was fixed: a person's upward `managerId` is not a second subject of the record.
- Honest limits: seats are local workflow declarations, not authentication; browser/backup access remains a confidentiality boundary; the classifier is heuristic; software rehearsal is not a causal business forecast; real-browser assistive-technology walkthrough is **[UNVERIFIED]** (jsdom + axe-core ran).
