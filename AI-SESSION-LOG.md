# AI Session Log — LeadOS pt-L (Organizational Thermodynamics)

This log records what was actually checked against `github.com/wbweve/Leados` this session, via which calls, what
was found, and what in the delivered app is original work vs. a disclosed heuristic. It follows the same
verified / contradicted / original ledger format established by this app's own in-UI "About / Provenance" view.

## 1. What was fetched, and how

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET https://github.com/wbweve/Leados` (rendered README) | Initial orientation — treated as a claim to verify, not a fact. |
| 2 | `GET /repos/wbweve/Leados` (REST API) | Repo metadata: default branch `main`, language TypeScript, size 7442 KB, last pushed 2026-10-17. |
| 3 | `GET /repos/wbweve/Leados/git/trees/main?recursive=1` | Full recursive file tree (response was long; see §2). |
| 4 | `GET /repos/wbweve/Leados/contents/` | Root directory listing. |
| 5 | `GET /repos/wbweve/Leados/contents/src` | `src/` directory listing. |
| 6 | `GET /repos/wbweve/Leados/contents/src/lib` | `src/lib/` directory listing. |
| 7 | `GET /repos/wbweve/Leados/contents/index.html` (base64 decoded) | Root `index.html` content. |
| 8 | `GET raw.githubusercontent.com/.../src/App.tsx` | The file Vite would actually build from. |
| 9 | `GET raw.githubusercontent.com/.../src/lib/core.ts` | Checked exports against what `intelligence.ts` imports. |
| 10 | `GET raw.githubusercontent.com/.../src/lib/intelligence.ts` | Checked for `LEADOS.infoTheory`/thermodynamics content and import correctness. |
| 11 | `GET /search/code?q=repo:wbweve/Leados+LEADOS` and `...+shannonEntropy` | **Failed** (API error — likely requires authenticated code-search scope in this environment). Not used as evidence either way; superseded by direct file reads (#7–10) and directory listings (#4–6). |

No commit history, pull requests, or issues were inspected. No code from the repo was executed. This is a
read-only, API-based inspection, not a full line-by-line audit of all ~88 tree entries — claims below are scoped
to what was actually fetched and read.

## 2. Verified facts (checked directly, this session)

- **V1.** Repo root contains at least 45 loose `.tsx`/`.md` files with no shared folder, including duplicate
  "concept" names that also appear differently-shaped inside `src/` (e.g. root `AboutView.tsx` vs.
  `src/components/AboutView.tsx` referenced from `src/App.tsx`). Confirmed via call #4.
- **V2.** A separate, complete `src/` Vite+React+TypeScript tree exists: `src/App.tsx`, `src/main.tsx`,
  `src/index.css`, `src/components/`, `src/lib/`, `src/utils/`. Confirmed via calls #3 and #5.
- **V3.** `src/App.tsx` imports only from `./components/{Shell,TodayView,DecisionsView,EnergyView,
  MemoryGenomeView,AccessibilityView,LogView,AboutView}` and `./lib/{storage,circadian,fatigue,workers,types}`.
  It does **not** import `./lib/core`, `./lib/intelligence`, or `./lib/physics`. Confirmed via call #8 (full file
  read).
