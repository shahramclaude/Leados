# LeadOS pt-J — The Living Interface

> **This is not github.com/wbweve/Leados.** That repo was fetched and read
> directly this session — root file tree (GitHub REST API), root `index.html`,
> root `App.tsx`, `src/App.tsx`, `src/lib/types.ts`, `src/lib/core.ts`,
> `src/lib/physics.ts`, `README.md`, `package.json` — before any line here
> was written. It turned out to contain three structurally different app
> lineages, at least three different `localStorage` keys across sessions,
> and a "Finding / domain score" model that the repo's own committed
> comments say does not match the real, originally-verified product schema
> at all. Full fetch-by-fetch ledger is in `AI-SESSION-LOG.md` §0. This
> delivery is a disclosed, hand-authored vanilla HTML/CSS/JS file — not a
> build of that repo, which has a Vite/React/TypeScript toolchain this tool
> cannot run.

## Run it

Open `index.html` in any browser. No build step, no install. Tailwind
loads from a CDN `<script>`; everything else is one inline `<script>` of
vanilla JS. All state lives in one `localStorage` key:
**`leados-pt-j:data`** (a fourth, isolated key — see "why" in the
changelog below).

## Files on disk

Exactly three files: `index.html`, `README.md` (this file),
`AI-SESSION-LOG.md`.

## What this part actually is

The brief for pt-J ("Part 1" of a larger, only-partially-received spec) asks
for `LEADOS.cssolver` — a constraint-satisfaction layout engine that
computes CSS from declared layout/color/typography constraints instead of
hand-tuned values. That is what's implemented and wired into the running
app (not left as an unused module):

- **Node consistency** — every solver-governed variable (finding-card
  height, primary-button size, score-math font size, rail/panel/column
  widths, section gap) is clamped into a real `[lo, hi]` domain and given a
  data-dependent preferred value (e.g. card height shrinks as the number of
  open findings grows, within bounds).
- **One real arc constraint** — `cardHeight × visibleCount + gap ×
  (visibleCount − 1) ≤ availableListHeight` is enforced by an iterative
  repair loop (shrink gap first, then card height), not a closed-form
  solve and not a general backtracking CSP engine. This is disclosed as a
  **simplified** solver in the source and in `AI-SESSION-LOG.md` §2 — it is
  not claimed to be more general than it is.
