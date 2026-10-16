# LeadOS pt-F — Adaptive Intelligence Renderer (single-file demo)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read this session (full tree via the Git Trees API, plus direct
> reads of `package.json`, the committed `index.html`, `main.tsx`, and
> `store.js`). It is a React 19 + Vite 7 + Tailwind 4 project built with
> `vite-plugin-singlefile`, with ~60 files sitting flat at repo root (no `js/`
> or `src/` directories) — not the vanilla-JS, 25-file, "no framework, no
> build step" architecture the pt-F brief assumes. Full evidence is in
> `AI-SESSION-LOG.md` §0. This delivery is a **fresh, self-contained,
> single-file reinterpretation** of the pt-F brief, built inside this
> session's own tooling constraint (one `index.html`), continuing the
> lineage's own established practice (visible in that repo's current
> `README.md`/`AI-SESSION-LOG.md` for its pt-D/pt-E deliveries) of labeling
> fabricated content instead of silently asserting it as real.

## Run it

Open `index.html` in a browser. That is the install. No server, no build
step for this file itself (the one disclosed exception: it loads
`@tailwindcss/browser` from `cdn.jsdelivr.net` for utility classes, because
this assistant's tooling requires that CDN reference — see "Disclosed
deviations" below).

## Files in this delivery

| File | Role |
|---|---|
| `index.html` | Everything: design tokens (3 themes), the adaptive layout-state engine, the finding-card/metric-card/person-row/heatmap/score-math components, command palette, keyboard shortcuts, toasts, and a fabricated demo data set — all in one file, per this assistant's own single-file delivery constraint. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-only log: what was verified about the real repo this session, and every disclosed decision/deviation in this delivery. |

**This table is the contract.** No `manifest.json`, `sw.js`, or `js/*.js`
files are shipped — see "Disclosed gaps" below for why, rather than
silently pretending they exist.

## What this is / isn't

- **Is**: a working, single-file demo of the pt-F brief's core idea — an
  interface that visibly reconfigures itself (7 layout states, 6 wired with
  live or simulatable triggers) around a finding-card component built close
  to the brief's pixel-level spec (severity bar, domain/rule/confidence
  chips, collapsible basis lines, confidence block, snooze-with-undo,
  dismiss-with-15s-undo, trace), a command palette, global keyboard
  shortcuts, three full themes (Obsidian/Parchment/Terminal), a Score Math
  Block that prints its own formula, and labeled fabricated demo data.
- **Is not**: the brief's full 144-rule / 22-module / 25-file engine. This
  demo ships **16 fabricated findings** and a small, transparent scoring
  function (`computeScore()`) as an illustrative subset — not a rules
  engine at the brief's claimed scale.
- **Is not**: a drop-in replacement for anything in the real
  `wbweve/Leados` repo, whose own vanilla-JS files (`store.js` et al. —
  verified present at repo root this session) use a different global
  (`window.LeadOS`), a different localStorage key (`leados:data`, vs this
  demo's `leados-ptf-demo:data`), and a different finding-key convention at
  a different rule-ID range (R1–R40 per that repo's prior session log,
  not independently re-verified by me beyond `store.js` itself this
  session).

## Verified vs. fabricated, at a glance

| Claim | Status |
|---|---|
| `github.com/wbweve/Leados` exists; tree has 60+ files, all at repo root, no subdirectories | ✅ verified this session (Git Trees API) |
| Real stack is React 19 + Vite 7 + Tailwind 4 + `vite-plugin-singlefile`, not vanilla JS / no-build | ✅ verified (read `package.json` directly) |
| Real committed `index.html` points at `<script type="module" src="/src/main.tsx">`, but `main.tsx` sits at repo root, not `/src/` — repo does not build as committed | ✅ verified (decoded the file via the GitHub Contents API myself) |
| Real `store.js` (root) uses global `window.LeadOS`, key `'leados:data'`, `SCHEMA_VERSION = 5`, `META_WHITELIST` with no `audit` field | ✅ verified (fetched and read `store.js` directly this session) |
| `store.js`'s own internal comments reference both `pt-6` (its `LINEAGE_TAG`) and `pt-15` (a comment citing "AI-SESSION-LOG pt-15 §62"), while the repo's current public README self-identifies as "pt-E" | ⚠️ observed discrepancy, not fully resolved — I did not fetch every intermediate session's log, so the exact numbering scheme across sessions is unverified by me beyond noting the inconsistency |
| Real rule set is R1–R40, real event registry has 92 types, real routes are `#/today #/roster #/insights #/patterns #/cadences #/data #/playbooks` | ⚠️ reported by the prior pt-E session's own `AI-SESSION-LOG.md` (which I read this session) — I did **not** independently re-fetch `engine.js`, `events.js`, `ui.js`, or `health.js` myself this session to re-confirm these specific numbers, so I'm not claiming first-hand verification of them |
| Brief's "144 rules, 22 modules, 100+ event types, 25-file `js/` structure" | ❌ does not match anything verified in the real repo (neither by me this session nor by the prior session's log) |
| This delivery's 16 findings, 6 people, 90 days of heatmap events, metric-card numbers | ⚠️ fabricated for this demo, generated by a seeded PRNG, labeled in-app and here |

