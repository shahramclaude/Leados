# ADR-0183 — Cross-Boundary Dependency Feedback-Cycle Register (DSM partitioning slice)

**Status:** Accepted — 2026-11-12 (Session 251)
**Schema:** v145 unchanged — no collection, no migration, no rule, no setting, no stored derived field
**Surface:** `#/matrix?panel=cycles` · CSV #137 `matrix-dependency-cycles` (aggregate, identity-free) · safe read `matrixDependencyCycleReport`
**Altitude / structure:** director / VP PRIMARY × matrix; a single-chain workspace is fully supported — a loop held inside one branch prints no cross-line finding, and a loop spanning two branches is escalated through the tree LCA

## Context

A director sequencing a portfolio has to know one thing a Gantt chart cannot tell them: **which work waits on itself**. LeadOS already stores every typed dependency edge the post-commit cross-module automation engine writes (`app/core/schema.js` → `state.links`, with `LINK_RELATIONS` and `LINK_ENTITY_TYPES` as its single registry). Every reader of that graph so far walks it one way: LCA escalation, articulation points in the collaboration network, lineage, reachability. The ROADMAP's Session-203 discovery named the missing capability: a **Design Structure Matrix** (Steward 1981; Eppinger & Browning 2012) whose partitioning finds **strongly connected components** — the mutual feedback loops a linear hierarchy cannot see or order.

Targeted absence check on this tree: `design structure matrix|strongly connected|kosaraju|SCC` returns no implementation in `app/`; the only Tarjan references are offline LCA and articulation points (`orgNetwork.js`, `chainRegistry.js`). Repository-wide absence in `src/` and non-canonical scripts remains **[UNVERIFIED]**.

In a matrix the question is not only topological. A feedback loop whose records are held by two different reporting lines cannot be settled by either manager alone: resequencing it is a joint decision. NORTH_STAR.md's matrix mandate says the system must **name** that ambiguity rather than silently picking one manager. A pure SCC engine that printed a list of cycles without the line reach would be the weaker tool the Competitive Benchmark Mandate rejects.

## Decision

**Ship the partitioning slice, end to end, with the matrix join. Remainder stays In Progress** (tearing, numerical/weighted DSM, clustering, simulation, LLM-assisted dependency discovery, and a governed remediation rule on the shared post-commit spine).

### 1. One pure reader, nothing stored

`app/core/domain/dependencyCycle.js` re-derives everything on read from `state.links`, the workspace collections and `buildMatrix`. `app/core/domain/dependencyCycleRegistry.js` holds the closed vocabulary. No schema bump, no marker ledger, no migration, no settings key. Schema v144 → v145's two collections are untouched. A read mutates nothing, bumps no revision, and cannot drift from the printed figure.

### 2. A declared precedence lexicon, not an inferred one

Five typed relations create an arc, each with a **declared direction** (`source-first` or `target-first`): `depends-on`, `rests-on`, `informs`, `pre-registers`, `prefigures`. The direction is a declaration because SCCs are invariant under a *global* reversal of every edge but not under reversing only some. Symmetric couplings (`shares-barrier`, `shares-approver`, `couples`) and `impacts-goal` are **excluded with a printed reason** — treating an equivalence class as two arcs would manufacture a two-node cycle out of every pair of items that merely share an approver. People-attribution relations are used to name line reach and never create an arc. All excluded edges are counted by relation; nothing is dropped in silence.

Both endpoints are resolved against the record the workspace actually holds using the shared `LINK_ENTITY_COLLECTIONS` registry. Confidential `conflict` / `pulse` endpoints, person nodes, unresolvable endpoints, unknown relations and self-arcs are counted under named refusals.

### 3. Exact partitioning, iterative, and checkable

`dependencyCycleComponents(nodeIds, arcs)` is an iterative two-pass Kosaraju partition over the exact adjacency: no recursion (a 4,000-node workspace cannot overflow the stack), deterministic node/adjacency ordering, and no heuristic. It is exported so the suite can compare it against a **brute-force mutual-reachability partition** over exhaustively enumerated small graphs — exactness is a checked property here, not a claim.

Each component with more than one node, or a singleton with a self-arc, is a **coupled feedback block**. The records inside it are printed as one irreducible set: the register orders the condensation DAG topologically (Kahn) but **never orders inside a cycle and never tears an edge**. `internalArcsN + externalArcsN === arcsN` and `Σ block sizes === nodesN` are printed as claims, not assumed.

### 4. The matrix join — the part a generic DSM tool cannot do

Each work node's line reach is the union of active reporting lines (`matrix.linesByPerson`) of the people named by its typed people-edges. Each distinct line id counts once per block; a person on three lines contributes three line ids, not three people. A block whose union holds two or more lines is `cross-line` and escalates through the canonical `matrixJointApex` of its managers: a unique apex is named, two incomparable minimal ancestors are **both** named as `ambiguous-apex`, and a disconnected DAG is named disconnected. Nobody is chosen silently.

