# AI-SESSION-LOG.md — pt-J (Temporal Velocity Measurement)

Append-only. Nothing below is edited after the fact; corrections are appended as new entries.

## §0 — What was verified about the real `wbweve/Leados` repo this session

Method: GitHub REST/Trees API for the file listing, then direct raw-content fetches
(`raw.githubusercontent.com/wbweve/Leados/main/<file>`) of individual files, in both `text` and `html` render
modes where relevant. No cloning, no local checkout — this environment only has `web_fetch`/`web_search`.

0.1. `GET /repos/wbweve/Leados/git/trees/main?recursive=1` returned 60+ entries, flat at repo root (no `src/`,
no `js/` directory actually present on disk, despite internal comments referencing `js/store.js` — see §0.4).
File types are overwhelmingly `.tsx`, e.g. `App.tsx`, `BulletGraph.tsx`, `Heatmap.tsx`, `DomainViews.tsx`,
`HealthView.tsx`, `ScoreMath.tsx`, `Shell.tsx`, `RosterView.tsx`, plus root `README.md`, `AI-SESSION-LOG.md`,
`AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`.

0.2. `package.json` (root) — fetched directly, verified verbatim:
```
name: "react-vite-tailwind", private, type module
deps: clsx, react 19.2.6, react-dom 19.2.6, tailwind-merge
devDeps: @tailwindcss/vite 4.1.17, vite 7.3.2, vite-plugin-singlefile 2.3.0, typescript 5.9.3, @vitejs/plugin-react
```
This confirms the repo root, as it exists right now, is a React 19 + Vite 7 + Tailwind 4 project using
`vite-plugin-singlefile` — **not** a vanilla-JS no-build project, at least for this slice of the repo.

0.3. `DomainViews.tsx` (root) — fetched directly. Contains `FinanceView`, `IntelligenceView`, `SelfView`, each
importing `Projected` from `../lib/engine` and components from `../components/primitives` — i.e. the source
tree this file was *written for* assumes a `src/lib/`, `src/components/` structure, even though the file itself
now sits flat at repo root. `IntelligenceView` renders "Cross-domain heat" as a grid of per-domain cards showing
`count` and `topSev` (max severity) of active findings — a coarse heat display, but not a `correlate.heatmap()`
0–10 decayed score, and not called "heatmap" in code.

0.4. `store.ts` (root) — fetched directly. Its own header comment says: *"Persistence + mutation layer for the
pt-E demo... uses a DISTINCT key so this demo can never collide with a real LeadOS install."* Confirmed fields:
`STORAGE_KEY = "leados-pte-demo:data"`, `SCHEMA_VERSION = 1`, `lineage: "pt-E-demo"`. This is **not** the real
app's store — it is itself a prior single-file demo delivery, now sitting at root as `store.ts`.

0.5. `store.js` (root) — fetched directly. Its own header comment: *"LeadOS pt-5 - js/store.js... Exactly one
localStorage key: 'leados:data'... schemaVersion 5, lineage 'pt'."* Verified verbatim in the fetched source:
`KEY = 'leados:data'`, `SCHEMA_VERSION = 5`, `LINEAGE = 'pt'`, `LINEAGE_TAG = 'pt-6'`. V5 settings defaults include
`correlationWindowDays: 90, trendMinPeriods: 3, heatmapDecayFactor: 0.85`, with an inline comment: *"prices
recency in the correlation heatmap, and every rendered heat value prints the factor it used."* This is the
closest verified real-repo artifact to the pasted velocity brief's "heatmap" concept — but note the file lives at
repo root as `store.js` while its own comment still says `js/store.js`, consistent with files having been
flattened out of an original `js/` folder at some point, or dumped at root by tooling without the folder.

0.6. `engine.js` (root) — fetched directly (~9k tokens, large; this session's fetch tool truncated and
concatenated head+tail of the content, so coverage of the middle of this file is incomplete — disclosed, not
hidden). Verified: this is the real `project()` fold (comment: *"LeadOS pt-4 - js/engine.js. Derivation engine.
project() folds the event log into state ON EVERY READ."*), covering ~15 business domains (finance, sales,
product/strategy, ops, HR, marketing, manufacturing, supply chain, design, R&D, legal, customer success,
executive/board, notes, intelligence layer). Later in the same fetched content: a decay-weighted per-domain
severity rollup (`byDomain`, `const w = r.sev * Math.pow(decay, r.ageDays)`), and a separate compound-pattern
detector (`LeadOS.patterns`, e.g. `DEATH_SPIRAL`, `QUALITY_COLLAPSE`) with explicit "shipped vs. spec-label"
disclosures for rule IDs. **A function or namespace literally named `correlate` or `heatmap(...)` was not seen
in the text that did arrive** — given the confirmed truncation, this is reported as "not found in what was
fetched," not "does not exist."

0.7. `rules.js` (root) — fetched directly. Entire file content is a tombstone comment: the real rules engine
(R1–R40) "was merged into `js/engine.js` in pt-4 part 11... This file is NOT referenced by `index.html` and is
NOT loaded by the browser. It remains on disk only because the tooling used in this session has no delete
operation." Verified verbatim.

