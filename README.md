# LEADOS — pt-O sandbox: Org Design, Stakeholders, Real Options, Exec Presence, Innovation Portfolio, Change Management

A single-file `index.html` (vanilla HTML/CSS/JS + Tailwind CDN, zero build step, zero
network calls after load) implementing the *functional ideas* of a pasted "Part 2–7"
specification: an organizational-design simulator, a game-theoretic stakeholder
intelligence map, a real-options valuation engine, an executive-presence tracker, a
three-horizons innovation portfolio analyzer, and ADKAR/Kotter change-management
assessments — all driven by one synthetic 54-person roster and ~70 synthetic events.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados` or
> any prior "pt-N" session:** `github.com/wbweve/Leados` was inspected directly this
> session (file tree via GitHub's REST API, the repo's own root `README.md` and
> `AI-SESSION-LOG.md` fetched and read in full). Short version:
>
> - The real repo is a prior session's own delivery — a React+Vite+Tailwind app
>   ("Thermodynamics, CAS Engine, Risk Intelligence") plus a separate set of loose
>   root-level files. Its own README/log already disclose that an even earlier pasted
>   "pt-L" brief was *not* found anywhere in the real app and was treated as an
>   unverified specification, not repo fact.
> - **Nothing found anywhere in the real repo, this session:** `orgDesign`,
>   `stakeholders`, `realOptions`, `executivePresence`, `innovationPortfolio`,
>   `changeManagement`, `wargame`, `competitive_intel`, or any `R145`–`R160` rule
>   catalog. This task's pasted "Part 2–7 / pt-O" spec is therefore treated here the
>   same way the real repo's own prior session treated its "pt-L" spec: as an
>   **unverified specification supplied by the task prompt**, not a fact about
>   `github.com/wbweve/Leados`.
> - This tool environment's required deliverable is a single hand-authored
>   `index.html` (not React/Vite, unlike the real repo's own prior session). No code
>   is shared with the real repo's `src/` tree or root `index.html`.
>
> Full ledger in `AI-SESSION-LOG.md` and in-app at **About / Provenance**.

## Run it

Open `index.html` in a browser. No install, no build, no server. State is in-memory
synthetic data regenerated on every load (no `localStorage` dependency, unlike the
real repo's prior session — disclosed as a deliberate simplification for this
sandbox, see Changelog).

## Tabs

| Tab | What it does |
|---|---|
| Today | Org snapshot + a combined findings feed (org-design problems + rules R145/R151/R158). |
| Org Design | `modelCurrentStructure()` (span of control, depth, centralization, conflict rate) + a 4-option restructure simulator with a readiness gate. |
| Stakeholders | Influence map, Power×Alignment quadrants (with a disclosed classification gap shown live), coalition strength, and a per-target influence-strategy generator. |
| Real Options | Black-Scholes-Merton-adapted `valueOfWaiting`/`valueOfAbandonment` calculators (sample numbers) plus all initiatives scored and ranked as real options. |
| Exec Presence | Six behavioral-proxy indicators (clarity, credibility, conviction, composure, communication, development), a disclosed scale-mixing bug in the composite score, and a generated development plan. |
| Innovation Portfolio | Three-Horizons classification of initiatives/experiments, 70/20/10 benchmark comparison, and a portfolio diagnosis. |
| Change Mgmt | ADKAR assessment (bottleneck + interventions) and a Kotter 8-Step assessment (only 3 of 8 steps are actually modeled — disclosed). |
| Wargame (stub) | Competitive landscape (blue/red/green teams) and a scripted scenario log — explicitly an **original stub**, since no source for `wargame.js`/`competitive_intel.js` was pasted into this task. |
| Self-Test | Runs ~18 structural/unit assertions modeled on the pasted spec's `T_O_*`/`G_O_*` Health Wall IDs; shows real pass/fail, including one intentional, explained FAIL. |
| About / Provenance | Full verification ledger + list of bugs/gaps found by inspecting the pasted spec's own text. |

## What's verified, what's original, what's a disclosed gap

- **Verified this session (about the real GitHub repo):** see the Provenance block
  above and `AI-SESSION-LOG.md`. Scope limit disclosed: the real repo's root
  `index.html` is a client-rendered SPA; this session did not re-fetch/re-verify its
  full byte content beyond what the repo's own `AI-SESSION-LOG.md` already documented.
- **Treated as unverified input, not repo fact:** the entire pasted "Part 2–7 / pt-O"
  specification (all six fully-specified modules, the `wargame`/`competitive_intel`
  module names, R145–R160, and the `T_O_*`/`G_O_*` test IDs).
- **Original code for this delivery:** the synthetic 54-person roster and ~70-event
  log, the UI, the self-test runner, the `wargame` stub, the R145/R151/R158 rule
  implementations (only these three had concrete enough logic in the pasted Health
  Wall section to implement), and `LEADOS.engine.run()` (never defined in the pasted
  spec — it's referenced throughout but its own implementation was never pasted; this
  session wrote an original one that folds org-design problems and the three rules
  into a single findings feed).
- **Disclosed bugs found by inspecting the pasted spec's own text** (per the task's
  instruction to inspect actual code before claiming anything — applied here to the
  spec itself, not only to the GitHub repo):
  1. **Stakeholder quadrants** leave `alignment === 3 & influence ≥ 4` unclassified by
     all four quadrant definitions as literally written. Demonstrated live (Industry
     Regulator stakeholder) rather than silently patched.
  2. **`valueOfAbandonment()`** calls `valueOfWaiting()` and reads its call-side
     `optionValue`; `valueOfWaiting()` computes a `putValue` internally but never
     returns it. The pasted abandonment-option number is therefore mislabeled
     call-option math, not a true put-based abandonment value.
  3. **Executive presence composite** averages a 1–5 clarity score directly against
     four 0–1-scaled scores with no normalization, which can distort the composite.
     We compute both the as-specified raw value and a normalized one.
  4. **Kotter 8-Step**: only steps 1–3 have any logic in the pasted code (a comment
     says steps 4–8 are "further checks," with no body); `progress` still divides by
     8 and `currentStep` defaults to 8 ("fully done") once steps 1–3 pass — silently
     implying 4–8 completed when they were never modeled.
  5. **`analyzePortfolio()`** computes `roadmapItems` from `product.roadmap.item`
     events but never uses that variable in the horizon-classification loop (dead
     code in the pasted spec).
  6. **`wargame.js`/`competitive_intel.js`**: named in the module list and referenced
     by three test IDs, but no source was pasted this session. Implemented as a
     disclosed, original stub only — not a verified implementation.
  7. **R145–R160**: most have only a one-line description in the pasted
     "IMPLEMENTATION SUMMARY," with no executable logic given. Only R145, R151, and
     R158 had concrete-enough descriptions (in the Health Wall `G_O_6`/`G_O_7`/`G_O_10`
     rows) to implement; the rest are listed, not executable, in the in-app Rules
     catalog (`About` tab).

## Project structure

Everything lives in one file, `index.html`:
```
<style>                      — small Tailwind-complementary CSS
<script>
  utils                      — fmt/pct helpers, event id/ts helpers
  buildSeed()                — synthetic 54-person roster + ~70-event log
  LEADOS.engine              — _days(), run() [original — not in pasted spec]
  LEADOS.orgDesign           — transcribed from the pasted spec, adapted to run
  LEADOS.stakeholders        — transcribed from the pasted spec
  LEADOS.realOptions         — transcribed from the pasted spec (bug disclosed above)
  LEADOS.executivePresence   — transcribed from the pasted spec (bug disclosed above)
  LEADOS.innovationPortfolio — transcribed from the pasted spec
  LEADOS.changeManagement    — transcribed from the pasted spec (gap disclosed above)
  LEADOS.wargame             — ORIGINAL STUB (no source pasted this session)
  LEADOS.rulesCatalog        — R145-R160 listing, 3 executable / 13 defined-only
  runSelfTests()             — ~18 T_O_*/G_O_* style assertions
  render() + per-tab view fns
