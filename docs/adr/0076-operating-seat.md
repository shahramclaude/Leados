# ADR-0076: The Operating Seat — one enforced boundary, one vertical roll-up

**Date:** 2026-11-02 · **Status:** implemented · **Schema:** v82 (unchanged — see §2.5) · **Surface:** `#/seat` (the Altitude Lens) · **Session:** 116 · **ADRs built on:** [0075](./0075-command-chain.md), [0008](./0008-post-commit-rules-hook.md) / [0026](./0026-propagation-ledger.md) (the shared post-commit spine), [0006](./0006-canonical-zero-build-app.md) / [0007](./0007-legacy-next-tree-disposition.md) (canonical boundary)

---

## 1. Context — what the audit actually found

A heads-up for this session said: *"IF the codebase has zero concept of users/roles/org structure, treat building the org-hierarchy/role data model as the single highest-priority item, since everything in Section 0.3 depends on it."* The condition is explicit, so it was verified before being acted on. **It is false.**

ADR-0075 (Session 115, Schema v82) shipped the org structure: `person.managerId` → `buildChain` → a reporting tree with `parentId`, `childIds`, `subtreeIds`, `span`, `altitude`, `reachable` and `depth`; six roster levels mapped to five Jaques altitudes; Tarjan-offline-LCA ownership of cross-unit work; exact-sum and pooled-vs-mean roll-ups; `RULE-CHN-01..05` on the shared spine; `chainReadings` / `chainMarkers`. §0.3's "connected hierarchy" and "vertical roll-up of insights" are, in their *computational* sense, already present.

What is **genuinely absent** is what the heads-up actually names: *real role-based permissions*. ADR-0075 §5 says so plainly: this is a single-browser, single-local-store application with **no authentication**, and its disclosure ladder is a **rendering contract** — `discloseItems` changes display strings, not readable state. Canonical `app/**` contains no `RBAC`, `canView`, `currentUser`, `impersonate`, `authoriz*` or access-control layer. The `clearance` token in this codebase is an Earned-Schedule clean-closure percentage, not a security clearance; `role` is DACI/job-role free text. A grep found 191 `=== 82` / `'81 → 82'` assertions across 78 test files.

So the correct leap is **not** an org-hierarchy rebuild (which would discard a working, tested model and is explicitly forbidden by §1 "evolve, don't discard"). It is the missing half of §0.3: turn the hierarchy into an **enforced acting position**, and make altitude a first-class dimension of the **same** event-driven propagation engine rather than a second system.

### The competitive picture (snippet-level, fetched 2026-11-02; see RESEARCH §99)

- Betterworks / Lattice / Workday: cascading OKRs, "full hierarchy view for senior leaders", granular permissions, org hierarchy synced from Workday daily; enterprise RBAC + audit logging is a stated buying criterion for organisations above ~2,000 people. Reported weak spot: goal cascading across **multiple** org levels and custom analytics.
- Visier Vee answers only from *permitted* data; ChartHop's live org model/scenario planning respects RBAC; Windmill's ONA, Gloat/Eightfold/Beamery, One Model, Culture Amp, Qualtrics, Oracle HCM cover people analytics and talent intelligence.
- ABAC/RLS literature (Netwrix, TechPrescient, Snowflake, DataSurge, Avigilon, 2025–2026): PDP/PEP separation, **deny-by-default on attribute-lookup failure**, need-to-know, row filters and column masking, governed tags, hierarchical inheritance for GDPR/HIPAA/FERPA-grade boundaries.
- Simpson's-paradox commentary (2026): aggregate dashboards should permanently show subgroup breakdowns, pooled/standardised rates beside naive means, and stratified analysis — validating ADR-0075's choice and constraining any new roll-up.

**The gap none of them close:** no platform in this category tells the person being denied a record **why** it was withheld, and none derives the roll-up live from the same dated records so that the number the top sees cannot drift from the record it reports. Both are shipped here.

---

## 2. Decision

### 2.1 The primitive: the SEAT, not a user

One browser, one local store, no server. There is no identity to authenticate, and pretending otherwise would be a silent failure. So the new primitive is an **explicit, append-only declaration of the position from which the workspace is being operated** — `settings.activeSeatId`, pointing at a leadership node in the reporting tree. Declaration is an event (`seat.switched`); validation refuses any id that is not a real leadership seat; `null` is the **undeclared operator view**, the exact pre-0076 behaviour.

