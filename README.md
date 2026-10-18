# LeadOS Sandbox — original single-file build

A standalone `index.html` (Tailwind via CDN + vanilla JS, zero build step)
implementing a small, original "leadership findings / risk register / systems
view / health wall" sandbox — built after directly inspecting
`github.com/wbweve/Leados`'s real source files, not by trusting its README's
self-description or the large spec pasted into this task's prompt at face
value.

> **Provenance, short version** (full ledger in `AI-SESSION-LOG.md`, and inside
> the app under the **Provenance** tab): the real repo is two different
> deliveries in one place — loose root-level files (incl. a differently-titled
> single-file `index.html` demo) plus a separate, live Vite+React+TypeScript
> app under `src/`. This session independently confirmed, by reading the raw
> files directly: the live `src/App.tsx` wires up a Signal-Board/CAS/Risk/
> Thermodynamics app; `src/lib/core.ts` exports no `engine` or `run` symbol;
> and `src/lib/intelligence.ts` imports exactly those two (broken) names and is
> not part of the live render path. The large "Color System v15 / Health Wall
> Master Suite / pt-V, 110 files, 230 rules" text pasted into this task's
> prompt was **not found anywhere** in the repo tree or files fetched this
> session, and is treated here as an unverified external spec, not repo fact.
>
> **This app does not fork, copy, or continue either the real repo's code or
> the pasted spec's claimed history.** It's a fresh, small, original build for
> this task's own plain-HTML tool environment.

## Run it

Open `index.html` in a browser. That's the install — no build step, no
network calls after the Tailwind CDN script loads, no accounts.

State lives in `localStorage` under `leados-sandbox:v1` (theme preference is a
separate small key, `leados-sandbox:theme`). Use **Reset demo data** (top
right) to regenerate the deterministic synthetic seed.

## Tabs

| Tab | What it does |
|---|---|
| **Today** | Headline counts + all active findings sorted by severity. |
| **Findings** | The same findings grouped by domain (People, Finance, Sales, Ops, Strategy, Governance). |
| **Decisions** | Table of logged decisions with open/stale/escalate/resolved status (21d / 45d thresholds). |
| **Risk Register** | 8 categories, always rendered even at zero (2 are always zero in this sandbox, by disclosed design), plus a single cross-category amplification heuristic. |
| **Systems** | A real (small-scope) Shannon entropy calculation over the event log's type distribution, plus an original "feedback loop" / "bifurcation" heuristic. Attractor detection is explicitly left unimplemented and labeled as such. |
| **Health Wall** | 14 original, actually-executing self-tests (schema, storage round-trip, purity, determinism, bounds-checking, etc.) — run on demand. |
| **Provenance** | What this session verified first-hand vs. what remains unverified, with the exact files read. |

## What's original vs. reused vs. a disclosed gap

- **Original, built from scratch for this delivery:** the 12-rule + 2-compound-rule
  engine (`R1`–`R12`, `AMP1`), the synthetic deterministic seed data, the 8-category
  risk register and its amplification heuristic, the Shannon-entropy "Systems" view,
  the 14-test Health Wall, and all UI/rendering code.
- **Reused as a generic design system, not a provenance claim:** the CSS color
  token *structure* (surface stack `--s0`…`--s5`, ink stack `--i0`…`--i3`,
  severity hues, domain hues) from the "Color System v15" text pasted into this
  task's prompt — trimmed to only the tokens this app actually uses, and
  re-implemented as plain CSS custom properties with three selectable themes
  (Dark / Light-Parchment / Terminal).
- **A gap, left as a gap, on purpose:** "attractor detection" in the Systems tab.
  No verified implementation of this concept was found anywhere (real repo or
  pasted spec), so rather than fabricate a plausible-looking output, the UI says
  so directly.
- **Not reproduced, by design:** the pasted spec's 75+ named `T1`…`T_PERC_7`
  Health Wall tests, and its "110 files / 230 rules / pt-V" closing summary.
  Their bodies/behavior aren't verifiable anywhere, so reproducing them under
  their original names would misstate where they came from.

## Project structure

Everything lives in one file:

```
index.html
  <style>   — CSS custom properties (3 themes) + small utility classes
  <body>    — header/nav, 7 tabbed views, footer
  <script>  — storage (single localStorage key, append-only events),
              pure project() function, rule engine, risk register,
              thermodynamics-lite, CAS-lite, health wall, rendering/router
```

## Changelog

- **Inspected `github.com/wbweve/Leados` directly first** (README, repo API
  tree, raw `App.tsx`/`core.ts`/`intelligence.ts`/root `index.html`) before
  writing any code — *why*: the task requires verifying actual code, not
  trusting a README's self-framing or a prompt's pasted summary.
- **Independently re-derived the "broken import" finding** (`intelligence.ts`
  imports `{ engine, run }` from `core.ts`, which exports neither) by reading
  both files myself, rather than just citing the repo's own prior session log
  that made the same claim — *why*: a claim repeated by a second party isn't
  verification; reading the actual exports/imports is.
- **Declared the pasted "Color System v15 / Health Wall Master Suite / pt-V"
  block an unverified external specification**, not repo fact — *why*: no
  matching file, folder, export, or test name was found anywhere in the tree
  or files fetched this session.
- **Built a hand-authored single `index.html` instead of a React/Vite app** —
  *why*: this task's own tool environment only supports a plain HTML/Tailwind-
  CDN/vanilla-JS single file; presenting anything else would misstate the
  environment this was actually built in.
- **Reused only the pasted spec's CSS *token structure*, not its claimed
  module list** — *why*: the token system is just generic design tokens
  (HSL surfaces/ink/severity/domain hues) with no factual claim attached to
  them, so adopting it as styling doesn't risk misattributing functionality
  that was never verified to exist.
- **Shrunk "144/230 rules" and "75+ tests" down to 12+2 rules and 14 tests,
  under new IDs** — *why*: writing fewer, real, executing rules/tests is more
  honest than writing stub functions under large borrowed ID ranges that imply
  a bigger verified system than what's actually here.
- **Left attractor detection unimplemented with a visible label** — *why*: no
  verified implementation or definition exists anywhere checked; a disclosed
  gap is more honest than a fabricated-but-plausible number.
- **Used a new storage key (`leados-sandbox:v1`)** — *why*: this delivery
  doesn't continue any other session's saved state (none is accessible from
  this environment anyway), so claiming an existing key would imply a false
  continuity.
