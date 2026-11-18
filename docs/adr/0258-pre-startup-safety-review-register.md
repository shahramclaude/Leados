# ADR-0258 — Pre-Startup Safety Review & Commissioning Readiness Register

- **Status:** Accepted and shipped
- **Date:** 2026-11-18
- **Schema:** v209 → v210 (additive, seven empty-at-upgrade collections, three bounded conventions)
- **Route:** `#/pre-startup` (aliases: `pssr`, `pre-startup-safety`, `pre-startup-safety-review`, `startup-gate`, `startup-authorisation`, `startup-authorization`, `commissioning-gate`, `punch-list`, `temporary-modification`, `energisation`, `energization`)
- **Rule:** `RULE-PSR-01` (`psrRule`, spine entry 167, pause switch `psrAutoPropagate`)
- **CSV export:** #195 `pre-startup-safety` (aggregate, identity-free, privacy-floored)
- **Altitude & structure:** Frontline operators/supervisors (rank 1) and mid-managers (rank 2) primary; director (rank 3) operational oversight; VP / CEO (ranks 4–5) aggregate posture and joint-apex startup gate where computed × **matrix and single-chain**

## Context

Targeted searches across `app/`, `docs/adr/` and `ROADMAP.md` for `pre-startup`, `PSSR`, `punch list`, `Flixborough`, `temporary modification`, `startup authorisation` and `commissioning readiness` returned zero matches (broader absence across historical prose **[UNVERIFIED]**). Existing safety registers cover adjacent, distinct moments:

- **Permit-to-work (`#/permit-to-work`, ADR-0246)** governs isolated execution of maintenance or high-hazard tasks and proves dead plant during work, not multi-discipline readiness to introduce energy or hazardous material after a modification or commissioning.
- **Stop-work & safe restart (`#/standard-work?panel=stops`)** halts a running routine after an abnormal signal and clears that halt, not the design-conformance, procedure, punch-list, operator-briefing and temporary-change restoration gate before first energisation.
- **Standard waivers (`#/standard-work?panel=waivers`)** grant dated policy departures, not physical temporary jumpers, bypasses or spool pieces whose un-reverted survival after startup is the Flixborough (1974) failure mode.

Published frameworks grounding the design: OSHA 29 CFR 1910.119(i) (Pre-Startup Safety Review), CCPS *Guidelines for Performing Effective Pre-Startup Safety Reviews* (2007, Category A pre-startup blockers vs Category B dated post-startup items), UK HSE *Flixborough* (1975) and U.S. CSB *BP Texas City* (2005) on temporary changes and startup governance, and Holmström (1979) on separating the change proposer from gate verification and acceptance.

## Decision

Add seven append-governed collections in Schema v210, all `[]` on empty state and on `209 → 210` upgrade (no review, gate, punch item, authorisation or startup is ever inferred from permits, stops or waivers):

1. `psrReviews` — unique `reviewRef`, `unitRef`, `triggerKind` (`new-build`, `modification`, `temporary-change`, `turnaround-restart`, `long-idle-restart`), written `changeBasisRef`, distinct `proposerId` and `unitHolderId`, 1–6 `requiredDisciplines` (`engineering`, `operations`, `maintenance`, `process-safety`, `instrumentation`, `environment`), 1–12 `affectedOperatorIds`, `plannedStartDay`, and `revertByDay` (mandatory on and after `plannedStartDay` for `temporary-change`; forbidden for all other triggers).
2. `psrPunchItems` — per-review Category A (`pre-startup`) or Category B (`post-startup`, mandatory `dueDay`) findings with `ownerId` and optional closure evidence (`closedById`, `closedAt`, `closedDay`, `closureEvidenceRef`, `closureBasis`).
3. `psrSignoffs` — dated discipline gate verdicts (`cleared` | `rejected`) with `evidenceRef`, `basisRef` and `signedById`. The latest valid row per `(reviewId, discipline)` governs, so a subsequent rejection re-holds startup until re-cleared.
4. `psrReadiness` — per-operator procedure briefing attestations (`operatorId`, `procedureRef`, `evidenceRef`, `attestedById`, `attestedDay`).
5. `psrAuthorisations` — joint-apex Startup Authorisations (`permitClearanceRef`, `basisRef`, `authorisedById`, `authorisedAt`, `authorisedDay`). Superseded rows (later open Category A item, gate rejection or revoked prerequisite) remain stored and marked superseded rather than deleted.
6. `psrStartups` — at most one physical energisation record per review (`energisedAt`, `energisedDay`, `startupLogRef`, `startupBasis`, `recordedById`), plus optional physical restoration fields (`restoredAt`, `restoredDay`, `restoredById`, `restorationRef`, `restorationBasis`) for temporary changes.
7. `psrMarkers` — bounded, identity-free rule observation records when no single joint apex can be resolved.

Conventions (`settings`): `psrAutoPropagate` (`true`), `psrPrivacyFloor` (`3`, strict whole integer `2..20`), `psrRevertHorizonDays` (`7`, strict whole integer `1..90`). Convention updates reject blanks, booleans, floats, non-decimal strings, unknown keys and out-of-range integers without silent coercion or clamping.

### Derived states and separation-of-duty invariants

