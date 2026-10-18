# LeadOS pt-Q — Predictive Intelligence Architecture

A React + Vite + Tailwind app implementing the two fully-specified engines
from the pasted "pt-Q" leadership-intelligence brief — a **Structural Causal
Model** (do-calculus style causal graph + counterfactual reasoning) and an
**Individual Flight Risk** model calibrated from your own org's historical
departures — plus a few smaller original additions, over one synthetic demo
org.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`
> or any prior "pt-" session:** the real repo was inspected this session via
> GitHub's REST API and raw-file fetches (not cloned, not executed). It
> contains **at least three separate, mutually inconsistent deliveries**
> stacked in one place — a ~60-file loose root-level `.tsx` lineage, a
> separate live `src/` Vite+React+TypeScript app, and a third vanilla-JS
> "mf-1/mf-2" lineage described only in its own append-log. The repo's own
> `AI-SESSION-LOG.md` is itself stale relative to its current `src/lib/`
> listing (it claims files are absent that are now present). Full ledger,
> with every API call and what it returned, is in **`AI-SESSION-LOG.md`** and
> in-app at **About / Provenance**.
>
> **This app does not fork, copy, or continue any of that history.** It is a
> fresh build, in this task's own tool environment (React + Vite + Tailwind,
> single `src/App.tsx` entry point, built with `npm run build`), implementing
> the *functional ideas* in the pasted pt-Q brief — original TypeScript
> throughout, with the two fully-specified engines (causal model, flight
> risk) translated as directly as the brief's own pseudocode allows.

## Run it

`npm install && npm run build`, then open `dist/index.html`. The build
inlines all JS/CSS into that one HTML file (via `vite-plugin-singlefile`), so
it opens standalone with zero runtime network calls.

For development: `npm run dev`.

State lives in `localStorage` under `leados-ptq:v1`. Use **Reset synthetic
data** in the header to regenerate the seeded demo org.

## Pages (hash routes)

| Route | What it does |
|---|---|
| `#/today` | Overview: active rule-based findings, highest flight-risk people, causal-edge counts, historical departure count. |
| `#/roster` | Every active person with their individual flight-risk score, risk level, contributing signal factors, and data-quality assessment — computed from **this org's own historical departures**, not population benchmarks. |
| `#/causal` | The Structural Causal Model: the full ASSUMED / EVIDENCED / CONFIRMED edge table, a do-calculus intervention estimator ("if I set X, what happens to Y?"), and a form to log your own CONFIRMED causal annotations. |
| `#/counterfactual` | "What would have happened if...?" — replays the event log up to a hypothetical past date and compares it to what actually happened since, clearly labeled as unverifiable. |
| `#/highpotential` | A simplified, original, explicitly-labeled heuristic combining feedback balance, engagement, growth-plan activity, and conflict history. Not a trained model. |
| `#/network` | Informal power network / "dark matter" detection: a degree-centrality heuristic over synthetic collaboration events, flagging people with high influence but no formal leadership title. |
| `#/meetings` | Meeting intelligence: decision velocity (decisions ÷ meeting-hours) per logged meeting, with a simple "this could have been an async update" flag. |
| `#/about` | Full provenance ledger — what was checked against the real repo, what was found, and exactly what in this delivery is spec-faithful vs. original vs. a disclosed gap. |

## What's spec-faithful, what's original, what's a disclosed gap

- **Ported as directly as the pasted brief's own pseudocode allows:**
  `src/lib/causal.ts` (Part 1 — `LEADOS.causal`: causal graph construction,
  ASSUMED/EVIDENCED/CONFIRMED edges, do-calculus backdoor-adjustment
  estimator, Lewis-style counterfactual replay) and `src/lib/flightRisk.ts`
  (Part 2 — `LEADOS.flightRisk`: departure-signature construction, weighted
  similarity scoring, heuristic fallback). Translated from the brief's
  `LEADOS.*` object/namespace style into standalone TypeScript modules to fit
  this project's `src/App.tsx`-entry-point architecture.
- **Original, because the brief only named these capabilities without
  algorithms:** `src/lib/extras.ts` — High-Potential Identification
  (feedback/engagement/growth-plan/conflict heuristic), Informal Power
  Network detection (simple degree-centrality over synthetic collaboration
  events — explicitly **not** full betweenness/eigenvector centrality), and
  Meeting Intelligence (decisions-per-hour heuristic). Each is labeled in the
  UI as a simplified, original heuristic, not a validated instrument.