A seat is `{ id, name, label, rank, altitudeKey, horizonDays, parentId, childIds, scope, scopeN, spanN, fullAccess }`. `scope` is `buildChain`'s `subtreeIds` minus the synthetic `leader` node — **the hierarchy is the scope, not a `WHERE manager_id = me` filter**. A seat at the root is a *chief* seat **with** enforcement; an undeclared seat is the operator view **without** it. They are deliberately different, so the no-regression default cannot be confused with a permission state.

### 2.2 Enforced ABAC/RLS, deny-by-default

`canSee(record, collection, seat, built)` is a pure PEP returning `{ allow: 'full' | 'aggregate' | 'denied', reason, classKey, policyLabel }`:

| Class | Rank window (full read) | Detail ceiling | Examples |
| --- | --- | --- | --- |
| `individual` | 1–2 | 2 | `oneOnOnes`, `feedback360`, `conflicts`, `perfconcerns`, `coachingScripts` |
| `unit` | 1–5 | 3 | `cases`, `delegations`, `goals`, `decisions`, `hiring`, `oneonone`-derived cadence |
| `portfolio` | 3–5 | 4 | `budgets`, `capital`, `orgDesigns`, `scenarios`, `workforcePlans` |
| `enterprise` | 4–5 | 5 | `meritCycles`, `compBands`, `transitionPrograms`, `parityAudits`, `board` readings |

Four gates, in order, each printing its reason:

1. **Undeclared action / unlisted collection → fail closed.** `ACTION_RIGHTS` has no entry ⇒ refused. An unlisted collection is treated as `unit` work with detail withheld above rank 3, not as readable.
2. **Scope (sideways).** A record about people outside the seat's subtree is **denied**, even when its class would be permitted. `recordPeople` reads the same person-id paths ADR-0075's `SIGNAL_SOURCES` uses (`ownerId` + `involvedPersonIds`, plus `personIds`/`partyIds`/`participants`), so a new module gets one row in `RECORD_POLICIES`, not a bespoke resolver.
3. **Rank window (downward).** Portfolio below rank 3 and enterprise below rank 4 are denied — a frontline lead is not buried in CEO analytics.
4. **Detail ceiling (upward).** Above a class's ceiling a record is **aggregate**: the *count* survives so the level above can see that work exists, but the record body, names and titles do not. A director is not handed a private 1:1 coaching note; a CEO is not handed shift notes. This is column masking applied to a local object graph.

`canAct(action, seat, { record, collection, built })` applies the same rank window to ~20 declared rights and refuses to act on an out-of-scope record even when the action itself is allowed. `routeVerdict(route, seat)` gates nav **and** direct hash navigation; `render()` refuses a forbidden route with the verdict's reason printed and three non-dead-end exits.

`projectForSeat(state, seat, built)` returns `{ visible, ledger, counts, enforced }` — the entire decision surface for one seat. **Every non-full outcome is a ledger row with its reason**, capped and counted as truncated rather than silently dropped. This transparency is the deliberate departure from the category: an access control that cannot explain its own refusal is a broken access control.

### 2.3 Vertical roll-up on the SAME spine

`seatRule` is registered **last** in `DEFAULT_POST_COMMIT_RULES` (55 rules), so it reads the finished workspace after every module has propagated. It is not per-module glue:

- **RULE-SEAT-01** iterates `harvestWork`'s items — the *declarative* `SIGNAL_SOURCES` registry that already covers cases, decisions, delegations, goals, 1:1 cadence, feedback, performance concerns, premises and hiring — and for each item walks `nearestLeadershipAncestor` up the reporting tree, writing one typed `rolls-up-to` edge per leadership span via the existing `ensureEntityLink`. Adding a module is one `SIGNAL_SOURCES` row; adding a level is a `person.managerId` change. Idempotency is the graph's exact-edge uniqueness — no marker collection.
- **RULE-SEAT-02** on a handover opens exactly one governed delegation per seat per ISO week, carrying the altitude's `handUp` obligations and its `forbidden` detail, so the level above receives the brief rather than the notes.
- **RULE-SEAT-03** on an explicit scan audits the boundary and logs `seat.access_denied` events with the withheld count and the grouped reasons — the enforcement ledger becomes append-only history.

