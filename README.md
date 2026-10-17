# LeadOS pt-M — Leadership Science, Self-Calibration, Universal Protocol, Decision Trees

A single-file HTML/CSS/JS app implementing the *functional ideas* from this
task's pasted "Part 3–6" brief: a leadership-science library, self-calibrating
rule thresholds, a BroadcastChannel-based local integration protocol (+ CLI
companion), and automated leadership decision trees — all running over a
small synthetic event log, entirely client-side.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`
> or any prior "pt-K"/"pt-L" delivery:** `github.com/wbweve/Leados` was
> inspected directly this session (GitHub's REST API file tree, the repo's own
> raw `AI-SESSION-LOG.md`, and its root `index.html` metadata) before any code
> was written. Full ledger in `AI-SESSION-LOG.md`. Short version:
>
> - The real repo mixes two deliveries: loose root-level files (including a
>   vanilla-JS `index.html` demo) and a separate, live `src/` Vite+React+TS app.
> - The repo's own prior session log confirms a real, wired `infoTheory.ts` →
>   `Thermodynamics.tsx` chain — but **explicitly states that no CAS engine,
>   risk register, or equivalent module exists anywhere in the repo.**
> - **Nothing resembling this task's pasted "Part 3–6" modules** (leadership
>   science library, self-calibration, universal protocol, decision trees,
>   `inference.js`, `autonomous.js`) was found anywhere, by this session or the
>   inherited prior one. That brief is therefore treated here as an
>   **unverified specification**, not repo fact — the same convention the real
>   repo's own prior sessions already used for the earlier "pt-L" brief.
>
> **This app does not fork, copy, or continue that unverified history.** It is
> a fresh, original build in this task's own tool environment (a single
> hand-authored `index.html`, no build step), implementing only the
> *functional ideas* in the pasted brief.

## Run it

Just open `index.html` in a browser. No build step, no dependencies beyond the
Tailwind CDN script already in the `<head>`. State lives in `localStorage`
under `leados-pt-m:v1`. Click **"Regenerate synthetic data"** to rebuild the
seeded roster/event log, or **"Reset store"** to wipe it (it will reseed on
next load).

For the CLI companion (`leados-cli.html`) to actually talk to `index.html` via
`BroadcastChannel`, serve both files from the same local origin, e.g.:

```
python3 -m http.server 8000
# then open http://localhost:8000/index.html and http://localhost:8000/leados-cli.html
```

Opening both as local `file://` documents may not work — most browsers give
each `file://` document its own opaque origin, which `BroadcastChannel`
requires to match. This limitation is disclosed in-app (Protocol & CLI tab)
and was **not** mentioned in the pasted brief.

## Tabs

| Tab | What it does |
|---|---|
| Dashboard | Roster/event counts and currently active findings from the original minimal rules engine. |
| Roster & Events | View the synthetic roster and event log; manually append new events. |
| Leadership Science | Runs each of the six `LEADOS.leadershipScience` methods live against the current data. |
| Self-Calibration | Runs `LEADOS.calibrateRules.runCalibrationReport()` (R1 cadence threshold, R4 feedback-imbalance threshold). |
| Decision Trees | Navigates `pip-decision`, `conflict-escalation`, or `initiative-kill` for a chosen person/pair/initiative. |
| Protocol & CLI | Shows `BroadcastChannel` protocol status; lets you run any READ command locally (bypassing the channel, for convenience); shows the write-command work queue. |
| Provenance / About | The verified-vs-unverified ledger above, plus the full changelog with "why" for each non-obvious decision. |

## What's original, what's a fix, what's a disclosed gap

