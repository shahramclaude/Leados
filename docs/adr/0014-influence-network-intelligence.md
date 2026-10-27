# ADR-0014: Influence Network Intelligence — surveillance-free ONA as a derived lens on the event-driven spine

## Status

Accepted — 2026-10-27 (Session 48). Extends the canonical zero-build app
(ADR-0006), the typed cross-module relationship graph (ADR-0005), and the
generalized post-commit rules hook (ADR-0008). **Additive on Schema v30** — no
new persisted record collection, no migration step.

## Context

LeadOS already owns a typed cross-module relationship graph (`links`) and a
dozen leadership records that name people (cases, DACI decisions, delegations,
goals, changes, negotiations, dependencies, war-room games, 1:1s, feedback,
onboarding, reviews, recognition, growth plans, readiness). But the app never
asked the question a chief people officer asks on day one: **who actually holds
this team together, where are the structural holes, and what happens to the
recorded work graph if one specific person leaves?**

A fresh 2026 competitive hunt (RESEARCH §56) found a genuine product gap:

- ONA products (Windmill, Worklytics, Viva Insights, Humanyze, Polinode) infer
  the network from **email/chat/calendar telemetry** — privacy-invasive,
  unavailable to a first-time manager without HRIS integration, and difficult
  to deploy casually under GDPR / the EU AI Act.
- Enterprise people-analytics / decision-intelligence platforms (SAS
  Intelligent Decisioning, Palantir Foundry+AIP, Visier Vee, Workday
  Illuminate, One Model) sell predictive/prescriptive analytics with
  data-to-decision lineage, but are cloud/warehouse-bound and priced from
  $250K to multi-million per year.
- SAS's 2026 "hybrid deterministic rules + predictive/prescriptive + GenAI in
  one governed flow with versioned audit trails" is the strongest benchmark for
  explainable, auditable decisioning — a posture LeadOS's ADR-0008 spine
  already embodies, but which had never been applied to **graph structure**.

The 2026 State of People Analytics (demand 70%+ / deployment ~20% for
manager-effectiveness analytics) confirms the market wants an integrated
intelligence layer, not isolated AI tasks. No leadership product we found
computes exact, reproducible network centrality from the leader's own records
and fuses it with succession / continuity Bus Factor risk, then propagates
blameless coaching action — locally and for free.

The owner is a non-technical first-time leader with zero HRIS, zero telemetry
access and zero budget. Any solution must be local-first, deterministic,
private by construction, honest about assumptions, and require no backend.

## Decision

Add a **pure, derived** ONA engine `app/core/domain/orgNetwork.js` and a five-tab
terminal `#/network`, wired into the event-driven spine via `networkRule`
(registered in `DEFAULT_POST_COMMIT_RULES` before `decisionTempoRule`). The
network is a **lens over existing collections** — it is never persisted as its
own record type.

1. **Data model — derived, not stored.** `collectAffiliations(state)` builds a
   person↔work-context bipartite graph from typed links and person references
   in existing collections (exact person IDs everywhere; names only under
   participant-ish keys so free-text notes cannot fabricate ties). Confidential
   `conflict` / `pulse` endpoints are excluded. `projectPersonGraph` projects
   co-affiliation to a weighted, undirected person–person graph (edge weight =
   number of distinct shared contexts). No self-edges, no invented nodes.
   Because this is read-side and pure, **no migration is required**: two
   additive settings (`networkTiePct`, `networkAutoPropagate`) are handled by
   `normalizeSettings`; older workspaces simply get the defaults.

2. **Relative strong-tie backbone (explicit modelling choice).** Co-affiliation
   over many contexts approaches a complete graph that hides structure. A tie
   must be at least `networkTiePct`% as strong as the strongest tie (default
   50, range 0–90). This is a leader-configurable visualisation threshold over
   real data, not fabricated data; `0` shows every real tie. Documented as a
   management convention, never a statistical law.

3. **Named, exact graph mathematics** (all implemented, not named in passing):
   Newman (2001) bipartite projection; Freeman (1978/1979) degree and
   betweenness centralization; Brandes (2001) O(V·E) betweenness normalised by
   (n-1)(n-2)/2; Wasserman–Faust normalised closeness for disconnected graphs;
   Page/Brin/Motwani/Winograd (1999) weighted damped PageRank as influence;
   Watts–Strogatz (1998) weighted local clustering; Burt (1992) network
   constraint `c_ij = (p_ij + Σ_q p_iq·p_qj)²` for structural holes; Tarjan
   articulation points & bridges; Latora–Marchiori (2001) global efficiency
   `Σ 1/d` for the **node-removal structural key-person stress test** (a
   deterministic what-if, not a prediction). Deterministic Fruchterman–
   Reingold-style SVG layout (no `Math.random`).

