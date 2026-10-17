# LEADOS — Decision Topology Surface (Part 3, sandbox build, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was fetched and read directly this session — GitHub Trees API for the file list, plus raw fetches of `package.json`, `store.js`, and `engine.js` — before any code here was written. Full method, exact raw findings, and everything explicitly **not** found or **not** re-verified are in `AI-SESSION-LOG.md`. This delivery is a fresh, self-contained implementation of the pasted **Part 3, "The Decision Surface"** brief, built as a single `index.html` because that is what this session's tools can produce — a different shape than the real repo's actual React + Vite tree, and the difference is disclosed, not glossed over.

## Run it

Open `index.html` in a browser. No build step, no dependencies beyond the Tailwind CDN script already in the `<head>`. All state lives in exactly one `localStorage` key: `leados-decision-surface:data` — deliberately distinct from the real repo's verified `leados:data` and from the other sandbox build's claimed `leados-orgphysics-sandbox:data`, so this build can never collide with either on the same origin (checked live by the in-app Health tab, check H8).

## What's actually in this file

| Area | What it does |
|---|---|
| `LEADOS.store` | Append-only event log in `localStorage`. `append()` always stamps real "now"; a separate `appendAtInto()` path, used only by the one-time seed, backdates and marks every event `meta.seeded: true`. |
| `LEADOS.engine` | `project(events)` folds the raw log into `{ state: { events }, decisions, decisionById, openDecisions }`, purely and on every call. `_days(today, isoDate)` is the brief's own helper name, reused verbatim. |
| `LEADOS.decisionSurface` | `mapDecisionTopology(decisions, P, today)` and `classifyDecisionQuadrant(risk, reversibility, pressure)` — implemented **verbatim** from the pasted brief. |
| Decision Surface tab | A 2D canvas plot: X = risk, Y = reversibility, 4 background quadrants split at risk 0.6 / reversibility 0.5 (per the brief's own visualization note: "a 2D grid with 4 quadrants visible, pressure encoded as node size, not a third axis"). Node radius encodes time pressure; node color encodes the full 8-way quadrant name. Click a node for its guidance text and exact score math. |
| Decisions tab | Log a new decision + its first scenario; add further scenarios to an existing decision (only the worst scenario — max probability, max cost — drives the topology, per the brief); table of every decision, open or resolved. |
| Raw Event Log tab | The literal append-only log, newest first, with JSON export and a reseed/wipe control. |
| Verified vs Fabricated tab | The same ledger as below, rendered live so the disclosure travels with the running app. |
| Health tab | 8 live, non-destructive self-checks (store round-trip, append-only immutability on a throwaway key, all 8 quadrants reachable, projection purity, `_days()` arithmetic, seed-marking, score bounds, key isolation). |

## Verified vs. fabricated, at a glance

*(Full detail and raw fetch results: `AI-SESSION-LOG.md`.)*

| Claim | Status |
|---|---|
| `github.com/wbweve/Leados` exists; root is a React 19 + Vite 7 + Tailwind 4 project with `vite-plugin-singlefile` | ✅ verified this session (raw `package.json`) |
| Repo root also carries ~40 loose files from prior sessions, mixing `.tsx` components with standalone `store.js` / `engine.js` | ✅ verified this session (GitHub Trees API) |
| Real namespace is `window.LeadOS` (capital L, lowercase "ead", capital OS) — **not** `LEADOS`; real store key is `leados:data`, schema v5 | ✅ verified this session (raw `store.js`) |
| `heatmapDecayFactor: 0.85`, `correlationWindowDays: 90`, `decisionMaxOpenDays: 21` are real settings | ✅ verified this session (raw `store.js`) |
| `engine.js` folds events into keyed per-domain buckets, an alias table, and open-set predicates | ✅ verified this session (raw `engine.js`; fetch was truncated mid-file, so treat as a partial read) |
| `engine.js` also contains a rule engine and `LeadOS.patterns`, a compound cross-domain pattern library (`DEATH_SPIRAL`, `QUALITY_COLLAPSE`, `GOVERNANCE_GAP`, …) | ✅ verified this session (same fetch) |
| Real decision-shaped events are `strategy.decision` (flat log entry, no id/severity/reviewDate) and `decision.decided` (a choice record) | ✅ verified this session (`engine.js` fold + `store.js` migration `2>3`) |
| `LEADOS.decisionSurface`, `mapDecisionTopology`, `classifyDecisionQuadrant`, a `decision.scenario` event, or decision entities with `severity`/`reviewDate` fields | ⚠️ **not found** in the files fetched this session — the ~40 files not individually fetched were not checked, so this is not proof of absence across the whole repo |
| `P.state.events` shape and `LEADOS` capitalization, as used in this brief | ⚠️ **not found** verbatim anywhere fetched — used here as this build's own internal contract, not a recovered fact |
| The 8 seed decisions and their calibration to land one in each of the 8 named quadrants | ⚠️ **fabricated**, disclosed in `seedIfEmpty()` in `index.html` |
| A single hand-authored `index.html`, instead of the real repo's Vite/React project | ⚠️ disclosed structural difference — this session's tools can only author one self-contained HTML file |

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-decision-surface:data`.
- The event log is append-only: `LEADOS.store.append()` always stamps real "now"; only the seed routine may backdate, and every event it writes is marked `meta.seeded: true` — checked live by Health check H6.
- Nothing derived is ever persisted: `project()` and `mapDecisionTopology()` recompute from the raw event array on every call — checked live by Health check H4 (projection purity).
- Every decision's score shows its exact arithmetic in an expandable "Show score math" panel on the Surface tab's detail view.
- The Health tab runs live, non-destructive checks in the browser and is the authority if it ever disagrees with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Verified the real repo via the GitHub Trees API plus raw fetches of `package.json`, `store.js`, and `engine.js` before writing any app code | The task requires inspecting actual code before claiming anything about it. |
| Disclosed that the real repo's namespace is `window.LeadOS`, not `LEADOS` as the pasted brief writes it, and that its real store key is `leados:data` | A one-letter capitalization difference is easy to gloss over; naming it explicitly stops this delivery from being mistaken for a recovered fact about the real code. |
| Disclosed that `LEADOS.decisionSurface`, `mapDecisionTopology`, `classifyDecisionQuadrant`, `decision.scenario`, and `P.state.events` were not found in any file fetched this session | Reporting "not found" honestly is better than assuming the pasted brief is a verbatim quote of real code — and honest about the limits of a partial-repo read (only 3 of ~40 files were fetched). |
| Built a fresh, minimal `LEADOS.store` / `LEADOS.engine.project` / `LEADOS.engine._days` scaffold rather than guessing at the real engine's actual per-domain shapes | This project's workspace started with no files at all — there is no Part 1/Part 2 implementation to build on here, and the brief's `P.state.events` / `d.severity` / `d.reviewDate` needed a concrete, documented definition to be runnable. |
| Implemented `mapDecisionTopology` and `classifyDecisionQuadrant` verbatim from the pasted brief | The brief supplies working code; reimplementing it differently would add risk without adding value. |
| Delivered as one self-contained `index.html` instead of a Vite/React tree | This session's tools can only create/edit a single HTML file — a disclosed, structural departure from the real repo's actual architecture (confirmed React+Vite this session), not a silent one. |
| Rendered the topology as a 2D canvas scatterplot (risk × reversibility) with node radius = pressure, rather than true 3D | The brief's own visualization note explicitly asks for "a 2D grid with 4 quadrants visible (pressure encoded as node size, not a third axis)" — matching the brief's own spec rather than adding unrequested 3D/WebGL complexity. |
| Hand-calibrated 8 seed decisions, one per quadrant (severity, cost, probability, review-date offset chosen to cross the 0.6 risk / 0.5 reversibility / 0.6 pressure thresholds in each direction) | Makes every one of the 8 named quadrants concretely reachable and checkable on first load, instead of requiring the user to hand-build test data; verified live by Health check H3. |
| Set seed review dates as `today + offsetDays` computed at seed time, not frozen ISO dates | Keeps the demo's risk/pressure numbers meaningful regardless of what day the app is opened, consistent with this family of builds' stated preference for recomputed-live over frozen-snapshot numbers. |
| Added `decision.resolved` as a new event type, with `openDecisions` driving the surface plot and all decisions (including resolved) shown in the Decisions table | The brief's topology is about *live* decision pressure; an ever-growing log of all-time decisions would clutter the surface forever without a way to retire a decided one, while append-only history is preserved for audit. |
| Added an 8-check Health tab (store round-trip, append-only immutability on a throwaway key, 8/8 quadrant reachability, projection purity, `_days()` arithmetic, seed-marking, score bounds, key isolation) | Mirrors this family of builds' own stated discipline ("nothing claimed without being checkable") without reusing any of the real repo's actual test code, which was not fetched this session. |
| Added an in-app "Verified vs Fabricated" tab duplicating the ledger above | So the disclosure travels with the running app, not only with the delivery documents. |
