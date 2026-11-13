# ADR-0187 — Dependency Feedback-Cycle Tear-Sensitivity Analysis & Governed Post-Commit Escalation (`RULE-CYC-01`)

**Status:** Accepted — 2026-11-13 (Session 255)
**Schema:** v148 unchanged — no new collection, no migration, no stored derived field; reuses existing `delegations`, `links` and `matrixMarkers`, plus two conventions on `settings` (`dependencyCycleAskDueDays`, `dependencyCycleAutoPropagate`)
**Surface:** `#/matrix?panel=cycles` · CSV #137 `matrix-dependency-cycles` (aggregate, identity-free, extended with tear & ask census columns) · safe read `matrixDependencyCycleReport` · rank-3+ governed actions `matrixDependencyCycleScan` and `matrixDependencyCycleSetConventions` (`govern-dependency-cycles`) · `RULE-CYC-01` on the shared post-commit spine (117 rules / 117 contracts)
**Altitude / structure:** director / VP PRIMARY × **both matrix and single-chain** (Sessions 251–254 were all matrix-primary; single-line loops address their sole active line manager and fan up via `rolls-up-to`, while cross-line loops address their unique `matrixJointApex`)

## Context

[ADR-0183](./0183-cross-boundary-dependency-feedback-cycles.md) (Session 251) shipped the Design Structure Matrix (Steward 1981; Eppinger & Browning 2012) partitioning slice: five declared precedence relations with declared direction, exact iterative Kosaraju strongly connected components (SCCs), Kahn topological condensation ordering, and `buildMatrix` / `matrixJointApex` line-reach attribution. Two explicit gaps were left **In Progress** in `ROADMAP.md` and ADR-0183 §5:

1. **Counterfactual tearing sensitivity.** Knowing *that* three or five work records form a closed dependency loop still leaves the accountable director asking: *"Can re-sequencing or splitting one declared dependency uncouple this block, does removing one edge only shrink an inner loop, or do redundant paths require re-sequencing two or more dependencies together?"* Generic DSM tearing tools answer that with heuristic weight rankings or opaque minimum feedback-arc-set approximations that pick a "recommended tear" — violating LeadOS's refusal to invent priority weights or silently decide which commitment gives way.
2. **Shared-spine escalation (`RULE-CYC-01`).** ADR-0183 was pure read: when a coupled loop formed across two reporting lines (or inside a single reporting branch), nothing on the shared post-commit automation spine placed a bounded sequencing ask in front of the accountable seat, fanned it upward via `rolls-up-to`, or recorded an auditable observation when no single roster seat could settle the loop. Moreover, single-chain workspaces (`withLines: false`) had received secondary/inert treatment across Sessions 251–254 even though a loop inside one reporting branch has a provable single accountable manager who can sequence it directly.

Targeted absence check on `app/` before implementation: `RULE-CYC` / `dependencyCycleRules` / `TearSensitivity` returned zero files; repository-wide absence in `src/` and non-canonical scripts remains **[UNVERIFIED]**.

## Decision

**Ship exact counterfactual single-arc tear sensitivity and `RULE-CYC-01` post-commit escalation across both matrix and single-chain workspaces, with zero schema bump (Schema v148 unchanged).** Leave numerical/weighted DSMs, NP-hard multi-arc minimum feedback-arc-set search, clustering, Monte Carlo simulation and LLM-assisted dependency discovery explicitly **In Progress**.

### 1. Exact counterfactual single-arc tear sensitivity — never a recommendation or auto-tear

`dependencyCycleTearSensitivity(memberKeys, internalArcs, { maxTearArcsPerBlock, lineReach, nodeLabels })` in `app/core/domain/dependencyCycle.js` groups internal precedence links by **distinct directed pair** `from>to` — because removing one of two parallel links that both assert `from → to` leaves the precedence claim intact — and evaluates exact `dependencyCycleComponents` after removing each single pair in turn:

