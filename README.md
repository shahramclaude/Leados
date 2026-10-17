# LeadOS pt-G — Adaptive Intelligence Interface (single-file demo)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was fetched and
> read directly this session (GitHub Trees API for the full file list, plus raw fetches of
> `package.json`, `store.js`, and `index.html`). It is a **React 19 + Vite 7 + Tailwind 4**
> project (`vite-plugin-singlefile`) with 60+ files flat at the repo root — no `js/` or
> `src/` directory — not the vanilla-JS, 25-file, "no framework, no build step"
> architecture the pt-G brief assumes. Full evidence, including one unresolved
> discrepancy, is in `AI-SESSION-LOG.md` §0. This delivery is a **fresh, self-contained,
> single-file reinterpretation** of the pt-G brief, continuing that repo's own disclosed
> practice of labeling fabricated/stubbed content instead of silently asserting it as real.

## Run it
Open `index.html` in a browser. That is the install. The one disclosed exception: it
loads `@tailwindcss/browser` from `cdn.jsdelivr.net`, required by this assistant's
delivery template (and a direct contradiction of the brief's own "no CDN" rule — see
below).

## Files in this delivery
| File | Role |
|---|---|
| `index.html` | Everything: 3 themes, append-only event store, a 6-rule engine computed from seeded demo data, the command palette, settings/rules management with a live impact preview, the narrative/anomaly/comparison system, a print stylesheet, and accessibility scaffolding — all in one file. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-only log of what was verified about the real repo, and every disclosed decision/deviation in this delivery. |

## What this is / isn't
- **Is**: a working single-file demo of the pt-G brief's core ideas — a command palette
  (`>`, `@`, `#`, `R###` prefixes; grouped results; keyboard nav; confirm-step for
  destructive commands), a settings interface where every number is tied to a real rule
  and shows a live before/after findings diff, a narrative layer (`dataStory` /
  `anomaly` / `compareContext`) that states what a number means without saying whether
  it's good or bad, a print stylesheet, and ARIA/focus-trap/keyboard-only accessibility
  for the findings list.
- **Is not**: the brief's full 144-rule / 22-module / 25-file engine, a PWA, or a
  drop-in replacement for anything in the real `wbweve/Leados` repo (different global —
  `LEADOS` here vs. the real repo's `window.LeadOS` — and a different, deliberately
  non-colliding localStorage key).

## Verified vs. fabricated, at a glance
| Claim | Status |
|---|---|
| `github.com/wbweve/Leados` exists; 60+ files, all at repo root, no `js/`/`src/` subdirectory | ✅ verified this session (GitHub Trees API) |
| Real stack is React 19 + Vite 7 + Tailwind 4 + vite-plugin-singlefile | ✅ verified (read `package.json` directly) |
| Real `store.js` uses `window.LeadOS`, key `'leados:data'`, `SCHEMA_VERSION = 5`, `LINEAGE_TAG 'pt-6'` | ✅ verified (read `store.js` directly) |
| Real repo's committed `index.html` currently renders as a prior "pt-F" single-file demo page | ⚠️ observed this session; conflicts with the repo's own README text about `/src/main.tsx` — not fully reconciled, see log §0 item 5 |
| Real rule set is R1–R40, 92 event types, routes `#/today #/roster #/insights #/patterns #/cadences #/data #/playbooks` | ⚠️ reported by the repo's own README (attributed to a prior session's log) — not independently re-fetched/re-verified by me this session |
| pt-G brief's "144 rules, 22 modules, 100+ event types, 25-file `js/` structure, PWA" | ❌ matches nothing verified in the real repo |
| This delivery's 6 computed rules, 3 people, 3 finance periods, 3 NPS periods, 4 sprints | ⚠️ fabricated for this demo, seeded once on first load, labeled in-app (About modal) and here |

## Implemented from the pt-G brief (this delivery)
- **Command palette** (`Cmd/Ctrl+K`): default view (recent / contextual top-3 findings /
  quick-log), `>` command registry (nav, theme, focus/wide mode, export JSON, export-to-print,
  seed, purge-with-typed-confirm, per-rule mute/explain, trace-by-event-type), `@person`,
  `#domain`, `R###` rule lookup, arrow-key navigation, focus trap + focus restoration.
- **Settings & Rules interface**: 7 setting groups from the brief (People & Cadences,
  Sales & Revenue, Operations & Delivery, Finance, Legal & Compliance, Executive & Board,
  Intelligence & Calibration), each field labeled with which rule it drives; a debounced
  (400ms) live preview that re-runs the engine with draft settings and reports exactly
  which findings would newly fire or resolve; an explicit **SAVE SETTINGS** button
  (append-only `settings.changed` events); a rules table with ACTIVE/MUTED/INACTIVE/NO
  DATA status, live finding counts, and per-rule mute/unmute.
