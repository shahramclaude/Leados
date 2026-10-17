# LeadOS — Accessibility Intelligence + Web Worker Architecture (Parts 7–8, single-file)

A leadership decision-support UI shipped as one self-contained `index.html`
(Tailwind via CDN, vanilla JS). This part implements `LEADOS.a11y` (adaptive
accessibility profiles, live-region announcements, focus management) and
`LEADOS.workers` (a Web Worker computation layer with timeout-based
main-thread fallback), hosted on a small original decision/scenario scaffold
so there's real work to offload.

> **Provenance note — read before trusting any claim about
> `github.com/wbweve/Leados`:** this build does **not** copy, fork, or
> continue that repository's code. This session verified, directly, via the
> GitHub REST Contents API (decoding the base64 blob itself — not the
> HTML-rendering fetch, which is documented upstream to silently strip
> `<script>` content), that `wbweve/Leados`'s own `main` branch `index.html`
> is real, decodes to a genuine HTML/vanilla-JS app (`LS_KEY =
> 'leados:events'`, a "LeadOS — Monte Carlo Decision Engine · part 6" build —
> an unrelated app with no accessibility or worker code in it), and is
> **currently 36,754 bytes** (sha `162c0a7006a44ade2c5647ec3f370fc4cd801a88`)
> per the Contents API at query time. That number **contradicts two different
> earlier figures** claimed elsewhere for "the same file" (56,046 bytes and
> 47,831 bytes). The repo's commit history shows `index.html` overwritten by
> roughly ten "Add files via upload" commits within a single ~2.5-hour window,
> on top of an even older rename from a "LeadCore application" — the most
> defensible conclusion is that this path is a **frequently-overwritten
> moving target**, and any single byte-count/sha claim about it is a snapshot
> valid only at query time, not a stable fact. This was not reconciled
> further (not every intermediate commit was diffed).
>
> This sandbox had **no pre-existing files** before this session (verified:
> reads of `index.html`, `README.md`, and `AI-SESSION-LOG.md` all failed), so
> there is no local "Part 1–6" here to extend. This build is an **original**
> implementation of the user-supplied accessibility + worker specs, built
> with just enough original scaffolding (an event log + decision-with-
> scenarios schema, reconstructed — not copied — from this session's reading
> of the upstream README's description of Part 6) to host them. Full ledger
> in `AI-SESSION-LOG.md` and the in-app `#/about` route.

## Run it

Open `index.html` in a browser. No build step, no server, no npm. On first
load it seeds 3 fabricated demo decisions (APAC expansion, VP of Sales hire,
infra vendor switch), each with probability-weighted scenarios, so the
Monte Carlo and rule-engine views have something to run against immediately.
Use **"wipe & reseed demo log"** in the sidebar to regenerate it.

## Routes

| Route            | What it does |
| ---------------- | ------------ |
| `#/today`        | Dashboard counts + short orientation. |
| `#/decisions`    | Log a decision with scenarios; run `LEADOS.monteCarlo` via `LEADOS.workers.runMonteCarlo()` and see mean/median/percentiles/histogram/interpretation inline, with a "computed in worker vs. fallback" timing readout. |
| `#/findings`     | Runs a small original 7-rule engine (`LEADOS.engine`) over open decisions via `LEADOS.workers.runEngine()`. |
| `#/accessibility`| `LEADOS.a11y` control panel: live-detected profile (matchMedia), manual dyslexia-friendly / cognitive-reduction modes, live-region announcer test with a sighted "mirror" panel, and a `LEADOS.focus.trap()` modal demo. |
| `#/workers`      | Worker diagnostics: status, a "terminate worker (simulate failure)" button to prove the timeout-based main-thread fallback actually works, and a log of every computation's timing + path (worker vs. fallback). |
| `#/log`          | Raw event log (JSON export, wipe + reseed). |
| `#/about`        | The verified / contradicted / original ledger for `github.com/wbweve/Leados`, condensed from `AI-SESSION-LOG.md`. |

## `LEADOS.a11y`

`detect()`, `_setupLiveRegions()`, `announce()`, `applyDyslexiaFriendly()`,
and `applyCognitiveReduction()` are implemented **verbatim** from the pasted
spec. `apply()` is **adapted**: the spec's version never does anything with
two of `detect()`'s five signals (`reducedMotion`, `darkMode`), so this build
adds two small, disclosed branches for them (zeroing `--dur-*` variables;
setting `data-theme`) rather than silently detecting-and-discarding. A manual
"I use a screen reader" self-report checkbox substitutes for automatic
screen-reader detection, which the spec itself says isn't reliably possible
from JS alone.

## `LEADOS.focus`

Implemented **verbatim**: `moveTo`, `returnToPrevious`, `trap`,
`_getFocusable`, `_focusFirstFocusable`. Demonstrated live via the
focus-trapped modal on `#/accessibility`.

## `LEADOS.workers`

The postMessage protocol (`{id, method, payload}` → `{id, result, error}`),
the `Map`-based pending-promise bookkeeping, the 5-second timeout-to-fallback
behavior, and the `runEngine` / `runMonteCarlo` wrappers are implemented to
match the spec's design. **One packaging change, disclosed:** the spec's
worker loads from `js/worker-engine.js`; because this task's deliverable is a
single `index.html`, the worker is instead built from an in-page source
string and instantiated via `Blob` + `URL.createObjectURL`. The actual
architecture (pure functions only, no DOM/localStorage inside the worker,
state passed by structured clone) is unchanged.

`correlate`, `search.buildIndex`, `temporal.profile`, and `synthesis.generate`
appear in the worker's method switch (as specified) but **no spec for
`LEADOS.correlate` / `LEADOS.search` / `LEADOS.synthesis` was supplied to this
session**. Rather than invent those engines, both the worker and the
main-thread fallback return `{ notImplemented: true, reason }` for those four
methods, and none of them are wired to a UI control.

## Data model

One flat event log in `localStorage['leados:a11y-worker-events']`. Nothing
derived is stored — every view recomputes via `LEADOS.events.project(state)`.
This schema, the demo seed data, and the small 7-rule `LEADOS.engine` are all
**original to this build**: no prior local build existed to inherit a schema
from, and the real `wbweve/Leados` repo (verified, see above) implements an
unrelated app with no accessibility/worker spec at all. The pasted spec's own
"144 rules" engine was referenced but never supplied to this session, so the
7 rules here are explicitly labeled illustrative, not a reconstruction of
that 144-rule set.

## What's verified vs. contradicted vs. original here

**Verified, directly, this session:** `wbweve/Leados` is real, public, and
actively committed to; its `main` `index.html` is a genuine HTML/JS app
(a different, Monte Carlo-themed app), currently 36,754 bytes (sha
`162c0a7006a44ade2c5647ec3f370fc4cd801a88`).

**Contradicted this session:** that figure matches neither of two earlier
figures (56,046 and 47,831 bytes) claimed for "the same file" elsewhere — not
fully reconciled, only explained as plausible given ~10 same-day overwrite
commits visible in the repo's history.

**Original/fabricated, disclosed here:** the entire event log + decision
schema, the 3 seed decisions, the `#/decisions` and `#/findings` UIs, the
7-rule illustrative engine, the reconstructed (not copied) `LEADOS.monteCarlo`
functions, the Blob-based worker packaging, two added `LEADOS.a11y.apply()`
branches, the `LEADOS.ui.densityManager` stub, and the `#/workers`
timing-comparison UI (filling an otherwise-empty spec heading).

## Changelog (this part)

- **Checked this sandbox for pre-existing files before writing anything** —
  *why*: the task requires inspecting actual code before claiming anything
  about it, including claims about this project's own continuity.
- **Verified `wbweve/Leados` via the GitHub Contents API (not the rendered
  page) and reported a third, newly-contradicting byte count instead of
  repeating or "resolving" earlier ones** — *why*: picking a winner among
  three disagreeing snapshots, or silently trusting the most recent one,
  would overstate what was actually confirmed; the only safe conclusion is
  that the path is frequently overwritten.
- **Built an original event/decision schema instead of adapting
  `wbweve/Leados`'s real schema** — *why*: the verified upstream app is
  unrelated (Monte Carlo decisions, no a11y/worker code), and no local prior
  schema exists to extend instead.
- **Reconstructed, rather than claimed to copy, `LEADOS.monteCarlo`** —
  *why*: no Part 6 source file ever existed in this sandbox; it was rebuilt
  from this session's own reading of the upstream README's description, and
  is labeled as a reconstruction, not a verbatim port.
- **Shipped 7 illustrative engine rules, explicitly not "144 rules"** —
  *why*: the 144 rules were referenced but never supplied to this session;
  inventing a number to match would be fabrication.
- **Added two `apply()` branches beyond the spec (reducedMotion, darkMode)**
  — *why*: `detect()` returns five signals but the spec's `apply()` only
  consumes three; leaving two silently unused seemed like a worse gap than a
  small, disclosed addition.
- **Packaged the worker via Blob instead of a second file** — *why*: this
  task's deliverable format is a single `index.html`; the spec's actual
  architectural requirement (pure computation, no DOM access) is preserved.
- **Left `correlate`/`search`/`temporal`/`synthesis` as disclosed
  not-implemented stubs, unwired from the UI** — *why*: no spec for those
  modules was ever supplied to this session; building fake versions would
  misrepresent specified vs. invented behavior.
- **Built an original timing-comparison UI for the spec's empty "Worker
  Performance Architecture" heading** — *why*: a heading with no body is a
  gap, not an instruction; filling it in silently would misattribute an
  original design choice to the user's spec.
