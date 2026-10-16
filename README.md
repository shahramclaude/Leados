# LeadOS pt-A — Design System & Interaction Architecture (reference build)

A single-file implementation of the **pt-A** brief: a complete design
token system, component library, navigation rail, command palette, and
interaction layer for a "leadership intelligence" interface. Open
`index.html` in any modern browser — no server, build step, or network
call.

> **This is not a verified continuation of `github.com/wbweve/Leados`'s
> real engine/rules/health code.** See "What was actually inspected"
> below and `AI-SESSION-LOG.md` §0 for the full audit. The pt-A brief is
> scoped to CSS + UI architecture, not rule semantics, so this build
> ships that layer against a small, clearly-labeled sample data set.

## What was actually inspected (and what wasn't)

| Area | Status |
|---|---|
| `github.com/wbweve/Leados` README content | **Verified** — fetched and read in full. Describes "pt-15", 41 event contracts, 13 rules, schema v15, and claims exactly 3 files ship. |
| Actual git tree at HEAD | **Byte-verified via GitHub's Git Trees API**: 21 entries, including loose `app.css`, `engine.js`, `events.js`, `health.js`, `playbooks.js`, `rules.js`, `store.js`, `ui.js`, **and** an unrelated React/Vite scaffold (`App.tsx`, `main.tsx`, `vite.config.ts`, `tsconfig.json`, `package.json`). This **contradicts** the README's "exactly 3 files" claim. |
| Real contents of `index.html`, `engine.js`, `ui.js`, `app.css`, `health.js`, `playbooks.js`, `store.js` | **NOT obtained.** The fetch tooling available this session strips/renders script and style content from the large (145 KB+) `index.html`, returning almost no usable text. The other files (24–175 KB each) were not individually fetched this session (budget). Any claim about their internal logic is explicitly **unverified** and not repeated here as fact. |
| "963,415-byte upstream index.html", "pt-5 relic store.js" etc. | These figures appear **inside the target repo's own README/session-log**, describing what it calls a separate "upstream" state of itself. They are **relayed, not independently re-verified**, and are flagged as such. |

