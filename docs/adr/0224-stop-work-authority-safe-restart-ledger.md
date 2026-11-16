# ADR-0224 — Stop-work authority & safe restart ledger

- Date: 2026-11-16
- Status: Accepted
- Primary duty: frontline / mid-manager stop-work; director / VP independent oversight
- Structures: single-chain and matrix
- Source schema: v179; route `#/work-stop`; CSV #166; rule `RULE-SWP-01`

## Context

LeadOS has records for incidents, cases, operating routines, temporary waivers, simultaneous station coverage, work/rest and shift handovers. None is a first-person stop-work hold with an explicit, independently reviewed path back to work. A schedule, acknowledgement, manager's approval or timeout must not be mistaken for proof that the unsafe condition has been removed.

OSHA/FCC's 2017 *Communication Tower Best Practices* is advisory material, not a standard or regulation. It recommends broadly available stop-work authority without reprisal, centralized tracking of unsafe-condition reports and proof that a serious unsafe condition was eliminated before restart. Those recommendations inform the process bar here; this software cannot enforce non-retaliation or verify a worksite. See [Sources and limits](#sources-and-limits).

## Decision

Build a local-first, human-declared ledger. A stop is a hold, not a verdict that a site is safe or a permit to proceed. The app records declared words and evidence; it does not sense a hazard, operate an interlock, isolate energy, authenticate a worker, dispatch emergency response, or certify legal compliance.

### State and authority

Three collections are added EMPTY at upgrade: `workStops`, `workStopActs`, and `workStopMarkers`. `MIGRATIONS[178]` advances schema v178 → v179 and sets the new `workStopAutoPropagate` convention to its default (`true`) without inferring a stop from incidents, waivers, schedules, handovers or other existing rows. No clearance, restart status or safety score is stored; the reader derives state from the append-only act stream.

A first-person declaration names the reporter, work area/asset/boundary, work being held, a closed hazard category, the observed condition, immediate stop/control already applied, a named work lead, one or more affected operators, and a formal review deadline no more than 72 hours out. The deadline is not an expiry: a hold never releases because time passed. People must be active roster entries and reachable from the operating seat through the declared tree / Matrix scope. The undeclared operator view requires an explicit local self-attestation. That checkbox is not authentication; a declared leadership seat acts only as its own roster identity.

At declaration, the reader freezes the complete askable authority set computed from the live Matrix graph over the active manager lines of the reporter, work lead and every affected operator. It selects every minimal common Director+ apex; a diamond tie is a set of duties, not a winner. A missing/defective route, no Director+ apex, participant conflict or synthetic workspace-leader-only result is refused wholesale. The hold is still recorded, but this release has no action to repair or re-resolve an unaskable frozen authority set; use the established site procedure and correct the roster / Matrix before declaring any subsequent hold. No surviving branch or manager is silently substituted. A later change to a resolved live authority set also fails closed: the frozen reviewers do not turn a stale key, and a new reviewer is not inferred.

### Three distinct acts; no automatic restart

1. **Work control:** the named work lead, or a manager strictly above that lead, appends what changed and the physical or documentary evidence they checked. This is not a clearance.
2. **Independent assessment:** every frozen joint apex, each acting as a distinct active roster person and not a named participant, appends `safe` or `hold` for the same latest mitigation round. A `hold` keeps the work stopped. Old assessments do not carry forward to a later mitigation.
3. **Affected-operator key:** after all joint apexes independently record `safe` for that same mitigation, one named affected operator—separate from the named work lead and every reviewer—records their own work-area check and evidence and chooses `restart` or `hold`. A restart act before those approvals, after a hold, or after authority drift is refused. A deadline, silence, task completion, reviewer acknowledgement or automation never supplies either key.

Acts are append-only. An actor cannot amend or repeat their own decision for a mitigation round; a new control creates a new round. Malformed, role-invalid or premature restart acts produce a derived `record-integrity-defect` state: the hold remains, every new act is refused, and the overdue rule writes an identity-free marker rather than assigning an impossible task. This release has no in-ledger repair action. A hold-decision can be followed only by a new work-control round, never an edit of the old words.

### Review obligations and access

`RULE-SWP-01` runs on the shared post-commit spine and on an explicit scan. Once the declared review deadline is overdue, it asks only the named work lead for a missing work-control act; after a mitigation exists, it asks each undecided frozen joint apex for an independent review. It never automates the affected operator's key. Each opaque task is idempotent by stop/round/addressee, respects a human answer, self-closes when its condition ceases, and is bounded to four new asks per commit. If authority is absent or drifted, it writes an identity-free observation and asks nobody. `workStopAutoPropagate` governs both commit and explicit-scan paths.

Rights are `read-work-stop` (rank 1–5), `declare-work-stop` (1–5), `mitigate-work-stop` (1–5), `assess-work-stop` (3–5) and `decide-work-restart` (1–5); each action rechecks its role and the live Matrix. The collections are report-only and are excluded from the generic seat projection. A dedicated reader exposes a row only within the declared span / Matrix scope or to a frozen joint reviewer; identities are withheld at rank 4+ without full access. No per-person stop-work volume, rate, ranking or performance score is produced.

CSV scope #166 contains only summary, derived-state and hazard-category counts; it exports no person, area, hazard narrative, mitigation or evidence. A numeric release is withheld with a reason if the claim is incomplete or any cell is nonzero and below the floor of three. The whole numeric release is suppressed when either condition occurs, so summary totals and the state/hazard partitions cannot recover a small cell by subtraction within the same export. This is not protection against differencing across repeated exports or other reports; cross-view release control remains an open system-level limitation.

## Consequences

- An operator can declare a hold even when no authority can be resolved; the lack of authority is explicit and does not erase the hold.
- The highest-assurance state the software can display is only that the required human acts were recorded in the expected order. It is not evidence that the site control physically exists or that restart is safe.
- A manager or reviewer cannot replace an affected operator's first-person decision. A manager cannot clear the work lead's control. Tied apexes cannot be collapsed into one approval.
- Local self-attestation can be impersonated by anyone with access to the same local workspace. A deployment requiring signed identity, non-repudiation, tenant isolation, or protected whistleblowing needs a separate authenticated service and operational policy.
- The generated three-stage diagram `app/assets/work-stop-safe-restart.jpg` is a method aid, not an equipment instruction.

## Sources and limits

- OSHA / Federal Communications Commission, *Communication Tower Best Practices* (2017), [PDF](https://www.osha.gov/sites/default/files/publications/OSHA3877.pdf). Advisory guidance; not a regulation or a legal-compliance determination. Used for the stop-work / report / prove-before-restart process bar.
- SafetyCulture / Mitti, [Manufacturing Safety Management](https://mitti.com/manufacturing/manufacturing-safety-management). Vendor-published descriptions of consolidated checks, corrective actions and traceability; **[BENCHMARK-UNVERIFIED]**. No hands-on product comparison was performed. LeadOS is not an EHS inspection, permit-to-work, lockout/tagout or safety-management platform.

Real-browser and assistive-technology behavior, the complete suite, competitor parity, the effectiveness of the local process, non-retaliation, and physical-control evidence remain **[UNVERIFIED]**. The exact build/test outcome for this session is recorded in `AI-SESSION-LOG.md`.