## Implemented from the pt-F brief (this delivery)

- **Layout states**: CRISIS (sev-5 trigger, pulsing red bar, `[RESPOND NOW]`,
  rail auto-collapses), BOARD PREP (countdown banner, color shifts at ≤2
  days), SPRINT CLOSE (sprint card + `[CLOSE SPRINT]`), DEEP WORK (rail to
  icons, sev<4 collapsed into a summary row, minimal header), REVIEW (two
  column layout, rail hidden), ONBOARDING (real add-person form, growing
  underline) — reachable via `> reset onboarding`, since the demo seeds data
  on first load. STANDARD is the default.
- **Finding card**: severity bar (width + pulse glow on sev-5), domain /
  rule / confidence chips, NEW dot, collapsible basis lines, confidence
  block with the low-confidence warning, action bar (Open Playbook /
  Snooze / Dismiss-with-15s-undo-toast / Trace), snooze-fatigue state,
  acted-today chip.
- **Right panel**: opens on finding click, renders a **Score Math Block**
  that prints the formula (`sev × conf = base`, then each multiplier, then
  the effective score and rank), resizable via the divider (min 320/480px
  per the brief).
- **Command palette** (`Cmd/Ctrl+K`): fuzzy nav + `>` commands
  (`theme`, `focus`, `review`, `wide`, `crisis`, `export`, `reset onboarding`).
- **Keyboard shortcuts**: `Cmd/Ctrl+K`, `Escape`, `?`, `[`, nav letters
  `T R I W D H`, finding nav `J K Enter s d t`.
- **Three themes** (Obsidian/Parchment/Terminal), instant-swap, persisted in
  `localStorage['leados:theme']`.
- **Numeric formatting rules**: `fmtLarge()` (K/M/B + required unit label),
  `fmtPct()` (always one decimal), mono-for-every-number convention in CSS.
- **Metric card, person row, heatmap calendar, legacy scorecard** — built
  per their component specs, with demo data.

## Disclosed gaps (named, not hidden)

- **25-file structure → 1 file.** This assistant's own operating
  instructions require delivering a complete site as a single `index.html`.
  The brief's 25-file module system is not implemented as separate files;
  all logic lives in one `<script>` block inside `index.html`, organized
  into commented sections that mirror the brief's module names.
- **PWA (manifest.json / sw.js) → not shipped.** A real service worker must
  be a same-origin file fetched by the browser; it cannot be inlined as a
  `blob:`/`data:` URL and registered reliably. Since this delivery is
  constrained to one file, `manifest.json` and `sw.js` are not created. The
  UI still shows the "OFFLINE — expected" indicator and documents this gap
  rather than faking a working install prompt.
- **One CDN call.** `@tailwindcss/browser` is loaded from `cdn.jsdelivr.net`
  per this assistant's required template — this contradicts the brief's own
  "no CDN" non-negotiable. Disclosed here and in-code.
- **144 rules → 16 fabricated findings + 1 illustrative scoring function.**
  Not a claim of parity with the brief's scale.
- **Touch gestures (swipe-to-dismiss/snooze), pull-to-refresh, pinch-zoom,
  wheel-to-cycle-period** — specified in the brief, **not implemented** in
  this pass; mouse/keyboard equivalents exist for the same actions (Dismiss
  and Snooze buttons, `J/K/s/d/t`).
- **Full 52-week heatmap, Intelligence cluster map (node graph), Playbook
  form (smart textarea/date-picker/stepper), Conversations/Decisions/
  Resilience/Narrative modules** — not implemented in this pass. The
  Finding Card, Score Math Block, layout-state engine, command palette,
  and theming system were prioritized as the highest-value, most-specified
  parts of the brief given the single-response scope.

## The non-negotiables, as applied here

- All state in `localStorage` under one key: `leados-ptf-demo:data`
  (deliberately distinct from the real repo's `leados:data`, so this demo
  can never collide with a real install on the same origin).
- The append-only event log (`DATA.events`) is never rewritten in place.
- Every number that could be questioned is rendered in monospace.
- Every finding's Score Math Block prints its formula, not just a result.
- Every adaptation (layout state) is labeled in the rail footer and, for
  CRISIS/BOARD PREP/SPRINT CLOSE, in a dedicated banner.
- `#/health` (the Health view) runs live checks in the browser and is
  presented as the authority if it ever disagrees with this document.
