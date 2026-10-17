# LEADOS — Visual Keyboard Guide Overlay

> **This is not a patch to `github.com/wbweve/Leados`.** That repository was
> fetched and read directly this session — `package.json`, the root-level
> `App.tsx`, `src/App.tsx`, both `CommandPalette.tsx` files (root and
> `src/components/`), `src/components/Shell.tsx`, and
> `src/components/SynthesisView.tsx` — before any code here was written.
> Full raw findings, exact URLs fetched, and a verified/fabricated ledger
> live in `AI-SESSION-LOG.md`. This delivery is a **disclosed,
> hand-authored vanilla HTML/CSS/JS re-implementation** of that repo's
> verified structure, extended with this session's keyboard-guide brief and
> typography spec — not a literal copy of the real product's `.tsx` source
> (or of the already-built `index.html` currently on `main`), which this
> tool cannot run and does not reuse verbatim.

## Run it

Open `index.html` directly in any browser. No build step, no dependencies
to install — Tailwind is loaded from a CDN `<script>` tag and everything
else is one inline `<script>` of vanilla JS. All state lives in exactly one
`localStorage` key: **`leados-keyboard:data`** — deliberately distinct from
the real repo's own store and from any other disclosed sandbox session's
key, so this build can never collide with another one on the same browser
origin.

## What's in this build

| Route | What it does |
|---|---|
| `#/today` | Active findings list, energy-balance and entropy snapshot. |
| `#/domains` | Per-domain open-count and decay-weighted score cards. |
| `#/synthesis` | The Organizational Moment, The Five Things That Matter, and The One Question — generated only on an explicit click or `⌘/Ctrl+Enter`, persisted as an append-only `synthesis.generated` event, with a staleness badge computed in memory from events logged since the last generation. |
| `#/lab` | Log a signal, log a decision, add a succession candidate, move a growth-plan level — changes here feed Synthesis and Health. |
| `#/health` | Five live, non-destructive self-checks (store-key isolation, append-only ids, synthesis history append-only, in-memory-only staleness, render-never-writes). |
| `#/about` | The verified/fabricated ledger for this exact build, live in the running app. |
| `#/log` | Raw event log, JSON export, wipe + reseed. |

## Typography (this delivery's explicit spec)

- **The Organizational Moment** — display serif ("Source Serif 4"), 15px,
  body-width (62ch), line-height 1.7. Meant to be read, not scanned.
- **The Five Things That Matter** — standard finding-card format, smaller
  type, rank badge + domain/leverage pills + an expandable detail line.
- **The One Question** — display serif, 24px, centered, `--ink-0`, with
  48px of padding and no other elements inside that frame. It should
  breathe.

None of these exact values exist in the real repo's verified
`SynthesisView.tsx` (which uses `text-[15px] leading-relaxed` sans-serif for
both the Moment and the Question, not serif/1.7/24px/centered) — this is a
deliberate upgrade specified by this session's brief, disclosed as such in
`AI-SESSION-LOG.md`.

## Visual Keyboard Guide Overlay (this delivery's headline feature)

Press **`?`** anywhere (outside a text field) to open a full-screen,
grouped keyboard map. It is organized into four groups so the
read-only/write-action boundary is visible at a glance, not just documented
in a table somewhere else:

**1. Navigation — no modifier, never writes data**

| Key | Action |
|---|---|
| `T` `D` `S` `L` `H` `A` `G` | Jump to Today / Domains / Synthesis / Lab / Health / About / Log (mnemonic) |
| `Esc` | Close palette / help overlay, or collapse the expanded item — always safe |

**2. Selection & lists — move the highlight, read-only**

| Key | Action |
|---|---|
| `J` / `↓` | Next item in the active list |
| `K` / `↑` | Previous item in the active list |
| `g g` | Jump to first item (press `g` twice within 400ms) |
| `Shift+G` | Jump to last item |
| `1`–`5` | Jump to Five Thing #N (Synthesis view) |
| `Enter` | Expand / collapse the highlighted item (read-only) |

**3. Command palette**

| Key | Action |
|---|---|
| `/` | Open Command Palette, search mode |
| `:` | Open Command Palette, command mode |
| `⌘`/`Ctrl`+`K` | Open Command Palette (conventional alias of `/`) |

**4. Write actions — require `⌘`/`Ctrl`, because they append to the event log**

| Key | Action |
|---|---|
| `⌘`/`Ctrl`+`Enter` | Submit the focused Lab form, or generate/regenerate Synthesis |
| `⌘`/`Ctrl`+`S` | Snooze the highlighted finding |
| `⌘`/`Ctrl`+`Shift`+`S` | Restore (un-snooze) the highlighted finding |
| `⌘`/`Ctrl`+`E` | Export the event log as JSON |
| `⌘`/`Ctrl`+`Backspace` | Wipe the event log (confirmation required) |

Only the bare, unmodified `/` → open-palette behavior is verified, real
behavior carried over from `src/App.tsx`. Every other binding above —
including `⌘K`, all of `J`/`K`/`gg`/`Shift+G`, `:`, the `1`–`5` jump, every
modifier-gated write action, and the entire `?` overlay itself — is this
session's own design, built to satisfy the "group shortcuts, modifiers only
for writes" brief. See `AI-SESSION-LOG.md` §5 for the full
fabricated-vs-verified list.

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-keyboard:data`.
- The event log is append-only; `project()` recomputes findings and domain
  scores from the raw event array on every call — nothing derived is
  cached in the store itself.
- `synthesis.generated` payloads are persisted as new log entries, never
  edited — the one disclosed exception to "nothing derived persists,"
  carried over faithfully from the verified real `SynthesisView.tsx`
  mechanism (`eventCountAtGeneration` snapshotted *before* the append).
- Synthesis is only ever generated by an explicit click or `⌘/Ctrl+Enter`;
  rendering, re-rendering, or navigating away and back never appends a new
  synthesis event — checked live in `#/health`.
- Every write action in the keyboard handler sits behind an
  `if (mod && ...)` branch; every navigation/traversal key returns before
  reaching any `append(...)` call. `#/health`'s "Rendering never writes an
  event" check is the authority if this document and the running app ever
  disagree.

## Changelog (this delivery)

See `AI-SESSION-LOG.md` §6 for the full table with one-line "why" per
non-obvious decision. Short version:

- Re-verified the real repo directly this session (package.json, both
  `App.tsx` files, both `CommandPalette.tsx` files, `Shell.tsx`,
  `SynthesisView.tsx`) rather than trusting the repo's own inherited
  README/session-log prose.
- Caught and disclosed that a prior session's claim — "the committed root
  `index.html` is a bare Vite shell" — is no longer true of the current
  `main` branch, which now holds a complete prior build at that path.
- Re-implemented the verified 7-route structure and the verified
  `synthesis.generated` append-only/staleness mechanism faithfully, in
  vanilla JS, independently hand-authored (not copied from the prior
  session's own `index.html`), because this tool cannot run the real
  Vite/React build.
- Implemented the Moment/Question typography spec exactly as given —
  display serif 15px/1.7 body-width for the Moment, 24px centered/48px
  breathing room for the Question — as a disclosed upgrade past the
  plainer, verified real implementation.
- Built the **Visual Keyboard Guide Overlay**: the `?` key opens a
  full-screen reference grouped into Navigation / Selection & lists /
  Command palette / Write actions, with an inline disclosure footer, so the
  read-vs-write modifier rule and the verified-vs-fabricated boundary are
  both visible at the moment a user is most likely to check them.