One committed frontline case therefore reaches the manager, director, VP and chief spans **in the same atomic transaction as every other module's propagation**, with zero re-entry. This is the §3 requirement: cross-module × cross-altitude in one write.

### 2.4 The digests are derived, never stored

`seatDigest(state, seat, built, { now, settings })` reads the same dated records through the seat's scope:

- **Exact counts** (open, overdue, past-horizon, severity load, oldest) — each item owns exactly one node, so an ancestor's count is the sum of its spans, never a re-typed status update.
- **Composition-safe horizon-debt rate**: pooled `Σnum / Σden` printed beside the **mean of unit rates**, the spread in pp, a materiality bar from settings, a **directly standardised** rate against the parent's type mix when the two disagree, and a refusal below the declared evidence floor (a rate of one identifies a person).
- **Severity × age risk heatmap** over child spans for drill-down — exposure is work, never a person score.
- **Arrival trend** over ISO weeks with a four-week minimum and an explicit `unmeasured` verdict below it.
- **Altitude duties** filtered by `routeVerdict` so every duty shows the one-click routes this seat may actually open, and a **generated board-ready line** that marks unverified figures and names nobody.
- **Disclosure ladder** reused from ADR-0075 (`discloseItems`), now binding on the readable state rather than only on strings.

`rollUpPath` drills up through all five altitudes; `drillDown` drills down into child spans. `seatReport` assembles the whole read model. Nothing is frozen, cached or copied: **old data cannot produce a stale executive number**.

### 2.5 Zero migration — an explicit architecture decision

`SCHEMA_VERSION` **stays 82**. No `MIGRATIONS[82]`, no new `COLLECTIONS` entry, no new stored entity.

- The seat declaration is a **setting** (whitelist-normalised by `normalizeSeatSettings`, fail-closed on malformed ids).
- Handovers, scans, propagation and every refusal are **events in the existing append-only log**.
- Provenance reuses the existing `rolls-up-to` relation and existing graph entity types (`person`, `case`, …); synthetic `cadence-*` ids are skipped; `conflicts`/`pulses`/`events`/`propagationLineage`/`propagationReceipts` stay excluded from lineage.
- Digests are derived live from `buildChain` + `harvestWork` + existing dated records.

An older blob simply opens on the undeclared operator view — graceful by construction, not by a repair pass. A version bump would have forced a fragile rewrite of **191 assertions across 78 test files** for zero user benefit, and would have converted a derived reading into a second stored copy that could drift. That is the explicit justification §5 requires for touching schema.

### 2.6 Inertness is a no-regression contract

31 `tests/app/*.mjs` files assert exact `events.length` / `links.length` / `propagations.length`. An always-on post-commit rule would break them. `seatRule` therefore gates its **automatic** pass on `seatAutoPropagate && activeSeatId && isOperationalCommit(event)`, and excludes derived/internal event prefixes. No existing fixture sets `activeSeatId`, so **every undeclared workspace's transaction is unchanged**. Explicit `seat.scan`, `seat.switched` and `seat.propagate` always run, so pausing automation never disables a deliberate scan.

---

## 3. Frameworks named (§0.2)

| Discipline | Named method used |
| --- | --- |
| Organisational theory | **Jaques (1956) Stratified Systems Theory / time span of discretion** — 7/30/90/180/365-day altitudes, reused from ADR-0075 |
| Computer security | **ABAC** (XACML-style subject/resource/action/environment PDP-PEP), **row-level security**, **deny-by-default on attribute-lookup failure**, **need-to-know**, **column masking**, hierarchical inheritance |
| Graph algorithms | **Tarjan offline LCA** for cross-unit ownership; subtree scoping; nearest-leadership-ancestor walk |
| Statistics | **Simpson's paradox**, **direct standardisation**, evidence floor / k-anonymity convention, pooled vs mean-of-rates, Jeffreys-style refusal below floor |
| Operations research / lean | **Little's Law** lineage; **Theory of Constraints** risk heat = severity load × age; WIP-age trend anomaly |
| MBA / strategy | Five-altitude duties, hand-up obligations, generated board-ready line with unverified figures marked |
| Finance / governance | Rank-floored access to capital allocation, merit/pay bands, parity audits; append-only handover as an audit control |
| Political science | Separation of the declaring authority (settings) from the enforcing authority (`canSee`/`canAct`), with an auditable refusal ledger |
| Software engineering | Declarative registries (`SEAT_*`, `RECORD_POLICIES`, `SIGNAL_SOURCES`), pure functions, single shared post-commit spine, marker-free idempotency |

