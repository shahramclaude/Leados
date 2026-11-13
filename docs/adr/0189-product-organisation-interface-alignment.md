# ADR-0189 — Product–Organisation Interface Alignment Matrix (RULE-OIA-01)

**Status:** Accepted — 2026-11-13 (Session 257)
**Schema:** v149 unchanged — the register stores nothing; it reads the typed-link spine, the reporting lines and the ADR-0162 interface-agreement / cadence-forum acts
**Surface:** `#/matrix?panel=alignment` · CSV #142 `matrix-interface-alignment` · safe read `matrixInterfaceAlignmentReport` · actions `matrixInterfaceAlignmentReport` / `matrixInterfaceAlignmentScan` / `matrixInterfaceAlignmentSetConventions` · rights `declare-matrix-line` (pure read), `govern-interface-alignment` (scan + conventions, director+) · `RULE-OIA-01`
**Altitude / structure:** director × matrix **and** single-chain (two spans of one tree). The reading is inert with a single holder, an empty roster, or no declared precedence / obligation links.

## Context

The org chart answers "who reports to whom". It cannot answer the question Sosa, Eppinger & Rowles posed in 2004: when design work **depends** across two spans, does any coordination channel connect the two holders — and conversely, does every coordination channel that was agreed still have work behind it? Their alignment matrix maps technical dependencies among design elements onto communication dependencies among the organisation units that own them, and names the two canonical misalignments: **technical interfaces left unattended** and **organizational coordination channels left idle**. Galbraith (1974) named the same duality from the design side; Steward's DSM supplies the partitioning discipline the register reuses.

LeadOS already holds all three ingredients — separately. The typed-link spine declares work dependencies (`informs`, `depends-on`, `blocks`, `constrains`, `supersedes`, with per-relation directions). The Matrix engine (`buildMatrix`, `matrixJointApex`) holds reporting spans and joint apices. ADR-0162 holds the coordination channels themselves: append-only bilateral interface agreements with a closed state machine and shared cadence forums. Nothing joins them. The concrete blind spot is in `matrixInterface.js`: its per-pair accumulator iterates **only multi-line allocations**, so a pair of holders whose connection is a *declared dependency with no allocation* — or an *agreement with nobody shared* — never appears at all. The idle case is literally invisible today.

Two failure modes follow:

1. **Unattended technical interface (FM1).** Declared work depends across two spans whose holders hold **no live coordination channel** — no matched agreement, no shared active forum. The dependency exists in the record; the channel never did, or was declared and is now dark (one-sided, contested, lapsed, not yet in force, venue gone). The org chart is silent about both states.
2. **Idle coordination channel (FM2).** An **active** interface agreement sits between two spans that carry **zero live shared people and zero in-window cross-span dependency**. The channel is paying standing costs — standing meetings, assumed obligations — with nothing behind it; or it is standing ready for out-of-window work nobody has recorded. Either way, nobody has been asked which.

## Decision

### 1. One matrix joins the two graphs; the pair universe is exact

A **pair row** exists for exactly the pairs in `cross-holder-dependency ∪ agreement-act ∪ shared-active-forum`. Pairs that share only live contributors (both spans hold the same person) and carry no dependency and no channel are **context only** — counted (`sharedPeopleOnlyPairsN`), never a row. Pairs are keyed `managerA|managerB` sorted; nothing is deduplicated across people by similarity — only the declared graph speaks.

Each declared precedence arc is attributed to a holder set exactly as `dependencyCycle.js` attributes it: the node's people edges (`involves`/`owns`) resolve through `lineReach` to a **single** accountable manager, or the arc is **refused** as `unattributed-endpoint` and printed — never charged to a home line, never imputed to the most likely holder. Same-holder arcs are counted (`sameHolderArcsN`) and never create a pair. Undated links are printed as a refusal and read as out-of-window. Excluded non-precedence relations are counted with their reason.

### 2. Seven pair verdicts, two failure modes, printed in rank order and never collapsed

