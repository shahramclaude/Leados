# ADR-0109 — The Jurisdiction Compiler

**Status:** Accepted · Session 149 · Schema v111 (additive `110 → 111`)
**Route:** `#/jurisdiction` · **Rules:** `RULE-JUR-01..04` · **CSV scope:** #103
**Altitudes:** frontline, manager, director, executive, chief (all five)

## Context

LeadOS could already route a case to an owning span (`altitudeRouter.js`), roll
counts up the reporting tree (`chain.js`, `seat.js`) and price the *authority*
of a single decision (`decisionFit.js`). It could not answer the structural
question: when two or more branches work the same objective, **who can actually
resolve it, and what does each governance choice cost?** Enterprise suites
(Glean/Workday briefs, Visier/Workday people analytics, Viva Insights, Power BI
Copilot) report cross-silo symptoms or let a human chat with aggregated data;
none was verified to compute a hierarchy-native governance allocation on the
same event spine. [UNVERIFIED] category-first claim.

## Decision

Harvest OPEN work records that already name an objective (`JUR_SOURCES`: cases
via `linkedGoalId(s)`, decisions, funded portfolio via `sourceId` +
`sourceType: 'goal'`). Resolve each to a responsible span with the existing
`recordPeople` → `responsibleNodeId` → reporting-tree primitives. Group by the
objective pointer. A cluster with spans in more than one branch of its lowest
common ancestor is a **jurisdiction gap**.

Price exactly three routes in **declared coordination units**:

| Route | Framework | Cost |
|---|---|---|
| Minimal covering coalition | Riker (1962) size principle; Coase (1937) | `jurHandoffUnitsPerPair × k(k−1)/2` handoff pairs |
| Escalate to LCA | Ashby (1956) requisite variety; Jaques (1956) horizons | `jurEscalationUnitsPerRung × Σ (lcaRank − branchRank)` rungs lifted |
| Boundary redraw | Williamson (1975) structural governance cost | `jurRedrawUnits` (one-off) |

Confidence is the Wilson (1927) lower bound on attribution completeness — never
a rating of a person. Route probability is a Luce (1959) softmax over −cost at
the declared mean-cost temperature. A route is recommended only if it beats the
runner-up by `jurMaterialityPct`; a tie prints as a tie. Grades are once-only
Brier (1950) skill against a strictly-prior 0.5 base.

All conventions are declared, clamped and printed on the Method panel; none is
fitted from the workspace's own outcomes. Eight named refusals are printed
verbatim: thin cluster, thin attribution, single span, no LCA, no decisive
route, ungraded, postdated, suppressed.

## The engine: one spine, one transaction

`RULE-JUR-01..04` are registered in `DEFAULT_POST_COMMIT_RULES` (89 rules / 89
`PROPAGATION_CONTRACTS`) and are **root-event gated** (`ctx.derived !== true`).

- **JUR-01 DETECT** freezes exactly one finding per `(objectiveKey, ISO week)`,
  id hashed from that pair (rescan converges). It writes ONE `spans-work` edge
  to EVERY member record (cross-module typed provenance) and ONE `rolls-up-to`
  edge per distinct leadership ancestor of every span (cross-altitude roll-up).
- **JUR-02 GOVERN** opens exactly one governed decision per priced finding per
  week, at the LCA rung, carrying all three priced routes as options. It NEVER
  moves a reporting line, reassigns a case or accepts itself. Silence is never
  consent. Marker-idempotent via `jurMarkers`.
- **JUR-03 GRADE** is derived state: cheap, once-only, no governed work. A
  missing choice, missing date or postdated review becomes a STORED REFUSAL
  (`status: 'ungradable'`, Brier/counts `null`), never a zero.
- **JUR-04 ROLLUP** freezes one identity-free `jurReadings` row per
  `(span, ISO week)` with counts only, small-cell suppression below
  `jurCellFloor`, one `reads-span-mandate` edge and one `rolls-up-to` edge per
  ancestor. Above rank 2 no objective key, member id, person, span label, title
  or note is stored.

Engine-authored governed decisions are excluded from the harvest by a
**state-only structural regex** on `[RULE-XXXX-NN]` / `[JUR-OPTION:...]`, never
by importing another rule module (which would create a silent cycle). This
defeats the Session-143 second-order-decision regression. The rule emits **no**
`automation.propagated` event: the returned result rows and typed edges are the
receipt, and the shared 64-event budget must not be re-entered by an extra
derived event.

`jurisdictionActions.js` exposes exactly TWO writes (`jurScan`,
`jurSetConventions`) and seven scoped reads. `jurisdictionRead` applies the
declared detail ceiling; `jurCsvRows` is aggregate-only; `jurBrief` is an
auto-generated identity-free board paragraph.

## Corrections discovered while implementing

1. `chain.js`'s `lowestCommonAncestor` returns on the first resolvable pair.
   With ≥3 spans whose first two share a branch, it reports that branch rather
   than the ancestor covering all spans — understating the coalition.
   `jurisdiction.js::commonAncestorOfAll` intersects every span's full ancestor
   chain and returns the deepest common node. The shared helper is left
   untouched so its ~80 two-id callers keep exact behaviour; auditing those for
   ≥3 ids is a roadmap item. [UNVERIFIED] impact elsewhere.
2. `lcaRank − maxSpanRank` prints a flattering zero whenever the ancestor is
   itself one of the spans (the normal case), making escalation free. Escalation
   now sums the rungs lifted from every non-ancestor branch.
3. Each priced route now carries its own Luce probability, not only the winner.
4. Non-array declarations and dropped markers now push counted warnings.

## Consequences

- **Storage:** v111 additive `110 → 111`; `jurFindings`, `jurReadings`,
  `jurMarkers` declarations-only; fail-closed normalizers; no back-fill.
- **Graph:** `jurfinding` / `jurreading` entity types; `spans-work`,
  `governs-mandate`, `reads-span-mandate` relations (plus reused `rolls-up-to`).
- **Permissions:** `record-jurisdiction` rank 1–5; `govern-jurisdiction` rank
  4–5 + full-access seat; API_RIGHTS + SAFE_READS + RECORD_POLICIES updated.
- **Disclosure:** adapter-scoped `jurisdiction` manifest, unit class, detail
  ceiling 2, aggregate-only note; CSV scope #103.
- **UI:** four panels (`map`, `options`, `grades`, `method`) with five distinct
  altitude questions; keyboard-usable tabs; semantic tables with captions.
- **Tests:** `tests/app/jurisdiction.test.mjs`, 10 tests, all pass, including a
  real store/API scan, a root `case.created` write, idempotence, grade refusals,
  export-leak oracle and axe on all four panels.

## Honest limits

A local seat is an auditable workflow declaration, not authentication.
Small-cell suppression is a printed refusal, not differential privacy.
Coordination units are declared conventions, not measured money. Clusters join
on a shared objective pointer, not inferred semantic similarity. A grade is an
association between one predicted route and one dated human choice, not a causal
forecast or a person rating. A boundary redraw is priced but never executed.
Full `npm test` green, vendor parity and a category-first claim are
[UNVERIFIED]; two pre-existing (A/B-confirmed) failures caused by the shared
64-event cap are recorded in `ROADMAP.md` as the P0 next target.