</script>
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first** (REST API tree, root `README.md`,
  root `AI-SESSION-LOG.md`) before writing any code — *why*: the task requires
  inspecting actual code, not trusting either the README's self-framing or this
  task's own pasted spec at face value.
- **Declared the pasted "Part 2–7 / pt-O" spec an unverified specification, not repo
  fact** — *why*: nothing fetched this session (tree listing, README, session log)
  contains any of its named modules, file counts, or test IDs, and the real repo's
  own prior session already established this exact convention for its own pasted
  brief ("pt-L").
- **Built as a single hand-authored `index.html`** instead of matching the real
  repo's React+Vite tool environment — *why*: this task's own tool environment
  requires a single `index.html`; presenting a React scaffold here would misstate the
  environment. No functionality is lost — Tailwind CDN + vanilla JS covers every
  interaction needed.
- **Folded org-design structural problems into `LEADOS.engine.run()`'s findings
  feed, alongside rules R145/R151/R158** — *why*: the pasted spec references
  `LEADOS.engine.run()` constantly (e.g. inside `_assessRestructureReadiness` and
  `assessKotter`) but never defines it. An empty/stub `run()` would make the
  restructure-readiness gate and Kotter urgency step permanently trivial
  (always "ready", always "no urgency"). Folding in real computed problems makes
  those two features demonstrate actual behavior instead of silently no-op'ing.
- **Used a fixed synthetic "today" (`2026-06-15`) and deterministic event timestamps
  (`daysAgo(n)`) instead of `Date.now()`** — *why*: makes every self-test and every
  on-screen number reproducible across reloads, which matters more here than
  simulating a "live" clock.
- **Deliberately left one self-test failing (quadrant-sum invariant) instead of
  adjusting seed data to force a pass** — *why*: the failure reveals a real
  boundary gap in the pasted spec's own quadrant thresholds; silently avoiding it
  in the seed data would hide a genuine finding rather than disclose it.
- **Implemented only R145, R151, R158 out of R145–R160, and labeled the rest
  `DEFINED_ONLY`** — *why*: only those three have concrete, worked descriptions in
  the pasted Health Wall section (`G_O_6`, `G_O_7`, `G_O_10`); inventing executable
  logic for the other thirteen from a one-line bullet each would misattribute
  original guesswork to the pasted spec.
- **Built `LEADOS.wargame` as an explicitly labeled stub** — *why*: no source was
  pasted for `wargame.js`/`competitive_intel.js` this session (only file names and
  two test IDs describing their return shape); inventing a full wargame engine would
  overstate what was actually specified.
- **Kept the `valueOfAbandonment()` / executive-presence composite / Kotter 8-step
  bugs exactly as pasted, rather than silently fixing them** — *why*: this task asks
  to inspect code before claiming things about it; quietly "fixing" a spec bug while
  presenting output as if it matched the spec would misrepresent both the spec and
  the output. Each is flagged in-app and here instead.
