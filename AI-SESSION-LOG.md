# AI Session Log — LEADOS pt-U (Talent / Financial OS / Regulatory / Narrative / Org Physics)

This log records exactly what was checked against `github.com/wbweve/Leados` this
session, via which calls, what was found, and what in this delivery is original,
a reused *idea* (not code), or a disclosed gap/limitation. Convention follows the
real repo's own prior sessions: inspect first, label everything, never assume
continuity that wasn't verified.

## 1. What was fetched, and how (this session)

| # | Call | Purpose / result |
|---|------|-------------------|
| 1 | `web_fetch https://github.com/wbweve/Leados` (rendered README) | Initial orientation — treated as a claim to verify, not fact. Describes a React+Vite+Tailwind sandbox themed "Thermodynamics, CAS Engine, Risk Intelligence" with hash routes `/today /signals /thermodynamics /cas /risk /about`, and a detailed provenance section asserting what a *prior* session verified about the repo. |
| 2 | `web_fetch https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1` (via `web_fetch`, truncated; re-run via `bash curl \| node` for full parse) | Full recursive tree: **148 files**, not truncated. Confirmed two structurally different deliveries in one tree: ~90 loose root-level files (including duplicated `.js`/`.ts`/`.tsx` pairs, e.g. `engine.js` **and** `engine.ts`, `store.js` **and** `store.ts`, `ui.js` **and** `ui.tsx`, plus many single-purpose dashboard-looking `.tsx` files like `FinanceDashboard.tsx`, `PeopleDashboard.tsx`, `Network.tsx`, `Radar.tsx`) alongside a separate, self-contained `src/` Vite+React+TypeScript tree. |
| 3 | `curl raw.githubusercontent.com/.../AI-SESSION-LOG.md` | Read a prior session's own log in full. It documents (its own, first-hand) findings: `src/lib/infoTheory.ts` is real and wired into `Thermodynamics.tsx` via `IntelligenceView.tsx` via the live `App.tsx`; `src/lib/core.ts`/`intelligence.ts`/`physics.ts` exist but are orphaned (not imported by the live app, and `intelligence.ts` imports `{engine, run}` from `./core`, which doesn't export them); no CAS/risk-register module exists anywhere in `src/lib`. |
| 4 | `curl raw.githubusercontent.com/.../package.json`, `.../vite.config.ts` | **Verified directly:** React 19.2.6, Vite 7.3.2, TypeScript 5.9.3, Tailwind 4 via `@tailwindcss/vite`, and `vite-plugin-singlefile` as a devDependency, wired into `vite.config.ts`'s `plugins` array. |
| 5 | `curl raw.githubusercontent.com/.../index.html` (root) | **Verified directly, this session:** 352 bytes — the default Vite scaffold (`<div id="root">` + `<script src="/src/main.tsx">`), titled "LEADOS Sandbox — CAS Engine, Risk Intelligence & Thermodynamics". **This is not** a large hand-authored single-file demo. |
| 6 | `curl raw.githubusercontent.com/.../src/App.tsx` | **Verified directly:** imports and routes to `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`, `RiskView`, `AboutView` — matching the rendered README's "Pages" table exactly. This corroborates that specific README claim first-hand, this session. |
| 7 | `curl raw.githubusercontent.com/.../AI-SESSION-LOG.append.md` (head) | A later session's log entry ("Session 6 — mf-2"), dated "February 2026", reporting a **12-file** root tree with `index.html` at **1,920 B**, `engine.js` at 27,781 B, etc. — a different file count/byte-size than both an earlier session's report and this session's own direct read (148 files, 352 B root `index.html`). |
| 8 | `curl raw.githubusercontent.com/.../SESSION-3.patch.md` (head) | A patch-only session note (no full-file read claimed): references a root `index.html` of **251,817 bytes** that "could not be moved through this environment whole," hence patches instead of full-file edits. |
| 9 | Keyword grep of the full 148-path list (Node, in `bash`) for `talent`, `financial_os`, `regulatory`, `narrative`, `org_ode`/`orgode`, `attention_opt`, `living_docs`, `scenarios` | **No match for any term**, anywhere in the tree. |

No commit history, pull requests, issues, or GitHub code search were used beyond
the Trees API and raw-file fetches listed above. No code from the real repo was
executed. This is a read-only inspection scoped to the specific calls above.

## 2. Verified facts (first-hand, this session)