- **Original, built from scratch** because no equivalent was found anywhere in
  the real repo: the whole leadership-science library, the self-calibration
  functions, the protocol/work-queue layer, the decision trees, the synthetic
  roster/event generator (deterministic PRNG, seed 42), and the minimal
  illustrative rules engine (`R1`, `R3`, `R4`, `R6`, `R38`, `R73`, `R79` — a
  small set invented for this delivery, **not** a port of any "58/62-file,
  144-rule" catalog, which was never found anywhere in the real repo).
- **Bugs found in the pasted brief's own pseudocode, fixed rather than copied
  verbatim:** a duplicate object key in the `initiative-kill` tree (silently
  drops the first `question` string); a self-referential `const volatility =
  volatility ? ... : 0` in `assessVUCA` that throws `ReferenceError` if run as
  written; calls to undefined globals (`LEADOS.correlate`, bare
  `backwardChain()`, `LEADOS.temporalField`). See `AI-SESSION-LOG.md` §5 for
  the full fidelity check.
- **A disclosed simplification:** `conflict-escalation.navigate` and
  `initiative-kill.navigate` were left as "same structure as
  pip-decision.navigate" in the brief with no body. This delivery uses one
  shared, generic tree-walker (`navigateTree()`) for all three trees instead
  of duplicating logic three times.
- **A disclosed limitation, not glossed over:** the Universal Protocol's
  `BroadcastChannel` transport requires same-origin tabs; it will not reliably
  connect two `file://`-opened documents. Serve over HTTP for the CLI to work.
- **Not implemented, disclosed as a gap:** `request-synthesis` (protocol write
  command) and the fuller `autonomous.js`/`ambient.js`/`predict.js` workflow
  modules referenced by the brief's `status`/`digest`/`calendar` protocol
  commands are present here only as small, honestly-labeled stand-ins, not
  full reimplementations — inventing elaborate behavior for modules whose
  real specification was never verifiable anywhere would overstate this
  delivery's scope.

## Project structure

```
index.html        — the entire app (store, synthetic data, rules engine, inference,
                     leadershipScience, calibrateRules, protocol, decisionTrees, UI)
leados-cli.html    — standalone companion CLI, talks to index.html via BroadcastChannel
AI-SESSION-LOG.md  — full first-hand research ledger for this session
README.md          — this file
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first (GitHub REST API tree, the
  repo's own raw `AI-SESSION-LOG.md`, root `index.html` metadata) before
  writing any code** — *why*: the task requires verifying actual code, not
  trusting the pasted "pt-M" brief or any README's self-framing at face value.
- **Declared the pasted "Part 3–6 / pt-M" brief an unverified specification,
  not repo fact** — *why*: no module, export, or test ID it names was found
  anywhere in the real repo, by this session or the prior session whose log
  this session read directly; the repo's own precedent for an earlier
  unverified brief ("pt-L") was to label it the same way.
- **Built one hand-authored `index.html` instead of a React/Vite app** —
  *why*: this tool environment only supports a single static HTML file; the
  real repo's own root-level vanilla-JS `index.html` is the closer precedent
  here, not its unrelated `src/` app.
- **Fixed a duplicate-key bug in `initiative-kill` and a self-referential
  undeclared-variable bug in `assessVUCA`, instead of reproducing either** —
  *why*: shipping known-broken pseudocode silently would be worse than
  disclosing and correcting it.
- **Replaced undefined-global calls (`LEADOS.correlate`, `backwardChain()`,
  `LEADOS.temporalField`) with original, labeled proxy formulas** — *why*:
  those modules don't exist in the brief or the repo; silent invented
  stand-ins would misattribute original work to an external spec.
- **Unified three decision trees under one generic `navigateTree()` walker**
  — *why*: the brief itself left two of the three `navigate()` bodies
  unspecified ("same structure as..."); a shared walker is the direct fix.
- **Generated deterministic synthetic data (seed 42) covering every branch of
  every tree and all four Radical Candor quadrants** — *why*: lets every code
  path in Parts 3–6 be demoed immediately without requiring manual data entry.
- **Disclosed the `BroadcastChannel` + `file://` origin limitation explicitly,
  in-app and in this README** — *why*: the brief asserted "zero network, same
  browser" without this caveat; it doesn't hold for two separately-opened
  local files in most browsers.
- **Did not claim to pass any `T_M_*`/`G_M_*` test ID; shipped an
  originally-named console self-check (`pt-M-01`…`pt-M-12`) instead** —
  *why*: those test bodies were never verifiable anywhere; claiming to satisfy
  them by name would misstate provenance.
