# AI Session Log — Leados Sandbox (single-file build)

This log records what was actually fetched from `github.com/wbweve/Leados`
this session, via which calls, what was found, and what in this delivery is
original, modeled-on-a-verified-pattern, or a disclosed gap/limitation.

## 1. What was fetched, and how (this session)

| # | Call | Purpose / result |
|---|------|-------------------|
| 1 | `web_fetch https://github.com/wbweve/Leados` (rendered repo page) | Initial orientation. Returned a README containing an elaborate provenance narrative (prior "sessions", a "pt-L" brief, verification tables with specific byte counts and call numbers). **Treated as a claim to verify, not as fact**, per the task's own instruction. |
| 2 | `web_fetch https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1` | Recursive tree (response truncated by this tool's own output-length limit, not by GitHub). Showed dozens of loose root-level `.tsx`/`.md` files (App.tsx, AboutView.tsx, Catalog.tsx, FinanceDashboard.tsx, SESSION-3.patch.md, …). |
| 3 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/README.md` and `.../AI-SESSION-LOG.md` | Full raw text of both files. Both contain a detailed first-person "session" narrative citing specific GitHub API calls, byte counts, and verified/unverified findings about the repo's own structure. |
| 4 | `web_fetch https://api.github.com/repos/wbweve/Leados/contents/` | Non-recursive root listing (also truncated by tool output limits, but confirmed root is a flat file list — not a `src/`-only layout). |
| 5 | `web_fetch https://api.github.com/repos/wbweve/Leados/contents/src` | **Verified directly:** `src/` contains `App.tsx`, `components/` (dir), `index.css`, `lib/` (dir), `main.tsx`, `utils/` (dir) — i.e. a genuine Vite+React+TS app layout exists. |
| 6 | `web_fetch https://api.github.com/repos/wbweve/Leados/contents/index.html` | **Verified directly:** root `index.html` is 352 bytes, base64-decodes to a stock Vite scaffold: `<div id="root"></div><script type="module" src="/src/main.tsx"></script>`. |
| 7 | `web_fetch https://api.github.com/repos/wbweve/Leados/contents/src/lib` | **Verified directly:** confirms `casEngine.ts` (6,628 bytes) exists in `src/lib`, alongside `core.ts`, `engine.ts`, `a11y.ts`, `aesthetics.ts`, `circadian.ts`, `cssolver.ts`, `familiarity.ts`, `fatigue.ts`, `genome.ts`, `health.ts`, and others (list was long; not every file's contents were read). |
| 8 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/src/App.tsx` | **Verified directly:** imports `Shell`, `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`, `RiskView`, `AboutView` from `./components/*`, `useHashRoute` from `./lib/useHashRoute`, and `loadState` from `./lib/store`. This is a live, wired Signal Board / Thermodynamics / CAS / Risk app. |
| 9 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/src/lib/infoTheory.ts` | **Verified directly:** implements `shannonEntropy`, `mutualInformation`, `signalToNoise`, `identifyBottlenecks` with real formulas (Shannon-entropy of event-type distribution, weekly-binned mutual information, a disclosed 30%-of-mean bottleneck threshold). The file's own header comment cites "AI-SESSION-LOG.md §2, V6–V8" as its source of truth for the real repo's prior state — i.e. the repo's internal documents cross-reference each other recursively. |
| 10 | `web_fetch https://api.github.com/repos/wbweve/Leados/commits?path=index.html` | Returned a long list of commits, all titled "Add files via upload" (GitHub web-UI bulk upload pattern), spanning Oct 16–17 2026. The API's path filter did not appear to narrow results meaningfully; full history walk to find when/if `index.html` was ever 54KB was **not completed** (scope/budget limit, disclosed below). |

No commit was checked out, no code from the real repo was executed, and no
GitHub code search was used. This is a read-only, API/raw-file inspection
scoped to the calls above.

## 2. Verified facts (first-hand, this session)

- **V1.** The repo root contains a flat set of ~40 loose `.tsx`/`.md` files
  *and* a separate `src/` Vite+React+TypeScript tree. (Calls #2, #4, #5)
- **V2.** `src/App.tsx` → `components/{TodayView, SignalBoardView,
  ThermodynamicsView, CasView, RiskView, AboutView}` is a real, live route
  tree. (Call #8)
- **V3.** `src/lib/infoTheory.ts` is real and implements Shannon entropy,
  mutual information, SNR, and a bottleneck rule. (Call #9)
- **V4.** `src/lib/casEngine.ts` exists (6,628 bytes) in the current
  `src/lib` listing. (Call #7) — this directly **contradicts** the fetched
  README/log text's claim that no CAS engine could be found "anywhere in
  the real repo" as of *their* session; the simplest explanation is that
  those documents describe an earlier state of the repo, before `casEngine.ts`
  was added, and were not re-verified against the current tree before being
  presented as current fact. This is flagged, not silently resolved.
- **V5 — contradiction, unresolved.** The repo's own `AI-SESSION-LOG.md`
  claims a `curl` of the root `index.html` returned 54,081 bytes containing
  `identifyAttractors()`, ~61 `R*` rule IDs, and the string `pt-L`. This
  session's own direct fetch of the same URL (call #6) returned exactly 352
  bytes — a stock Vite scaffold containing none of that text. **Both cannot
  be true of the same file state.** Not resolved via full commit-history
  walk (out of scope/budget this session). Reported as an open discrepancy.
- **V6 (scope limit, disclosed).** Most of `src/lib`'s 20+ files
  (`core.ts`, `intelligence.ts`, `physics.ts`, `monteCarlo.ts`, `health.ts`,
  etc.) were listed by name but not fetched and read this session. Any
  claim about their internal correctness or wiring is **not verified** here
  and is not made.
- **V7.** This conversation was given no "pt-L implementation summary" text
  to compare against — unlike the scenario the real repo's own README
  describes for *its* session. Any resemblance between this build's rule
  concepts (burnout, austerity trap, trust collapse) and that referenced
  brief is coincidental/generic, not a reproduction of a seen document.

## 3. Conclusion drawn from the above

The real `github.com/wbweve/Leados` repo does contain a genuine, live
React+Vite+TypeScript app with a working Thermodynamics (info-theory) module
and, as of this session's listing, files named consistently with a CAS
engine and risk-intelligence layer (not read in full). Its own self-authored
documentation is **partially unreliable**: at least one specific, checkable
claim in `AI-SESSION-LOG.md` (the root `index.html` byte count and content)
does not match what this session verified directly. The practical
instruction this produces for any future session: **re-verify specific
factual claims in that repo's own docs directly; do not propagate them
on the strength of their confident, detailed-sounding phrasing alone.**

## 4. Environment constraint that shaped this delivery

This task's tool environment requires a single `index.html` file using
Tailwind CSS (CDN) and inline `<script>` JavaScript — no build step, no
Node/npm, no React. This is incompatible with literally continuing the real
repo's `src/App.tsx` Vite entry point. **Disclosed explicitly:** this
delivery is therefore a fresh, hand-authored single-file implementation of
the same functional ideas (Signal Board, Thermodynamics, CAS engine, Risk
Register), not a build output or port of the real repo's React tree.

## 5. Original work in this delivery

- 50-rule synthetic catalog (`R1`–`R50`) across 8 categories — original
  titles and category assignments, not sourced from any external list.
- Synthetic 6-person roster and a deterministic (mulberry32-seeded) event
  log generator.
- `shannonEntropy`, `mutualInformation`, `signalToNoise`,
  `identifyBottlenecks` — original code implementing standard, public-domain
  Shannon (1948) formulas; not copied from `src/lib/infoTheory.ts` (that
  file's internals were read but not transcribed).
- `identifyFeedbackLoops`, `identifyBifurcations`, `identifyAttractors` —
  original loop/threshold definitions (Workload Amplification Loop, Burnout
  Spiral, Austerity Trap, Trust Collapse Loop; runway/severity/category
  thresholds), not a port of any verified prior implementation.
- `buildRiskRegister`, `crossCategoryAmplification` — original.
- `runSelfTests()` — original self-test suite checking this build's own
  formulas/rules, under original test names (not an attempt to reproduce
  any `T_L_*`/`G_L_*`-style naming referenced in the real repo's docs, since
  that naming's actual content was never verified or supplied here).
- All UI/markup in `index.html` — original.
- Storage key `leados-singlefile:v1` — new key; no continuity with any
  other session's key is claimed.

## 6. Scope note

Only `github.com/wbweve/Leados` and its own linked files were in scope for
inspection this session. No other "pt-" labelled document was supplied in
this conversation, so none is reproduced or claimed as a source here.
