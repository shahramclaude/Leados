# LEADOS — Intelligence Synthesis Surface (Part 6, sandbox build, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read directly this session — `package.json`, `store.js` (both
> re-verified independently rather than trusted from a prior log),
> `App.tsx`, `IntelligenceView.tsx`, `IntelligenceDashboard.tsx`,
> `SESSION-3.patch.md`, `README.md`, the GitHub Trees API listing, and (with
> limited success — see below) the repo's own `index.html` — before any code
> here was written. Full method, raw findings, and everything **not** found
> or **not** re-verified are in `AI-SESSION-LOG.md`. This delivery is a
> fresh, self-contained implementation of the pasted **Part 6 ("The Complete
> Intelligence Synthesis Surface")** brief, built as a single `index.html`
> because that is what this session's tools can produce, and because — newly
> discovered this session — the fetch tool strips `<script>`/JSX content from
> both `.tsx` and raw `.html` sources, so the real repo's actual Part 4/5
> `index.html` could not be read with enough fidelity to literally extend it.

## Run it

Open `index.html` in a browser. No build step, no dependencies beyond the
Tailwind CDN script already in `<head>`. All state lives in exactly one
`localStorage` key: **`leados-synthesis:data`** — deliberately distinct from
the real repo's verified `leados:data`, and from the other sandbox builds'
`leados-signals-api:data` / `leados-decision-surface:data`, so this build can
never collide with any of them on the same browser origin.

## What's actually in this file

| Area | What it does |
|---|---|
| `LEADOS.store` | Minimal append-only event log + a pure `project()` fold — matches the real repo's verified `store.js` *doctrine* (append-only, nothing derived persists) but is a fresh implementation, not a port, because the real `store.js` is a different, unrelated schema (decisions/KRs/risk, not findings). |
| 6 domains, 12 seed findings, 4 compound-pattern definitions | **Fabricated**, disclosed in the About tab and in `seedIfEmpty()` — needed so the Synthesis view has real numbers to synthesize from on first load. |
| `#/synthesis` — the new route | The headline deliverable. Reads current findings/domain scores/patterns, composes three sections, and **persists the result as a new append-only `synthesis.generated` event** — generated only when you click the button, never recomputed on render or on reload. A staleness badge shows how many finding-events have happened since the last generation, without ever auto-regenerating. |
| The three sections: **Situation / Interpretation / Recommendation** | **This delivery's own interpretation**, clearly labeled as such everywhere it appears. The pasted brief's spec text was truncated before it named what the three sections actually are ("Three sections, generated on demand... :" → nothing follows). Guessing silently and presenting the guess as the brief's intent would misattribute an invented structure to the source document; naming the gap is the honest alternative. |
| `#/today`, `#/domains` | Supporting views so Synthesis has something non-trivial to read: an open-findings list and per-domain scorecards. |
| `#/lab` | Log or resolve findings by hand, to change the picture and see staleness/regeneration behave correctly without a live data feed. |
| `#/health` | Live, non-destructive checks: rendering never appends `synthesis.generated`; the store key is isolated from the real repo's `leados:data`; synthesis history is append-only (regenerating adds, never edits); staleness math is correct, computed on an in-memory event-array copy that is never saved; `finding.created` events are never deleted on resolve. |
| `#/about` | The verified/fabricated ledger below, rendered live so the disclosure travels with the running app. |
| `#/log` | The literal event log, with JSON export and a wipe/reseed control. |

## Verified vs. fabricated, at a glance

*(Full detail and raw fetch results: `AI-SESSION-LOG.md`.)*

| Claim | Status |
|---|---|
| Real repo is React 19.2.6 + Vite 7.3.2 + Tailwind 4.1.17 + vite-plugin-singlefile | ✅ verified this session, independently (raw `package.json`) |
| Real namespace `window.LeadOS`, key `leados:data`, schemaVersion 5, lineage `pt` | ✅ verified this session, independently (raw `store.js`, in full) |
| Real routes in `App.tsx` are exactly `today / intelligence / data / health / about`; **`#/synthesis` does not exist**, unrecognized hashes fall back to `today` | ✅ verified this session directly from `routeFromHash()` — plain TypeScript logic, not JSX, so it was not affected by the tool's JSX-stripping |
| `IntelligenceView.tsx` is a real, detailed velocity/entropy/energy/inertia/resonance component | ✅ verified it exists and read its non-JSX structure; ⚠️ its JSX render output could not be read (tool strips JSX markup — new finding, see log §3) |
| `IntelligenceDashboard.tsx` exists but is not imported by `App.tsx` | ✅ verified (cross-checked import list) — likely orphaned code; **not** confirmed dead, just not wired into the routes that were fetched |
| `SESSION-3.patch.md` describes an unrelated mood-pulse "1:1 mentor" app, no LEADOS domains | ✅ verified — flagged so it's never mistaken for part of this system |
| The real repo's Part 4/5 `index.html` contains a working `LEADOS.signalQueue` / `LEADOS.localAPI` | ⚠️ **not re-verifiable this session** — raw fetch returned only a few stripped UI text fragments, not the actual script; relying on the prior session's own log, not a fresh read |
| The Part 6 brief names three specific synthesis sections | ⚠️ **not found** — brief text is truncated before the list; Situation/Interpretation/Recommendation here is this delivery's own stand-in, labeled as such |
| 6 domains, 12 findings, 4 patterns, scoring formula | ⚠️ **fabricated**, disclosed in `seedIfEmpty()` / About tab |
| A hand-authored single `index.html` instead of the real repo's Vite/React tree, or a literal extension of its Part 4/5 file | ⚠️ disclosed structural difference — both the tool's one-file constraint and a genuine inability to read the real Part 4/5 file's script contents (see log §3) |

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-synthesis:data`.
- The event log is append-only; `project()` recomputes findings and domain
  scores from the raw event array on every call.
- The **one disclosed exception**: `synthesis.generated` payloads are
  themselves persisted as new log entries, never edited — a derived artifact
  that is cached by design, because the brief requires "generated on demand,
  not on every render" to still hold true across reloads.
- Synthesis is never generated except by an explicit click; rendering the
  view, re-rendering the app, or navigating away and back never appends a
  new synthesis event. Verified live in the Health tab.
- The Health tab runs live, non-destructive checks in the browser and is the
  authority if it ever disagrees with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Independently re-fetched `package.json` and `store.js` rather than trusting the prior session's `AI-SESSION-LOG.md` text | "Inspect the actual code before claiming anything about it" applies to this session too, not just to trusting a previous session's notes. |
| Fetched `App.tsx` directly and read its `routeFromHash()` whitelist | This is the one fact that actually matters for Part 6's premise ("a route that does not exist anywhere in the system yet") — worth confirming first-hand rather than inferring from filenames. |
| Discovered and documented that `web_fetch` strips `<script>`/JSX content from `.tsx` and raw `.html` sources alike | Without naming this, a reader could assume the real Part 4/5 `index.html` was re-read and still matches its README — it wasn't, and doesn't necessarily. |
| Flagged `IntelligenceDashboard.tsx` as present but unimported by `App.tsx` | A second "intelligence" file with a different CSS variable system sitting unused is worth surfacing, not silently ignoring or silently assuming it's live. |
| Flagged `SESSION-3.patch.md` as describing a wholly different app | Shared repo, unrelated product — leaving it unflagged risks someone assuming "the system" includes a 1:1/mood-pulse mentor tool it doesn't. |
| Named the Part 6 brief's own truncation explicitly, in-app, in the log, and here, instead of silently inventing section names | Presenting an invented structure as if it were specified would misattribute this delivery's own choice to the source brief. |
| Built a fresh `LEADOS.store` / `project()` rather than porting `store.js` | The real `store.js` schema (decisions, KRs, risk reviews) has no findings/domains concept to port; its *doctrine* (append-only, pure fold) was adopted, its schema was not. |
| Persisted `synthesis.generated` as an append-only event instead of a plain in-memory cache | A `useState`-style cache would reset on reload, breaking "generated on demand, not on every render" the moment the page is refreshed; an event-log entry survives reloads honestly, at the cost of one disclosed exception to "nothing derived persists." |
| Added a staleness badge (rail + Synthesis header) computed by diffing live event counts against the cached synthesis's snapshot count, never by auto-regenerating | Lets the operator *see* that data changed without the system silently doing expensive, "conceptually significant" work on their behalf. |
| Health tab's staleness check builds a candidate event array in memory and never calls `store.append` | Keeps the checks genuinely non-destructive in an append-only store where a written probe event cannot later be un-written. |
| 6 domains / 12 findings / 4 compound patterns, inspired by (not copied from) the real repo's verified `LeadOS.patterns` naming concept | Needed concrete, non-random data so the three sections compute real sentences from real numbers instead of reading as a static mock. |
