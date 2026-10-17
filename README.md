# LeadOS pt-J — The Living Interface (Parts 1–3)

> **This is not github.com/wbweve/Leados.** That repo, and its own already-committed
> pt-J delivery (`README.md`, `AI-SESSION-LOG.md`, `index.html` at the repo root),
> were fetched and read directly this session — the rendered repo page, and the
> three files above via **three independent raw mirrors** (`raw.githubusercontent.com`,
> `cdn.jsdelivr.net`, `rawcdn.githack.com`) — before a line of this file was written.
> All three mirrors truncated the returned `index.html` at the same ~5,700-token
> offset inside the middle of the file (a fetch-tool output-length limit, not a
> content issue); a fourth fetch, in text-rendering mode, returned that missing
> byte range but with a *different* corruption — its HTML-aware extractor
> stripped every `<`/`>` character, which silently deleted comparison operators
> from the JS it ran through. The full, fetch-by-fetch ledger — including which
> parts of the prior commit are confirmed byte-for-byte, which are recovered
> cross-mirror text, and which had to be re-implemented from documented
> behavior rather than corrupted bytes — is in `AI-SESSION-LOG.md` §0–§1.

## Run it

Open `index.html` in any browser. No build step, no install. Tailwind loads
from a CDN `<script>`; everything else is one inline `<script>` of vanilla
JS. Durable state lives in one `localStorage` key: **`leados-pt-j:data`**
(unchanged from the prior session — verified to be the exact key already
committed at github.com/wbweve/Leados). Two new, intentionally session-only
`sessionStorage` keys back Part 3's familiarity tracking — see "non-negotiables"
below.

## Files on disk

Exactly three files: `index.html`, `README.md` (this file), `AI-SESSION-LOG.md`.

## What this delivery adds

This continues the prior session's pt-J build, which implemented **Part 1**
(`LEADOS.cssolver`, a constraint-satisfaction layout engine). This delivery
carries Part 1 forward and adds the next two parts of the spec, wired into
the same running app — not left as described-but-unused modules:

* **Part 2 — `LEADOS.aesthetics`** ("The Computational Aesthetics Engine").
  Real, running code for: a Golden-Ratio spacing scale (φ = 1.6180339887,
  computed, not hand-typed); an `optimizeDensity()` that computes a
  bits-per-pixel figure and a Miller's-Law-inspired "visible card count"
  target; a time-of-day-driven chromatic adaptation that injects a CSS
  `hue-rotate`/`saturate` filter on `<body>`; and a `generateLivingStylesheet()`
  that injects a real `<style id="leados-generated">` block. See `#/aesthetics`
  for the live values and the exact generated CSS.
* **Part 3 — `LEADOS.familiarity`** ("Familiarity-Adaptive Components").
  Real `sessionStorage`-backed view-count tracking per finding, plus a
  cross-session signal derived from the real event log (times a finding was
  resolved). Finding cards on `#/today` render in four tiers — NOVEL,
  LEARNING, FAMILIAR, HABITUATED — with genuinely different markup at each
  tier (not just a CSS class swap): full teaching copy + fabricated-and-labeled
  confidence/score-math blocks when NOVEL, collapsing down to a single
  36px-tall table row when HABITUATED. When every active finding is
  HABITUATED, `#/today` switches to a table-only "expert mode" automatically.
  A one-time toast notifies the user the first time a given finding compacts,
  per the brief's own "the adaptation is never silent" rule.

## Routes