Given that the two primary sources of truth in the target repo (its
README and its own file tree) disagree with each other, nothing from
that repo's internals is treated as ground truth here. This build
implements the pt-A **specification text** (which was supplied directly
and does not depend on the repo's internal code), using original sample
data.

## Files in this delivery

Exactly three, matching the convention described by the target project:

| File | Role |
|---|---|
| `index.html` | Everything: design tokens, all CSS (organized into the 10 sections the brief specifies), and all JS (sample data layer + `LeadOS` module namespace + UI managers), inlined. No build step. |
| `README.md` | This file. |
| `AI-SESSION-LOG.md` | Append-style engineering log: claim-vs-inspection audit, what was built, every deliberate deviation from the literal brief and why, and a decisions log. |

## What's implemented

- **Full token system** from the brief: 5-level surface/ink hierarchies,
  semantic severity colors (never decorative), 14 domain colors, type
  scale, 4px spacing grid, radii, dark-mode glow shadows, motion
  durations/easings, layout widths. Light theme via `[data-theme="light"]`.
- **Component library**: severity-coded finding cards (distinct per sev
  1–5, including the sev-5 pulsing glow), monospace score-math blocks,
  domain/rule/confidence chips, confidence-as-rendering-weight (solid /
  dashed+70% / dotted+italic+45%), insight (pattern) cards with a
  **hard-coded, non-bypassable** no-suppress state for sev-5 patterns,
  metric cards with SVG sparklines + CSS bullet graphs, a 14-cell domain
  heatmap, zebra-striped sticky-header data tables, toasts, empty
  states that teach (what's missing → why it matters → fastest fix),
  shimmer skeleton loading states.
- **Navigation**: collapsible left rail with the brief's exact section
  grouping (Command / Intelligence / Operations / Business / People /
  Organization / Self / System), badges colored by highest active
  severity in that section, footer with schema/storage info.
- **Command palette** (`⌘/Ctrl+K`): recent / suggested / quick-log
  groups by default; `#domain`, `sev:N`, `@person`, `>command` query
  modes; arrow-key navigation, Enter to execute, Escape to close.
- **Context panel**: opens on finding click with full detail + actions;
  closes on Escape, ✕, or nav change.
- **Keyboard shortcuts**: `K T R P H D J Enter S X U [ ? Esc`, plus an
  on-screen shortcuts overlay (`?`).
- **Managers** exposed on `window.LeadOS`: `renderComponent`,
  `commandPalette`, `keyboardShortcuts`, `densityManager`,
  `themeManager`, `panelManager`, `scrollManager`, `toastManager` —
  matching the interface the brief specifies.
- **Theme** (dark / light / system) and **density** (compact / standard
  / comfortable / reading) with `localStorage` persistence.
- **Accessibility**: visible focus rings, `aria-live="polite"` main
  region, icon-only buttons labeled, `prefers-reduced-motion` and
  `prefers-contrast: more` media queries honored.
- **Print stylesheet**: rail/panel/toasts hidden, colors flattened,
  footer stamp.
- A persistent, non-dismissable **sev-5 crisis banner** when critical
  findings are present.

## What's intentionally not implemented (and why)

See `AI-SESSION-LOG.md` §2 for the full list with reasoning. Short
version: no real rules engine (sample data only, clearly labeled
everywhere), no `<canvas>` sparkline (SVG instead), no D-Spine widget,
no drag-resize table columns, no generic form system — each omission is
because this build refuses to render a convincing-looking feature with
nothing real behind it, which is the same discipline the target
project's own documentation claims for itself.

## Run it

Open `index.html`. Press `Cmd/Ctrl+K` for the command palette, `?` for
the shortcut list, `[` to collapse the rail, `T`/`R`/`P`/`H`/`D` to jump
views.

---

## Changelog

### pt-A (this delivery)
- **Added** complete design token system (`:root`, light theme, density
  variants) per brief — *why: establishes the single source of truth
  every component below reads from, so severity/confidence/domain
  colors stay semantic instead of ad-hoc.*
- **Added** finding card, insight card, metric card, score-math block,
  chips, bullet graph, heatmap, sparkline, data table, toast, empty
  state, skeleton components via a `renderComponent(type, data)`
  factory — *why: brief explicitly calls for a component factory, not
  ad-hoc string concatenation, so new card types can be added in one
  place.*
- **Added** full left rail navigation, command palette, context panel,
  keyboard shortcut system, theme/density managers — *why: these are
  the primary "power user" surfaces the brief is built around; without
  them the component library has nothing to live inside.*
- **Added** sev-5 persistent crisis banner, collapsed sev-1 nudges,
  mini-TOC for long lists, print stylesheet, reduced-motion/high-
  contrast support — *why: brief requirements for graded urgency and
  accessibility, not optional polish.*
- **Replaced** "port the real `engine.js`/`ui.js`/`app.css`" with "build
  the pt-A layer against labeled sample data" — *why: the real files
  could not be read this session (tooling strips large inline-script
  HTML on fetch; the loose `.js` files were 25–175 KB each and porting
  them byte-faithfully was out of budget and, per the target repo's own
  README, already unverifiable against "upstream" anyway). Shipping
  invented rule logic as if it were the real R1–R144 set would repeat
  the exact failure mode that repo's README is written to call out in
  itself.*
- **Used** inline SVG for sparklines instead of `<canvas>` — *why:
  equivalent visual result, simpler to keep in sync with sample data
  re-renders, no DPI/resize handling needed for a reference build.*
- **Kept** everything in one `index.html` instead of separate
  `css/app.css` + `js/ui.js` — *why: hard constraint of this delivery
  environment (single-file output); CSS and JS are still organized into
  the exact sections/managers the brief names, so the separation is
  logical even if not physical.*