- **V1.** The repo mixes two structurally different deliveries in one tree: ~90 loose root-level files (several duplicated as both `.js` and `.ts`/`.tsx`) and a separate, coherent `src/` Vite+React+TypeScript app. (Call #2)
- **V2.** The real stack is React 19.2.6 + Vite 7.3.2 + TypeScript 5.9.3 + Tailwind 4 + `vite-plugin-singlefile`. (Call #4)
- **V3.** The live `src/App.tsx` routes to `TodayView`/`SignalBoardView`/`ThermodynamicsView`/`CasView`/`RiskView`/`AboutView` — this matches the rendered README's "Pages" table. (Call #6)
- **V4.** The root-level `index.html`, **as of this session's read**, is the 352-byte default Vite scaffold — not a large standalone demo. This **contradicts** earlier session logs' claims about the same file (1,920 B / 54,081 B / 251,817 B / 337,974 B at various other points). **Conclusion: file state in this repo is highly volatile session-to-session; a historical size/content claim is not evidence of current state**, which is exactly why this session re-verified from scratch instead of trusting any prior log, including the most recent-looking one. (Calls #5, #7, #8)
- **V5.** No file, export, or path containing any of `talent`, `financial_os`, `regulatory`, `narrative`, `org_ode`/`orgPhysics-ODE`-as-described, `attention_opt`, `living_docs`, or `scenarios` exists anywhere in the 148-file tree. (Call #9)
- **V6 (scope limit, disclosed).** This session did not fetch the full byte contents of most of the ~90 loose root-level files (e.g. `FinanceDashboard.tsx`, `PeopleDashboard.tsx`, `engine.js`, `rules.js`) — only `package.json`, `vite.config.ts`, root `index.html`, and `src/App.tsx` were read in full. Their presence is known (from the tree listing); their contents are not claimed to have been read line-by-line this session.

## 3. Conclusion drawn from the above

The task prompt's pasted "Part 4–8" brief and its closing "pt-U Implementation
Summary" (105 files, `js/talent.js`, `js/financial_os.js`, `js/regulatory.js`,
`js/narrative_intel.js`, `js/org_ode.js`, 220 rules, a `T_U_1…T_U_20` test suite)
is treated here as an **unverified specification supplied by the task prompt**,
not as a claim about what exists in `github.com/wbweve/Leados`. This is the same
convention the real repo's own prior sessions applied to their pasted "pt-L"
brief. Nothing in this delivery is presented as a copy, port, or continuation of
`github.com/wbweve/Leados`'s code. This sandbox began from the default Vite
scaffold `App.tsx` with no access to any other session's files.

## 4. Fidelity check on the pasted brief's own text

Applying the task's "inspect before claiming" instruction to the **brief itself**,
not only to GitHub:

- The brief asserts specific formulas (LTV:CAC, Rule of 40, Quick Ratio, RK4
  integration of a 5-variable ODE system, exposure-score weighting) as if they
  were pre-existing, tested behavior from a 105-file system. These are
  implemented here as **fresh, original TypeScript that satisfies the described
  behavior** — not a port of verified prior logic (none exists to port).
- The brief's own ODE formulas were hand-checked (see `src/components/AboutView.tsx`
  and `src/lib/selfTest.ts` ST-05/06/07): there is **no exact all-variables-zero
  fixed point** for generic states in the given derivative equations (e.g. `dC`
  never references `C`, and the pulls toward 5 vs. 8 for different variables are
  mutually inconsistent at the extremes checked). This is a mechanical property
  of the pasted formulas, disclosed rather than silently "fixed" or glossed over.
- The brief's `T_U_1…T_U_20` test names/bodies could not be verified anywhere
  and mostly depend on modules not pasted into this session (simulated annealing,
  scenario federation, living docs). Rather than inventing test bodies under
  those exact names, `src/lib/selfTest.ts` implements a freshly-named ST-01…ST-13
  suite that checks this build's own formulas.

## 5. Original work in this delivery (not claimed as verified spec or repo code)

- `src/lib/seed.ts` — fabricated roster (10 people) and event log across all five
  domains, deterministic via a seeded PRNG (`src/lib/prng.ts`), regenerable from
  the UI.
- `src/lib/talent.ts`, `financialOS.ts`, `regulatory.ts`, `narrativeIntel.ts`,
  `orgODE.ts`, `engine.ts`, `selfTest.ts`, `store.ts`, `types.ts`,
  `useHashRoute.ts` — all original TypeScript for this delivery.
- All UI (`Shell`, `ui.tsx`, and the seven route views) — original.
- Storage key `leados-ptU:v1` — new key; no other session's key is continued.

## 6. Disclosed gaps

- **Rules R206, R207, R220** (living strategy documents) and **R216**
  (simulated-annealing attention optimizer) are **not implemented**. Their
  dependencies are only described in the pasted summary's "Parts 1–3," whose
  full code was not included in this session's pasted text. Inventing them would
  misattribute original work to an unseen external spec — the same reasoning the
  real repo's own sessions used for their own undefined dependencies (e.g.
  `scoreCulture()` for "cultural bifurcation").
- **`LEADOS.scenarios` (federated scenario planning)** is replaced by a small,
  local 3-scenario stand-in inside `financialOS.ts` (`buildMinimalScenarioSet`),
  explicitly labeled as a simplification, for the same reason.
- All people, metrics, jurisdictions, and narrative outcomes are **fabricated
  demo data** — there is no real company behind this dataset.

## 7. Scope note

Only this task's pasted "Part 4–8" text (plus the closing "pt-U Implementation
Summary") was in scope as an input spec this session. No other "pt-" part was
pasted into this conversation, so none other is reimplemented here.
