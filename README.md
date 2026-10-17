# LeadOS pt-P — Organizational Life Stage Intelligence (Part 1)

A React + Vite + Tailwind app implementing the *functional idea* behind the
pasted "pt-P" brief's `LEADOS.lifeStage` module: a single-tenant organizational
maturity model scored across twelve independent dimensions, computed entirely
from one synthetic organization's own event log.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados` or any prior "pt-" session:**
> The real repo was inspected directly this session — full directory listings via GitHub's REST API, and the raw
> content of all 28 `src/lib` files, all 24 `src/components` files, `src/App.tsx`, and all ~90 loose root-level
> files (confirmed by `grep` across the full downloaded set). Full ledger in `AI-SESSION-LOG.md` and in-app at
> **About / Provenance**. Short version:
>
> * The real repo is **two different deliveries in one place**: ~90 loose root-level files (including a root
>   `index.html` that is, as of this session, the stock Vite template) plus a separate, live Vite+React+TypeScript
>   app under `src/`.
> * **Verified live in the real repo:** `src/App.tsx` renders exactly six hash-routed views (Today, Signal Board,
>   Thermodynamics, CAS, Risk, About). Several extra `src/components`/`src/lib` files are real and wired to each
>   other, but are **not** reachable from that live route table.
> * `src/lib/intelligence.ts` still imports `{ engine, run }` from `./core`, which does not export either symbol —
>   confirmed broken, same as a prior session's own log already documented.
> * **Not found anywhere in the real repo, this session:** any string match for `lifeStage`,
>   `computeMaturityProfile`, `DIMENSIONS`, or `PEOPLE_SYSTEMS`, across the entire fetched content (root files +
>   `src/` tree). The pasted "pt-P / Part 1" brief describing a 12-dimension maturity model is therefore treated
>   here as an **unverified external specification**, not as repo fact.
>
> **This app does not fork, copy, or continue any of that history.** It is a fresh build, in this task's own tool
> environment (React + Vite + Tailwind, single `src/App.tsx` entry point, built with `npm run build`), implementing
> only the functional idea in the pasted brief — original code throughout.

## Run it

`npm install && npm run build`, then open `dist/index.html`. This project's Vite config (already present in the
scaffold, not edited this session) inlines all JS/CSS into that one HTML file via `vite-plugin-singlefile` —
confirmed by grepping the build output for `http(s)://` strings: only inert W3C XML/SVG namespace URIs and one
React docs error-message link baked into minified error text were found, so the "open one file, zero network
calls" property holds.

For development: `npm run dev`.

State lives in `localStorage` under `leados-ptp-maturity:v1`. Use **Reset** (Maturity Radar view) to clear it.

## Pages (hash routes)

| Route | What it does |
|---|---|
| `#/maturity` | The dashboard: an editable org name, a pattern banner (Beginning / Emerging Practitioner / Specialist / Balanced Practitioner / Advanced Leader), mean maturity + variance, a twelve-axis SVG radar chart, a priority-gaps list (lowest-scoring dimensions, capped at Level 3), and a card per dimension showing its current level, description, and what the next level requires. Five preset buttons seed a demonstration event mix for each pattern bucket. |
| `#/events` | The event log: ~40 synthetic event-type tiles grouped by dimension (filterable), click-to-log, a running count per type, and a feed of the 12 most recent logged events with per-event removal. This is the only way scores change outside of the presets — there is no hidden data. |
| `#/about` | Full provenance ledger: what was checked against the real repo, what was found, and exactly what in this delivery is original vs. modeled-on-a-pasted-spec vs. disclosed gap. |

## What's original, what's modeled on a pasted (unverified) spec, what's a disclosed gap

- **Modeled on the pasted "pt-P / Part 1" brief, reimplemented from scratch:** `src/lib/maturity.ts` — the twelve
  dimension names, the Level 1–5 per-dimension idea, and `computeMaturityProfile()`'s mean/variance/pattern/gap
  output shape. The brief's own JavaScript was not found anywhere in the real repo (see provenance above), so
  nothing here is a copy of verified prior code — it is original TypeScript satisfying the brief's *described*
  behavior. `INTELLIGENCE_MATURITY` was renamed `ANALYTICAL_MATURITY` to avoid implying this demo's own UI measures
  itself.
- **Built from scratch, with no external source to model against:** the ~40-entry `src/lib/eventCatalog.ts`, the
  five `src/lib/presets.ts` demonstration mixes, `src/lib/store.ts` persistence, and the hand-built SVG
  `RadarChart.tsx` (no charting library).
- **A scope limit, left as a limit:** only "Part 1" (life-stage / maturity dimensions) was pasted into this
  conversation. No later part of the brief is implemented, since none was supplied.
- **All UI and copy:** original to this delivery.

## Project structure

```
src/
  lib/
    types.ts            — shared types (OrgEvent, DimensionDef, MaturityProfile, ...)
    maturity.ts          — 12-dimension scoring engine + computeMaturityProfile (original)
    eventCatalog.ts        — ~40 synthetic event types grouped by dimension (original)
    presets.ts                — 5 demonstration event mixes, one per pattern bucket (original)
    store.ts                    — localStorage persistence + state mutations (original)
    useHashRoute.ts               — tiny hash router (original)
  components/
    Shell.tsx, RadarChart.tsx, DimensionCard.tsx — shared UI + chart (original)
    MaturityView / EventsView / AboutView        — route views (original)
  App.tsx                                           — route composition (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first — this time via `bash curl` against GitHub's REST API (confirmed
  outbound network access from the sandbox) rather than only `web_fetch`, because `web_fetch` truncated the full
  recursive tree response.** — *why*: a truncated listing would have under-counted the repo's real file set and
  risked a false "not found" on the keyword search; `curl` gave complete, untruncated directory listings.
- **Downloaded and grepped the raw content of every file in `src/lib`, `src/components`, and all ~90 root-level
  files for the pasted brief's distinctive identifiers before writing any code.** — *why*: the task requires
  inspecting actual code, not trusting either the README's self-framing or the task prompt's own pasted spec at
  face value; a brute-force content grep is more conclusive than spot-checking a handful of files.
- **Declared the pasted "pt-P / Part 1" (`LEADOS.lifeStage`) brief an unverified specification, not repo fact.** —
  *why*: zero string matches for its named exports/dimensions anywhere in the current `main` branch.
- **Renamed the brief's `INTELLIGENCE_MATURITY` dimension to `ANALYTICAL_MATURITY` in this implementation.** —
  *why*: avoids the confusing implication that this demo UI is scoring its own "intelligence"; purely a label
  change, the scoring behavior is unchanged.
- **Built five hand-tuned presets instead of relying on random/seeded synthetic data generation.** — *why*: the
  pattern classifier (`BEGINNING` / `EMERGING_PRACTITIONER` / `SPECIALIST` / `BALANCED_PRACTITIONER` /
  `ADVANCED_LEADER`) is easiest to demonstrate convincingly with deliberately-constructed event mixes that land
  exactly in each bucket, rather than hoping a random generator lands there.
- **Used a hand-built SVG radar chart instead of a charting library.** — *why*: avoids an extra dependency for a
  single, fully custom chart shape (12 fixed axes, 5 fixed rings).
- **Used a new storage key (`leados-ptp-maturity:v1`).** — *why*: this workspace began with the default Vite
  scaffold and no prior state; claiming continuity with any other session's key would assert a shared history that
  doesn't exist here.
- **Left later parts of the "pt-" brief series out of scope.** — *why*: only "Part 1" text was pasted into this
  conversation; inventing the rest would misattribute invented work to an external spec that was never supplied.
