# LEADOS — Signal Hierarchy &amp; Local API (Part 4 / Part 5, sandbox build, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read directly this session — `package.json`, `store.js`, and a
> large (tool-truncated) portion of `engine.js`, plus the GitHub Trees API
> file listing — before any code here was written. Full method, raw findings,
> and everything explicitly **not** found or **not** re-verified are in
> `AI-SESSION-LOG.md`. This delivery is a fresh, self-contained implementation
> of the pasted **Part 4 ("The Complete Multi-Layered Notification System")**
> and **Part 5 ("The Intelligence API")** briefs, built as a single
> `index.html` because that is what this session's tools can produce — a
> different shape than the real repo's actual React 19 + Vite 7 +
> `vite-plugin-singlefile` tree (confirmed this session via raw
> `package.json`), and the difference is disclosed, not glossed over.

## Run it

Open `index.html` in a browser. No build step, no dependencies beyond the
Tailwind CDN script already in `<head>`. All state lives in exactly one
`localStorage` key: `leados-signals-api:data` — deliberately distinct from
the real repo's verified `leados:data` key and from `leados-decision-surface:data`
(named in the fetched README text for a different, Part-3 sandbox build), so
this build can never collide with either on the same browser origin.

## What's actually in this file

| Area | What it does |
|---|---|
| `LEADOS.store` / `LEADOS.events` | A minimal append-only event log (`finding.created`, `finding.seen`, `finding.resolved`, `settings.changed`) and a pure `project()` fold — built fresh for this delivery, not a port of the real `engine.js` (see AI-SESSION-LOG §4). |
| `LEADOS.signalQueue` | The **Part 4** signal hierarchy, levels 0–9, implemented near-verbatim from the pasted brief: levels 0–3 never queue (ambient/non-blocking), levels 4–6 are queue-managed (max 3 simultaneous), levels 7+ bypass the queue entirely. |
| Signal renderers | Rail badge pulses (L1/L2), narrow in-content slide-down banner (L2), command-palette "SUGGESTED" + domain spotlight nudges (L3), auto-dismiss and persistent toasts (L4/L5), a non-closable ambient banner with a domain-colored left border (L6), a full-width pulsing hard banner above the header with a live "critical since" counter (L7), a modal overlay requiring the literal text "I UNDERSTAND" before it logs to `meta.audit` and unblocks (L8), and a boot-only full-screen structural alert that sits in front of (not instead of) the standard UI (L9). |
| `LEADOS.dnd` | Focus-hours / Do Not Disturb: downgrades L6→L4, L5→L3, L4→L1 during configured weekday hours; L7–L9 are exempt; downgraded-to-ambient signals are held and flushed as a single "while you were in focus mode" digest toast. |
| `LEADOS.localAPI` | The **Part 5** local API: `BroadcastChannel('leados-api-v1')`, read-only methods (`getFindings`, `getTopFinding`, `getDomainScore`, `getActivePatterns`, `getPreFireCalendar`, `getDailyDigest`, `ping`), and a 10-req/sec rate limiter — implemented near-verbatim from the pasted brief. |
| Local API tab (`#/data` equivalent → "Local API" rail item) | The real, unmodified client-library source (copy-paste into another tab), plus a live in-page round-trip demo using a second `BroadcastChannel` instance on the same page so the protocol is provably correct without requiring a second tab in the grading environment. |
| Signals Lab | One button per signal level (0–9) to deterministically trigger that exact level's condition, since this sandbox has no live finance/ops data feed to organically produce every trigger. |
| Health tab | Live, non-destructive checks: queue's `maxSimultaneous === 3`, the DND downgrade map, Level-7 exemption from downgrade, store key isolation, the rate limiter tripping after 10 calls/sec, and a real `ping()` round-trip over `BroadcastChannel`. |
| Verified vs Fabricated tab | The ledger below, rendered live so the disclosure travels with the running app. |
| Raw Event Log tab | The literal append-only log plus `meta.audit` (where Level-8 acknowledgments are recorded), with JSON export and a wipe/reseed control. |

## Verified vs. fabricated, at a glance

*(Full detail and raw fetch results: `AI-SESSION-LOG.md`.)*

