# LeadOS pt-J demo — Temporal Velocity Measurement (single-file, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was fetched and read directly this
> session (GitHub Trees API for the full file list, plus raw fetches of `package.json`, `store.js`, `engine.js`,
> `rules.js`, `Heatmap.tsx`, `DomainViews.tsx`, `store.ts`, and `index.html`) before any code here was written.
> Full method and raw findings are in `AI-SESSION-LOG.md`. This delivery implements, fresh and self-contained,
> the pasted **"Temporal Velocity Measurement"** brief (`measureVelocity()` + a "Velocity Dashboard Widget" in
> the domain heatmap) — a brief whose own text cuts off mid-sentence right after *"In the domain heatmap
> (everywhere it appears):"*, before specifying the widget's layout. Neither the widget's exact layout nor any
> part of it was fabricated as "verified" — see the gaps table below.

## Run it

Open `index.html` in a browser. That's the install. One disclosed exception, carried over from this problem
family's prior deliveries: it loads `@tailwindcss/browser` from `cdn.jsdelivr.net`, which is itself a CDN
dependency — a contradiction of the repo's own repeated "no CDN, no network calls" instinct (verified in the
real repo's own README snippet, see below), same as every prior delivery in this lineage.

## Files in this delivery

| File | Role |
| --- | --- |
| `index.html` | Everything: an append-only event store (`LEADOS.store`), a pure projection (`LEADOS.events.project`), the domain heatmap + velocity engine (`LEADOS.correlate`), a 4-view UI (Today / Domain Heatmap / Data / Health), and a live health suite. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-only log of what was verified about the real `wbweve/Leados` repo this session, and every disclosed decision/deviation in this delivery. |

## What this is / isn't

- **Is**: a working single-file demo of the pasted velocity brief — `LEADOS.correlate.heatmap(P, today)` scores
  every domain 0–10 from a decay-weighted sum of that domain's event severities (decay constant borrowed,
  disclosed, from the real repo's own verified `heatmapDecayFactor: 0.85`); `LEADOS.correlate.measureVelocity()`
  reconstructs the same domain's score 30 days earlier by re-filtering and re-projecting the event log, then
  reports `velocity`, a `WORSENING/IMPROVING/STABLE` direction, and a labeled linear `projectedIn30d`. A
  "Velocity Dashboard Widget" renders this at two sites — a compact strip on **Today** and a full card (with
  sparkline + expandable score math) on **Domain Heatmap** — because the brief says "everywhere it appears" but
  never enumerates the sites.
- **Is not**: a patch to the real `wbweve/Leados` repo, a diff/merge against any prior pt-letter delivery's
  actual code (this session's fetch tooling cannot recover `<script>` contents from a rendered single-file page —
  only its visible text/markup, same limitation the pt-I README disclosed for pt-H), a PWA, or an implementation
  of "Organizational Physics" / a "decision surface" (not specified in anything pasted this session).

## Verified vs. fabricated, at a glance

