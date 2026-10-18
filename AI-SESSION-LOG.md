# AI Session Log — LEADOS Sandbox (Part 2: Multi-Agent Organizational Simulation)

This log records what was actually checked against `github.com/wbweve/Leados`
this session, via which calls, what was found, and what in this delivery is
verified, original, or a disclosed gap. Per the task instruction ("inspect
the actual code before claiming anything about it; label anything
unverified"), this applies to the real repo *and* to the task's own pasted
`LEADOS.simulation` spec.

## 1. What was fetched, and how (this session)

| # | Call | Purpose / result |
|---|------|-------------------|
| 1 | `web_fetch https://github.com/wbweve/Leados` (rendered page) | Initial orientation. Returned a README whose text is itself a **prior AI session's self-description** of inspecting this same repo — i.e. the repo's README is not neutral documentation, it's a narrated provenance claim from an earlier pass. Treated as a claim to verify, not fact. |
| 2 | `web_fetch https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1` | Recursive tree listing. Returned dozens of entries — **all at repo root**, no `src/` prefix visible in the (truncated) response: `AI-SESSION-LOG.append.md`, `AI-SESSION-LOG.md`, `AboutView.tsx`, `App.tsx`, `BulletGraph.tsx`, `BundleModal.tsx`, `BundlesView.tsx`, `CalibrationCurve.tsx`, `Catalog.tsx`, `ChartFrame.tsx`, `CohortGrid.tsx`, `CommandPalette.tsx`, `ContractView.tsx`, `DataView.tsx`, `DataWidgets.tsx`, `DomainViews.tsx`, `FinanceDashboard.tsx`, `GanttText.tsx`, `HealthView.tsx`, `Heatmap.tsx`, `Histogram.tsx`, `IntelligenceDashboard.tsx`, `IntelligenceView.tsx`, `LineChart.tsx`, `MaintenanceView.tsx`, `MiscViews.tsx`, `Network.tsx`, `OverlayPanels.tsx`, `PeopleDashboard.tsx`, `PlaybooksView.tsx`, `ProvenanceView.tsx`, `Radar.tsx`, `RosterView.tsx`, `README.md`, `SESSION-3.patch.md`, `ScoreMath.tsx`, and more (response was truncated by size; not every row was enumerated). |
| 3 | `web_fetch https://api.github.com/repos/wbweve/Leados/contents/` | Root directory listing, confirms #2: a flat root directory of loose `.tsx`/`.md` files. |
| 4 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/AI-SESSION-LOG.md` | **Verified directly:** the repo's own log file. It narrates a session that claims to have found `src/lib/` and `src/components/` trees (with `infoTheory.ts`, `core.ts`, `engine.ts`, `intelligence.ts`, `casEngine.ts` absent, etc.) and a root `index.html` of 54,081 bytes containing `identifyAttractors()`, ~60 `R`-prefixed rule IDs, and the string `pt-L`. This is the repo *documenting itself*, not this session independently confirming the `src/` tree's contents. |
| 5 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/README.md` | **Verified directly:** matches the rendered page from call #1 — same provenance narrative, same project-structure diagram (`src/lib/...`, `src/components/...`). |
| 6 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/index.html` (text mode) | Returned only `<title>LEADOS Sandbox — CAS Engine, Risk Intelligence & Thermodynamics</title>` — a signal the body was minimal/empty of static text. |
| 7 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/index.html` (html mode) | **Verified directly, this session, in full:** the entire file is 9 lines — a bare Vite entry stub: `<div id="root"></div>` + `<script type="module" src="/src/main.tsx"></script>`. **This directly contradicts** the 54,081-byte, rule-ID-laden, hand-authored `index.html` that the repo's own README (#5) and AI-SESSION-LOG.md (#4) describe inspecting. |

No commit history, blame, or GitHub code search was used, so it is not established *when* the root `index.html` changed to this stub, or whether the `src/` tree the repo's docs describe currently exists — only that the docs' description of the root `index.html` does not match what that file actually contains as of this fetch.

## 2. Verified facts (first-hand, this session)

- **V1.** The repo root is a flat directory of ~35+ loose `.tsx`/`.md` files (not nested under `src/`), confirmed via two independent calls (#2, #3).
- **V2.** The current root `index.html`, fetched and read in full (#7), is a minimal Vite/React entry stub with zero inline application logic, zero rule IDs, zero `identifyAttractors` reference.
- **V3.** The repo's own `README.md` and `AI-SESSION-LOG.md` (#4, #5) describe a *different* root `index.html` (54KB, hand-authored, rule-ID catalog) than what V2 shows. **This is a direct contradiction**, surfaced here rather than silently resolved in either document's favor.
- **V4 (not verified, disclosed as a gap).** Whether a `src/lib/` or `src/components/` directory exists with the specific files the repo's docs name (`infoTheory.ts`, `casEngine.ts`, `Thermodynamics.tsx`, etc.) was **not independently confirmed this session** — no `contents/src` call was made. The root `index.html`'s `/src/main.tsx` reference makes some `src/` folder plausible, but its contents are repeated here only as the repo's *own, not fully reliable* self-report (per V3), not as this session's verified fact.
- **V5.** The task's pasted `LEADOS.simulation` code (agent model: mood/load/engagement/flightRisk/performance, `stepAgents`, Monte Carlo `run`/`_runScenario`) does **not** appear in anything actually fetched from the real repo this session. No search for its specific identifiers (`stepAgents`, `initAgents`, `flightSignal`, `attritionProbability`) was run against the repo, but it is absent from every file this session actually read (the stub `index.html`, `README.md`, `AI-SESSION-LOG.md`). Treated as an **unverified specification pasted into this task**, exactly as earlier sessions in this repo's own lineage treated their own pasted briefs (per their own disclosed convention, itself unverified beyond the repo's self-report — see V3).

## 3. Conclusion

The real repo's own documentation about itself is **not reliable on its own** — at minimum, its description of its own root `index.html` is contradicted by that file's actual current content. This session therefore did not extend, copy, or "continue" any specific module from that repo (no verified module was available to continue), and treats the task's pasted `LEADOS.simulation` spec purely as this task's own input, not as repo-sourced code.

## 4. What this delivery actually is

This tool environment's own constraint is a **single hand-authored `index.html`** (Tailwind via CDN, inline `<script>`, no build step) — the opposite of the real repo's current Vite/React stub. No attempt was made to imitate the Vite app; this is a fresh, self-contained build.

- **Part 1 (org data model)** — not previously delivered in *this* project (confirmed: `read_file index.html` returned "does not exist" before this session's first write). Built from scratch: a `people / pulses / feedback / plans / oneonones / events` localStorage-backed store, shaped specifically to match the field names (`P.directs`, `P.pulsesByPerson`, `P.openPlans`, `P.oneononeLast`, `P.state.events`, etc.) that the pasted Part 2 spec's `initAgents()` already assumes. This is an **inference from the spec's own code**, not a port of any verified prior LEADOS data model.
- **Part 2 (`LEADOS.simulation`)** — `initAgents`, `stepAgents`, `run`, `_runScenario`, `_percentile` are reproduced **verbatim** from the task's pasted code (unverified-provenance, per §2 V5), unmodified. Two small additive helpers (`weeklyTrajectory`, `estimateCurrent`) were added in a clearly separate block, used only for charting/dashboard display — the headline Monte Carlo numbers shown to the user always come from the unmodified pasted functions, never from these helpers.
- **Synthetic seed data** (9-person roster, pulses, feedback, growth plans, 1:1 history, one conflict) — entirely fabricated for this demo, not real organizational data, not copied from the repo (no such dataset was found there either).
- **Simulation Playbook + View** — new UI: manual single-intervention run, a "full playbook" run comparing all six intervention types (auto-targeted by simple heuristics — overdue people, no-plan people, overloaded people, or the whole team, disclosed inline in the UI as a simplification), a ranked scenario table, a single-seed illustrative trajectory chart (explicitly labeled as distinct from the Monte Carlo means), and a per-agent final-state table.

## 5. Known limitations, disclosed

- All behavioral coefficients in `LEADOS.simulation` are exactly as pasted in the task prompt and are **not** empirically validated for any real organization — this is stated in the model's own `label` string and repeated in the UI and About tab.
- "Attrition probability" = share of Monte Carlo seeds where any agent's flight risk exceeds 0.7 — a modeling proxy invented by the pasted spec, not a calibrated forecast.
- The playbook's auto-targeting (e.g. "reduce load for everyone with load > 7") is a simplification for comparability across scenarios; real interventions are rarely applied uniformly.
- The chart renderer is a small hand-written `<canvas>` line chart (no charting library), chosen to keep the deliverable a single dependency-free file (Tailwind CDN only).