| rank | verdict | reads |
|---|---|---|
| 0 | `unattended-interface` | dependencies, channel never existed (FM1) |
| 1 | `channel-not-live` | dependencies, channel declared but dark (FM1; the dark state — one-sided / contested / expired / future / forum-unavailable — prints beside) |
| 2 | `idle-channel` | ACTIVE agreement, 0 shared people, 0 in-window dependencies (FM2; out-of-window dependencies print beside, never counted in-window) |
| 3 | `forum-without-interface` | shared forum only, nothing behind it (context) |
| 4 | `channel-without-interface` | dark channel only, nothing behind it (context) |
| 5 | `standing` | live channel + shared contributors, no dependency to ride |
| 6 | `attended` | every declared dependency rides a live channel |

The channel's own state is printed in its own closed vocabulary (8 states: `live-agreement`, `shared-forum`, `contested-terms`, `one-sided`, `expired-agreement`, `forum-unavailable`, `future-agreement`, `none`), derived from the ADR-0162 acts by the register's OWN question ("can this channel carry coordination today?"). ADR-0162's richer state machine stays authoritative there; this register surfaces it (`agreementStateDetail`) and never contradicts it. No manager is scored, no weight is invented, no ML similarity creates an interface.

### 3. Escalation resolves to the `matrixJointApex`, and ambiguity is named

Each pair resolves to the minimal common ancestors of its two holders in the matrix DAG — `matrixJointApex`, the same primitive ADR-0147/ADR-0188 use. Exactly one active roster seat: the finding carries a **governed ask**. Leader-held, off-roster, unattributed or an incomparable minimal-ancestor set (a diamond tie): **one identity-free `matrixMarkers` observation** (`kind: 'interface-alignment'`), and nobody is substituted.

### 4. `RULE-OIA-01` on the shared spine: one dated ask per finding, idempotent, self-closing, pause-governed

For each pair finding with a unique apex the rule keeps at most ONE open dated ask (cap `asksPerCommit: 6` per commit; the remainder is deferred and counted), copy "open or renew a coordination channel … or record why the dependency stands without one" (FM1) or "retire the idle agreement or record what it stands ready for" (FM2). Asks carry typed `issues-obligation` and matrix-DAG `rolls-up-to` provenance (`ensureEntityLink`, automation.js) and are idempotent per deterministic signature (`ifa1:<finding>:<16-hex dual-FNV>`). The ask **closes itself** (`Closed by RULE-OIA-01:`) when the finding clears or its owning seat moves; a human's `done`/`returned` answer is history and is never re-asked. The `interfaceAlignmentAutoPropagate` pause governs **every** path, including explicit scans — a pause is a pause (ADR-0181 discipline).

### 5. Three claims, printed apart; a refused claim prints its reason

`countsReconcile` (the closed-loop tallies add up), `figuresComplete` (every printed figure came from the reader's own tallies — the CSV never counts a truncated print list), and `interfacesClaim` (the arc census is complete) are separate. `interfacesClaim` is **refused** on any unattributed arc, any matrix defect, or any exceeded bound — with the reason printed. The CSV (#142) is aggregate-only: workspace row + one row per pair verdict + one per channel state + one per refusal; no person, manager, pair key, line, record id, title, note or record date.

## Consequences

- The two classic misalignments are visible for the first time in the workspace, in their own words, with the org side (channels) and the technical side (dependencies) both printed beside each other.
- The register stores nothing: Schema v149 unchanged, no migration, no new collections. All state lives in the records it reads.
- `matrixInterface.js`'s allocation-only blind spot is now covered by a register whose pair universe is exact; its own state machine is untouched and stays authoritative for agreement governance.
- The benchmark (Step 3.5): Structure101/Lattix DSM, Cambridge Advanced Modeller, Orgvue and Team Topologies tooling each cover part of the picture (DSM partitioning, org modelling, capacity) but none joins a typed-link precedence graph + reporting lines + recorded channels with refusals-not-imputation and governed idempotent asks. `[BENCHMARK-UNVERIFIED]` against commercial DSM org-design consulting engagements, which do this by hand.
- The method diagram (`app/assets/interface-alignment-matrix.jpg`) is a generated asset (Higgsfield unavailable this session — reported as a blocker; Arena image tool per Session 252 precedent), labelled as a conceptual method diagram, not workspace data.
