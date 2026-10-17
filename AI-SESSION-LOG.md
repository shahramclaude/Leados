# AI-SESSION-LOG.md

Append-only. Nothing below is removed between parts — only added to. Every
line is either (a) something this session directly fetched and read, or
(b) explicitly marked as not verified / fabricated.

---

## Session start — inspecting the real `github.com/wbweve/Leados`

Before writing any application code, this session fetched the real repo
directly, per the task's own instruction ("Inspect the actual code before
claiming anything about it"). Method and raw results:

1. **`web_fetch https://github.com/wbweve/Leados`** (rendered GitHub page).
   Returned a repo whose current root `README.md` / `AI-SESSION-LOG.md`
   describe a **prior AI session's own delivery** ("pt-J demo — Temporal
   Velocity Measurement"), itself built against a lineage of earlier
   deliveries (pt-4 … pt-I). That prior session's README already contains
   its own "verified vs. fabricated" ledger. Treated as a *claim*, not a
   fact, until independently re-checked below.

2. **`web_fetch https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1`**
   — ✅ verified directly: the repo root holds 60+ flat files, the large
   majority `.tsx` (e.g. `App.tsx`, `BulletGraph.tsx`, `BundleModal.tsx`,
   `BundlesView.tsx`, `CalibrationCurve.tsx`, `Catalog.tsx`, `ChartFrame.tsx`,
   `CohortGrid.tsx`, `CommandPalette.tsx`, `ContractView.tsx`, `DataView.tsx`,
   `DataWidgets.tsx`, `DomainViews.tsx`, `FinanceDashboard.tsx`,
   `GanttText.tsx`, `HealthView.tsx`, `Heatmap.tsx`, `Histogram.tsx`,
   `IntelligenceDashboard.tsx`, `LineChart.tsx`, `MaintenanceView.tsx`,
   `MiscViews.tsx`, `Network.tsx`, `OverlayPanels.tsx`, `PeopleDashboard.tsx`,
   `PlaybooksView.tsx`, `ProvenanceView.tsx`, `Radar.tsx`, `RosterView.tsx`,
   `ScoreMath.tsx`, `SelfDashboard.tsx`, `Shell.tsx`, …), plus
   `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, `README.md`,
   `SESSION-3.patch.md`. The listing was long enough that the raw JSON
   response was truncated by this session's own tooling past the "S"
   filenames — **not every one of the 60+ files was individually
   confirmed to exist**; the ones named above were read directly from the
   tree response.

3. **`web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/package.json`**
   — ✅ verified directly: `"name": "react-vite-tailwind"`, React `19.2.6`,
   Vite `7.3.2`, `@tailwindcss/vite` `4.1.17`, `vite-plugin-singlefile`
   `2.3.0`, TypeScript `5.9.3`. This matches the prior session's claim.

4. **`web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/README.md`**
   — ✅ verified directly: the live `README.md` is in fact the pt-J
   narrative described above (not a vanilla-JS "offline leadership mentor"
   README as a stale search snippet might suggest). Confirms the prior
   session's own disclosure that the repo root accumulates **overwritten
   single-file deliveries** rather than a stable, versioned product.

5. **`web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/store.js`**
   — ✅ verified directly, in full. Confirmed facts used in this delivery:
   - Exactly one localStorage key, `KEY = 'leados:data'`.
   - `SCHEMA_VERSION = 5`, `LINEAGE_TAG = 'pt-6'`.
   - `V5_SETTING_DEFAULTS = { correlationWindowDays: 90, trendMinPeriods: 3,
     heatmapDecayFactor: 0.85 }`, with its own comment: *"heatmapDecayFactor
     is a labeled assumption — it prices recency in the correlation
     heatmap, and every rendered heat value prints the factor it used."*
   - `V1_SETTING_DEFAULTS = { decisionMaxOpenDays: 21 }`.
   - Append-only discipline: `appendRaw()` is the only mutation path;
     migrations may only *append* repair events, never rewrite in place;
     a corrupt store is refused, not silently repaired (`load()` throws).
   - An import gate (`mergeInto`) with id-rewiring and dangling-reference
     rejection exists — **not reused here**, out of scope for this brief.

6. **`web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/engine.js`**
   — ✅ verified directly (large file; the fetch tool truncated the middle
   ~9k tokens of a single response, so coverage of this file is **not
   100% exhaustive** — disclosed, not hidden). Confirmed facts:
   - `project(events)` folds the append-only log into state **on every
     read**; nothing it returns is persisted. Per-module entity buckets
     (`finBudgets`, `finRisks`, `deals`, `okrs`, `legalRisks`, `contracts`,
     `incidents`, `milestones`, …), **not** a generic `domain`/`severity`
     event stream.
   - A declarative alias table and `open*` predicate sets (`openRisks`,
     `openDeals`, `openOkrs`, …) are rebuilt every fold — "stale state
     impossible by construction," in the file's own words.
   - A correlation/clustering routine exists with the fragment
     `const w = r.sev * Math.pow(decay, r.ageDays);` and `byDomain`/`cell.contrib`
     structures — i.e. **a decay-weighted per-domain severity rollup
     concept is real**, independently re-confirmed this session, consistent
     with the prior session's claim.
   - ⚠️ **Not found, this session or the last**: a function literally named
     `LEADOS.correlate.heatmap`, `LEADOS.correlate.measureVelocity`, or a
     data shape `P.state.events`. The brief pasted into this task uses
     those exact names/shapes; they do not exist under those names in the
     real repo as fetched. This delivery's `LEADOS`-flavored modules
     (`src/lib/velocity.ts`, `src/lib/orgPhysics.ts`) are **fresh code**,
     not recovered or reverse-engineered from the real engine.js, beyond
     reusing the three verified numeric constants (0.85, 90, 21) and the
     "nothing derived persists" discipline.
   - A rule/pattern-detection layer (`LEADOS.patterns`) was also visible in
     the fetched engine.js bundle, with named compound patterns
     (`DEATH_SPIRAL`, `EXECUTION_BREAKDOWN`, `GOVERNANCE_GAP`, …), each
     with an explicit `confWhy` string disclosing *why* a confidence level
     was assigned (e.g. "medium — 4 correlated signals … a compound of
     correlated rule signals, not a single measured fact"). **This
     disclosure style — always print the arithmetic, always label
     confidence, never silently upgrade a heuristic to a fact — is the
     one thing this delivery deliberately imitates**, because it is the
     real repo's own verified doctrine, not because any of its code was
     copied.
   - `rules.js` was **not** re-fetched this session (time-boxed); the
     prior session's claim that it is a disclosed tombstone merged into
     `engine.js` is carried forward **unverified by this session**.

7. **Files named in the prior session's own ledger but not re-fetched this
   session** (carried forward as **unverified by this session**, not
   re-confirmed): `Heatmap.tsx`, `DomainViews.tsx`, `store.ts`,
   `rules.js`'s exact tombstone text, and the remainder of the 60+ file
   tree beyond what is listed in item 2 above.

### Conclusion driving this delivery's architecture

- The real repo is a **moving target that overwrites its own root
  `index.html`/`README.md` with each new single-file demo**; there is no
  single stable "LeadOS app" to patch.
- This task's sandbox is **not** that repo — it is a separate
  React + Vite + Tailwind scaffold (`src/App.tsx` as entry, build via
  `npm run build` → `dist/index.html`, already configured with
  `vite-plugin-singlefile`, independently confirmed by reading
  `vite.config.ts` and `package.json` in *this* sandbox, not the GitHub
  repo). This delivery is written as a **fresh, standalone implementation**
  of the pasted "Temporal Velocity" (Part 1) and "Organizational Physics
  Engine" (Part 2) briefs, inside this sandbox's required architecture —
  not a diff/patch against `wbweve/Leados`, and not a byte-for-byte port of
  anything in it. Every numeric constant or design choice knowingly
  borrowed from the verified real repo is called out inline in code
  comments and in the table in `README.md`.

---

## Part 1 + Part 2 delivery (this sandbox)

- Implemented `src/lib/velocity.ts` (`heatmap`, `domainMath`,
  `measureVelocity`) — Part 1, "Temporal Velocity Measurement."
- Implemented `src/lib/orgPhysics.ts` (`computeChangePhysics`,
  `measureOrgEntropy`, `computeLeadershipEnergyBudget`, `measureResonance`)
  — Part 2, the four laws, adapted directly from the pasted brief's own
  pseudocode against this session's `Projection` shape (`src/lib/types.ts`,
  `src/lib/engine.ts`).
- Seed data (`src/lib/seed.ts`) is hand-placed and disclosed as fabricated.
  The LEGAL domain's six `signal.raised` events are deliberately tuned —
  arithmetic shown in `AI-SESSION-LOG.md`/README and live in the UI's
  "Show score math" panel — to land close to this task's own illustrative
  numbers (score ≈5.2, velocity ≈+0.070/d, 30-day projection ≈7.3).
  Independently recomputed in Node during this session:
  `current=5.2035, historical=3.1429, velocity=+0.0687/d, projected30=7.264`.
  This will drift slightly every day the app is opened, because every
  score is computed live from `Date.now()`, never frozen — disclosed in
  the UI and in README, not hidden behind a static snapshot.
- Built a custom hash router (`#/today #/intelligence #/data #/health
  #/about`) instead of installing `react-router-dom` — kept the dependency
  surface identical to the sandbox's starting `package.json` (no `npm
  install` beyond what already ships), consistent with the real repo's own
  minimal-dependency instinct (verified: its `dependencies` list is only
  `clsx`, `react`, `react-dom`, `tailwind-merge`).
- Added a live `#/health` suite (`src/lib/health.ts`) with 8 checks
  (store round-trip, append-only immutability, heatmap bounds, independently
  re-derived velocity arithmetic, projection purity, seed-marking, the
  decay constant's value, and finding severity range) — mirrors the real
  repo's own verified "T-suite" / health-check doctrine (store.js and
  engine.js both reference test suites like `T18`, `T42`, `G4`, `G7`,
  `G10`, `G32` in their comments) without reusing any of its actual test
  code, which was not fetched this session.
- Added an in-app `#/about` view that renders the same verified/fabricated
  ledger as this file and README, so the disclosure travels with the app,
  not only with the delivery documents.

### Known gaps, disclosed

- Not implemented: the real repo's schema migration ladder, import/merge
  gate, or any of its 60+ domain dashboards (`FinanceDashboard.tsx`,
  `PeopleDashboard.tsx`, etc.) — out of scope for the Part 1 + Part 2 briefs
  pasted into this task.
- `rules.js`'s exact tombstone text and the full contents of `Heatmap.tsx` /
  `DomainViews.tsx` / `store.ts` were not re-fetched this session; claims
  about them above are explicitly marked as carried over, unverified by
  this session.
- The GitHub Trees API response was long enough to be truncated by this
  session's fetch tool past the "S" filenames; the file tree is confirmed
  only up to that point, not exhaustively to the end of the alphabet.