Nothing derived is stored. `derivePsrReview` computes one of ten mutually exclusive states on every read, in strict precedence:

1. `breach-energised-unsafe` — physical startup recorded without a valid, un-superseded joint-apex Startup Authorisation or while any prerequisite or separation rule was breached (permanent audit record; factual startup logging accepts the event rather than hiding a premature energisation off the ledger).
2. `temporary-expired` — energised `temporary-change` past `revertByDay` with no verified physical restoration.
3. `energised-post-overdue` — energised review with one or more open Category B items past `dueDay`.
4. `temporary-live` — energised `temporary-change` within its `revertByDay` window awaiting physical restoration (`temporaryExpiring` flag inside `psrRevertHorizonDays`).
5. `energised-post-open` — energised review with open Category B items still inside their declared due dates.
6. `closed-verified` — authorised energisation completed, zero open Category A/B items, and (for temporary changes) physical baseline restoration recorded.
7. `gate-rejected` — pre-startup with at least one required discipline gate currently `rejected`.
8. `blocked-pre-startup` — pre-startup with at least one open Category A blocker.
9. `awaiting-verification` — pre-startup with no open Category A blockers or rejections, awaiting remaining required discipline clearances or operator briefings.
10. `ready-for-authorisation` — every Category A blocker closed independently, every required discipline cleared independently, every affected operator briefed independently, awaiting joint-apex `psrAuthoriseStartup`.

Write-door invariants (re-checked independently by the reader against imported rows):

- `proposerId !== unitHolderId`; `proposerId` is barred from closing Category A items, signing discipline gates, attesting operator readiness, authorising startup, and certifying physical restoration.
- A Category A punch-item `ownerId` cannot self-close their own blocker; an `operatorId` cannot self-attest their own procedure briefing.
- `psrAuthoriseStartup` requires the acting seat to hold active line reach and equal the unique live `matrixJointApex` across all active lines holding the review's unit holder, proposer and governing signers. Genuine complete-bipartite matrix diamonds (`ambiguous: true`) refuse with `apex-ambiguous` rather than guessing an authority.
- All eight write actions join `MATRIX_LINE_SCOPED` in `accessGateway.js` so declared secondary matrix lines grant reach consistently at both the gateway and action boundaries; expired reporting lines grant zero reach.

### Matrix accounting, altitude disclosure, rule and export

- A person held across primary and secondary matrix lines is counted once in `totals.peopleN`, `totals.operatorsN` and `totals.operatorsUnbriefedN`. Line roll-ups state per-line review participation separately and never sum to headcount.
- `balances` (partition and child-to-review arithmetic) and `figuresComplete` (absence of dropped malformed rows, off-graph orphan hands, matrix errors and ambiguous apexes) are computed and printed separately.
- Ranks 1–3 (and the local operator view) receive operational detail within reach; ranks 4–5 receive exact counts, breach totals and reconciliation with operational detail and identities withheld, plus `apexActionableRefs` solely where the executive seat is itself the computed joint startup apex on a `ready-for-authorisation` review.
- `RULE-PSR-01` emits at most 4 opaque delegations per commit (excess counted as `deferred`) across six conditions (`energised-unsafe`, `temporary-expired`, `post-startup-overdue`, `gate-rejected`, `ready-for-authorisation`, `temporary-expiring`), addressed to `matrixJointApex`, keyed only by `psr1:<kind>:<reviewId>` in typed `issues-obligation` links, self-closing on resolution, respecting human closure/return, recording identity-free `psrMarkers` when unresolvable, and pausing on `psrAutoPropagate`.
- CSV #195 (`pre-startup-safety`) exports identity-free summary, state, trigger and discipline rows, withholding sub-floor positive bucket counts as blank with `below-privacy-floor` reason rather than `0`.

## Visual asset provenance

`app/assets/pre-startup-safety-method.jpg` illustrates the five-stage PSSR governance gate on `#/pre-startup?tab=method`. Connector check for `higgsfield` returned `unsupported` in this session; the schematic was generated with Arena's built-in image generator and visually inspected for legibility. It is an explanatory diagram, not operational evidence.

## Benchmark and honest limits

Benchmarked from published documentation (fetched 2026-11-18) against Frontline Data Solutions (Frontline MOC/PSSR), Sphera Process Safety Management, Enablon, VelocityEHS, Intelex, Benchmark Gensuite and EcoOnline, plus OSHA 1910.119(i) and CCPS PSSR guidelines. Matched on trigger-typed reviews, Category A/B punch separation, multi-discipline verification, operator readiness, startup authorisation and temporary-change expiry tracking; stricter on live matrix joint-apex computation, proposer/self-verification refusals, explicit retention of premature-startup breaches, and separate `balances` vs `figuresComplete` reporting.

**Explicit limits (not built):** LeadOS is a local-first governance record, **not** a physical interlock, DCS/SIS permissive, LOTO hardware lock, P&ID CAD system, automated PHA/HAZOP engine, mobile offline walkdown app, or authenticated multi-user server (seat selection is a workflow declaration, not authentication). Hands-on vendor trial and same-input comparison: **[BENCHMARK-UNVERIFIED]**. Real-browser and assistive-technology walkthrough, encrypted-vault reload and full 314-suite CI run: **[UNVERIFIED]**.