- **Disclosed gaps — not implemented this session**, because the brief names
  them without a usable algorithm and/or they require data fields (OKRs,
  compensation, promotion/demographic history) this build deliberately does
  not fabricate: information cascade prediction through the org network,
  OKR causal chains / leading-indicator architecture, organizational learning
  velocity measurement, compensation equity analytics, and promotion
  pattern/bias analysis. Full reasoning for each is in the in-app About page
  and in `AI-SESSION-LOG.md` §4.
- **All UI, the synthetic 10-active + 4-departed roster/event generator, the
  minimal disclosed-fabricated findings engine (`engine.ts`), and the
  storage/projection layer:** original to this delivery.

## Project structure

```
src/
  lib/
    types.ts            — shared types (Person, LeadEvent, Projection, ...)
    prng.ts              — deterministic seeded PRNG
    seed.ts               — synthetic roster + event log (10 active, 4 departed)
    store.ts               — localStorage persistence + event-log projection
    stats.ts                 — Pearson correlation, date-diff helper
    engine.ts                  — minimal disclosed-fabricated findings engine
    causal.ts                    — Part 1: Structural Causal Model engine (spec-faithful)
    flightRisk.ts                  — Part 2: Individual Flight Risk engine (spec-faithful)
    extras.ts                        — High-Potential / Power Network / Meeting Intelligence (original) + disclosed-gap list
    useHashRoute.ts                    — tiny hash router
  components/
    Shell.tsx, ui.tsx                   — nav shell + shared UI primitives (Card, Tag, RiskPill, Callout)
    TodayView / RosterView / CausalView / CounterfactualView /
    HighPotentialView / PowerNetworkView / MeetingView / AboutView
  App.tsx                                 — route composition (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first** — via GitHub's REST API
  (trees, contents) and raw-file fetches of the root README, root
  `index.html`, `src/App.tsx`, `src/lib`/`src/components` listings, and both
  `AI-SESSION-LOG.md` and `AI-SESSION-LOG.append.md` — *why*: the task
  requires inspecting actual code before claiming anything about it, not
  trusting the repo's own README self-framing (which turned out to itself be
  one layer of several self-contradicting session narratives).
- **Found and documented that the repo's own session log is stale relative to
  its own current file tree** (claims `casEngine.ts`/`riskIntelligence.ts`
  don't exist; they currently do) — *why disclosed prominently*: a stale
  provenance document is more dangerous than no provenance document, since it
  invites a future session to trust a false "verified absent" claim.
- **Declared the repo a multi-lineage, non-continuous artifact and built
  fresh instead of porting any one lineage** — *why*: with three
  self-contradicting deliveries in one repo, "continuing" any single one
  would arbitrarily privilege a fragment of a history that isn't actually
  coherent, and would misrepresent this build's relationship to it.
- **Ported the two fully-specified pt-Q engines (causal model, flight risk)
  as directly as their pasted pseudocode allows** — *why*: the brief gave
  complete, runnable logic for these two; reimplementing them loosely instead
  of following the given structure would discard the one part of the input
  that was actually unambiguous.
- **Left 5 named pt-Q capabilities as disclosed gaps** (cascade prediction,
  OKR causal chains, learning velocity, comp equity, promotion bias) instead
  of inventing algorithms for them — *why*: the brief's intro names them
  without any method, and several require data (compensation, OKRs,
  promotion/demographic history) that would need to be fabricated in a way
  that could misleadingly imply real analytical rigor over invented numbers.
- **Built a simplified, explicitly-labeled degree-centrality network metric**
  for "dark matter" detection instead of a full social-network-analysis
  implementation — *why*: betweenness/eigenvector centrality would need a
  much richer interaction graph than this synthetic demo's handful of
  `collab.logged` events can support without becoming misleading theater.
- **Disclosed, rather than silently patched, the spec's own `flightRisk`
  causal-variable limitation** (it is structurally always 0 among currently
  active people) — *why*: matches the "label it, don't quietly fix it"
  convention, so the UI's claims stay traceable to what the pasted spec
  actually does.
- **Used a new storage key (`leados-ptq:v1`)** — *why*: this workspace began
  from the default scaffold with no prior app state; reusing any other
  session's key would falsely imply continuity with data that was never
  here.