- Every internal pair receives one of three closed outcomes (`DEPENDENCY_CYCLE_TEAR_OUTCOMES`):
  - `acyclic` — removing this pair leaves zero coupled sub-blocks (`freedNodesN === block.size`);
  - `reduces-core` — removing this pair frees at least one record into sequential order while a smaller coupled core persists;
  - `core-persists` — alternate directed paths keep every record in the block coupled (`freedNodesN === 0`).
- Every coupled block receives one of four mutually exclusive tear states (`DEPENDENCY_CYCLE_TEAR_STATES`): `single-arc-tearable`, `partial-single-tear`, `multi-arc-only`, or `tear-bound-exceeded` when distinct internal pairs exceed `maxTearArcsPerBlock = 64` (with `singleArcBreakN = null`, never `0` or a sampled subset).
- Each candidate pair also reports its holder boundary (`same-holder`, `cross-holder`, `unattributed-endpoint`) from proven line reach without ranking or selecting which edge should yield.
- Exactness is checked exhaustively in `tests/app/dependency-cycles.test.mjs` against brute-force mutual reachability across all $2^9 = 512$ directed 3-node graphs (including self-loops).

### 2. Deterministic content signature and zero-schema-bump persistence

`dependencyCycleSignature(memberKeys)` (`app/core/domain/dependencyCycleSchema.js`) computes a deterministic 64-bit FNV-1a signature (`cyc1:<size>:<16-hex>`) over sorted canonical member keys (`type:id`), independent of topological condensation index (`blk-001` shifts if an unrelated upstream cycle appears; `cyc1:...` does not). Two settings conventions (`dependencyCycleAskDueDays` in `1..30`, default `7`; `dependencyCycleAutoPropagate`, default `true`) normalize through `normalizeDependencyCycleSettings` in `app/core/schema.js` (`DEFAULT_SETTINGS` and `normalizeSettings`) and satisfy ADR-0180's convention-persistence contract. `dependencyCycleAutoPropagate` is registered on `PAUSE_PERMIT_MATRIX_REACH_SWITCHES` and `PAUSE_PERMIT_REACH_RULES` (ADR-0182) so an unpermitted pause is caught by `buildPausePermits`.

### 3. `RULE-CYC-01` on the shared post-commit spine — serving both single-chain and matrix

`dependencyCycleRule` (`app/core/domain/dependencyCycleRules.js`) sits on `DEFAULT_POST_COMMIT_RULES` immediately before `seatRule` and `sealRule` with its 1:1 `PROPAGATION_CONTRACTS` entry:

- **Fast exit:** O(`|links|`) scan when no workspace link uses a declared precedence relation and no `RULE-CYC-01` obligation exists.
- **Single-line loops (`single-line-holder`):** when every record in the coupled block resolves to one active line manager on the live roster (covering single-chain branches and single-line loops inside a matrix workspace), `RULE-CYC-01` places **one** dated sequencing ask (`delegations`, `authority: 'act-inform'`) in front of that sole manager.
- **Cross-line loops (`joint-apex`):** when a coupled block spans multiple line managers and `matrixJointApex` resolves to **one** active roster seat, `RULE-CYC-01` places **one** dated sequencing ask in front of that joint apex — never one of the competing peer lines.
- **Honest abstention (`leader-held`, `ambiguous`, `unattributed`, `off-roster`):** when the sole holder is the synthetic workspace `LEADER_ID`, when `matrixJointApex` returns incomparable minimal ancestors (or none), when any member lacks provable line reach, or when the resolved seat is off the active roster, `RULE-CYC-01` issues **zero** delegations and writes **one** bounded, identity-free `matrixMarkers` observation (`kind: 'dependency-cycle'`). Nobody is substituted.
- **Lifecycle, roll-up & idempotence:** each ask links via `issues-obligation` (`person → delegation` with `cyc1:...` provenance) and fans upward via `rolls-up-to` to every active matrix ancestor of the owning seat (excluding `LEADER_ID`). Asks close themselves (`status = 'done'`, prefixed `Closed by RULE-CYC-01:`) when the cycle clears or its owning seat moves; an ask closed by a human (`done` without the rule prefix, or `returned`) is read as `answered` and never re-opened while the same cycle signature stands. New asks cap at `asksPerCommit = 6` with any remainder counted in a `deferred` effect and issued on the next write or scan.