---

## 4. Alternatives rejected (with one-line reasons)

- **Build an org-hierarchy/user/role data model first.** Rejected: the condition in the heads-up is false — ADR-0075's `person.managerId` tree is present and tested; rebuilding it would discard working code and violate §1.
- **Schema v83 with `seats`, `seatMarkers`, `seatReadings` collections.** Rejected: 191 hardcoded v82 assertions / 78 files, and a stored digest creates a second copy that can drift from the record.
- **Five per-altitude dashboards.** Rejected in ADR-0075 and again here: it makes hierarchy a theme. One surface, altitude as a parameter; the *content*, permissions, duties and routes differ genuinely by rank.
- **A static `role` flag on each person.** Rejected: role is not the same as acting position, a static flag cannot express subtree scope, and it cannot explain a refusal.
- **Authentication / login.** Rejected: there is no server; claiming identity enforcement would be a silent failure. Stated in the UI and here instead.
- **Always-on automatic propagation.** Rejected: 31 exact-count test files; inertness gate preserves them without weakening the rule.
- **Per-module roll-up glue.** Rejected: §3 requires a generalized spine; `SIGNAL_SOURCES` + `RECORD_POLICIES` are declarative rows.
- **Averaging unit rates / hiding subgroup breakdowns.** Rejected: Simpson's paradox; pooled, mean-of-unit and standardised rates are all printed.
- **Rating, ranking or naming persons as subjects of judgement.** Rejected: above the detail ceiling, individuals are counts.
- **Silent denials.** Rejected: no platform in the category explains a withheld record; every refusal here prints its reason and is auditable.

---

## 5. Consequences

**Positive.** §0.3's missing half is real and enforced: a declared frontline lead cannot read enterprise pay material, a director cannot read private 1:1 notes, a peer span's case is denied sideways, and a forged URL to a forbidden route is refused at render time with the reason. One frontline case rolls up through five altitudes in one transaction with zero re-entry. The five operating pictures are genuinely different (duties, routes, disclosure, board line) without duplicating a single screen. A 13-test suite proves boundaries, roll-up, idempotence, pausability, actions and all five panels; the full canonical suite is run before merge.

**Limitations, stated plainly.**
- This is **not authentication**. A knowledgeable local user can edit `localStorage`; a seat is an auditable *declaration*, not an identity proof. Server-backed SSO, cryptographic seat tokens and tamper-evident sealing are the honest next step if the product is ever deployed multi-user — see ROADMAP.
- The seat is enforced in the **canonical app's render/action layer**. Data already present in an exported JSON backup is not encrypted per seat; export/import remain whole-workspace operations.
- `conflicts` carry participant *names* rather than person ids in the normalised schema, so their scope is governed by class window rather than subtree. They are also forbidden link endpoints and stay out of lineage.
- Real-browser walkthrough with assistive technology: **[UNVERIFIED]** — covered here by JSDOM + the axe suite, not by a human on a screen reader.

---

## 6. Carried forward

1. **Succession as a measured quantity** (from RESEARCH §98): with `subtreeIds` and item ages, compute whether a span's loss leaves work with no altitude to hold it — a *bench* figure from the tree rather than self-assessed readiness ratings.
2. **Cryptographic seat attestation**: sign a handover with a Web Crypto key held by the departing operator so the append-only log becomes tamper-evident; prerequisite for any multi-user deployment.
3. **Per-seat export redaction**: apply `projectForSeat` to `exportRedactedJSON` so a board pack exported from a chief seat carries counts only.
4. **Detector-level error rates**, cross-terminal consistency checks, the Node 20 CI diagnosis, and the standalone artefact's embedded source hash remain from earlier sessions.
