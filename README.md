# LeadOS pt-O — Organizational Wargaming Engine (sandbox build)

A React + Vite + Tailwind app implementing the functional core of the task's
pasted **"pt-O: Organizational Wargaming Engine"** brief: a blue/red/green
competitive-landscape model and multi-turn wargame simulator, driven entirely
by your own logged event data, plus logging/registers for the brief's new
event types (stakeholders, ecosystem, M&A, regulatory, org design, technology
disruption, strategic intelligence signals).

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`
> or any prior "pt-" session:** `github.com/wbweve/Leados` was inspected
> directly this session (full recursive file tree via GitHub's REST API, the
> rendered README, and raw fetches of `AI-SESSION-LOG.md`, `src/App.tsx`,
> `index.html`, `package.json`). Full ledger in `AI-SESSION-LOG.md` and
> in-app at **About / Provenance**. Short version:
>
> - The real repo currently holds **two different deliveries at once**: ~90
>   loose root-level files from older sessions (including large
>   bundle-like `.js` files) plus a separate, structured `src/`
>   Vite+React+TypeScript app that is the one actually wired to the root
>   `index.html` / `package.json` as of this session's read.
> - **Verified, first-hand, this session:** the live `src/App.tsx` routes to
>   `TodayView`, `SignalBoardView`, `ThermodynamicsView`, `CasView`,
>   `RiskView`, `AboutView` — a Thermodynamics/CAS/Risk-Register build, not a
>   wargaming build. The repo's own `AI-SESSION-LOG.md` (read directly) in
>   turn documents an **earlier** session's finding that a live
>   `infoTheory.ts` → `Thermodynamics.tsx` chain is real, that
>   `core.ts`/`intelligence.ts`/`physics.ts` are present but orphaned (with
>   one broken import), and that **no CAS engine, risk register, or
>   wargaming module existed in the files it read** at that time.
> - **Not found anywhere in the real repo, this session:** any file named
>   `wargame*`, `competitiveLandscape*`, `stakeholder*`, `ecosystem*`,
>   `ma-target*`, or equivalent, by filename across the full 148-entry tree.
>   (GitHub's authenticated code-search API was attempted for a full-text
>   check and returned `401 Requires authentication` in this sandbox — a
>   disclosed scope limit, not a claim of exhaustive proof.)
>
> **This app does not fork, copy, or continue any of that history.** It is a
> fresh build, in this task's own tool environment (React + Vite + Tailwind,
> single `src/App.tsx` entry point, built with `npm run build`), implementing
> the pasted pt-O brief's described behavior as original TypeScript — the
> brief's own wargaming pseudocode is mechanically transcribed (not
> reimplemented from any other source, and not claimed to have ever existed
> in the real repo).

## Run it

`npm install && npm run build`, then open `dist/index.html`. The Vite config
(`vite-plugin-singlefile`) inlines the built JS/CSS into that one HTML file,
so it opens standalone with zero runtime network calls.

For development: `npm run dev`.

State lives in `localStorage` under `leados-pt-o:v1`, seeded on first load
with an **original, deterministic synthetic dataset** (fabricated company:
fictional competitors, deals, people). Use **Reset demo data** or **Wipe
all** on the Event log page to clear it.

## Pages (hash routes)

| Route         | What it does                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/today`     | Org snapshot: runway, headcount, win rate, pipeline, active rule-based findings, recent intelligence signals.                                        |
| `#/landscape` | The competitive landscape: BLUE team (your org's capabilities), RED teams (one card per distinct `competitor.logged` name), GREEN team (customer base — satisfaction, churn, pains, win/loss reasons). |
| `#/wargame`   | Scenario builder (trigger + your move) → 5-turn simulated wargame (situation → blue move → probabilistic red responses → green reaction → decision options) → verdict. Scenarios can be saved to the event log. |
| `#/registers` | Tabbed registers over the manually-logged pt-O event types: stakeholders, ecosystem map, M&A targets, regulatory jurisdictions, org design scenarios, technology disruption watch, raw intel signals. |
| `#/log`       | Generic intelligence logger — pick any of ~25 event types (grouped by domain) and fill a schema-driven form to append an event.                      |
| `#/events`    | Raw, filterable, deletable event log. The single source of truth every other view reads from. Reset-to-demo / wipe-all live here.                   |
| `#/about`     | Full provenance ledger — what was checked against the real repo, what was found, what's a disclosed gap.                                           |

## What's a direct transcription, what's original, what's a disclosed gap

- **Direct TypeScript transcription of the task's pasted pt-O brief:**
  `src/lib/wargame.ts` (`buildCompetitiveLandscape`, `runScenario`, the
  probable-response matrix, verdict/counter-option generation). The brief
  supplied this as runnable JavaScript; it is reproduced here mechanically
  against this app's own event/store model, not copied from
  `github.com/wbweve/Leados` (nothing resembling it was found there).
- **Original, written from scratch because the brief didn't supply it:**
  `src/lib/engine.ts` (a ~12-rule findings engine — a different, smaller,
  independently-authored set from both the real repo's own 6-rule engine and
  any "144-rule catalog" referenced in other unverified pasted briefs),
  `src/lib/eventSchema.ts` (form schemas for the brief's new event types),
  `src/lib/seedData.ts` (synthetic demo dataset), and all UI.
- **A gap, left as a gap:** the brief's own "Rules R145–R160 (Wargaming
  Domain)" section heading has no rule text under it anywhere in the pasted
  text. Nothing was invented to fill it. Real-options valuation, M&A
  scoring, and regulatory-interpretation analysis are represented only as
  structured logging (the brief gave event shapes, not algorithms for these).

## Project structure

```
src/
  lib/
    types.ts         — shared types (LeadEvent, Projection, Finding, ...)
    format.ts         — date/money/uid helpers
    seedData.ts         — original synthetic demo dataset (deterministic PRNG)
    store.ts              — localStorage persistence + event mutations
    engine.ts               — original ~12-rule findings engine
    wargame.ts                — transcription of the pasted pt-O wargame engine
    eventSchema.ts              — form schema for the 25 loggable event types
    useHashRoute.ts               — tiny hash router
  components/
    Shell.tsx, ui.tsx               — nav shell + shared UI primitives
    TodayView / LandscapeView / WargameView / RegistersView /
    IntelLogView / EventLogView / AboutView
  App.tsx                                — route composition (entry point)
```

## Changelog

- **Inspected `github.com/wbweve/Leados` first** (recursive tree via GitHub
  REST API, rendered README, raw fetches of `AI-SESSION-LOG.md`,
  `src/App.tsx`, `index.html`, `package.json`) before writing any code —
  _why_: the task requires inspecting actual code, not trusting the pasted
  pt-O brief's framing or a README's self-description at face value.
- **Attempted GitHub's authenticated code-search API** for a full-text check
  on terms like `wargame`/`buildCompetitiveLandscape`; it returned `401`
  unauthenticated — _why disclosed_: absence-by-filename is weaker evidence
  than absence-by-full-text-search, and the gap is labeled rather than
  silently upgraded into a stronger claim.
- **Declared the pasted "pt-O" brief an unverified specification, not repo
  fact** — _why_: no filename match for its named modules was found in the
  148-entry tree, and the real repo's own prior sessions already established
  this exact convention for their own pasted briefs (confirmed by reading
  their `AI-SESSION-LOG.md` directly).
- **Transcribed the brief's wargame engine almost verbatim into
  `wargame.ts`, instead of redesigning the mechanics** — _why_: the brief
  supplied working pseudocode (unlike pure-prose briefs), so mechanical
  transcription is more honest than inventing a different algorithm and
  presenting it as equivalent.
- **Wrote a new, independent ~12-rule findings engine (`engine.ts`) rather
  than porting the real repo's 6-rule one or inventing a 144-rule system**
  — _why_: neither the real repo's engine (different scope/rules) nor the
  "144-rule" history from other unverified briefs could be verified as
  applicable here; a small original set, clearly labeled, avoids
  misattributing provenance either way.
- **Left "Rules R145–R160" unimplemented** — _why_: the pasted brief names
  the section but supplies no rule text; inventing rules would misattribute
  original work to the brief.
- **Built registers/logging UI for all ~25 new event types the brief
  defines, even though the wargame engine itself only directly reads a
  subset (competitor.logged, cs.*, win.loss.logged, etc.)** — _why_: the
  brief frames these as the substrate for *future* wargame mechanics
  (M&A, regulatory, org design, tech disruption); logging them now makes the
  data model match the brief's schema even though the matching algorithms
  were not supplied.
- **Used a new storage key (`leados-pt-o:v1`)** — _why_: this sandbox began
  from the default scaffold `App.tsx` with no prior state; reusing another
  session's key would assert a shared history that doesn't exist here.
- **Seeded with an original, deterministic (seeded-PRNG) synthetic dataset**
  — _why_: the task's own "zero external data" principle applies to the demo
  data too; nothing here is real market or competitor information, and a
  deterministic seed keeps "Reset demo data" reproducible.