4. **Fusion with continuity (extends ADR-0012).** `stewardshipFusion` reads the
   Session 45 dependency stewards; a structural key-person is a load-bearing
   broker who is ALSO a primary steward of dependencies lacking a verified
   backup. Network science and the resilience Bus Factor become one finding.

5. **Atomic cross-module propagation.** `RULE-ORG-01..05` run inside the store
   transaction on an explicit network scan or any event declaring
   `rules:['network']`. One analysis fans out into: typed person↔person
   collaboration links (01); a blameless cross-training delegation + 1:1 prompt
   for a structural key-person (02); a DACI org-design decision for a
   fragmented team (03 — an ordinary decision record the decisions/Decision
   Tempo modules consume on their own triggers); blameless 1:1 check-ins for
   isolates (04) and over-loaded brokers (05). All artifacts use idempotent
   markers; stale 1:1 prompts self-clean while employee-authored topics
   survive. Read-side `ORG-01..05` signals feed `buildInsights`, the Today
   triage card and the nav badge continuously (the always-on sensing layer).

6. **Trigger discipline (anti-regression).** The rule fires ONLY on `network.*`
   events, `networkScan` events, or events declaring `rules:['network']` —
   narrow, mirroring `powerRule`. Unrelated case/decision/person writes never
   re-add talking points (the Session 46 alert-fatigue regression). The
   `networkAutoPropagate` setting gates automatic/declared triggers; an
   explicit human scan always runs. Any future module can chain in by declaring
   `rules:['network']`.

7. **Privacy & data minimisation.** CSV scope #31 exports only dimensionless
   scores and integer counts keyed by an opaque sequential `node_index` — no
   names, titles or free text. Below `ORG_MIN_TEAM = 2` active people the
   network is reported as **unmeasurable**, counts-only, never a fabricated
   zero. Findings are blameless: a structural position is a fact about the
   recorded work graph, never a rating of a person.

## Consequences

- **Positive.** A first-time leader gets Bloomberg-terminal-grade structural
  insight with zero data integration, zero surveillance and zero cost; the
  ADR-0008 spine gains a genuinely new *class* of trigger (graph structure);
  the continuity model gains a network-science dimension; a data-minimised
  export satisfies contextual-integrity expectations.
- **Costs / risks.** The engine runs `O(n²(n+e))` node-removal analysis per
  report; it is capped at `ORG_MAX_TEAM = 60` active people so it cannot block
  the main thread (measured ~1.7 ms on the 5-person demo). Co-affiliation is a
  **proxy** for collaboration, not observed communication; name-matching under
  participant keys is a heuristic, so exact person IDs are always preferred.
  Centralities describe recorded structure, not behaviour or performance.
- **Neutral.** No `SCHEMA_VERSION` bump: this session is deliberately additive.
  A future longitudinal "network drift" feature (versioned snapshots) would be
  the natural reason for the next migration.

## Alternatives considered

- **New `networkScans` collection + Schema v31 migration.** Rejected: the
  network is fully derivable from existing records; persisting snapshots would
  duplicate state and add a migration with no same-session user value. Deferred
  to the "network drift" backlog item.
- **Communications-telemetry ONA.** Rejected: violates the local-first privacy
  premise and is impossible without integrations the owner does not have.
- **Weighted/disparity-filter backbone (Serrano et al. 2009).** Considered;
  on small dense graphs the disparity filter removes even the strongest ties.
  The relative tie-strength floor is simpler, tunable and behaves honestly on
  both uniform and hierarchical weight distributions.
- **Predictive attrition / manager-effectiveness scoring.** Rejected: no
  validated labels, no probability model, and unsafe scope for a blameless
  leadership tool (see RESEARCH §56).

## Verification

`tests/app/org-network.test.mjs` (25 tests): exact centralities on
textbook graphs, purity, projection/backbone honesty, report determinism,
signals, board brief, idempotent atomic fan-out, pause semantics, self-cleaning
prompts, settings/normalization parity, CSV data-minimisation, and JSDOM+axe
across all five tabs + empty state. Full gate: 698/698 tests, 0 lint errors,
0 boundary leaks, docs links, standalone rebuilt. Graphical rendering beyond
JSDOM/axe, Firefox/Safari and screen-reader speech remain [UNVERIFIED].
