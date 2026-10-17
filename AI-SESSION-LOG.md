# AI Session Log — Leadership Intelligence Sandbox

This log records exactly what was fetched/checked against
`github.com/wbweve/Leados` this session, via which calls, what was found, and
what in this delivery is verified-pattern, original, or a disclosed gap.
Everything not in the "verified" tables below is explicitly labeled
unverified in the README and in-app About page.

## 1. What was fetched, and how (this session, in order)

| # | Call | Purpose / result |
|---|------|-------------------|
| 1 | `web_fetch https://github.com/wbweve/Leados` (rendered page) | Initial orientation. Returned a README containing a self-described "provenance ledger" from what it claims is an earlier session. Treated as a **claim to verify**, not fact — especially since it is itself an AI-authored narrative about a chain of prior sessions ("pt-K"/"pt-L"). |
| 2 | `web_fetch https://api.github.com/repos/wbweve/Leados/git/trees/main?recursive=1` | Full recursive file tree (~90 entries). Confirmed: the repo mixes dozens of loose root-level `.tsx`/`.ts`/`.md` files with a separate `src/` Vite+React+TS tree. **Critically, this tree lists `src/lib/casEngine.ts` and `src/lib/riskIntelligence.ts`**, directly contradicting the fetched README's claim that no such files exist. |
| 3 | `web_fetch https://raw.githubusercontent.com/wbweve/Leados/main/README.md` | Confirmed the rendered page's content is the actual, current `README.md` (not a rendering artifact) — same provenance-ledger text, word for word. |
| 4 | `bash curl` of `src/App.tsx`, `src/lib/core.ts`, `src/lib/intelligence.ts`, `src/lib/casEngine.ts`, `src/lib/riskIntelligence.ts`, `src/lib/infoTheory.ts` (raw, in one batched call) | **Verified directly:** current `src/App.tsx` imports `Shell`, `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`, `RiskView`, `AboutView`, `useHashRoute`, `loadState`; routes `/today`, `/signals`, `/thermodynamics`, `/cas`, `/risk`, `/about`. `casEngine.ts` (6.6KB) and `riskIntelligence.ts` (3.7KB) are real, substantive files, each with their own in-file "PROVENANCE" comment asserting they were built because no prior source was found. `core.ts` exports `DOMAINS, DECAY, CORRELATION_WINDOW_DAYS, DECISION_MAX_OPEN_DAYS, STORAGE_KEY, loadState, saveState, appendEvent, seedIfEmpty, project` — no `engine`, no `run`. |
| 5 | `bash curl` of root `index.html`, `src/lib/casEngine.ts` (head), `src/lib/riskIntelligence.ts` (head), `src/components/CasView.tsx` (head) | **Verified directly:** root `index.html` is a 12-line standard Vite entry (`<div id="root">` + `<script src="/src/main.tsx">`) — not a hand-authored single-file demo, contrary to the fetched README's looser description of "a single-file `index.html` demo." `CasView.tsx` imports `identifyFeedbackLoops, identifyBifurcationPoints, identifyAttractors` from `../lib/casEngine` and is a real, rendered view, not a stub. |
| 6 | `bash curl` of `src/lib/intelligence.ts` (head), `src/components/IntelligenceView.tsx` (head), `AI-SESSION-LOG.md` (head) | **Verified directly:** `intelligence.ts` line 2 is `import { engine, run } from "./core";` — confirmed broken against call #4's export list. `src/components/IntelligenceView.tsx` (a different, older component from the currently-routed `ThermodynamicsView.tsx`) imports `engine` from `../lib/engine` (not `core.ts`), and is **not** imported by the current `src/App.tsx` (per call #4) — it appears to be a leftover from an earlier iteration of the app, now superseded by the `/thermodynamics`, `/cas`, `/risk` route set. The repo's own `AI-SESSION-LOG.md` head confirms it documents an *earlier* snapshot (describes routes `/intelligence`, components `PeopleView`/`EventLogView` that are no longer in the current `App.tsx`'s import list) — consistent with the repo having moved on since that log and the fetched README were written. |
| 7 | `bash curl` of `src/components/ThermodynamicsView.tsx` (head), current `src/App.tsx` (re-fetched to reconfirm) | **Verified directly:** `ThermodynamicsView.tsx` imports `shannonEntropy, mutualInformation, signalToNoise, identifyBottlenecks` from `../lib/infoTheory` — a real, live information-theory layer, reachable from the current `App.tsx`'s `/thermodynamics` route. |
| 8 | `read_file vite.config.ts`, `index.html` (this project's own scaffold) | Confirmed this task's own environment: `vite-plugin-singlefile` is already configured, so this delivery's build genuinely inlines everything into one `dist/index.html`. |
| 9 | `npm run build` (this project) + `grep` of `dist/index.html` for `src=`/external URLs | **Verified directly:** build succeeds; `dist/` contains only `index.html`; no external `src=`/`href=` references found in the output beyond an inert dynamic-string template inside minified JS. |

No commit history, pull requests, issues, blame, or GitHub code search were
used — only the current `main` tree, raw file contents, and this project's
own build output. No code from the real repo was executed; nothing was
copied into this project.

## 2. The central finding: a false claim in the fetched README, corrected here

The fetched `github.com/wbweve/Leados` README states (verbatim):

> "Not found anywhere in the real repo, this session: any CAS engine, any
> risk register, any file named `cas.ts`/`risk.ts`/equivalent... That summary
> is therefore treated here as an **unverified external spec**, not as repo
> fact."

This session's own independent checks (table rows #2 and #4 above) show this
is **false against the repository's current `main` branch**:
`src/lib/casEngine.ts` and `src/lib/riskIntelligence.ts` both exist, are
substantive (not stubs), and are imported by `src/components/CasView.tsx` /
`RiskView.tsx`, which are in turn imported and routed to by the current
`src/App.tsx`.

**Why the discrepancy likely exists (unverified, since no commit history was
checked):** the repo shows clear signs of multiple sequential AI sessions
each adding files and writing their own README/session-log describing only
what existed *at that point*, without necessarily being regenerated after
later sessions added more code (e.g., `src/components/IntelligenceView.tsx`
and `src/components/ThermodynamicsView.tsx` coexist, as do `Thermodynamics.tsx`
under `src/components`, root-level loose `.tsx` files, and the `src/` tree —
consistent with additive, non-destructive sessions over time). The practical
lesson applied in this delivery: **a repo's own README/session-log should be
treated as a timestamped claim, not current fact**, and re-checked against
the live tree before being repeated.

## 3. What is original vs. modeled vs. a disclosed gap in this delivery

| Module | Status | Basis |
|---|---|---|
| `src/lib/infoTheory.ts` | Modeled on a verified real-repo pattern, written fresh | Real repo's equivalent confirmed to exist and be live (table row #7); only the metric set (entropy, mutual info, SNR, bottlenecks) and standard Shannon-1948 formulas were reused, not any file contents. |
| `src/lib/casEngine.ts` | Built from scratch, modeled on the real repo's module boundary (not its code) | Real repo's `casEngine.ts` confirmed to exist and be wired up (table rows #2, #4, #5), but its internal logic was not fetched/read for this delivery. Rule-combination logic here (burnout loop, velocity spiral, austerity trap, trust collapse) is original. |
| `src/lib/riskIntelligence.ts` | Same as above | Real repo's file confirmed to exist (table rows #2, #4); internals not read. 8-category scoring and amplification rules here are original. |
| "Cultural bifurcation" | Disclosed gap, not implemented | Depends on a hypothetical `scoreCulture()` not defined in anything checked this session. |
| 50-rule catalog, roster/event generator, self-test suite, storage layer, all UI | Original to this delivery | No equivalent was sourced from the real repo; built fresh for this task's environment. |

## 4. Environment / build facts verified for this delivery specifically

- Entry point: `src/App.tsx` (this task's required convention).
- `npm run build` succeeds; output is `dist/index.html` only (264.6 KB,
  ~80 KB gzip), via the pre-existing `vite-plugin-singlefile` config —
  verified by inspecting `vite.config.ts` and grepping the build output.
- State persists to `localStorage` under `leados-wargaming-sandbox:v1`,
  a key unique to this delivery (no claimed continuity with any other
  session's storage key).