- **Real metric computation**, not placeholders: WCAG contrast ratio via
  the actual relative-luminance formula; CIE sRGB→XYZ→Lab→LCH color
  conversion (D65) for domain-color perceptual distance; Fitts' Law
  acquisition-time estimate. Where the underlying formula is a public
  standard (WCAG, CIE, Fitts' functional form), it's labeled verified.
  Where a specific constant is an assumption (Fitts' `a`/`b` regression
  constants, the severity-color "arousal" proxy), it's labeled fabricated,
  at the point of definition.

## Routes

| Route | What it does |
|---|---|
| `#/today` | Active findings as severity-bar rows, sized by the live solver output. Resolve findings inline. |
| `#/domains` | Per-domain heatmap score (decay-weighted, `DECAY=0.85/day`, verified constant — see log), velocity, 30-day projection, and the literal `sev × decay^age = weight` math per contributing signal, rendered in mono at the solver's `score-math.font-size`. |
| `#/synthesis` | The Organizational Moment, The Five Things That Matter, The Hardest Question — generated only on explicit click (or ⌘/Ctrl+Enter), persisted as an append-only `synthesis.generated` event with `eventCountAtGeneration` snapshotted *before* the append. |
| `#/decision` | Decision Topology: every logged decision classified into a risk×reversibility×urgency quadrant (fabricated rule, disclosed inline), plus a form to log new decisions. |
| `#/health` | Live `T_*`/`G_*` checks, including six new ones (`G_FITTS`, `G_CONTRAST`, `G_LCH_SYMMETRY`, `G_ARC_CONSTRAINT`, `G_AROUSAL`, `G_WEIGHT_RATIO`, `T_SOLVER_BOUNDS`) that run against the solver's real output, not a description of what it should do. |
| `#/log` | Raw event log, JSON export, wipe + reseed. |
| `#/layout` | Full-page constraint monitor: every solved variable, every constraint check (pass/fail against real numbers), and the exact generated `:root{...}` CSS block currently injected into the page. |
| `#/about` | The verified / unverified / fabricated ledger for this exact build, live in the running app. |

A compact version of the same monitor also appears as a floating panel
(`#cssolver-monitor`) when the "constraint monitor" checkbox in the sidebar
is on, or when the page is loaded with `?debug=layout` in the query string
— the brief's own text read `?>debug layout`, interpreted here as that
flag (see `AI-SESSION-LOG.md` §1 for the literal wording and why).

## The non-negotiables, as applied here

- All state in `localStorage` under one key, `leados-pt-j:data`.
- The event log is append-only; `project()` recomputes findings, domain
  scores, and open decisions/commitments from the raw event array on every
  call — nothing derived is cached in the store itself.
- `synthesis.generated` payloads are persisted as new log entries, never
  edited — the one disclosed exception to "nothing derived persists," with
  `eventCountAtGeneration` snapshotted *before* the append so the
  staleness badge is correct.
- Synthesis is only ever generated by an explicit click or ⌘/Ctrl+Enter;
  rendering or navigating never appends a synthesis event.
- Every event validator runs before append, not after; a rejected event
  never reaches the log (`EVENT_VALIDATORS` / `appendEvent`).
- The layout solver recomputes on load, on window resize (debounced), and
  on every re-render — it never hand-waves "would update live"; it does.

## What's verified vs. fabricated vs. simplified (short form)

**Verified this session, by direct fetch (not by trusting a prior
session's README):** the real repo's `DOMAINS` set and `DECAY=0.85` /
`CORRELATION_WINDOW_DAYS=90` / `DECISION_MAX_OPEN_DAYS=21` constants
(`src/lib/types.ts`, `src/lib/core.ts`); the existence of three different
app lineages in one repo; the existence of `src/lib/physics.ts` and its own
disclosure that it's a second-generation fabrication; a 5-route whitelist
in root `App.tsx` vs. a 7-route whitelist in `src/App.tsx`, both confirmed
by this session's own raw fetches (and independently also noted by an
earlier session's comment already committed in `src/App.tsx` — a genuine
cross-confirmation, recorded as such rather than claimed as a new find).
Also verified: the WCAG 2.5.5 (44×44px, AAA) vs. 2.5.8 (24×24px, AA)
target-size split, via one external web search this session.

**Unverified / not independently re-fetched this session:** the exact
contents of two other `localStorage` keys (`leados-orgphysics-sandbox:data`,
`leados-synthesis:data`) named only inside another file's comments, not
fetched directly; whether any non-AI-authored version of "org physics" or
"synthesis" exists in this product at all (every file touching those
concepts, in every lineage found, self-discloses as an AI construction).

**Fabricated in pt-J, disclosed at the point of definition in
`index.html`:** the Fitts' Law regression constants and travel-distance
assumption; the domain and severity color palettes; the severity-color
"arousal" proxy (LCH chroma, not a PAD measurement); the Decision Surface
quadrant rule; all synthesis text generation.

**Simplified relative to the brief's own text, disclosed:** `LEADOS.cssolver`
implements real node consistency and one real arc-consistency repair loop,
not a general backtracking CSP solver over an arbitrary constraint graph.
The brief's own pseudocode also had a JS syntax error (unescaped apostrophe)
and an internally-inconsistent severity-bar width spec (`[1,2,3,4]` px
claimed to satisfy a "1px JND" pre-attentive-discrimination requirement);
both were fixed, not silently reproduced — see `AI-SESSION-LOG.md` §2.

## Changelog (this delivery)

See `AI-SESSION-LOG.md` §3 for the full table with "why" per row. Short
version:

- Re-fetched the real repo directly this session (10 raw/API calls) rather
  than trusting the already-committed `README.md`'s account of a prior
  session's fetch — *why*: the task requires inspecting actual code before
  claiming anything about it, and a well-labeled prior disclosure is still
  a claim, not a re-verification.
- Carried forward the three numeric constants and the `DOMAINS` set that
  this session re-verified directly, rather than inventing a fifth set —
  *why*: keeps this build consistent with the one part of this repo's
  history that multiple independent sessions now agree on.
- Used a new, fourth, isolated `localStorage` key — *why*: three different
  keys already exist across sessions; guessing which is canonical risks
  silently touching another session's disclosed sandbox.
- Implemented `LEADOS.cssolver` as real running code wired into the live
  UI (not a described-but-unused module), with real WCAG/Lab/Fitts math
  and a disclosed-simplified arc-consistency repair loop — *why*: a
  "constraint satisfaction layout engine" that only describes itself in
  prose isn't checkable; `#/layout` and `#/health` let you see it run and
  fail/pass against real numbers.
- Fixed two defects in the brief's own constraint pseudocode (a syntax
  error; an internally-inconsistent severity-bar width spec) instead of
  reproducing them — *why*: the first doesn't parse, the second contradicts
  its own stated justification; both are disclosed rather than silently
  patched.
