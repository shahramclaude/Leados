# LeadOS pt-T — Strategic Consciousness, Decision Oracle, Knowledge Graph

A single self-contained `index.html` (served at the site root by a minimal
Next.js + Drizzle + PostgreSQL scaffold — see **Why two layers?** below)
implementing three leadership-intelligence modules from this task's pasted
"pt-T" brief: a **Strategic Consciousness** synthesis engine, a real-time
**Decision Oracle**, and an **Autonomous Knowledge Graph** — all running on
synthetic, in-browser data with zero network calls and zero dependencies.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`
> or any prior "pt-"-numbered session:** the real repo was inspected directly
> this session (GitHub REST API file tree, raw-file fetches of its root
> `index.html`, `README.md`, `AI-SESSION-LOG.md`, and `src/lib/core.ts`)
> before any code was written here. Full ledger in `AI-SESSION-LOG.md`.
> Short version:
>
> - The real repo already contains **multiple, mutually-unaware prior
>   sessions** stacked on top of each other: loose root-level files
>   (including its own `index.html` and root `.tsx` files), plus a separate
>   `src/` Vite+React+TypeScript app that itself uses the storage key
>   `leados-pt-j:data`. A *different* prior session's own live README
>   (fetched directly, not assumed) describes yet another from-scratch
>   React/Vite rebuild with its own storage key, `leados-sandbox:v1`, and its
>   own disclosed gaps.
> - That same prior session's own `AI-SESSION-LOG.md` (fetched and read
>   directly) states it searched the real repo and found **no** CAS engine,
>   no risk register, and none of the "58/62-file, 144-rule, `T_L_*`/`G_L_*`"
>   history referenced by an earlier pasted brief in that lineage.
> - **Not found anywhere in the real repo, this session:** any file,
>   export, or identifier resembling "Strategic Consciousness," a
>   "Decision Oracle," an "Autonomous Knowledge Graph," 97 files, or 205
>   active rules — the specific claims in this task's pasted "pt-T"
>   implementation summary.
>
> **This delivery does not fork, copy, or continue that unverified history.**
> It is a fresh build, in this task's own tool environment, implementing
> only the *functional ideas* in the pasted brief — original code
> throughout, deliberately scoped down from the brief's claimed scale (14
> rules, not 205; 3 Bayesian hypotheses, not 5+; 10 self-tests, not 94).

## Why two layers? (Next.js scaffold + static `index.html`)

This task's tool environment requires a Next.js App Router + Drizzle +
PostgreSQL project that passes `next typegen`, `tsc`, `next build`, and a
DB-backed `/api/health` check. That is incompatible with *only* shipping a
hand-authored vanilla-JS `index.html` the way the pasted brief's lineage
does. Both constraints are satisfied honestly, without pretending one is
the other:

- `public/index.html` is the actual deliverable: one file, inline
  `<style>`/`<script>`, no imports, no build step, no network calls,
  state in `localStorage` only. Verified by inspection — there is nothing
  in it that reaches out to a server.
- `src/app/page.tsx` is a one-line server redirect to `/index.html`, so
  opening the app's root URL *is* opening that file.
- `src/app/api/health/route.ts` (unchanged from the starter scaffold) does
  a real `select 1` against PostgreSQL via Drizzle, satisfying the
  platform's healthcheck. The LeadOS app itself needs no database — all
  of its state is synthetic and client-side, consistent with every prior
  session's convention in this lineage (`localStorage`, never a server).

## Run it

Open `public/index.html` directly in a browser — that is the entire app,
with zero setup. Inside this project's dev/preview environment, visiting
`/` redirects there automatically. Use **↺ Reset synthetic data** (top
right) to regenerate the demo dataset with a new random seed.

## What's inside `index.html`

| Module | What it does |
|---|---|
| `LEADOS.engine` | 14 original detection rules (`P01–P05` people, `F01–F03` finance, `O01–O03` ops, `S01–S02` strategy, `G01` governance), each computed from the synthetic event log — not 205. |
| `LEADOS.bayesian` | Genuine odds-form Bayesian updating (`posterior_odds = prior_odds × ΠLR`) for 3 hypotheses. The *mechanism* is real Bayes; the likelihood-ratio *inputs* are disclosed, illustrative estimates, not a validated base-rate study. |
| `LEADOS.behavioralEcon` | 3 disclosed heuristic detectors: Recency, Planning Fallacy (Kahneman, Lovallo & Sibony), Status-Quo Bias (Samuelson & Zeckhauser, 1988). |
| `LEADOS.flightRisk` | Weighted composite (1:1 cadence, engagement trend, feedback recency, blocker load) per person. |
| `LEADOS.healthScore` | 100 − Σ(severity²×1.1) over active findings; trend recomputed against the event log truncated 30 days ago (a real recomputation, not a stored delta). |
| `LEADOS.consciousness` | **Strategic Consciousness.** Runs the 5 frames above, checks 3 specific cross-frame convergence patterns, derives a strategic question, a highest-leverage action, and an NLG narrative — recomputed from live data on every call. |
| `LEADOS.oracle` | **Decision Oracle.** Classifies a free-text decision (domain / stakes / reversibility), retrieves matching findings + decision history, applies named real frameworks (Radical Candor — Scott 2017; Real Options — Myers 1977; Premortem — Klein 2007; Two-Way Door — Bezos 2016), flags detected biases, runs a disclosed *directional, non–Monte-Carlo* estimate for people decisions, and synthesizes a recommendation. |
| `LEADOS.knowledgeGraph` | Builds PERSON/FINDING/DOMAIN/GOAL nodes and typed edges from the same event log; BFS neighborhood queries (visited-set guarded against cycles) rendered on an in-browser canvas; a capped non-obvious-connection search (path length ≥ 3, first 25 nodes / 40 pairs — disclosed limit). |
| `LEADOS.selfTest` | 10 original self-tests, IDs `PT-T-01…10` — not a reproduction of the pasted brief's unverified `T_T_*` suite, which could not be found or verified anywhere. Results render live on the **About** page. |

## Pages (hash routes, inside `index.html`)

| Route | What it shows |
|---|---|
| `#/today` | Health score, active findings, flight-risk summary. |
| `#/consciousness` | Strategic moment: narrative, strategic question, highest-leverage action, cross-frame insights, per-frame status. |
| `#/oracle` | Decision input → full brief (classification, evidence, frameworks, bias warnings, quick simulation, Bayesian belief, recommendation). |
| `#/knowledge-graph` | Canvas graph explorer (BFS highlight by start node + hop count) and a non-obvious-connection finder. |
| `#/about` | Full provenance ledger, self-test results, and disclosed gaps/limitations. |

