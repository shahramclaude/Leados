# ADR-0080: Mission Control — the altitude-specific operating loop, scoped API and disclosure-safe brief

**Date:** 2026-11-03 · **Status:** implemented · **Schema:** v86 · **Surface:** `#/mission` · **Session:** 120 · **Built on:** [0076](./0076-operating-seat.md) (operating seat), [0075](./0075-command-chain.md) (reporting tree and altitudes), [0066](./0066-action-bundles.md) (atomic action bundles), [0008](./0008-post-commit-rules-hook.md) / [0026](./0026-propagation-ledger.md) (shared rule spine)

---

## 1. Context — the audit found a boundary that was mostly a label

The repository already had a sophisticated local-first leadership workspace: a transactional store, a reporting-tree model, five altitudes, a large post-commit rule engine, action bundles, decision rights and a succession flow model. The blunt defect was that the Operating Seat filtered navigation and route entry, while most legacy screens still received unrestricted state and the API had no central mutation guard. A declared seat could therefore be described as “enforced” while a legacy screen or API call still read or wrote outside the intended boundary.

The product gap was equally concrete: the hierarchy existed as a model, but the daily operating surface was still a long module catalogue. A frontline lead, director and CEO did not get a genuinely different job-to-be-done with a reviewed path from situation to coordinated action to upward handoff.

## 2. Decision

Add Mission Control as the supported scoped operating surface for declared seats, and make the boundary honest:

1. **Five operating loops, not five skins.** `missionRegistry.js` declares the question, horizon, focus and allowed command kinds for frontline, manager, director, VP and chief. Coaching is limited to individual-detail altitudes; budget commitments require executive authority; every altitude can open a case, decide and delegate within its span.
2. **A central API gateway.** `accessGateway.js` wraps every API method. The undeclared local operator is unchanged. A declared seat gets an exact allowlist of reviewed adapters, rank checks, person-scope checks, source-case scope checks and budget ownership checks. Unknown methods fail closed. Legacy raw-data screens are not labelled safe; they remain available only after an explicit handover to the local operator view.
3. **A render projection.** `viewScope.js` gives the shell a scoped state: governed collections pass the existing record policy, private person fields are removed above manager altitude, raw audit events and pulses are not projected, and links are kept only when both endpoints are visible. Seat-resolution failure blocks projection rather than failing open.
4. **Disclosure-safe hierarchy roll-up.** `mission.js` partitions work by the responsible owner node exactly once. Cross-team work stays at the lowest common leader. Above the individual-detail boundary, small cells are suppressed; if only one cell is hidden, a second cell is withheld; parent totals become intervals so a reader cannot subtract visible siblings from an exact parent. Source totals receive the same complement protection. This is not differential privacy and does not claim protection against every auxiliary-data or repeated-release attack.
5. **Reviewed cross-module interventions.** Mission Control composes rank-filtered commands and reuses the existing Action Bundle registry, disposable rehearsal worker, atomic executor, stale-rehearsal guard and guarded compensation. It does not create a second workflow engine. Adoption creates real decisions, delegations, assumptions, budget encumbrances, stakeholder drafts or coaching prompts in one transaction; the existing post-commit spine then fans work through modules and up the hierarchy.
6. **Immutable mission briefs.** Schema v86 adds `missionBriefs`. Only the declared enterprise root can freeze a brief. The snapshot is identity-free, carries interval counts, source revision, evidence fingerprint, review date and limitations, and cannot be edited by an API. `RULE-MIS-01` opens one governed review decision and writes typed `summarizes-span` edges to child leadership seats plus `tracks-followup` to the review. Lower altitudes can export a scoped handoff but cannot read enterprise snapshots outside their boundary.

## 3. Named frameworks encoded

- **Jaques’ time-span of discretion:** escalation debt is work older than its owner’s altitude horizon, not a universal SLA.
- **FMEA severity:** recorded severity is one triage input, never a person score or a probability.
- **PDCA / assumption-based planning:** an intervention pairs a choice and owned work with a testable assumption and a dated review.
- **Commitment accounting:** a budget command encumbers an existing envelope; it is not actual spend and never converts currencies.
- **Primary and complementary small-cell suppression:** small cells and their complements are withheld; interval parent totals block simple differencing.
- **DACI / decision governance:** a frozen brief opens an explicit maintain/revise/stop review; the software never chooses.

## 4. Data and propagation contract

- New collection: `missionBriefs` (bounded, immutable, identity-free). Migration `MIGRATIONS[85]` adds it without inferring historical snapshots.
- New setting: `missionCellFloor` (3–25, default 5).
- New graph node: `missionbrief` → `missionBriefs`.
- New relation: `summarizes-span` (mission brief → child leadership seat). Existing `tracks-followup` links the brief to its governed review.
- New rule: `RULE-MIS-01`, registered before the final `seatRule` so vertical fan-out reads the finished transaction.
- Existing vertical edge: `rolls-up-to` from operational sources to leadership ancestors, produced by `seatRule`.

## 5. Honest limits

- This remains a **local workflow boundary**, not authenticated multi-user security. The browser owner can switch seats, read localStorage or export a full backup from the operator view.
- Legacy modules are not all seat-scoped yet. The gateway refuses their raw reads/writes under a declared seat; Mission Control is the supported scoped surface. Extending reviewed adapters module by module is the next architecture task.
- Suppression protects exact small-cell counts in the current release. It is not a formal privacy guarantee across time, reorganisation or external auxiliary data.
- Rehearsal is a software effect diff, not a causal forecast. No message is sent and no money is spent by adoption.
- The full repository was inventoried and parsed, but not every legacy line was semantically reviewed. Untouched surfaces remain `[UNVERIFIED]` beyond the executed tests.

## 6. Verification target

`tests/app/mission-control.test.mjs` — **10 tests** — covers migration, five distinct loops, LCA partitioning, complementary suppression, scoped projection/API refusal, an atomic frontline intervention with vertical roll-up and withdrawal, stale-rehearsal refusal, an executive budget intervention, immutable chief brief creation with governed review/provenance, drill-up/down detail ceilings and mission-adapter gateway bypass refusal, and axe-clean rendering of all four panels.

Mission briefs export as Markdown only. No CSV scope was added this session; the CSV registry remains at 75 exports (through #74).
