# LEADOS Sandbox — pt.3–5: OKR Synthesis · Behavioral Economics · Network Science

A single-file (`index.html`) vanilla HTML/CSS/JS + Tailwind sandbox
implementing three leadership-intelligence engines from this task's pasted
brief — an **autonomous OKR draft generator**, a **behavioral-economics bias
scanner**, and a **network-science module** (SIR epidemic spread model +
centrality analysis) — all driven by one deterministic, seeded synthetic
event log.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados` or any prior "pt-" session:** `github.com/wbweve/Leados` was inspected directly this session (file tree + commit history via GitHub's REST API, the repo's own `AI-SESSION-LOG.md`, its root `index.html`, `src/App.tsx`, and `src/lib/casEngine.ts`, all fetched and read in full) before any code here was written. Full ledger in `AI-SESSION-LOG.md`, short version below. **This build does not fork, copy, or continue that repo's code** — it's a fresh single-file sandbox, in this tool environment's own required stack (vanilla JS, no build step), implementing only the *functional ideas* of Part 3/4/5 of the pasted brief.

## What was verified vs. not, this session

- **Verified directly:** the real repo's root `index.html` is currently a 352-byte Vite entry shell (`<div id="root">` + `/src/main.tsx`) — not a hand-rolled single-file demo.
- **Verified directly:** `src/App.tsx` hash-routes to `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`, `RiskView`, `AboutView` — matching the repo's own README.
- **Verified directly:** `src/lib/casEngine.ts` is real and implements named feedback-loop/attractor detection (`BURNOUT_FEEDBACK_LOOP`, `VELOCITY_DEATH_SPIRAL`, `TALENT_VIRTUOUS_CYCLE`, `GOVERNANCE_SELF_CORRECTION`), with its own header comment disclosing it as original work, not a port of any prior verified build.
- **Noted, not fully resolved:** the repo's own `AI-SESSION-LOG.md` (written in an earlier session) describes a *different*, 54,081-byte root `index.html` containing ~60 rule-ID strings and the text "pt-L". That no longer matches what this session read. Commit history shows the repo gets overwritten wholesale across fast "Add files via upload" commits — the most likely explanation, treated here as a timeline note, not an accusation.
- **Not found anywhere in the repo, this session:** any file named `bayesian.js`, `org_simulation.js`, `okr_synth.js`, `behavioral_econ.js`, or `network_science.js` (or TS equivalents). The task's pasted "pt-S implementation summary" (these five files, event types, rules R186–R195, tests `T_S_1`–`T_S_15`) is therefore treated as an **unverified specification supplied by the task prompt**, not as repo fact — the same convention the real repo's own earlier sessions used for "pt-L"/"pt-K".

Full ledger, including every fetch URL and what each one returned: `AI-SESSION-LOG.md`.

## Run it

Open `index.html` in any browser. No build step, no network calls except the
Tailwind CDN `<script>` tag. State persists to `localStorage` under
`leados-sandbox-pt3to5:v1`.

## Tabs

| Tab | What it does |
|---|---|
| **Overview** | Findings, Bayesian beliefs, maturity-gap snapshot from the current synthetic event log. |
| **OKR Synth** | `LEADOS.okrSynth.generateOKRDraft()` — up to 4 ranked objective drafts, each with generated key results, labeled explicitly as proposals requiring human approval. |
| **Behavioral Econ** | `LEADOS.behavioralEcon.detectAll()` — all 6 bias detectors (Availability, Recency, Halo, Confirmation, Planning Fallacy, Status Quo) run against the log, each showing detected/not-detected plus its signal and implication. |
| **Network Science** | `LEADOS.networkScience.computeCentrality()` (degree/closeness/betweenness from 1:1 + conflict events) and `modelSpread()` (SIR epidemic model for a sample behavior, charted on canvas). |
| **Self-Tests** | Runs `T_S_1`–`T_S_15` live in-browser against this build's own math (Bayesian update, SIR edge cases, bias thresholds, BFS/betweenness, determinism). |
| **Event Log & Seed** | View/regenerate the deterministic synthetic event log (seeded PRNG — same seed always produces the same events). |
| **About / Provenance** | The full verification ledger, condensed, plus disclosed gaps. |

## What's adapted from the pasted brief, what's original, what's a disclosed gap

- **Adapted near-verbatim from the pasted Part 3/4/5 pseudocode** (same
  method/field names, same thresholds): `LEADOS.okrSynth.*`,
  `LEADOS.behavioralEcon.BIASES.*`, `LEADOS.networkScience.modelSpread` /
  `computeCentrality`. Rewired against this sandbox's own data model since
  the pasted brief's full upstream architecture (`engine.run`,
  `bayesian.computeAllBeliefs`, `lifeStage.computeMaturityProfile`,
  `performance.buildPerformanceChain`, `wargame.buildCompetitiveLandscape`,
  `cascade.buildInformalNetwork`) does not exist anywhere in verified form.
- **Built from scratch, disclosed as simplified stand-ins:**
  `LEADOS.engine.run()` (4 synthetic rules, not 50/144), `LEADOS.bayesian`
  (3 hypotheses), `LEADOS.lifeStage` (4 of 12 maturity dimensions),
  `LEADOS.wargame` (win-reason tally only), `LEADOS.agentStub` (a 2-line
  stub only sufficient to make T_S_5/T_S_6 checkable — **not** the full
  multi-agent `org_simulation.js` engine named in the pasted "pt-S" brief).
- **A gap, left as a gap:** no population-level Monte Carlo organizational
  simulation. No literal R186–R195 rule table (the underlying logic for
  R186/R189/R190/R191/R192 exists conceptually in the findings engine and
  bias scanner, but isn't wired as numbered rules). CAS engine / Risk
  Register / Thermodynamics from earlier, unrelated parts of this lineage
  are out of scope for this delivery (the user asked for Parts 3–5 only).
- **All UI, the synthetic roster/event generator, the seeded PRNG, and the
  self-test suite:** original to this delivery.

## Changelog

- **Inspected `github.com/wbweve/Leados` first** — via GitHub's REST API (tree, commits, contents) and direct raw-file reads of `index.html`, `AI-SESSION-LOG.md`, `src/App.tsx`, `src/lib/casEngine.ts` — before writing any code. *Why:* the task requires inspecting actual code, not trusting the README's self-framing or the task prompt's pasted "pt-S" summary at face value.
- **Found the real repo's root `index.html` no longer matches its own `AI-SESSION-LOG.md`'s description of it**, and traced this to a fast sequence of "Add files via upload" commits rather than asserting a flat contradiction. *Why:* the instruction to "inspect the actual code" cuts both ways — it also means not over-claiming a gotcha when a timeline explanation is more defensible.
- **Declared the pasted "pt-S" implementation summary an unverified specification, not repo fact.** *Why:* no string match for its five named files, event types, or `T_S_*` test IDs was found in anything fetched this session.
- **Built as a single hand-authored `index.html` (vanilla JS) instead of attempting to extend the real repo's React+Vite+TypeScript app.** *Why:* this tool environment's required output is a single-file HTML/CSS/JS artifact with no build step — incompatible with the real repo's actual stack. Presenting this as a continuation of that codebase would misstate the environment.
- **Kept the pasted brief's exact method/field names for `okrSynth`, `behavioralEcon`, and `networkScience`** (e.g. `_beliefToObjective`, `BIASES.HALO`, `modelSpread`). *Why:* lets the brief's own named scenarios be explored directly without claiming they came from a verified prior implementation — same reasoning the real repo's own prior sessions used for reusing specific rule IDs.
- **Added a deterministic seeded PRNG (`mulberry32`) for the synthetic event log.** *Why:* several of the user's own requested self-tests (T_S_4, T_S_13) specifically assert "same seed → same results," which is only meaningfully checkable if generation is actually deterministic, not just visually similar.
- **Did not implement a full multi-agent `org_simulation.js` engine; added a 6-line `agentStub` instead.** *Why:* the pasted "pt-S" summary names this as a whole separate module with seeded Monte Carlo runs across a population of agents — building that honestly (not as a decorative stub) was out of scope for this pass; said so explicitly rather than shipping a fake version under a real-sounding name.
- **Limited `lifeStage` to 4 of the pasted brief's 12 maturity dimensions and `engine.run()` to 4 synthetic rules.** *Why:* reproducing the full 12-dimension / 50+-rule catalogs from earlier, unrelated parts of this lineage was out of scope for a Part 3–5-only request; a narrower but fully-wired set keeps the OKR/bias/network engines genuinely data-driven instead of hard-coded.
- **Used a new storage key (`leados-sandbox-pt3to5:v1`).** *Why:* this is a new, unrelated sandbox build; reusing another session's key would imply a shared history that doesn't exist here.