## What's original, what's a disclosed gap

- **Original, built from scratch for this session:** the 14-rule engine,
  the Bayesian hypothesis set, the 3 bias detectors, flight-risk model,
  health score, Strategic Consciousness synthesis, Decision Oracle, and
  Knowledge Graph — all satisfy the *described behavior* in the pasted
  brief, not any verified prior implementation (none was found to port).
- **Deliberately scoped down, disclosed as such:** 14 rules (not 205), 3
  Bayesian hypotheses (not 5+), 10 self-tests (not 94), a capped
  25-node/40-pair non-obvious-connection search (not an unbounded graph
  mine), and a fixed-factor "Quick Simulation" heuristic in the Oracle
  (not a 50-seed Monte Carlo multi-agent simulation — no such engine
  exists in this file).
- **A gap, left as a gap:** no Web Worker, no 15-minute background
  scheduler, and no cultural-bifurcation-style undefined-dependency
  features are implemented. All of pt-T's five outputs are generated
  on-demand (button click / page load), not on a timer, so the
  "continuous background process" framing in the brief is implemented as
  "recompute live from current data, instantly," not literally
  continuous.
- **Synthetic data only:** people, events, goals are fabricated by a
  seeded PRNG at first load (and on **Reset**), deliberately skewed so
  every rule/detector has a realistic chance to fire. None of it reflects
  a real organization.

## Project structure (this delivery)

```
public/index.html        — the entire LeadOS pt-T app (single file)
src/app/page.tsx          — redirects "/" to "/index.html"
src/app/layout.tsx         — page metadata only
src/app/api/health/route.ts — DB-backed healthcheck (platform requirement, unchanged)
src/db/schema.ts             — no tables needed; app state is client-side only
AI-SESSION-LOG.md              — full inspection ledger for this session
```

## Changelog

- **Inspected `github.com/wbweve/Leados` via GitHub's REST API (full
  recursive tree) and raw-file fetches of its root `index.html`,
  `README.md`, `AI-SESSION-LOG.md`, and `src/lib/core.ts`, before writing
  any code** — *why*: the task requires inspecting actual code, not
  trusting the pasted "pt-T" brief's own framing of a 97-file/205-rule
  history at face value.
- **Found the real repo already contains at least two other sessions'
  worth of mutually-inconsistent prior work (different storage keys,
  different frameworks, different disclosed gaps), and that none of them
  contain Strategic Consciousness / Decision Oracle / Knowledge Graph
  code** — *why disclosed this way*: half-right continuity claims are
  worse than a clean break; this README and the in-app About page name
  exactly what was checked and what was and wasn't found.
- **Declared the pasted "pt-T" brief's 97-file/205-rule/pt-A…pt-S lineage
  an unverified specification, not repo fact** — *why*: no matching
  strings, file names, or counts were found in anything fetched this
  session, mirroring the convention the real repo's own prior sessions
  already used for their own pasted briefs.
- **Built a single static `index.html` plus a minimal Next.js redirect
  shell, instead of either a pure vanilla-JS repo (no DB/healthcheck) or a
  full React rewrite** — *why*: this task's platform requires a working
  Next.js+Drizzle+Postgres app with a passing `/api/health`, while the
  user explicitly asked for an `index.html` deliverable; redirecting `/`
  to the static file satisfies both without misrepresenting either.
- **Scoped the rule engine to 14 rules, Bayesian beliefs to 3 hypotheses,
  and self-tests to 10 checks, instead of matching the brief's 205/5+/94
  figures** — *why*: inventing that volume of rules/tests with no
  verified source to back them would manufacture false scale; a smaller,
  fully-working, honestly-labeled set is more trustworthy than a padded
  one.
- **Implemented the Oracle's people-decision simulation as a disclosed
  fixed-factor directional estimate, not a Monte Carlo simulation** —
  *why*: a real multi-agent Monte Carlo engine does not exist in this
  file; labeling a heuristic as a full simulation would overclaim.
- **Used a new storage key, `leados-pt-t:v1`** — *why*: this session has
  no prior local state, and the real repo's own divergent sessions already
  use their own distinct keys (`leados-pt-j:data`, `leados-sandbox:v1`);
  reusing either would falsely imply shared history.
