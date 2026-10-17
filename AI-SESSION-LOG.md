# AI Session Log — LEADOS Decision Topology Surface (Part 3)

Append-only record of what was actually fetched and read from
`github.com/wbweve/Leados` this session, what it showed, and what was
**not** found or **not** re-verified. This log is the authority if the
README or any in-app claim ever disagrees with it.

## Method

1. `web_fetch` on `https://github.com/wbweve/Leados` — read the rendered README as it exists on GitHub right now.
2. `web_fetch` on `https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1` — full repo file tree via the GitHub Trees API.
3. `web_fetch` (raw) on `https://raw.githubusercontent.com/wbweve/Leados/main/package.json`.
4. `web_fetch` (raw) on `https://raw.githubusercontent.com/wbweve/Leados/main/store.js`.
5. `web_fetch` (raw) on `https://raw.githubusercontent.com/wbweve/Leados/main/engine.js` (this fetch was **truncated mid-file** by the tool — roughly 9,000 tokens were cut from the middle; everything quoted below was actually present in the returned text, but the absence of a term elsewhere in the file cannot be guaranteed).

No other raw files were fetched this session (not `rules.js`, not any `.tsx` component, not `AI-SESSION-LOG.md`/`AI-SESSION-LOG.append.md`/`SESSION-3.patch.md` in the real repo, not the real `README.md` body beyond GitHub's rendered summary). Everything about those files below is therefore either taken from the rendered README's own prose (labeled as such) or explicitly marked unverified.

## Raw findings, this session

**Rendered `github.com/wbweve/Leados` README (fetched directly):**
- Describes itself as a "sandbox build, unofficial" delivery, built as a React + Vite + Tailwind app (`src/App.tsx` entry, `vite-plugin-singlefile` build), with its own store key `leados-orgphysics-sandbox:data` — distinct from the real repo's own verified `leados:data`.
- States its own Part 1/Part 2 work implemented fresh names (`LEADOS.correlate`, `P.state.events`, `LEADOS.orgPhysics`, `heatmap`, `measureVelocity`) that it says it could **not** find in the real repo's `store.js`/`engine.js`, and that it reused the real, verified constants `heatmapDecayFactor: 0.85`, `correlationWindowDays: 90`, `decisionMaxOpenDays: 21`.
- This README's own self-description does **not**, by itself, prove anything about the current repo contents — it is prose written by a prior session. Everything below this point is what I independently re-verified by fetching raw files myself in this session.

**GitHub Trees API (`git/trees/main?recursive=1`), fetched directly:**
- Confirms the repository root contains **both** a large number of React `.tsx` component files (`App.tsx`, `AboutView.tsx`, `BulletGraph.tsx`, `BundleModal.tsx`, `BundlesView.tsx`, `CalibrationCurve.tsx`, `Catalog.tsx`, `ChartFrame.tsx`, `CohortGrid.tsx`, `CommandPalette.tsx`, `ContractView.tsx`, `DataView.tsx`, `DataWidgets.tsx`, `DomainViews.tsx`, `FinanceDashboard.tsx`, `GanttText.tsx`, `HealthView.tsx`, `Heatmap.tsx`, `Histogram.tsx`, `IntelligenceDashboard.tsx`, `IntelligenceView.tsx`, `LineChart.tsx`, `MaintenanceView.tsx`, `MiscViews.tsx`, `Network.tsx`, `OverlayPanels.tsx`, `PeopleDashboard.tsx`, `PlaybooksView.tsx`, `ProvenanceView.tsx`, `Radar.tsx`, `RosterView.tsx`, `ScoreMath.tsx`, and more beyond where the listing was truncated) **and** standalone vanilla files (`store.js`, `engine.js`) at the repo root — plus `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`, `README.md`.
- This confirms the real repo is an **accumulation of many prior sessions' deliveries sitting side by side at root**, not a single clean architecture. (The listing was truncated by the tool after ~35 entries; the true file count is larger than what I read.)

**`package.json` (fetched directly, in full):**
- `"name": "react-vite-tailwind"`, dependencies `react@19.2.6`, `react-dom@19.2.6`, `clsx@2.1.1`, `tailwind-merge@3.4.0`; devDependencies include `vite@7.3.2`, `@tailwindcss/vite@4.1.17`, `vite-plugin-singlefile@2.3.0`, `typescript@5.9.3`.
- **Verified:** the real repo genuinely is a React 19 + Vite 7 + Tailwind 4 project with a single-file build plugin, exactly as the rendered README claimed.

**`store.js` (fetched directly, in full):**
- Header comment: `"LeadOS pt-5 - js/store.js ... Exactly one localStorage key: 'leados:data'. ... schemaVersion 5, lineage 'pt'."`
- Global namespace is `window.LeadOS` — **capital L, lowercase "ead", capital OS** — not `LEADOS`.
- `KEY = 'leados:data'`, `SCHEMA_VERSION = 5`.
- Confirmed real setting defaults, including `V5_SETTING_DEFAULTS = { correlationWindowDays: 90, trendMinPeriods: 3, heatmapDecayFactor: 0.85 }` and `V1_SETTING_DEFAULTS = { decisionMaxOpenDays: 21 }`.
- Append-only discipline is explicit in code: `append()` is the only public write path, `appendRaw()` always stamps `at: ms()` (real "now"), migrations may only append repair events and must count every repair (`recordMigration`). `load()` **refuses** to silently repair a corrupt store (`throw new Error('LeadOS: store at ' + KEY + ' is corrupt and was left untouched.')`) rather than discarding it.
- Migration `'2>3'` renames legacy `decision.decided` payload field `decision` → `choice`. This is the **only** decision-labeled event type found in `store.js`.
- No occurrence of `LEADOS`, `P.state.events`, `decision.scenario`, `decisionSurface`, or any decision entity with `severity`/`reviewDate` fields.

**`engine.js` (fetched directly, but the fetch was truncated mid-file — ~9,000 tokens cut from the middle; treat as a partial read):**
- Header comment: `"LeadOS pt-4 - js/engine.js. Derivation engine. project() folds the event log into state ON EVERY READ... nothing in this module touches localStorage... every selector is pure."`
- `project(events)` folds the log into per-domain keyed buckets: `finBudgets`, `finRisks`, `deals`, `quotas`, `okrs`, `roadmap`, `incidents`, `milestones`, `pips`, `campaigns`, `vendors`, `contracts`, `escalations`, `techDebt`, `experiments`, `crises`, `legalRisks` (keyed by originating event id, not a payload id), etc. An `ALIASES` table re-exposes these under names like `riskById`, `dealById`, `contractById`; an `OPEN_SETS` table derives `openRisks`, `openDeals`, `openMilestones`, `openEscalations`, `openContracts`, etc. by **absence of a closing event**, explicitly never by "overdue."
- The only decision-shaped fold found: `'strategy.decision': function (s, p, at) { push(s.strategyDecisions, p, at); }` — a flat, appended log entry with no `id`, `severity`, or `reviewDate` field, not a keyed, updatable entity.
- The same file (later in the truncated fetch) also contains a rule-evaluation layer and `LeadOS.patterns` — a library of named cross-domain compound patterns (`DEATH_SPIRAL`, `EXECUTION_BREAKDOWN`, `REVENUE_AT_RISK`, `GOVERNANCE_GAP`, `INNOVATION_STALL`, `QUALITY_COLLAPSE`, `LEADERSHIP_VACUUM`, `CASHFLOW_WARNING`) that fire when a fixed set of rule-ids (`R1`...`R40`) are all simultaneously active, each with a disclosed confidence label and (where relevant) a time window check against real evidence timestamps. This is a real, sophisticated feature — but it correlates **rule findings**, not decisions, and it is a flat pattern-match, not a continuous topology/coordinate system.
- **Not found** anywhere in the (partially-read) file: `LEADOS.decisionSurface`, `mapDecisionTopology`, `classifyDecisionQuadrant`, `decision.scenario`, `cost_if_true`, `probability` as a decision-scenario field, or any 3-axis (risk/reversibility/pressure) coordinate system for decisions.

## What this means for Part 3

The user's pasted Part 3 brief (`LEADOS.decisionSurface`, `mapDecisionTopology`, `classifyDecisionQuadrant`, `decision.scenario` events, `P.state.events`, `LEADOS.engine._days`) is **not a quote of real repo code** — none of those identifiers were found in the files fetched this session. It reads as a hypothetical feature brief, written in a capitalization (`LEADOS`) that doesn't match the real project's actual namespace (`LeadOS`).

Given that:
- This delivery implements the brief's own pasted `mapDecisionTopology` / `classifyDecisionQuadrant` **verbatim**, inside a fresh, minimal `LEADOS.store` / `LEADOS.engine.project` / `LEADOS.engine._days` scaffold that this session defines itself (since no Part 1/Part 2 scaffold exists in *this* project workspace — it started empty, with no prior `index.html`).
- It is delivered as **one self-contained `index.html`**, not a Vite/React tree, because this environment's tools can only create/edit a single HTML file — a disclosed, structural departure from the real repo's actual architecture, not a silent one.
- The 8 seed decisions (and their severities, costs, probabilities, review-date offsets) are hand-calibrated, disclosed fabrications, built only to exercise each of the 8 named quadrants — they are not derived from any real data.

## Verified vs. fabricated, at a glance

| Claim | Status |
|---|---|
| `github.com/wbweve/Leados` exists; root is a React 19 + Vite 7 + Tailwind 4 project with `vite-plugin-singlefile` | ✅ verified this session (raw `package.json`) |
| Repo root also carries ~40 loose files from prior sessions, mixing `.tsx` components with standalone `store.js`/`engine.js` | ✅ verified this session (Trees API) |
| Real namespace `window.LeadOS` (not `LEADOS`); real key `leados:data`, schema v5 | ✅ verified this session (raw `store.js`) |
| `heatmapDecayFactor: 0.85`, `correlationWindowDays: 90`, `decisionMaxOpenDays: 21` are real settings | ✅ verified this session (raw `store.js`) |
| `engine.js` folds events into keyed per-domain buckets + alias table + open-set predicates | ✅ verified this session (raw `engine.js`, partial read — fetch truncated) |
| `engine.js` also contains a rule engine and `LeadOS.patterns` compound-pattern library | ✅ verified this session (same fetch) |
| Real decision-shaped events are `strategy.decision` (log-only) and `decision.decided` (choice record) | ✅ verified this session (`engine.js` fold + `store.js` migration `2>3`) |
| `LEADOS.decisionSurface`, `mapDecisionTopology`, `classifyDecisionQuadrant`, `decision.scenario`, or decision entities with `severity`/`reviewDate` | ⚠️ **not found** in the files fetched this session — not proof of absence across the ~40 files not individually fetched |
| `P.state.events` shape, `LEADOS` (vs `LeadOS`) capitalization, as used in the pasted brief | ⚠️ **not found** verbatim — treated here as this build's own internal contract, not a recovered fact |
| This session's 8 seed decisions and their calibration to the 8 quadrants | ⚠️ **fabricated**, disclosed in `seedIfEmpty()` in `index.html` |
| A single hand-authored `index.html` as the delivery vehicle | ⚠️ disclosed structural difference — this session's tools cannot author a Vite/React project tree |

## Non-negotiables, as applied here

- Single localStorage key, `leados-decision-surface:data`, deliberately distinct from both the real repo's verified `leados:data` and the other sandbox build's claimed `leados-orgphysics-sandbox:data` (per its README, not independently re-verified this session) — checked live by Health check **H8**.
- `append()` is the only "now" write path and always stamps real time; `appendAtInto()` — used only by the seed routine — is the sole backdating path, and every event it writes carries `meta.seeded: true` (checked live by **H6**).
- Nothing derived is persisted: `project()` and `mapDecisionTopology()` recompute from the raw event array on every call (checked live by **H4**, which re-runs `project()` twice on the same input and diffs the output and the input).
- `classifyDecisionQuadrant` is exercised against all 8 boolean combinations of (risk, reversibility, pressure) at runtime, not just asserted in prose (checked live by **H3**).
- `#Health` tab runs 8 live, non-destructive checks in the browser and is the authority if it ever disagrees with this document or the README.

## Explicitly not done this session

- Did not fetch `rules.js` (if it exists as a separate file; the rule-evaluation code found may live inside `engine.js` itself — the truncated fetch makes file boundaries uncertain).
- Did not fetch any `.tsx` component, so no claim is made about what the real repo's actual rendered UI looks like beyond the file list.
- Did not fetch the real repo's own `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, or `SESSION-3.patch.md` — their contents are unknown to this session.
- Did not attempt to write to or open a pull request against the real repository — this session only reads from GitHub and writes to this local project's own `index.html` / `README.md` / `AI-SESSION-LOG.md`.