0.8. `Heatmap.tsx` (root) — fetched directly. Renders a **calendar heatmap of logging activity** (active days /
total days, click a day to see its event count) — not a per-domain health score. Confirms the React-rewrite
lineage's "Heatmap" component is unrelated in shape to the pasted brief's `correlate.heatmap(P, today)[domain]`.

0.9. `index.html` (root) — fetched directly in both `markdown` and `html` render modes. `<title>` and visible
nav text: *"LeadOS pt-I demo — Temporal Cognition (unofficial, single-file)"*, nav links `Today / Temporal Field
/ Data / Health / real repo ↗`. This matches the pt-I README's own description of itself. **Both fetch modes
stripped all `<script>` content** — only markup/visible text came back in each case, confirmed by trying both
before concluding the script was unrecoverable. This is the same limitation the pt-I README disclosed when it
could not recover pt-H's script contents from this same kind of tool.

0.10. A `web_search` for `wbweve/Leados correlate heatmap` returned, among unrelated results, a snippet
apparently describing the same repository's README differently: *"Offline leadership mentor for someone newly
put in charge of other team leads... Vanilla JS, no framework, no backend, no build step, no network calls."*
This was **not independently re-confirmed by a direct fetch** of `README.md` this session (the direct fetch
returned the pt-I narrative instead, described in `web_fetch #1` below). Reported as an unverified secondary
signal, consistent with — but not proof of — the repo accumulating multiple overwritten single-file deliveries
at its root over time, which is exactly what the pt-I README (quoted via direct fetch) itself claims happens.

0.11. Candidate filenames tried and **not found** (404) at repo root: `correlate.js`, `insight.js`. This narrows,
but does not prove, that no file under those names implements `LEADOS.correlate.heatmap`; the real logic for a
"correlation heatmap" most plausibly lives inside the already-large `engine.js`, in the ~9k-token mid-section
this session's fetch tool could not return.

## §1 — Decisions and deviations made in this delivery (disclosed)

1.1. Given `LEADOS.correlate.heatmap` / `P.state.events` could not be located verbatim in the real repo, this
delivery implements them **fresh**, reusing only the one concrete verified number available
(`heatmapDecayFactor: 0.85` from `store.js`) rather than fabricating an unrelated constant.

1.2. The pasted brief's own `measureVelocity` code calls `heatmap(P, today)` where `today` is used both as a
bare value passed straight into `heatmap()` and, a few lines later via `new Date(today)`, as something
`Date`-constructible — while the second `heatmap(historicalP, lookbackIso)` call definitely passes an ISO
string. This is an inconsistent argument type for the same parameter position across two call sites in the same
pasted function. Fixed by normalizing every "as of" argument through a single `iso()` call inside
`domainMath()`, so both a `Date` and an ISO string work identically. Disclosed in code comments and in the
README, not silently patched.

1.3. The pasted brief's text ends immediately after "In the domain heatmap (everywhere it appears):" — no bullet
list, no layout spec follows. This delivery's own completion (a compact Today-view strip + a full Domain-Heatmap
card with sparkline and expandable score math) is disclosed as this session's own design choice, not a recovered
spec, mirroring how the pt-I README disclosed its own completion of "Causal Chain Display" after a similar
mid-sentence cutoff.

1.4. This session's fetch tool cannot recover `<script>` contents from a rendered single-file HTML page (tested
directly against the real repo's current `index.html` in both `markdown` and `html` modes before concluding
this, per §0.9). Therefore this delivery does **not** diff against, extend in place, or claim fidelity to the
prior pt-I session's actual code — it is a fresh build that implements only the newly pasted velocity brief,
continuing the lineage narratively, not by code inheritance.

1.5. Seed data (5 domains, ~21 events) is hand-placed with specific day-offsets chosen to deterministically
exercise `WORSENING`, `IMPROVING`, `STABLE`, and a sparse/low-data domain under the decay-weighted scoring
formula — disclosed as fabricated-for-demo in the README, not presented as real organizational data.

1.6. Chose a new, previously-unused localStorage key, `leados-ptj-demo:data`, distinct from every key verified
or named in this repo's visible history (`leados:data`, `leados-pte-demo:data`, and the `leados-ptg/pth/pti-
demo:data` keys the pt-I README names for its own predecessors), so this demo cannot collide with any of them on
the same browser origin.

## §2 — Tool-budget note

This session used ~12 research calls (Trees API, `package.json`, `store.ts`, `store.js`, `engine.js`, `rules.js`,
`DomainViews.tsx`, `Heatmap.tsx`, `index.html` ×2 render modes, two 404 probes, one web search) before writing
any deliverable file, leaving the remainder of the budget for the three required files. Deeper verification
(e.g., paginating through all 60+ files, or fetching `engine.js` in smaller byte-range chunks to recover its
truncated middle section) was not performed and is named here as a boundary of this session's verification, not
hidden.