| Route | What it does |
|---|---|
| `#/today` | Active findings, rendered through `LEADOS.familiarity`'s four-tier adaptive card system; sized by the live `LEADOS.cssolver` output. |
| `#/domains` | Per-domain heatmap score (decay-weighted, `DECAY=0.85/day`), velocity, 30-day projection, and the literal `sev × decay^age = weight` math per signal. |
| `#/synthesis` | Generated only on explicit click (or ⌘/Ctrl+Enter); persisted as an append-only `synthesis.generated` event. |
| `#/decision` | Decision Topology quadrant classifier (fabricated rule, disclosed inline) plus a form to log new decisions. |
| `#/aesthetics` | **New.** Live Part 2 output: the computed spacing scale (with the brief's own wrong hand-typed comments shown side-by-side for sp7–sp10), the density/Miller-range numbers, the chromatic-adaptation filter and label, the generated CSS, and a session-memory generation audit. |
| `#/health` | Live `T_*`/`G_*` checks, including new ones for Part 2 (`G_SPACING_GOLDEN_RATIO`, `G_MILLER_RANGE_ORDER`, `G_DENSITY_SANE`, `G_HUE_BOUND`) and Part 3 (`T_FAMILIARITY_THRESHOLDS`, `G_FAMILIARITY_MONOTONIC`). |
| `#/log` | Raw event log, JSON export, wipe + reseed. |
| `#/layout` | Full-page `LEADOS.cssolver` constraint monitor (Part 1, unchanged in behavior). |
| `#/about` | The verified / unverified / fabricated ledger for this exact build, covering all three parts. |

The sidebar also has a density-mode selector (`COMPACT`/`STANDARD`/
`COMFORTABLE`/`READING`, feeds `LEADOS.aesthetics`) and a "reset familiarity"
button (clears the two `sessionStorage` keys, for demoing the adaptive tiers
without waiting out a real session).

## The non-negotiables, as applied here

* All **durable** state in `localStorage` under one key, `leados-pt-j:data` — unchanged.
* `densityMode` (Part 2's only new durable field) is added to `st.meta` as an
  additive, defaulted field — like the pre-existing `idSeq`/`createdAt` —
  not routed through `appendEvent`/validators, because it's a UI preference,
  not a business event.
* Part 3's familiarity counters are **intentionally not** in the durable
  store: the brief itself specifies `sessionStorage`, resetting each session.
  They live in two new, isolated `sessionStorage` keys
  (`leados-pt-j:familiarity`, `leados-pt-j:familiarity-notified`) rather than
  being folded into the one `localStorage` key, so a familiarity reset can
  never accidentally wipe real business events.
* The event log is still append-only; `project()` still recomputes
  everything from the raw event array on every call.
* `synthesis.generated` is still the one disclosed exception to "nothing
  derived persists," with `eventCountAtGeneration` snapshotted before the append.
* `LEADOS.cssolver` still recomputes on load, resize, and every re-render.
* `LEADOS.aesthetics` recomputes on load and resize **only** — a deliberate,
  disclosed difference in cadence, because Part 2's own brief text says the
  stylesheet is "regenerated on each session start... not each render,"
  unlike Part 1's explicit "it never hand-waves — it does [update on every render]."

## What's verified vs. fabricated vs. simplified (short form)

**Verified this session, cross-mirror:** `DOMAINS`, `DECAY=0.85`,
`CORRELATION_WINDOW_DAYS=90`, `DECISION_MAX_OPEN_DAYS=21` — identical across
all three independent raw-file mirrors fetched this session. The WCAG
contrast formula, CIE Lab/LCH conversion, Fitts' Law functional form, and
φ=1.618 Golden Ratio arithmetic are real public formulas, re-derived in code
here. Weber–Fechner (1834/1860) and Miller's "7±2" (1956) are real, named
citations.

**Unverified:** whether Miller's working-memory figure or the
Weber–Fechner law actually transfers to "bits of finding-card information
per pixel" — not independently verified, carried only as the brief's own
analogy. The exact byte-for-byte content of roughly the middle third of the
prior session's committed `index.html` (see the fetch-corruption note at the
top of this file and in `index.html`'s own header comment) — this build
re-implements that section's documented behavior rather than guessing at
corrupted bytes.

**Fabricated, disclosed at the point of definition in `index.html`:**
(Part 1, carried forward) Fitts' a/b regression constants, the 200px/220px
travel/saccade assumptions, domain/severity color palettes, the Decision
Surface quadrant rule, all synthesis text. (Part 2, new) the "257 bits per
finding" constant; the severity-color "arousal" proxy (chroma, not PAD).
(Part 3, new) the severity-derived "confidence" proxy shown on NOVEL/LEARNING
cards — this build's Finding schema has no native confidence field, so this
is a disclosed stand-in, not a measured model output.

**Simplified, disclosed at the point of definition:** `LEADOS.cssolver`
remains a node-consistency + one-arc-repair solver, not a general CSP
engine. `LEADOS.aesthetics`'s "chromatic adaptation" matches the brief's own
pseudocode (a flat `hue-rotate`/`saturate` filter), not the fuller
Bradford/D50 transform named only in the brief's prose — this build
discloses that gap between the brief's prose and its own code, rather than
building the fuller, unwritten version. `LEADOS.familiarity`'s "fade over
600ms while the card height collapses" is not implemented as a true
cross-render DOM animation (this app re-renders via full `innerHTML`
replace); a CSS fade-in plus a one-time positioned toast substitutes for it.

## Bugs found in the brief's own text, fixed rather than reproduced

Same policy as the prior session's Part 1 delivery (which fixed an
unescaped apostrophe and an internally-inconsistent severity-bar width
spec). This delivery found and fixed two more, in Part 2's own pseudocode:

1. **`optimizeDensity()`'s Miller range is self-inverted.** Its own code
   computes `withinMillerRange.min` using a ×1.8 multiplier and `.max`
   using a ×0.55 multiplier — since 1.8 > 0.55, the computed "min" is
   always numerically larger than the computed "max." Fixed by swapping
   which multiplier feeds which key, preserving the evident intent
   (sparser ⇒ fewer visible cards is the "min" end of the range).
2. **The spacing-scale comments are arithmetically wrong from `sp7` on.**
   The brief's own hand-typed `// 71px`, `// 115px`, `// 186px`, `// 301px`
   comments don't match `Math.round(4 × φⁿ)` for those `n` (true values:
   72, 116, 188, 304 — off by rounding-propagation errors in whoever typed
   the brief). This build computes the real values and displays both,
   side by side, on `#/aesthetics`, rather than hard-coding the brief's
   wrong numbers.

