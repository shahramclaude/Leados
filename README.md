# LeadOS pt-G demo — Adaptive Intelligence Interface (single-file, unofficial)

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read directly this session (GitHub Trees API for the full file
> list, plus raw fetches of `package.json`, `store.js`, and `index.html`). It
> is a **React 19 + Vite 7 + Tailwind 4** project (`vite-plugin-singlefile`)
> with 60+ files flat at the repo root — no `js/` or `src/` directory — not
> the vanilla-JS, no-build-step architecture the pasted "pt-G" brief assumes.
> Full evidence, including one unresolved discrepancy (the repo's committed
> `index.html` currently renders what looks like an older single-file demo
> page, not a Vite entry point), is in `AI-SESSION-LOG.md` §0. This delivery
> is a **fresh, self-contained, single-file reinterpretation** of the pasted
> brief's Parts 5–10, continuing the real repo's own disclosed practice of
> labeling fabricated/stubbed content instead of silently asserting it as real.

## Run it

Open `index.html` in a browser. That is the install. The one disclosed
exception: it loads `@tailwindcss/browser` from `cdn.jsdelivr.net`, required
by this assistant's delivery template — and a direct contradiction of the
brief's own "no CDN" rule (see below).

## Files in this delivery

| File | Role |
|---|---|
| `index.html` | Everything: 3 themes, an append-only event store, a 6-rule engine computed from seeded demo data, the command palette, a settings/rules interface with a live before/after impact preview, the narrative/anomaly/comparison system, a print stylesheet, and accessibility scaffolding — all in one file. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-only log of what was verified about the real `wbweve/Leados` repo, and every disclosed decision/deviation in this delivery. |

## What this is / isn't

- **Is**: a working single-file demo of the pasted brief's Part 5–10 ideas —
  a real `computeImpact()` (deep-clone state, append proposed events, diff
  findings) wired into a live settings preview; a command palette (`>`, `@`,
  `#`, `R###` prefixes, grouped results, keyboard nav, focus trap, typed
  confirm for destructive actions); a narrative layer (`dataStory` /
  `anomaly` / `compareContext`) that states what a number means without
  saying whether it's good or bad; a print stylesheet with pattern-based
  (not color-only) severity borders; and a keyboard-only findings journey
  with an in-browser accessibility self-test.
- **Is not**: the brief's full 144-rule / 22-module / 25-file engine, a PWA,
  or a drop-in replacement for anything in the real `wbweve/Leados` repo
  (different global — `LEADOS` here vs. the real repo's `window.LeadOS` —
  and a different, deliberately non-colliding localStorage key).

## Verified vs. fabricated, at a glance

| Claim | Status |
|---|---|
| `github.com/wbweve/Leados` exists; 60+ files, all at repo root, no `js/`/`src/` subdirectory | ✅ verified this session (GitHub Trees API) |
| Real stack is React 19 + Vite 7 + Tailwind 4 + `vite-plugin-singlefile` | ✅ verified (read `package.json` directly) |
| Real `store.js` uses `window.LeadOS`, key `'leados:data'`, `SCHEMA_VERSION = 5`, `LINEAGE_TAG 'pt-6'`, a real append-only migration chain | ✅ verified (read `store.js` directly) |
| Real repo's committed root `index.html` currently renders a prior single-file demo page ("pt-G demo … OFFLINE — expected") | ⚠️ observed this session; not reconciled with the Vite/React stack — see log §0 item 5 |
| Real rule set is R1–R40, 92 event types, routes `#/today #/roster #/insights #/patterns #/cadences #/data #/playbooks` | ⚠️ reported by the repo's own README — **not independently re-verified by this session** |
| Pasted brief's "144 rules, 22 modules, 100+ event types, 25-file `js/` structure, PWA" | ❌ matches nothing verified in the real repo |
| This delivery's 6 computed rules, 3 people, 3 finance periods, 2 NPS periods, 4 sprints | ⚠️ fabricated for this demo, seeded once on first load |

## Implemented from the pasted brief (this delivery)

- **Impact Analysis (`computeImpact`)**: implemented exactly as specified —
  deep-clones real state, appends proposed `[type, data]` events to a virtual
  copy, reruns the engine on both, diffs finding keys into `resolved` /
  `created`. Wired into the Settings page's live, 300ms-debounced preview.
  Disabled above 2000 events with the brief's exact message.
- **Data Storytelling**: `dataStory()` for 6 real metrics (gross margin,
  LTV:CAC, pulse load, NPS, velocity, 1:1 gap), each followed by a smaller,
  lower-contrast, monospace source line. `anomaly()` detects spikes and step
  changes over real computed series. `compareContext()` reports internal
  best/worst/average; external benchmark explicitly says "no `benchmark.set`
  events logged" rather than inventing an industry number.
- **Command palette** (`Cmd/Ctrl+K`): default view (recent / contextual
  top-3 findings / quick-log), `>` command registry, `@person`, `#domain`,
  `R###` lookup, arrow-key nav, in-panel focus trap + focus restoration.