- **V4.** `src/lib/` contains (per call #6) at least: `a11y.ts`, `aesthetics.ts`, `circadian.ts`, `core.ts`,
  `cssolver.ts`, `familiarity.ts`, `fatigue.ts`, `genome.ts`, `health.ts`, `intelligence.ts`, `memory.ts`, and more
  not individually enumerated in this log (listing was long; stopped once V3/V5 were established).
- **V5.** `src/lib/intelligence.ts` contains the line `import { engine, run } from "./core";` and uses
  `engine.iso`, `engine._days`, `run(P, today)` throughout. The `src/lib/core.ts` fetched in call #9 exports:
  `DOMAINS, DomainKey, DECAY, CORRELATION_WINDOW_DAYS, DECISION_MAX_OPEN_DAYS, STORAGE_KEY, FAMILIARITY_KEY,
  FAMILIARITY_NOTIFIED_KEY, Severity, SEVERITY_WEIGHT, FindingEvent, DecisionEvent, SynthesisEvent, AnyEvent, Meta,
  StoreState, loadState, saveState, nextId, appendEvent, seedIfEmpty, ProjectedFinding, ProjectedDomainScore,
  ProjectedDecision, Projection, project` — no `engine`, no `run`. **This import would not resolve** against the
  file actually at that path. This is a concrete, checkable inconsistency, not an inference.
- **V6.** `src/lib/intelligence.ts` itself contains a disclosure comment (written by a prior session, not this
  one) stating that `LEADOS.temporalField`, `LEADOS.correlate`, `LEADOS.simulate`, `LEADOS.predict`,
  `LEADOS.leaderSelf`, and `LEADOS.calibration` were searched for in the real repo and not found — i.e. that
  entire file self-identifies as a disclosed fabrication from an earlier part of this series, built to run the
  pasted brief for that part, not as code mirroring the real repo.
- **V7.** `src/lib/core.ts` contains its own provenance comment stating that `DOMAINS`, `DECAY`,
  `CORRELATION_WINDOW_DAYS`, `DECISION_MAX_OPEN_DAYS`, and the storage key name were "copied from values
  independently confirmed... by downloading the real file ...index.html with curl and grepping it directly", and
  that everything else in the file is an original reimplementation. (This claim about an even-earlier session's
  methodology is reported here as-is; it was not re-verified by this session beyond confirming the comment exists
  in the fetched file.)
- **V8.** Root `index.html` (call #7) is a minimal Vite entry (`<div id="root">` + `<script type="module"
  src="/src/main.tsx">`), titled "LeadOS Lite — Circadian, Fatigue & Monte Carlo Decision Support" — consistent
  with `src/App.tsx` actually being the live entry point, not the root-level loose files.
- **V9.** No string match for `infoTheory`, `shannonEntropy`, `mutualInformation`, `LEADOS.infoTheory`, or
  `thermodynamics` was found in any of the files read in calls #7–10, nor in the directory listings from calls
  #4–6 (no file name suggests it either, e.g. no `infoTheory.ts`, `thermodynamics.ts`, `entropy.ts`).

## 3. Contradicted / unverifiable claims

- **C1.** The repo's rendered README (call #1) describes `src/` as *the* project structure without mentioning the
  root-level duplicate files at all in its headline description — the contradiction is only visible by directly
  listing the repo root (call #4), which this session did rather than trusting the README's framing alone. (The
  README's own "Provenance note" section, lower down, does separately disclose this; the initial top-level
  description does not.)
- **C2.** The pt-L task prompt's pasted `LEADOS.infoTheory` code block implies it is part of "the LeadOS event
  log" / "`#/intelligence`" — i.e. implies existing, shipped functionality. Per V9, no evidence of this was found
  anywhere in the real repo. Treated as an **unverified specification** supplied by the task, not as a fact about
  the repository.
- **C3.** GitHub code search (call #11) could not be used to double-check V9 negatively (a search returning zero
  results is weaker evidence than a search succeeding and returning zero) — V9 instead rests on direct file reads
  and directory listings, which is why V9 is scoped to "the files read in calls #7–10" rather than "the entire
  repository."

## 4. Original work in this delivery (not claimed as verified repo code)

- `src/lib/types.ts`, `src/lib/seed.ts`, `src/lib/prng.ts`, `src/lib/store.ts` — original data model, seeded
  synthetic event generator, and localStorage persistence for this sandbox.
- `src/lib/engine.ts` (`LEADOS.engine`) — original 6-rule findings engine, built because `signalToNoise()` in the
  pt-L brief requires one and none was found in the real repo (V9).
- `src/lib/infoTheory.ts` (`LEADOS.infoTheory`) — original TypeScript implementation of the brief's pasted
  `shannonEntropy`, `mutualInformation`, `identifyBottlenecks`, `signalToNoise`, adapted to this app's own
  `Projection`/`OrgEvent` types. The Shannon entropy formula itself is standard, real information theory; the
  interpretation bands, the mutual-information approximation, and the SNR framing are disclosed heuristics,
  labeled in both code comments and the rendered UI.
- All UI components (`Shell`, `ui`, `TodayView`, `IntelligenceView`, `Thermodynamics`, `PeopleView`,
  `EventLogView`, `AboutView`) and the hash router (`useHashRoute`) — original to this sandbox.
- Roster names, event titles, and all synthetic data — fabricated demo content, disclosed as such in-app (About
  view) and here.

## 5. Scope note

Only Part 1 of the pt-L brief ("THE INFORMATION THEORETIC ENGINE") was supplied in the task prompt for this
delivery; Parts referenced by section numbering elsewhere (e.g. "Section 2/3") were not pasted into this task and
are therefore not implemented. Nothing beyond `LEADOS.infoTheory` and its supporting `LEADOS.engine` was built.