### 4. Seat boundary, governance rights and aggregate CSV #137

- `matrixDependencyCycleReport` remains a `SAFE_READ` (`declare-matrix-line`) passing seat-scoped `visiblePersonIds` into `buildDependencyCycles`, which withholds out-of-span record titles, people, line ids, manager ids and upward apex names (`withheld outside seat span`).
- `matrixDependencyCycleScan` and `matrixDependencyCycleSetConventions` require `govern-dependency-cycles` (rank 3–5 or full-access operator view). Out-of-bounds or non-integer conventions are **refused**, never silently clamped.
- CSV #137 (`matrix-dependency-cycles`) appends aggregate tear-sensitivity and escalation/ask columns across workspace, ownership-state and feedback-block rows while preserving zero-identity export parity.
- `#/matrix?panel=cycles` renders the coupled-block tear & ask columns, the counterfactual single-arc tear census table, and the governed `RULE-CYC-01` scan / convention controls from the single `buildDependencyCycles` report, keeping the embedded `app/assets/dependency-cycle-dsm.jpg` conceptual method diagram (`LeadOS-standalone.html` rebuilt at 11,928,631 bytes, inside the 12 MB ceiling).

## Competitive benchmark (Step 3.5)

Specialized DSM suites (Steward 1981; Eppinger & Browning 2012; Lattix / Cambridge Advanced Modeller) and portfolio tools (Jira Advanced Roadmaps, Planview) provide cycle detection and tearing heuristics. LeadOS now **clears and exceeds** the single-arc sensitivity and governance bar on three fronts: (1) **exact counterfactual tear census** (`acyclic` / `reduces-core` / `core-persists` over distinct directed pairs, exhaustively verified against brute-force mutual reachability, with an explicit refusal bound instead of heuristic sampling); (2) **non-prescriptive human authority** (reports which pairs uncouple or shrink the loop without inventing edge weights or auto-breaking commitments); and (3) **matrix-aware + single-chain accountability** (`RULE-CYC-01` routes single-line loops to the sole line manager, cross-line loops to the unique `matrixJointApex`, and refuses to guess on diamond ties or unattributed nodes). Multi-arc minimum feedback-arc-set optimization, numerical DSMs, clustering, simulation and LLM-assisted dependency discovery remain unbuilt (**`[BENCHMARK-UNVERIFIED]`** against commercial DSM suites; Higgsfield connector remains `unsupported` in this environment).

## Verification

- `node --test tests/app/dependency-cycles.test.mjs` — **22/22 PASS** (all 14 Session-251 tests + 8 new ADR-0187 suites: spine/contract/rights/pause-switch registration, exhaustive 512-graph brute-force tear-sensitivity check, hand-worked 4-pair overlapping loop + 6-pair clique + parallel-link deduplication + bound refusal, real-spine `RULE-CYC-01` + `audit.seal` + reload idempotence, single-chain escalation + `rolls-up-to` + human closure + self-closure + leader-held abstention, per-commit cap-6 deferral, pause-permit census + fail-closed convention validation + rank-3+ gate + seat-scoped redaction, and interactive JSDOM scan/conventions persistence).
- Cross-cutting suites: `board-room.test.mjs`, `convention-persistence.test.mjs`, `pause-permits.test.mjs` (**68/68 PASS**), `standalone.test.mjs` (**7/7 PASS**).
- `npm run lint`, `npm run check:boundary` (788 app ES modules, 238 test suites, 23 documentation checks, 0 violations), `npm run check:links` (1,120 internal links across 304 markdown files), `npm run build:standalone` (11,928,631 bytes · 786 bundled modules · Schema v148) and `git diff --check` PASS. Full `npm test` across all 238 suites and real-browser assistive-technology walkthroughs remain **[UNVERIFIED]**.