## Changelog (this delivery)

See `AI-SESSION-LOG.md` §2 for the full table with "why" per row. Short version:

* Re-fetched github.com/wbweve/Leados and its own already-committed pt-J
  files directly this session, via three independent mirrors, rather than
  trusting the prior session's README/log prose — *why*: the task requires
  inspecting actual code before claiming anything about it, and a prior
  disclosure is still a claim, not a re-verification; cross-mirroring also
  surfaced a fetch-tool corruption that a single fetch would have silently
  propagated.
* Kept the same `localStorage` key, `leados-pt-j:data`, and the same
  durable schema, only adding `meta.densityMode` as an additive field —
  *why*: Part 2/3 don't require a schema break, and the non-negotiables
  from Part 1 (one key, append-only log) still apply in full.
  verified, not reconstructed — *why*: those two mirror-identical raw
  file quotes required zero reconstruction and shouldn't be touched.
* Re-implemented (rather than guessed at) the ~5,700-token middle section
  of the prior `index.html` that three independent mirrors all truncated
  at the same offset — *why*: reproducing corrupted bytes with false
  confidence would be worse than a clearly labeled, behavior-matched
  reimplementation; every such function is marked RECONSTRUCTED at its
  definition.
* Implemented `LEADOS.aesthetics` and `LEADOS.familiarity` as real, running
  code wired into `#/today`, `#/aesthetics`, `#/health`, and the sidebar —
  not described-but-unused modules — *why*: consistent with this whole
  project's standing rule that a module only counts as "implemented" if
  you can watch it run and fail/pass against real numbers.
* Gave `LEADOS.aesthetics` a different recompute cadence (load + resize
  only) than `LEADOS.cssolver` (load + resize + every render) — *why*:
  each module's own brief text says something different about when it
  should regenerate, and silently picking one cadence for both would
  erase a real distinction the brief itself draws.
* Put Part 3's familiarity counters in two new `sessionStorage` keys
  instead of folding them into `leados-pt-j:data` — *why*: the brief
  itself specifies session-scoped memory that resets each session; mixing
  that into the durable, append-only store would make "wipe + reseed"
  and "reset familiarity" accidentally entangled operations.
* Fixed the Miller-range min/max inversion and documented the sp7–sp10
  comment-arithmetic errors in the brief's own Part 2 pseudocode, instead
  of reproducing them — *why*: same policy the prior session already
  established for Part 1's two bugs; silently reproducing a broken
  min>max range would make `#/health`'s own `G_MILLER_RANGE_ORDER` check
  fail by construction.
