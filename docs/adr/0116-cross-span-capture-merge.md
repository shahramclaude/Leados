# ADR-0116 — Cross-Span Capture Merge: privacy-preserving constraint linkage, true N-way LCA routing and human-confirmed consolidation

- **Status:** Accepted — 2026-11-07 (Session 157, Schema v112 unchanged)
- **Deciders:** LeadOS product architecture
- **Surface:** Mission Control → Command Flow (`#/mission?panel=capture`)
- **Extends:** ADR-0105 (Mission Command Flow), ADR-0113 (1:1 Agenda Provenance Ledger), ADR-0114 (Reviewed command editing), ADR-0080 / ADR-0081 (Operating Seat & subsidiarity)

## Context

ADR-0105 and ADR-0114 let a single preparing seat turn a situation note into one
reviewed, rehearsed, atomically adopted case and action bundle while keeping the
raw note private to `ownerSeatId`. That isolation created the largest remaining
Command Flow gap on the roadmap: when **two or more leads or managers in
separate reporting branches** independently prepared captures describing the
**same underlying operational constraint**, neither sibling could see the
collision, and their common ancestor (mid-manager at rank 2, director at rank 3,
VP at rank 4, or CEO at rank 5) saw nothing until duplicate local cases and
uncoordinated action bundles had already been adopted below the span that holds
authority over both branches.

Closing that gap could not violate three hard doctrines:
1. **No raw-note or peer leakage:** raw `sourceText`, classifier sentences and
   individual IC names must never cross a peer boundary or travel upward.
2. **Subsidiarity:** consolidation belongs at the **Lowest Common Ancestor
   (LCA)** of the participating branches — never sideways to a peer and never
   higher than the smallest span containing every affected branch.
3. **Human confirmation, never auto-merge:** heuristic text/lineage similarity
   is not proof that two spans face one root cause.

## Decision

1. **Privacy-preserving constraint signature (`missionCaptureMerge.js`).**
   Each open constituent capture (`draft` or `rehearsed`, non-expired,
   non-merged) derives an in-memory structural signature from three zero-leak
   channels:
   - **Blocking class (Fellegi & Sunter, 1969):** `primaryCategoryId` from the
     deterministic intake taxonomy; cross-category pairs never link.
   - **Keyed one-way constraint shingles (Broder, 1997; Schnell, Bachteler &
     Reiher, 2009 PPRL):** non-negated static lexicon terms plus stemmed
     non-stopword content tokens stripped of all roster person-name tokens,
     hashed through `fingerprint()`.
   - **Graph & ADR-0113 lineage anchors:** active `prepares-for` edges on
     `agendaEntries` inside the seat's span carrying an explicit upstream
     record marker (`[RULE-...:id]` or `; ref id)`) or an engine constraint
     family overlapping the capture's stems, plus any explicit `linkedGoalId`.
   A pair across disjoint reporting branches matches when it shares an exact
   lineage anchor OR has weighted Jaccard resemblance `>= 0.28` across at least
   two shared shingles (including a lexicon or lineage term).

2. **Associative N-way LCA (`multiSpanLowestCommonAncestor`).**
   Connected cross-span components select at most one capture per disjoint
   branch (up to 8 spans) and route exclusively to the associative pairwise
   LCA of all participating seats — so three spans meeting at a director
   (`lead1` + `lead2` under `mgr1`, plus `lead3` under `mgr2`) route to `dir1`,
   not `mgr1`. Each cluster carries a deterministic 16-hex `dedupeFingerprint`
   covering the LCA, category, constituent capture IDs and constituent
   `inputFingerprint`s.

3. **Altitude-appropriate disclosure.**
   - **Preparing seats (ranks 1–4):** receive an identity-free `mergeAdvisory`
     naming only the LCA, peer-span count, category, resemblance and
     `dedupeFingerprint` — never a sibling note, title or person.
   - **LCA seats at rank 2–3 (manager / director):** within the `unit` detail
     ceiling (`detailCeiling: 3`), see constituent span labels, reviewed case
     titles, FMEA severity and review dates, with zero raw notes or sentences.
   - **LCA seats at rank 4–5 (VP / CEO):** enforced seats above the `unit`
     detail ceiling withhold constituent case titles (`titleWithheld: true`) and
     unlock capital envelopes (`budget`) on the consolidated response.

4. **Human confirmation, rehearsal and atomic settlement.**
   - `missionCapturePrepareMerge` verifies LCA ownership and matching
     `dedupeFingerprint`, sets `involvedPersonIds` to `directBranchIds` so the
     Command Chain (`harvestWork` / `responsibleNodeId`) attributes the adopted
     case directly to the LCA seat, and preserves full ADR-0114 `commandEdits`.
   - `missionCaptureDismissMerge` records a human reason (5–600 chars) on a
     dismissed LCA merge row, suppressing that exact `dedupeFingerprint` while
     leaving constituent captures open in their own spans.
   - `transactMissionCapture` creates **one** LCA-owned case and **one**
     coordinated bundle and settles every constituent capture to
     `status: 'merged'` (`mergedIntoCaptureId`, `caseId`, `bundleId`) in the
     **same** store write. Changing any constituent capture after rehearsal
     invalidates `captureSourceFingerprint` and blocks stale adoption; any rule
     failure rolls back the case, bundle and constituent statuses together.
   - `RULE-MIS-01` (`missionRules.js`) writes typed `responds-to`,
     `coordinates` and `rolls-up-to` provenance edges from both the LCA merge
     capture and every merged constituent capture without adding a new rule ID,
     collection or schema bump (`SCHEMA_VERSION` stays 112).

## Consequences

- **Positive:** Directors, managers, VPs and chiefs arbitrating cross-span
  bottlenecks replace N fragmented child cases with one rehearsed, LCA-owned
  case and coordinated action bundle; frontline leads stop carrying duplicate
  upward escalations without surrendering note privacy.
- **Honest limits:** Weighted shingle resemblance and shared lineage markers are
  heuristic proposals, not causal proof of an identical root cause — human
  confirmation is mandatory. Local seats remain workflow declarations, not
  multi-user authentication. Real-browser assistive-technology walkthrough is
  `[UNVERIFIED]` (jsdom + axe-core ran).
