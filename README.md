# LEADOS — Part 2 + 3: Complex Adaptive Systems Engine &amp; Risk Intelligence

A single-file (`index.html`) demo implementing two modules pasted into this
task's prompt:

- **`LEADOS.cas`** — models the organization as a Complex Adaptive System:
  feedback loops, bifurcation points, attractors.
- **`LEADOS.riskIntelligence`** — an 8-category risk register with
  cross-category "amplification" detection (Austerity Trap, Trust Collapse,
  Execution-Strategy Gap).

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> that repository was inspected this session via GitHub's REST API (file tree)
> and by reading its own `AI-SESSION-LOG.md` directly. It is a separate
> Vite+React+TypeScript project; its live entry point (`src/App.tsx`) imports
> none of `core.ts`/`intelligence.ts`/`physics.ts`, and no file in its tree
> matches `LEADOS.cas`, `LEADOS.riskIntelligence`, or any `R1`–`R132` rule ID
> (see verification scope and caveats in `AI-SESSION-LOG.md`). **This app does
> not fork, copy, or continue that repo's code or its prior "pt-L" session.**
> It is a fresh build, forced into a single `index.html` + Tailwind-CDN +
> vanilla-JS shape by this task's own tool environment (no build step
> available here), implementing only the Part 2/3 brief pasted into this
> conversation. Full ledger: `AI-SESSION-LOG.md`, and in-app at **About /
> Provenance**.

## Run it

Open `index.html` in any browser. No build step, no server, no network calls.
All state lives in `localStorage` under `leados-cas-risk:v1`.

## Pages (hash routes)

| Route | What it does |
|---|---|
| `#/` | Overview, links, headline disclosures. |
| `#/cas` | The **Signal Board** (toggle any of 60 synthetic rule IDs on/off with severity + score, link `R1`/`R4`/`R7` to a specific person), preset scenario buttons, and live **Feedback Loops**, **Bifurcation Points**, and **Attractors** panels computed by `LEADOS.cas`. |
| `#/resilience` | The **Risk Register**: 8 risk categories (Strategic, Operational, Financial, People, Governance, Market, Reputational, Resilience), overall risk score, and cross-category amplification detection, computed by `LEADOS.riskIntelligence`. |
| `#/about` | Full provenance ledger: what was checked against the real repo, why this is a standalone single-file build, and a line-by-line logic audit of the pasted spec itself (including a bug found in it — see below). |

## What's real, what's a stand-in, what's a known dead end

- **Implemented near-verbatim from the pasted brief:** `LEADOS.cas.identifyFeedbackLoops`,
  `identifyBifurcationPoints`, `identifyAttractors`, `_buildFindingHistory`;
  `LEADOS.riskIntelligence.CATEGORIES`, `buildRiskRegister`,
  `_detectCrossRiskAmplification`, `_computeOverallRisk`. Only the `P`/`today`
  plumbing was adapted to this app's own engine.
- **Built from scratch because the brief depends on them but never defines
  them:** `LEADOS.engine.run()` (a Signal-Board-driven findings generator),
  `LEADOS.finIntel.runwayStatus()`, `LEADOS.temporalField.buildTemporalProfile()`.
- **A bug in the pasted spec, found and disclosed rather than silently
  patched:** `identifyAttractors()`'s recurrence check (`h.appeared > prev.resolved`)
  compares two values that are always structurally equal, so it can **never**
  return a non-empty result, for any input. Reproducible live on `#/cas` via
  "Simulate 3 suppress/dismiss cycles" — the result stays empty on purpose,
  with the raw history shown underneath so you can see why.
- **A gap in the pasted spec, left as a gap:** a "cultural bifurcation" is
  referenced in a code comment inside `identifyBifurcationPoints()` but
  depends on a `scoreCulture()` function that's never defined anywhere in the
  brief. Not invented here.
- **Rule titles/categories for `R1`–`R132`:** the brief only gives bare rule
  IDs inside arrays (e.g. `CATEGORIES.PEOPLE.rules = ['R1','R4',...]`). The
  human-readable titles shown in the Signal Board are this delivery's own
  invented, illustrative labels — not sourced from any real rule engine.

## Project structure

Everything is in `index.html`:

```
<style>              — minimal custom CSS (Tailwind utility classes do the rest)
<script>
  RULE_CATALOG, CATEGORY_META     — synthetic rule metadata (original)
  defaultState / load/saveState   — localStorage persistence (original)
  LEADOS.engine                   — synthetic findings generator (original)
  LEADOS.finIntel                 — runway stub (original)
  LEADOS.temporalField            — unused-result stub (original)
  LEADOS.cas                      — pasted from Part 2 brief (near-verbatim)
  LEADOS.riskIntelligence         — pasted from Part 3 brief (near-verbatim)
  UI helpers, view*() functions   — hash-router + render (original)
</script>
```

## Changelog

- **Read the real repo via GitHub's REST Trees API and by reading its own
  `AI-SESSION-LOG.md` directly, before writing any code** — *why*: the task
  requires inspecting actual code, not trusting a README's framing of itself,
  and not trusting this task's own prompt-pasted code at face value either.
- **Declared the Part 2/3 code blocks an "unverified specification," not
  repo fact** — *why*: a check against the fetched tree and the repo's own
  prior session log found zero trace of `LEADOS.cas`, `LEADOS.riskIntelligence`,
  or any `R1`–`R132` rule ID; disclosed as a non-exhaustive check (see
  `AI-SESSION-LOG.md` §2, V5) rather than overclaiming a clean negative.
- **Built as one static `index.html` instead of continuing the repo's (or
  the prior session's) Vite+React+TypeScript stack** — *why*: this task's
  tool environment only supports a single-file, no-build-step delivery;
  presenting it as anything else would misstate the environment.
- **Built a synthetic, user-toggleable "Signal Board" instead of simulating
  a realistic event stream for 60 rules** — *why*: the pasted brief gives no
  rule logic, only rule IDs referenced by `LEADOS.cas`/`LEADOS.riskIntelligence`;
  direct manual control makes every downstream computation (loops,
  bifurcations, risk categories, amplifications) independently reproducible
  and auditable in the UI, rather than hidden behind an opaque generator.
- **Implemented `_buildFindingHistory`/`identifyAttractors` exactly as
  pasted, including its dead-end logic, instead of silently fixing it** —
  *why*: the entire exercise (per the task's own framing and the real repo's
  precedent) is about verifying claims and labeling what's broken, not about
  quietly producing a "nicer" result than the source specifies.
- **Left the "cultural bifurcation" branch unimplemented** — *why*: its
  dependency (`scoreCulture()`) was never defined in the brief; inventing a
  scoring function here would misattribute original work to the pasted spec.
- **Used a new storage key (`leados-cas-risk:v1`)** — *why*: this sandbox
  began with no `index.html` at all; claiming continuity with a prior
  session's storage key would assert a shared history that doesn't exist in
  this workspace.
- **Labeled every rule title, category assignment, and stub module in the UI
  and in code comments** — *why*: matches the standard already set by the
  real repo's own README/About view and this task's instruction to label
  unverified claims.