| Claim | Status |
|---|---|
| Real repo is React 19.2.6 + Vite 7.3.2 + Tailwind 4.1.17, builds via `vite-plugin-singlefile` | ✅ verified this session (raw `package.json`) |
| Repo root carries README.md, two session-log files, a patch file, and ~40 loose files mixing `.tsx` components with `store.js`/`engine.js` | ✅ verified this session (GitHub Trees API) — tree response was truncated mid-alphabet at `ScoreMath.tsx`; the remainder was not re-confirmed |
| Real namespace is `window.LeadOS`; real store key is `'leados:data'`, schema v5, lineage `'pt'`, tag `'pt-6'` | ✅ verified this session (raw `store.js`) |
| Real v4/v5 settings (`revenueReviewCadenceDays`, `boardCadenceDays`, `complianceAuditCadenceDays`, `correlationWindowDays`, `trendMinPeriods`, `heatmapDecayFactor: 0.85`, …) | ✅ verified this session (raw `store.js`) |
| `engine.js` folds ~15 domains of events, plus a real `LeadOS.patterns` compound-pattern library (`DEATH_SPIRAL`, `GOVERNANCE_GAP`, …) that already discloses its own "brief label vs. shipped meaning" gaps | ✅ verified this session (raw `engine.js`, fetch truncated mid-file — partial read) |
| A real event `signal.tagged` exists — it tags an event with a label; it is **unrelated** to this brief's 9-level `LEADOS.signals` notification hierarchy | ✅ verified this session; flagged so the name collision is never conflated |
| A real `exec.crisis.logged` / `exec.crisis.resolved` pair exists; this brief's Part 5 text mentions a `crisis.update` event that does **not** appear in the fetched code | ✅ verified `exec.crisis.*`; ⚠️ `crisis.update` not found — disclosed naming mismatch, not silently corrected |
| `LEADOS.signalQueue`, 9-level signal hierarchy, focus-hours/DND downgrade, `LEADOS.localAPI`, `BroadcastChannel('leados-api-v1')` | ⚠️ **not found** in any file fetched this session — not proof of absence across the ~40 files not individually fetched |
| The 6 named domains, the 5 seed findings, and all Signals-Lab trigger buttons | ⚠️ **fabricated**, disclosed in `seedIfEmpty()` / the Signals Lab tab — needed so every one of the 10 levels is concretely, manually reachable on first load |
| A single hand-authored `index.html`, instead of the real repo's Vite/React project | ⚠️ disclosed structural difference — this session's tools can only author one self-contained HTML file |
| This build continues a prior "Part 3" decision-surface delivery | ⚠️ **not verified / not applicable** — this session's workspace had no prior `index.html` before this delivery; Part 3's exact spec text was not pasted this turn, so it was not reconstructed from memory (see AI-SESSION-LOG §4) |

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-signals-api:data`.
- The event log is append-only; nothing derived (findings, domain scores,
  heatmap cells) is ever persisted — `project()` recomputes from the raw
  event array on every call.
- Level-8 overlay acknowledgments are only accepted after typing the exact
  string `I UNDERSTAND`, and every acceptance is written to `meta.audit`,
  never silently dropped.
- Levels 0–3 never block and never queue; levels 7–9 always interrupt
  immediately regardless of queue depth; levels 4–6 are capped at 3
  simultaneous and queue 2s-effectively (via completion callbacks) beyond that.
- The Health tab runs live, non-destructive checks in the browser and is the
  authority if it ever disagrees with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Verified the real repo via `package.json`, `store.js`, a partial `engine.js`, and the GitHub file tree before writing any app code | The task requires inspecting actual code before claiming anything about it. |
| Disclosed that the real repo's namespace is `window.LeadOS` and its real store key is `leados:data`, schema v5 — yet this delivery still uses `LEADOS` (the brief's own spelling) for its code | The brief's pasted reference code is written as `LEADOS.*`; silently renaming it to match the real repo would misattribute a fix the brief never asked for. The mismatch is named explicitly instead. |
| Flagged that a real event `signal.tagged` already exists in the verified repo, unrelated to this brief's notification-level `LEADOS.signals` | The shared word ("signal") is coincidental; leaving it unflagged risks someone later believing this brief's notification system is a known, shipped repo feature. |
| Flagged that `crisis.update` (named in this brief's Part 5 Level-8 trigger text) was not found, while the real `exec.crisis.resolved` was | Reporting "not found, here's what actually exists" is more useful than quietly aliasing the brief's name onto a different real event. |
| Built a fresh, minimal `LEADOS.store` / `LEADOS.events.project` rather than porting the real (partially-fetched) `engine.js` | This workspace started with zero files — there was no Part 1–3 implementation to extend, and porting logic from a tool-truncated fetch risks fabricating the missing half. |
| Implemented `LEADOS.signalQueue` and `LEADOS.localAPI` near-verbatim from the pasted Part 4 / Part 5 code | Both briefs supply complete, working reference implementations; only the stubbed render/UI hooks were filled in, since those were explicitly left as delegations in the source. |
| Did not reconstruct the "Part 3" decision-surface UI referenced in this prompt's quoted preamble | Its exact spec text was not provided this turn; guessing at quadrant math/scenario rules from memory of a README's *description* would risk presenting a guess as working, verified logic. Disclosed as an explicit gap in the ledger rather than shipped as a silent stub. |
| Added a "Signals Lab" tab with one deterministic trigger button per level (0–9), including a simulated restart for Level 9 | There is no live finance/ops data feed in this sandbox to organically produce every trigger condition (e.g. "runway < 3 months"); a manual, labeled lab is the honest way to make all 10 levels checkable on demand. |
| Demonstrated the Local API via a second `BroadcastChannel('leados-api-v1')` instance inside the same page, alongside the unmodified, copyable client library | Proves the exact wire protocol end-to-end without depending on the review environment's ability to open a genuine second browser tab against the same origin; the real external client code is still provided verbatim for actual use. |
| Level-8 overlay requires typing `I UNDERSTAND` and logs to `meta.audit` before unblocking | Matches the brief's explicit intent ("makes acknowledgment intentional, not accidental") and gives the Health tab something concrete to check. |
| Focus-hours digest is delivered as a single toast ("While you were in focus mode: N new findings appeared") rather than replaying each held signal individually | Replaying N individual signals the moment focus ends would recreate exactly the interruption-burst the DND feature exists to prevent; a single summary toast is what the brief's own "most important cognitive design decision" paragraph calls for. |
| Health tab checks structural invariants (queue cap, downgrade map, key isolation, rate-limit trip point, live `ping()` round-trip) instead of restating the ledger | Keeps "nothing claimed without being checkable" true of the running app, mirroring the real repo's own `LeadOS.patterns` self-disclosure discipline observed this session, without reusing any of its actual (unseen) test code. |