- **Settings & Rules interface**: 4 settings wired to real rules (R1, R7,
  R103, R110) each with a live before/after findings diff and an explicit
  **SAVE SETTINGS** button; the remaining brief-specified setting groups are
  shown as labeled, display-only reference rows (not wired to any rule in
  this demo); a rules table with ACTIVE/MUTED/INACTIVE/NO DATA status, live
  finding counts, per-rule mute/unmute/explain.
- **Score Math Block**: every finding's detail panel prints
  `sev × conf = base`, the multiplier, the effective score, and rank.
- **Accessibility**: skip link, `aria-live` main region, `sr-only` badge
  text, inside focus ring, `aria-label`/`aria-describedby` on every finding
  card, keyboard-only findings flow (`J`/`K` move, `Enter` opens score math,
  `s` snooze, `d` dismiss, `t` trace), and a `T_ACCESS` self-test.
- **Print stylesheet**: chrome hidden, white surfaces, pattern-based (not
  color-only) severity-5 border, expanded detail blocks, an
  "INTERNAL — Not for distribution" watermark activated by the
  `>export pdf` command.
- **3 themes** (Obsidian / Parchment / Terminal), instant-swap, persisted in
  `localStorage['leados-ptg-demo:theme']`. Obsidian's hex values are copied
  from the pasted brief's own contrast table; the other two are this
  session's own palette, unverified against any real repo asset.
- **6-rule engine, fully computed** from an append-only event log: R1 (1:1
  cadence overdue), R7 (pulse load trigger), R103 (gross margin floor +
  decline), R110 (LTV:CAC below convention), R120 (NPS decline), R130
  (sprint velocity decline, linear regression + zero-crossing projection).
- **Health suite** (`#/health`): `T_STORE`, `T_APPEND_ONLY`, `T_ENGINE`,
  `T_MUTE`, `T_ACCESS`, `T_PRINT` — live, in-browser, no external runner.

## Disclosed gaps (named, not hidden)

- **27-file brief structure → 1 file** (this assistant's single-file constraint).
- **No `manifest.json` / `sw.js`** — can't be reliably inlined in one file.
- **One CDN script tag**, contradicting the brief's own "no CDN" rule.
- **144 rules → 6 computed rules**, no fabricated placeholder rows for the rest.
- **25+ settings → 4 wired, rest display-only**, each clearly labeled.
- Playbook buttons open a labeled stub toast rather than a real wizard.
- `undo`, `digest`, `review`, and the 5 automation bundles are stub toasts.
- Snooze is enforced by the engine (filters the active list) but has no
  undo toast, only a pointer to the append-only event log.

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-ptg-demo:data` —
  deliberately distinct from the real repo's `leados:data` so this demo can
  never collide with a real install on the same origin.
- The event log (`events[]`) is append-only; mute/unmute, settings changes,
  snooze/dismiss, and quick-log actions all write new events, never rewrite
  old ones (`T_APPEND_ONLY` checks this live).
- Every number that could be questioned renders in monospace with a source
  line and, where applicable, a score-math block showing its formula.
- `#/health` runs live checks in the browser and is the authority if it ever
  disagrees with this document.

---

## Changelog (this delivery)

| Change | Why |
|---|---|
| Verified the real repo via GitHub Trees API + raw file fetches (`package.json`, `store.js`, `index.html`) before writing anything | The task explicitly requires inspecting actual code before claiming anything about it. |
| Built a fresh single-file reinterpretation instead of attempting to "patch" the pasted brief's 27-file structure into the real repo | The real repo is a React/Vite SPA with 60+ root-level files and a different global/storage contract; this assistant delivers one `index.html`. Claiming to patch files that don't exist here would misrepresent what was done. |
| Used `LEADOS` (not `LeadOS`) and a distinct localStorage key `leados-ptg-demo:data` | Prevents this demo from ever silently colliding with a real `wbweve/Leados` install opened in the same browser profile. |
| Implemented exactly 6 rules, fully computed, instead of stubbing all 144 with display text | A small set of real, number-driven findings is more honest and inspectable than a large table that only *looks* like a rules engine. |
| Implemented `computeImpact()` generically (any `[type,data]` tuples), not settings-only | The pasted brief's own pseudocode is generic; the generic version was achievable this session and is more faithful than a narrower settings-only shortcut. |
| External benchmark lines say "no `benchmark.set` events logged" instead of printing an industry number | The brief's own narrative rule is "never add uncertainty the data doesn't support" — inventing an industry percentile with no source would violate the exact rule this system exists to enforce. |
| Dropped the brief's `@page` margin-box print footer in favor of a flowed `.print-footer-flow` block | Treated as a cross-browser-support risk (not re-verified via search this session — flagged in the log) rather than silently shipping a footer that might render in only some browsers. |
| Snooze now actually filters the findings list (ahead of a "logged but not enforced" stub pattern) | A snooze that doesn't hide the finding is confusing in a working demo; enforcing it was low-cost and testable via `T_MUTE`-style logic reuse. |
| Playbook buttons, bundles, undo, digest, and weekly review all show an explicit "disclosed stub" toast instead of silently doing nothing | Matches the non-negotiable that the interface never lies — a button that does nothing with no feedback is a worse failure mode than one that tells you it's not implemented. |