- **Narrative / Data Storytelling**: every finding and metric card prints a one-sentence
  contextual narrative (states what the number means, never whether it's good/bad) followed
  by a mono, smaller, lower-contrast source line — per the brief's visual-hierarchy rule.
  Anomaly detection (spike / step-change / insufficient-data) and an internal
  comparison frame (best/worst/average period) run on real computed series. External
  benchmark comparison explicitly states "no `benchmark.set` events logged" rather than
  inventing an industry number.
- **Score Math Block**: right-panel drill-down prints `sev × conf = base`, the multiplier
  applied, the effective score, and rank — the full formula, not just a result.
- **Accessibility**: skip link, `aria-live` main region, `sr-only` badge counts, inside
  focus ring, `aria-label`/`aria-describedby` on every finding card and action button,
  `role="dialog" aria-modal="true"` + focus trap + focus restoration on the command
  palette and modals, keyboard-only findings flow (`J`/`K` move, `Enter` opens detail,
  `s` snoozes, `d` dismisses, `t` traces), and a `T_ACCESS` self-test.
- **Print stylesheet**: rail/overlay/toasts hidden, white surfaces, pattern-based severity
  borders (not color-only), expanded basis lines, `@page` margin-box footer/page-counter
  (Chromium 131+/Safari 18.2+, verified via web search this session) **plus** a flowed
  `.print-only` fallback footer so Firefox prints aren't silently missing it, and an
  "INTERNAL — Not for distribution" watermark set via the `>export pdf` command.
- **3 themes** (Obsidian/Parchment/Terminal), instant-swap, persisted in
  `localStorage['leados-ptg-demo:theme']`. Obsidian's hex values are copied verbatim from
  the brief's own contrast table; the other two are this session's own invented palette.
- **6-rule engine computed from an append-only event log**: `R1` (1:1 cadence overdue,
  per-person), `R7` (pulse load trigger), `R103` (gross margin floor breach + N-period
  decline), `R110` (LTV:CAC below convention threshold), `R120` (NPS decline, two
  consecutive periods), `R130` (sprint velocity decline, linear regression + zero-crossing
  projection). All findings, scores, and narrative sentences are computed live from seeded
  events — nothing is a hard-coded display string.
- **Health suite** (`#/health`): `T_STORE`, `T_APPEND_ONLY`, `T_ENGINE`, `T_MUTE`,
  `T_ACCESS`, `T_PRINT` — live, in-browser, no external runner.

## Disclosed gaps (named, not hidden)
- **25/27-file structure → 1 file** (this assistant's own single-file constraint).
- **No `manifest.json` / `sw.js`** — can't be reliably inlined in one file; the "OFFLINE —
  expected" badge documents this instead of faking a working install prompt.
- **One CDN script tag**, contradicting the brief's own "no CDN" rule.
- **144 rules → 6 computed rules + 14 illustrative stub rows** in the rules table.
- **`computeImpact()` → settings-only preview**, not an arbitrary-proposed-event virtual
  diff (see log §1.6).
- **Snooze is logged but not yet enforced** by the engine (a disclosed stub — see code
  comment at the snooze action handler and log §1.8).
- **Playbook wizard, 52-week heatmap, cluster-map, Conversations/Resilience/Narrative
  modules, touch gestures, full WCAG AAA audit** — not implemented in this pass.

## The non-negotiables, as applied here
- All state in `localStorage` under one key, `leados-ptg-demo:data` — deliberately distinct
  from the real repo's `leados:data` so this demo can never collide with a real install on
  the same origin.
- The event log (`events[]`) is append-only; mute/unmute, settings changes, snooze/dismiss,
  and quick-log actions all write new events, never rewrite old ones.
- Every number that could be questioned is rendered in monospace with a source line.
- Every finding's Score Math Block prints its formula, not just a result.
- `#/health` runs live checks in the browser and is the authority if it ever disagrees
  with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Verified the real repo via GitHub API + raw file fetches before writing anything | The task explicitly requires inspecting actual code before claiming anything about it — training-data assumptions about this repo would very likely be wrong given how much it has evidently changed across prior sessions. |
| Built a fresh single-file reinterpretation instead of attempting to "merge" pt-G into the real repo | The real repo is a React/Vite SPA with 60+ root-level files; this assistant can only deliver one `index.html`. Pretending to patch 27 files that don't structurally exist here would misrepresent what was actually done. |
| Used `LEADOS` (not `LeadOS`) as the global and a distinct localStorage key `leados-ptg-demo:data` | Keeps this demo from ever silently colliding with a real `wbweve/Leados` install opened on the same origin/browser profile, while still following the brief's exact naming for its own APIs (`LEADOS.command`, `LEADOS.engine`, etc.). |
| Implemented exactly 6 rules, fully computed, instead of stubbing all 144 with fake text | A smaller set of real, number-driven findings is more honest and more inspectable than a large set of hard-coded display strings that only look like a rules engine. |
| Settings → Rules live preview is scoped to draft settings, not arbitrary proposed events | The brief's full `computeImpact()` deep-clones an entire virtual event log for any proposed event; implementing that generally (for 1 event type or 100) was out of scope for one response. The settings-only version still demonstrates the "see the diff before you save" principle end-to-end against the real engine. |
| Added a `.print-only` flowed footer alongside the spec's `@page` margin-box footer | Web search this session confirmed `@page` margin boxes are Chromium 131+/Safari 18.2+ only; Firefox ignores them entirely. Implementing only the spec'd CSS would silently produce a footer-less print in Firefox. |
| NPS/velocity/margin "external benchmark" lines say "no `benchmark.set` events logged" rather than printing an industry number | The brief's own rule for the narrative system is "never add uncertainty, never claim something the data doesn't support." Inventing an industry percentile with no source would violate that rule this whole system is supposed to enforce. |
| Snooze logs an event and offers an undo toast, but doesn't yet filter the findings list | Disclosed as a stub rather than silently wired to look functional — flagged in-code and in the session log so it isn't mistaken for a finished feature. |