| Claim | Status |
| --- | --- |
| `github.com/wbweve/Leados` exists; repo root currently holds 60+ flat files, mostly `.tsx` | ✅ verified this session (GitHub Trees API) |
| Root is a React 19 + Vite 7 + Tailwind 4 project (`package.json`: `react-vite-tailwind`, `vite-plugin-singlefile`) | ✅ verified this session (raw fetch of `package.json`) |
| A separate vanilla `window.LeadOS` lineage also exists at repo root: `store.js` (schemaVersion 5, `KEY='leados:data'`, `LINEAGE_TAG='pt-6'`) and `engine.js` (the real `project()`, rule fold, and a decay-weighted per-domain severity rollup) | ✅ verified this session (raw fetches of `store.js`, `engine.js`) |
| `rules.js` is a disclosed tombstone — its content was merged into `engine.js` in a prior session (`pt-4 part 11`) | ✅ verified this session (raw fetch — the file is literally a comment saying so) |
| Real `store.js`'s v5 settings include `heatmapDecayFactor: 0.85`, described in its own comment as pricing recency "in the correlation heatmap" | ✅ verified this session (raw fetch) |
| A function literally named `LEADOS.correlate.heatmap` or a data shape `P.state.events` exists anywhere in the real repo | ⚠️ **not found** this session — `engine.js`'s per-domain decay rollup exists conceptually but under different names/shapes (`project(events)` takes a bare array, not a `state` wrapper; no `correlate` namespace was located in the fetched source, which was large and may be incompletely covered by this session's fetch) |
| `Heatmap.tsx` (React rewrite) is a calendar/activity heatmap, not a domain-score heatmap | ✅ verified this session (raw fetch) |
| `store.ts` at repo root is yet another, distinct single-file delivery (`STORAGE_KEY='leados-pte-demo:data'`, `SCHEMA_VERSION=1`, lineage `pt-E-demo`) — not the real `store.js` | ✅ verified this session (raw fetch; contents explicitly say so in their own header comment) |
| Root `index.html` currently renders a prior session's **pt-I "Temporal Cognition"** demo page | ✅ verified this session (raw fetch; `<title>` and nav matched the pt-I README's own description) |
| Prior pt-I delivery's actual `<script>` contents (its real `LEADOS.temporalField` / `LEADOS.causality` code) | ⚠️ **not recoverable this session** — this session's fetch tool strips `<script>` content from rendered HTML (tried both `markdown` and `html` output modes); only the page's visible nav/text came back. Same limitation the pt-I README itself disclosed when it could not recover pt-H's code. |
| The repo's own real README currently self-describes (per a separate search-engine snippet, not re-verified by direct fetch this session) as "offline leadership mentor... vanilla JS, no framework, no build step" | ⚠️ **unverified by direct fetch this session** — plausible given the verified vanilla `store.js`/`engine.js` lineage, but this session's direct `README.md` fetch returned the newer pt-I narrative instead; the two are not necessarily contradictory (the repo accumulates overwritten single-file deliveries at its root, per the pt-I README's own account) |
| This delivery's 5 domains, seed events, decay constant application, and health checks | ⚠️ fabricated/hand-placed for this demo, disclosed as such throughout |

## Implemented from the pasted brief (this delivery)

- **`LEADOS.correlate.heatmap(P, today)`**: per domain, sums `severity × 0.85^ageDays` over every event in that
  domain with `ts <= today`, clamps to `[0, 10]`. The 0.85 decay constant is the verified real-repo value, reused
  on purpose (see table above); the clamp-and-sum formula itself is this session's own construction, since the
  real `correlate.heatmap` function could not be located.
- **`LEADOS.correlate.measureVelocity(domain, P, today, lookbackDays=30)`**: implemented essentially verbatim from
  the pasted code — reconstructs a 30-days-ago state by filtering `P.state.events` to `ts <= lookbackIso`,
  re-projects it, re-scores it, and returns `{ current, historical, velocity, direction, projectedIn30d, label }`.
  One disclosed fix: the brief passes `today` (ambiguously a `Date` or an ISO string) into `heatmap()` in one call
  and a guaranteed ISO string (`lookbackIso`) in the next — an inconsistent argument type for the same parameter
  position. Fixed by normalizing every "as of" argument through `iso()` inside `domainMath()`, so both forms work.
- **Velocity Dashboard Widget**: a reusable `renderDomainCard()` with a compact mode (Today strip: domain, score,
  direction badge) and a full mode (Domain Heatmap view: score, direction + velocity rate, 30-days-ago value,
  linearly-projected 30-day value, a 5-point sparkline, and an expandable "Score math" table listing every
  contributing event's severity, age, and decayed weight). This completes the brief's cut-off instruction
  ("In the domain heatmap (everywhere it appears):") — disclosed as this session's own completion, not a
  recovered spec.
- **Append-only store** (`LEADOS.store`, key `leados-ptj-demo:data`): one localStorage key, nothing derived is
  persisted; `append()` always stamps "now"; only the one-time `appendAt()` seed path may backdate, and every
  seeded event is marked `meta.seeded: true`.
- **Health suite** (`#/health`): `T1_STORE`, `T2_APPEND_ONLY` (proven on a throwaway key, never the live store),
  `T3_HEATMAP_BOUNDS`, `T4_VELOCITY_MATH` (independently recomputes the arithmetic and diffs it against the
  function's own output), `T5_PROJECTION_PURITY`, `T6_SEED_DISCLOSURE`.

## Disclosed gaps and simplifications

- The 5 domains (`people, finance, ops, strategy, legal`) and ~21 seed events are hand-placed, not random, so the
  demo deterministically exercises all three directions (`WORSENING` / `IMPROVING` / `STABLE`) plus a sparse
  low-data domain (`legal`). Because scores are recomputed live from "now" on every load, exact numbers and even
  the direction label will drift slightly day to day — disclosed in the Domain Heatmap view's own caption, not
  hidden behind a frozen snapshot.
- Import/undo/multi-rule-engine/causal-chain features described in prior pt-letter READMEs (pt-E, pt-I) are out
  of scope here — this delivery is narrowly the velocity brief, continuing Part 1's lineage conceptually but not
  literally extending unrecoverable code.
- `LEADOS.correlate.domainMath()` (the score-math breakdown) is this session's own addition beyond the pasted
  brief, needed so every score is arithmetic shown verbatim, per this project family's own "nothing fabricated,
  show the math" doctrine observed throughout the verified real-repo source.

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-ptj-demo:data` — distinct from every other key verified or
  claimed in this repo's history (`leados:data`, `leados-pte-demo:data`, and the `leados-ptg/pth/pti-demo:data`
  keys named in the pt-I README), so this demo can never collide with any of them on the same origin.
- The event log is append-only; nothing is rewritten in place. Only the seed path may backdate timestamps, and
  every seeded event is marked.
- Every heatmap score and every velocity number shows its exact arithmetic in an expandable "Score math" block.
- `#/health` runs live, non-destructive checks in the browser and is the authority if it ever disagrees with this
  document.

---

## Changelog (this delivery)

| Change | Why |
| --- | --- |
| Verified the real repo via GitHub Trees API + raw fetches of `package.json`, `store.js`, `engine.js`, `rules.js`, `Heatmap.tsx`, `DomainViews.tsx`, `store.ts`, `index.html` before writing anything | Task requires inspecting actual code before claiming anything about it. |
| Disclosed that `LEADOS.correlate.heatmap` / `P.state.events` as named in the pasted brief were not located anywhere in the real repo's fetched source | Reporting "not found" honestly is better than assuming the pasted brief is a verbatim quote of real code. |
| Reused the real repo's verified `heatmapDecayFactor: 0.85` as this demo's decay constant | Ties this fresh implementation back to one concrete verified fact instead of inventing an arbitrary number. |
| Fixed the pasted brief's inconsistent `today` argument type (`Date` in one `heatmap()` call, guaranteed ISO string in the next) by normalizing inside `domainMath()` | One behavior had to be chosen to make the code run; disclosing the fix is more honest than silently picking one. |
| Completed the Velocity Dashboard Widget's layout myself (compact Today strip + full Domain Heatmap card with sparkline and score-math table) | The pasted brief cuts off immediately after "In the domain heatmap (everywhere it appears):" with no further spec. |
| Hand-placed ~21 seed events across 5 domains instead of randomizing | Needed deterministic, inspectable coverage of WORSENING / IMPROVING / STABLE / low-data domains for a demo that recomputes live. |
| Kept the health suite's append-only/store checks on a throwaway `localStorage` key, never the live store | Running Health repeatedly must never mutate or pollute the demo's own seeded data. |
| Did not attempt to recover or diff against the prior pt-I session's actual `<script>` contents | This session's fetch tooling strips `<script>` from rendered HTML in both `markdown` and `html` modes — confirmed by directly testing both before writing this document, not assumed. |
