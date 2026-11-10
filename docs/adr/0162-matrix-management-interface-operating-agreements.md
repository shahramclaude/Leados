# ADR-0162 — Matrix Management-Interface Operating-Agreement Register

- **Status:** Accepted (Session 223, 2026-11-10)
- **Schema:** v131 — additive (`matrixInterfaceAgreements`, `matrixInterfaceMarkers`, clamped term/warning/ask settings; migration `130 → 131` leaves both ledgers empty)
- **Surface:** `#/matrix?panel=interfaces`; CSV scope #122 (`matrix-interfaces`, aggregate-only); `RULE-MIA-01`; `affirm-matrix-interface` & `govern-matrix-interface`
- **Altitude / structure:** director / VP / CEO × matrix, with first-person bilateral signing by counterpart managers at every leadership rank; a single-chain workspace stays inert

## Context

ADRs 0140–0161 declare reporting lines, price time-weighted share-days, reconcile activity, audit frozen authority continuity, and expose lateral span fragmentation (`#/matrix?panel=coordination`). None records the operational contract counterpart managers actually run on every week when sharing people across lines: *which consultation rule governs decisions, which active cadence forum hears collisions, who escalates when that forum cannot settle, and when does the agreement expire?*

Allowing automation, a third manager, or one side alone to assert a bilateral agreement would fabricate consent — repeating the same "shadow accountability" defect ADRs 0148 and 0157 closed for individual shares. Equally, collapsing diamond ties in the reporting DAG into an arbitrary single escalation owner would misstate governance authority.

## Decision

Introduce a first-person bilateral management-interface operating-agreement register wired across the canonical Schema, Operating Seat gateway, post-commit spine, CSV catalog, and Matrix terminal:

### 1. Canonical Pair Extraction & Live Structural Derivation (`matrixInterface.js`)

- Active unordered manager pairs `{managerAId < managerBId}` are deduced exclusively from live `buildMatrix` + `matrixAllocations` across active multi-line people, deduplicating pairs shared across multiple people before rolling up to directors, VPs, or the CEO.
- Each pair resolves to one of seven mutually exclusive, exhaustive states ordered by strict severity precedence:
  1. `structurally-unresolvable` — `!apex.unique` (`matrixJointApex` diamond tie or disconnected graph) OR a previously agreed `escalationSeatId` no longer sits at or above today's live unique `apexId`.
  2. `contested-terms` — both counterparts signed live acts in the current round with differing consultation rule, forum, escalation seat, or date window.
  3. `forum-unavailable` — agreed terms reference a `cadenceForums` ID that no longer exists or is retired.
  4. `expired` — `reviewByOn < today` (agreements never auto-renew by silence).
  5. `one-sided` — exactly one counterpart has a live sign-off in the current round.
  6. `unagreed` — no live agreement in force (never signed, retired, or `effectiveFrom > today` future-dated).
  7. `current` — unique joint apex, valid active forum (if named), matching bilateral terms, and `effectiveFrom <= today <= reviewByOn`.
- Coverage percentage (`coveragePct`) is withheld (`null`, printed `coverageWithheldReason`) whenever active reporting-line defects cloud graph completeness (`invalidLineN > 0`) or fewer than `MATRIX_FLOORS.cellN` (3) active pairs exist.

### 2. First-Person Bilateral Standing & Normalizer Fail-Closed Guards

- `matrixInterfaceAgreements` stores append-only dated human acts (`affirm` or `retire`), one counterpart side per row, validated by `matrixInterfaceSchema.js`. Forged-side rows (`actingManagerId` mismatch), missing dates/rules/escalation owners, `reviewByOn < effectiveFrom`, or short/empty basis/reason strings are dropped with explicit warnings.
- `matrixInterfaceActions.js` requires scoped managers to sign ONLY their own side (`seat.id === managerAId | managerBId`), explicitly refusing forged `actingSide`/`actingManagerId` arguments, disconnected/tied pairs, non-ancestor escalation seats, and missing/retired `cadenceForums`.
- Both `matrixInterfaceAgreements` and `matrixInterfaceMarkers` are registered in `seatRegistry.js` (`unit`, `detailCeiling: 0`) so declared seats read only through the seat-scoped `SAFE_READS` adapters. Above `MATRIX_FLOORS.detailRank` (`rank >= 4`), non-self counterpart names and prose basis text are redacted while aggregate counts and DAG buckets stay accurate.

### 3. Shared Spine (`RULE-MIA-01`) & Aggregate CSV (#122)

- `RULE-MIA-01` runs before `seatRule` in `DEFAULT_POST_COMMIT_RULES`, triggers only on matrix-line, cadence-forum (`cadence.forum.declared` / `cadence.forum.retired`), and matrix-interface lifecycle events, stays inert on auto-commits in single-chain workspaces, and obeys `matrixInterfaceAutoPropagate`.
- It closes prior `matrixInterfaceMarkers` delegations when a pair reaches `current` (or disappears / loses its apex), issues at most ONE dated review delegation per uncovered pair to its unique `matrixJointApex` with `issues-obligation` and DAG `rolls-up-to` provenance, and logs an observation marker refusing to guess an owner on diamond ties or disconnected pairs.
- Briefs (`matrixInterfaceBriefText`) and CSV scope #122 (`matrix-interfaces`) are strictly aggregate-only with zero person names, manager names, IDs, forum titles, or prose text.

## Consequences

- Existing v130 workspaces migrate cleanly (`130 → 131`) with zero invented agreements (`matrixInterfaceAgreements = []`, `matrixInterfaceMarkers = []`).
- Any structure move (`matrixJointApex` tie or moved ancestor) or forum retirement surfaces immediately on read and on the post-commit spine without touching historical sign-offs.
