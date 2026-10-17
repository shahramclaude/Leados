# LeadOS pt-J — React/Vite/Tailwind rebuild

A leadership/management cockpit UI: an append-only event log, per-domain
decay-weighted finding scores, a decision quadrant classifier, a small
"computational aesthetics" module (golden-ratio spacing, density
heuristics, time-of-day chromatic adaptation), a four-tier
familiarity-adaptive card system, and a live, computed health-check wall.

> **Provenance note:** this app was built after independently inspecting
> `github.com/wbweve/Leados` (API metadata, full git tree, and the raw
> `index.html`/`README.md`/`AI-SESSION-LOG.md` files, fetched directly
> with `curl`). It reuses a handful of constants confirmed byte-for-byte
> in that repo's `index.html`. It does **not** claim to be a port of that
> repo's internal code, which this session did not read line-by-line.
> Full verified/unverified/contradicted ledger: see
> `AI-SESSION-LOG.md` and the in-app **#/about** route.

## Run it

```
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/index.html (single self-contained file)
npm run preview   # serve the production build locally
```

`npm run build` uses `vite-plugin-singlefile`, so `dist/index.html` is
one self-contained HTML file with all JS/CSS inlined — open it directly
in a browser, no server required. This is the closest honest equivalent,
inside a React/Vite project, to "open index.html, that is the install."

## Durable state

All durable state lives in one `localStorage` key: `leados-pt-j:data`
(events array + a small `meta` object). Nothing derived is stored —
every view recomputes from the raw event array via `project()` on every
render. The event log is append-only: resolving a finding appends a
`finding.resolved` event rather than mutating the original.

Familiarity view-counts are session-scoped and live in two separate
`sessionStorage` keys (`leados-pt-j:familiarity`,
`leados-pt-j:familiarity-notified`) so resetting them can never touch
real business events.

## Routes

| Route | What it does |
|---|---|
| `#/today` | Active findings rendered through 4 familiarity tiers (NOVEL → LEARNING → FAMILIAR → HABITUATED), card height bounded by a small constraint solver. |
| `#/domains` | Per-domain heatmap: `severity_weight × 0.85^age_days`, summed over open findings, recomputed every render. |
| `#/decisions` | Log a decision (domain, impact, reversibility) and see it classified into a disclosed-fabricated quadrant; decisions open > 21 days are flagged stale. |
| `#/aesthetics` | Live golden-ratio spacing scale, density/Miller's-Law numbers, time-of-day chromatic-adaptation filter, and the generated CSS variable block. |
| `#/health` | Live, computed pass/fail checks (WCAG contrast, spacing ratio, solver bounds, familiarity monotonicity, reused-constant sanity). |
| `#/log` | Raw event log, JSON export, wipe + reseed. |
| `#/about` | The verified / contradicted / fabricated ledger for both the upstream repo and this build. |

Sidebar also has a density-mode selector (`COMPACT`/`STANDARD`/
`COMFORTABLE`/`READING`) and a "reset familiarity" button for demoing
the adaptive tiers without waiting out a real session.

## Project structure

```
src/
  App.tsx                      hash-based router + top-level state wiring
  index.css                    Tailwind import + fade-in keyframe
  components/
    Shell.tsx                  sidebar nav, density selector
    TodayView.tsx               familiarity-tiered finding cards
    DomainsView.tsx             decay-weighted domain heatmap
    DecisionsView.tsx           decision form + quadrant list
    AestheticsView.tsx          live aesthetics-engine readout
    HealthView.tsx              live health-check wall
    LogView.tsx                 raw event log, export/wipe
    AboutView.tsx               verification ledger
  lib/
    core.ts                    constants, event types, append-only store, project()
    aesthetics.ts               φ spacing scale, density heuristic, chromatic adaptation, WCAG contrast
    familiarity.ts               sessionStorage view-count tracking + tiering
    cssolver.ts                  small bounded layout solver
    health.ts                   runs the live checks shown on #/health
```

## What's verified vs. fabricated vs. simplified here

**Verified against the real upstream file (grepped from a direct `curl`
download, not from prose):** `DOMAINS`, `DECAY=0.85`,
`CORRELATION_WINDOW_DAYS=90`, `DECISION_MAX_OPEN_DAYS=21`, and the three
storage key names. WCAG contrast math, golden ratio arithmetic, and
Miller's "7±2" (1956) as a named citation are real public
facts/formulas, re-derived in this project's own code.

**Contradicted/unverifiable (see `AI-SESSION-LOG.md` §1 for detail):**
the upstream README's claim of "exactly three files" in the repo (the
actual tree has 106 entries, including a full second Vite+React+TS
project at the same root); the upstream's own narrative about
mirror-fetch corruption and byte reconstruction (not reproduced by this
session's direct, complete fetch); and the user-supplied 8-module/
49-file "pt-J" summary, which does not match the 3-part delivery
actually described in the fetched README.

**Fabricated, disclosed at point of use:** the "257 bits per finding"
density constant; per-card "confidence" percentages on NOVEL-tier
finding cards; the decision quadrant classification thresholds; all
seed/demo content (findings, decisions).

**Simplified, disclosed at point of use:** the layout solver is a
bounded clamp, not a general CSP engine; chromatic adaptation is a flat
`hue-rotate`/`saturate` approximation, not a full Bradford/D50 transform;
familiarity "compaction" is a re-render + CSS fade-in + one-time toast,
not a true cross-render DOM height animation.

## Changelog

- **Inspected `github.com/wbweve/Leados` directly** (GitHub REST API +
  raw `curl` downloads of `index.html`/`README.md`/`AI-SESSION-LOG.md`)
  before writing any code or claim — *why*: the task requires verifying
  before asserting, and a repo's own README is still a claim, not a
  verification.
- **Found and documented a contradiction** between the upstream README's
  "exactly three files" claim and the actual 106-entry git tree — *why*:
  silently repeating an unverified claim would violate the task's own
  instruction to label unverified things.
- **Did not port the upstream vanilla-JS `index.html`** into this
  React sandbox — *why*: this sandbox's entry point is `src/App.tsx`
  (React/Vite/Tailwind, enforced by the environment), and this session
  did not read the upstream file fully enough to claim a faithful port.
- **Reused only the handful of constants verified byte-for-byte** from
  the upstream file (`DOMAINS`, `DECAY`, `CORRELATION_WINDOW_DAYS`,
  `DECISION_MAX_OPEN_DAYS`, storage key names) — *why*: keeps one honest,
  checkable thread back to the source material without overclaiming.
- **Built an original append-only event log + pure `project()`**
  implementation, plus original aesthetics/familiarity/solver/health
  modules — *why*: matches the brief's architecture principles in code
  this session can actually run and show passing/failing, rather than
  describing modules left unused.
- **Fixed the Miller-range min/max ordering by construction** instead of
  reproducing a bug only described (not seen in real code) in the
  user-supplied summary — *why*: a self-inverted range would fail this
  build's own `G_MILLER_RANGE_ORDER` health check by design.
- **Kept familiarity counters in `sessionStorage`, separate from the
  durable `localStorage` key** — *why*: so a familiarity reset can never
  accidentally wipe real logged events.
- **Used the project's existing `vite-plugin-singlefile`** so
  `npm run build` still yields one self-contained `dist/index.html` —
  *why*: closest honest equivalent to "open index.html, that is the
  install" available inside this sandbox's required tooling.
