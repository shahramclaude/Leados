# AI Session Log — LeadOS pt-Q (this delivery)

This log records what was actually checked against `github.com/wbweve/Leados`
in this session, via which calls, what was found, and what in this delivery
is spec-faithful (to the pasted pt-Q brief), original, or a disclosed gap.
Nothing below is a commit to, or continuation of, the real repo's git history
— this sandbox began from the default Vite scaffold with no prior state.

## 1. What was fetched, and how (this session)

| # | Call | Purpose / result |
|---|------|-------------------|
| 1 | `web_fetch https://github.com/wbweve/Leados` (rendered README) | Initial orientation. Describes a "LEADOS Sandbox — Thermodynamics, CAS Engine, Risk Intelligence" delivery, with its own provenance ledger claiming to have inspected the repo and found a live `src/` app plus orphaned root-level files. Treated as a claim to verify, not fact. |
| 2 | `GET /repos/wbweve/Leados/git/trees/main?recursive=1` (GitHub REST API) | Full recursive tree. Confirmed: ~60 loose root-level `.tsx`/`.md` files (e.g. `App.tsx`, `AboutView.tsx`, `BulletGraph.tsx`, `RosterView.tsx`, `FinanceDashboard.tsx`, `README.md`, `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`) **alongside** a separate `src/` tree. |
| 3 | `GET /repos/wbweve/Leados/contents/` and `.../contents/src` | Confirmed two distinct, structurally different deliveries coexist: root-level flat files, and a nested `src/App.tsx` + `src/components/` + `src/lib/` + `src/utils/` Vite/React/TS app, with **different file contents/SHAs** than the root-level `App.tsx`. |
| 4 | `web_fetch` raw `src/App.tsx` | **Verified directly:** imports `Shell`, `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`, `RiskView`, `AboutView` from `./components`, and `useHashRoute`, `loadState` from `./lib`. This matches the route table in the repo's current README (`#/today`, `#/signals`, `#/thermodynamics`, `#/cas`, `#/risk`, `#/about`). |
| 5 | `web_fetch` raw root `index.html` | **Verified directly:** title is `LEADOS Sandbox — CAS Engine, Risk Intelligence & Thermodynamics` — a single-file demo, separate artifact from the `src/` app. |
| 6 | `GET /repos/wbweve/Leados/contents/src/lib` and the full tree node for it | **Verified directly:** 28 files, including `a11y.ts`, `aesthetics.ts`, `casEngine.ts`, `circadian.ts`, `core.ts`, `cssolver.ts`, `engine.ts`, `familiarity.ts`, `fatigue.ts`, `genome.ts`, `health.ts`, `infoTheory.ts`, `intelligence.ts`, `memory.ts`, `monteCarlo.ts`, `physics.ts`, `prng.ts`, `riskIntelligence.ts`, `rules.ts`, `seed.ts`, `selfTest.ts`, `sensory.ts`, `storage.ts`, `store.ts`, `synthesis.ts`, `types.ts`, `useHashRoute.ts`, `workers.ts`. |
| 7 | `web_fetch` raw `AI-SESSION-LOG.md` (repo root) | **Verified directly:** this is the real repo's own prior session log. It documents an *earlier* session that read `src/lib` and found only **24** files — explicitly stating **no** file named `cas.ts`, `risk.ts`, or equivalent existed, and that `casEngine.ts`/`riskIntelligence.ts`/`rules.ts`/`selfTest.ts` were **absent**. |
| 8 | `GET /repos/wbweve/Leados/contents/src/components` | **Verified directly:** current component list includes `AboutView.tsx`, `AccessibilityView.tsx`, `AestheticsView.tsx`, `CasView.tsx`, `CommandPalette.tsx`, `DecisionsView.tsx`, `DomainsView.tsx`, `EnergyView.tsx`, `EventLogView.tsx`, and more — a different set than the import list documented in the repo's own prior session log (call #7), which named `IntelligenceView`, `PeopleView`, `EventLogView`, `Thermodynamics.tsx` as the live render path at that earlier time. |
| 9 | `web_fetch` raw `AI-SESSION-LOG.append.md` (repo root) | **Verified directly:** a *third*, separate narrative ("Session 6 — mf-2") describing a vanilla-JS, non-Vite, 12-root-file lineage (`index.html`, `store.js`, `events.js`, `engine.js`, `ui.js`, plus a stray `package.json`/Vite/React scaffold it recommends **deleting**). This is inconsistent with both the loose root `.tsx` lineage (call #2) and the live `src/` Vite+TS lineage (call #4) — it appears to describe a different point in the repo's history, or a different branch/export, not reconcilable with the other two from the files read this session. |

No commit history, pull requests, issues, or GitHub code search were used.
No code from the real repo was executed. This was a read-only, API/raw-file
inspection, scoped to the calls above.

## 2. Verified facts (first-hand, this session)

- **V1.** The repo currently contains at least **three mutually inconsistent
  lineages**: (a) ~60 loose root-level files described by the current root
  README as a single-file "LEADOS Sandbox" demo; (b) a live `src/`
  Vite+React+TypeScript app with 28 files under `src/lib/`; (c) a described
  but not fully reconciled vanilla-JS "mf-1/mf-2" lineage documented only in
  `AI-SESSION-LOG.append.md`. (Calls #2, #3, #5, #9)
- **V2.** The repo's *own* `AI-SESSION-LOG.md` is **stale relative to its own
  current tree**: it asserts `casEngine.ts`, `riskIntelligence.ts`, `rules.ts`,
  and `selfTest.ts` do not exist in `src/lib`, while a direct listing this
  session shows they currently do. This means a later session added them
  after that log entry was written, without a corresponding update to that
  log file being reflected in the copy fetched this session. (Calls #6, #7)
- **V3.** The live `src/App.tsx`'s import list (`SignalBoardView`,
  `ThermodynamicsView`, `CasView`, `RiskView`) does not match the import list
  the repo's own prior session log recorded for "the live app" at an earlier
  point (`IntelligenceView`, `PeopleView`, `EventLogView`) — confirming the
  component tree was substantially replaced at least once. (Calls #4, #7)
- **V4 (scope limit, disclosed).** This session did not fetch the byte
  contents of most individual `src/lib/*.ts` or `src/components/*.tsx` files
  (e.g. `casEngine.ts`, `riskIntelligence.ts`, `infoTheory.ts` were not
  re-read in full this session) — their existence is confirmed by filename
  listing only, not by reading their logic. Flagged as a gap, not glossed
  over.
- **V5 (unverified).** The label "pt-P" does not appear in any file fetched
  this session. The task prompt's framing of a "pt-P" predecessor is treated
  as an unverified claim about this task's own input lineage, not a
  repo-verified fact.

## 3. Conclusion drawn from the above

`github.com/wbweve/Leados` is not a single coherent codebase with one
continuation point — it is an accumulation of several independent sessions'
deliveries, several of which explicitly flag each other's claims as stale or
unverifiable. Given that, this delivery does not attempt to "continue" any
one of those lineages (doing so would arbitrarily privilege one fragment of a
self-contradictory history). Instead, this delivery is an **original build**,
in this task's own tool environment, implementing the *functional ideas* in
the pasted pt-Q brief (the two fully-specified engines — Structural Causal
Model, Individual Flight Risk — plus a few smaller, clearly original
additions). No file here is claimed to be a port of any verified repo file.

## 4. What this delivery built, and how it relates to the pasted pt-Q brief

| Module | Status | Note |
|---|---|---|
| `src/lib/causal.ts` | **Spec-faithful port** | Structure, variable set, ASSUMED edge list + citations, EVIDENCED Pearson-correlation logic, CONFIRMED annotation mechanism, do-calculus backdoor-adjustment estimator, and Lewis-style counterfactual replay all follow the pasted pt-Q **Part 1** code, translated into TypeScript module form (no global `LEADOS` namespace; the given `.measure`/edge objects became typed functions). |
| `src/lib/flightRisk.ts` | **Spec-faithful port** | Departure-signature construction, weighted similarity scoring, heuristic fallback, and the "never used for any employment decision" label follow the pasted pt-Q **Part 2** code directly. |
| `src/lib/extras.ts` (High-Potential ID, Power Network / "dark matter", Meeting Intelligence) | **Original** | The pasted brief only *names* these capabilities in its introduction; no algorithm was given. Everything here is invented for this build and explicitly labeled in-UI as a simplified heuristic, not a validated method. |
| Information cascade prediction, OKR causal chains, org learning velocity, compensation equity analytics, promotion bias detection | **Disclosed gap — not built** | Named in the brief's intro with no algorithm, and/or require data fields (compensation, OKRs, promotion history) this build deliberately does not fabricate. See in-app About page and README for the itemized list and reasoning. |
| `src/lib/engine.ts` | **Original, disclosed-fabricated** | A minimal 2-rule findings engine, needed only so `counterfactual()` has something concrete to count as "active findings" when replaying historical state. Not a port of anything found in the real repo (no equivalent rule engine's logic was read this session — see §2 scope limit). |
| `src/lib/seed.ts` | **Original** | Deterministic (seeded PRNG) synthetic roster (10 active + 4 departed people) and event log, constructed so the flight-risk and causal-graph demos have something to show (a couple of people are deliberately seeded "at risk"; one non-manager is seeded as a high-centrality hub for the power-network demo). All fabricated, clearly labeled as synthetic throughout the UI. |
| Storage key `leados-ptq:v1` | **New** | This workspace had no prior state beyond the default scaffold; a new key avoids falsely implying continuity with any other session's data. |

## 5. Self-review notes

- The pasted pt-Q spec's own causal-graph code measures `flightRisk` only
  across *currently active* people, where it is structurally always 0
  (departed people are excluded from that node set by the spec's own
  definition). Rather than silently "fixing" this, the limitation is
  disclosed directly in the Causal Model view's UI — consistent with the
  convention the real repo's own prior sessions used for their own
  undefined/broken dependencies.
- `estimateCausalEffect` and `counterfactual` were kept behaviorally
  identical to the pasted spec, including its documented limitations (no
  hidden-confounder detection beyond simple parent-overlap, no real
  parallel-universe verification for counterfactuals).