A node with no people-edge, an untraceable person, no active line, an out-of-seat person or a load-time defect in the declared reporting graph is `line-reach-unknown` and **refuses the workspace cross-line claim**. It is never charged to the home line by default. Four claims are printed separately: `lineReachComplete`, `countsReconcile`, `figuresComplete` and `crossLineClaim`. Reconciled counts never license an unprovable structure claim.

### 5. Shared engine and roll-up integration

The input is the typed graph written by the shared post-commit automation spine; the hierarchy side is the one canonical `buildMatrix` / `matrixJointApex` pair; the export runs through the one CSV engine and the new read is a registered `SAFE_READ`. Coupled blocks are rolled into mutually exclusive ownership groups (`joint-apex` / `ambiguous-apex` / `unattributed` / `single-line`) so a block is counted exactly once. **Not shipped:** a dedicated `RULE-*` that opens a governed joint-forum ask on the post-commit spine. The register is the read side; the write side is In Progress and is not implied anywhere on the panel.

### 6. The asset

`app/assets/dependency-cycle-dsm.jpg` is a task-specific conceptual method diagram (sequential blocks → one closed SCC → two reporting lanes → a refused unattributed node), generated with Arena's image-generation tool, inspected at 896×296 and optimized to 27,562 bytes. `scripts/build-standalone.mjs` inlines its exact bytes into the offline build and fails the build if the view stops referencing a diagram; `tests/app/standalone.test.mjs` asserts both diagrams are embedded byte-for-byte and that no relative asset URL survives offline. Provenance is recorded here and in the session log. **Higgsfield's connector is unsupported in this environment; no Higgsfield skill or subscription was verified** — this is reported as a blocker rather than silently substituted.

## Refusals that are the product

| Refusal | What it prevents |
|---|---|
| `unresolved-endpoint` | A dangling edge becoming a phantom node |
| `forbidden-type` / `person-node` / `outside-node-vocabulary` | Confidential records, people and static types entering the dependency matrix as work |
| `unknown-relation` | A relation the typed graph does not declare |
| `untraced-person` / `no-active-line` / `outside-seat` | A guessed line reach, a default owner, or a seat reading outside its population |
| `matrix-defect` | A structural claim over a reporting graph the loader already flagged |
| `limit-exceeded` | A partial graph presented as a complete claim |
| `self-arc` | A record silently declared its own prerequisite |

## Competitive benchmark (Step 3.5)

Specialized tools that do this class of work: **DSM partitioning / tearing suites** (Steward 1981; Eppinger & Browning 2012 — block-triangular partitioning, tearing, sequencing, numerical DSM) [1](https://grokipedia.com/page/Design_structure_matrix) [3](https://www.researchgate.net/publication/259229839_Project_Scheduling_Improvement_Using_Design_Structure_Matrix) [4](https://www.researchgate.net/publication/228360063_An_Introduction_to_Modeling_and_Analyzing_Complex_Product_Development_Processes_Using_the_Design_Structure_Matrix_DSM_Method); **LLM-assisted DSM generation/optimisation** noted as a 2024 development [1](https://grokipedia.com/page/Design_structure_matrix); and modern **SCC-based loop detectors** in static analysis (IAL-Scan, 2026, which retains non-trivial SCCs including self-loop singletons) [2](https://arxiv.org/html/2607.01641v1). Generic LLM assistants can also describe or write SCC code from an exported edge list.

The bar they set: exact SCC partitioning, a condensation order, tearing to break loops, and (for LLM-assisted tools) automatic dependency discovery. LeadOS **clears the partitioning and condensation bar** with a deterministic, brute-force-checked exact algorithm, and goes further on the two things those tools do not do with this data: fail-closed provenance (every excluded edge and every refused line reach counted and printed) and a matrix-DAG ownership read that names ambiguous joint apexes instead of picking one. It does **not** match the full DSM suite on tearing, numerical/weighted matrices, clustering, simulation or automatic dependency discovery; those are explicitly In Progress. No hands-on comparison against a licensed DSM product or an LLM-assisted DSM workflow was run, and the connector for such a tool is not available here. **`[BENCHMARK-UNVERIFIED]`** for parity with those broader capabilities — stated plainly rather than shipping a native version dressed up as the whole market bar.

## Verification (one focused pass)

`tests/app/dependency-cycles.test.mjs` covers the closed vocabulary, the exact partition (including exhaustive brute-force comparison on small graphs), a hand-worked two-line feedback cycle with a unique joint apex, a diamond-tie ambiguous apex, an unattributed node refusing the cross-line claim, a single-chain inert workspace, reconciliation identities (`display == stored` through a real reload), CSV #137 column/count parity and an identity audit, the registered safe read returning the same computed board, the panel JSDOM render with the real diagram, and the standalone build. Full `npm test`, a real-browser assistive-technology walkthrough and external benchmark parity remain **[UNVERIFIED]**.
