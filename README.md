# LEADOS — Part 7: The Complete Keyboard Experience

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read directly this session — `package.json`, both copies of
> `App.tsx` (root-level and `src/`), both copies of `CommandPalette.tsx`,
> `src/components/Shell.tsx`, and `src/components/SynthesisView.tsx` — before
> any code here was written. Full raw findings, exact URLs fetched, and a
> verified/fabricated ledger live in `AI-SESSION-LOG.md`. This delivery is a
> **disclosed, hand-authored vanilla HTML/CSS/JS re-implementation** of that
> repo's verified structure, extended with this session's Part 7 brief (the
> full keyboard interface) and typography spec — not a literal copy of the
> real product's `.tsx` source, which this tool cannot build or run.

## Run it

Open `index.html` directly in any browser. No build step, no dependencies to
install — Tailwind is loaded from a CDN `<script>` tag and everything else is
one inline `<script>` of vanilla JS. All state lives in exactly one
`localStorage` key: **`leados-keyboard:data`** — deliberately distinct from
the real repo's key and from any other disclosed sandbox session's key, so
this build can never collide with another one on the same browser origin.

## What's in this build

| Route | What it does |
|---|---|
| `#/today` | Active findings list, energy-balance and entropy snapshot. |
| `#/domains` | Per-domain open-count and decay-weighted score cards. |
| `#/synthesis` | **The headline deliverable.** The Organizational Moment, The Five Things That Matter, and The One Question — generated only on an explicit click, persisted as an append-only `synthesis.generated` event, with a staleness badge computed in memory from events logged since the last generation. |
| `#/lab` | Log a signal, log a decision, add a succession candidate, move a growth-plan level — changes here feed Synthesis and Health. |
| `#/health` | Five live, non-destructive self-checks (store-key isolation, append-only ids, synthesis history append-only, in-memory-only staleness, render-never-writes). |
| `#/about` | The verified/fabricated ledger for this exact build, live in the running app. |
| `#/log` | Raw event log, JSON export, wipe + reseed. |

## Typography (this delivery's explicit spec)

- **The Organizational Moment** — display serif ("Source Serif 4"), 15px,
  body-width (62ch), line-height 1.7. Meant to be read, not scanned.
- **The Five Things That Matter** — standard finding-card format, smaller
  type, rank badge + domain/leverage pills + an expandable detail line.
- **The One Question** — display serif, 24px, centered, `--ink-0`, with 48px
  of padding and no other elements inside that frame. It should breathe.

None of these exact values exist in the real repo's verified `SynthesisView.tsx`
(which uses `text-[15px] leading-relaxed` sans-serif for both the Moment and
the Question, not serif/1.7/24px/centered) — this is a deliberate upgrade
specified by this session's brief, disclosed as such in `AI-SESSION-LOG.md`.

## Part 7: The Complete Keyboard Experience

The interface works completely without a mouse. Press **`?`** anywhere to
open the full in-app keyboard map. Summary:

**Navigation — no modifier, never writes data:**

| Key | Action |
|---|---|
| `T` `D` `S` `L` `H` `A` `G` | Jump to Today / Domains / Synthesis / Lab / Health / About / Log (mnemonic) |
| `J` / `↓` | Next item in the active list |
| `K` / `↑` | Previous item in the active list |
| `g g` | Jump to first item (press `g` twice within 400ms) |
| `Shift+G` | Jump to last item |
| `1`–`5` | Jump to Five Thing #N (Synthesis view) |
| `Enter` | Expand / collapse the highlighted item (read-only) |
| `/` | Open Command Palette, search mode |
| `:` | Open Command Palette, command mode |
| `?` | Toggle the keyboard-map help overlay |
| `Esc` | Close palette / help / collapse — always safe, always available |

**Actions — require `⌘`/`Ctrl`, because they append to the event log:**

| Key | Action |
|---|---|
| `⌘/Ctrl+K` | Open Command Palette (conventional alias of `/`) |
| `⌘/Ctrl+Enter` | Submit the focused Lab form, or generate/regenerate Synthesis |
| `⌘/Ctrl+S` | Snooze the highlighted finding |
| `⌘/Ctrl+Shift+S` | Restore (un-snooze) the highlighted finding |
| `⌘/Ctrl+E` | Export the event log as JSON |
| `⌘/Ctrl+Backspace` | Wipe the event log (confirmation required) |

Only the bare, unmodified `/` → open-palette behavior is verified, real
behavior carried over from `src/App.tsx`. Every other binding above —
including `⌘K`, all of J/K/gg/Shift+G, `:`, and every modifier-gated write
action — is this session's own design, built to satisfy the explicit "three
types of shortcut" / "modifiers only for writes" rules in this session's
brief. See `AI-SESSION-LOG.md` §4 for the full fabricated-vs-verified list.

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-keyboard:data`.
- The event log is append-only; `project()` recomputes findings and domain
  scores from the raw event array on every call — nothing derived is cached
  in the store itself.
- `synthesis.generated` payloads are persisted as new log entries, never
  edited — the one disclosed exception to "nothing derived persists,"
  carried over faithfully from the verified real `SynthesisView.tsx`
  mechanism (`eventCountAtGeneration` snapshotted *before* the append).
- Synthesis is only ever generated by an explicit click or `⌘/Ctrl+Enter`;
  rendering, re-rendering, or navigating away and back never appends a new
  synthesis event — checked live in `#/health`.
- Every write action in the keyboard handler sits behind an `if (mod && ...)`
  branch; every navigation/traversal key returns before reaching any `append(...)`
  call. `#/health`'s "Rendering never writes an event" check is the
  authority if this document and the running app ever disagree.

## Changelog (this delivery)

See `AI-SESSION-LOG.md` §6 for the full table with one-line "why" per
non-obvious decision. Short version:

- Verified the real repo directly (package.json, two `App.tsx`s, two
  `CommandPalette.tsx`s, `Shell.tsx`, `SynthesisView.tsx`) before writing
  anything, including re-checking a prior session's own claims rather than
  trusting its README.
- Discovered the committed root `index.html` is a bare Vite shell, not a
  runnable app — disclosed so this delivery isn't mistaken for "the same
  file, just open it."
- Re-implemented the verified 7-route structure and the verified
  `synthesis.generated` append-only/staleness mechanism faithfully, in
  vanilla JS, because this tool cannot run the real Vite/React build.
- Implemented the Moment/Question typography spec exactly as given —
  display serif 15px/1.7 body-width for the Moment, 24px centered/48px
  breathing room for the Question — as a disclosed upgrade past the plainer,
  verified real implementation.
- Built the full Part 7 keyboard system (mnemonics, vim-style J/K/gg/`:`,
  conventional `⌘K`/`⌘Enter`/`Esc`) from scratch, since only the bare `/`
  shortcut exists in the verified source, with every data-writing shortcut
  deliberately gated behind `⌘`/`Ctrl` and every navigation shortcut
  deliberately left unmodified.
