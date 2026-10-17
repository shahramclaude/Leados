# LEADOS — Compound Intelligence Engine (Part 2)

A single-file HTML/CSS/vanilla-JS demo implementing this task's pasted
`LEADOS.compound` module: a function that detects "compound intelligence
effects" when pairs of organizational maturity dimensions are both high,
plus one "ultimate" effect when all twelve dimensions clear a lower bar.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> That repo was inspected directly this session (GitHub REST/Contents API,
> raw fetches of its root `index.html`, `README.md`, `package.json`, and its
> own `AI-SESSION-LOG.md`). Full ledger in `AI-SESSION-LOG.md` and in-app at
> **Provenance & Session Log**. Short version:
>
> - **Verified directly, this session:** the real repo's root `index.html`
>   (on `main`, right now) is a 7-line Vite dev shell (`<div id="root">` +
>   `<script src="/src/main.tsx">`) — nothing more.
> - **This contradicts** a claim inside that repo's *own* `AI-SESSION-LOG.md`
>   (written by an earlier session), which describes that same file as a
>   54,081-byte hand-authored vanilla-JS demo full of rule IDs and a
>   `identifyAttractors()` function. That claim does not match what's on
>   `main` now. Flagged, not resolved.
> - **Not re-verified this session:** the same log's claims about a live
>   `src/lib/infoTheory.ts`/`Thermodynamics.tsx` chain, orphaned
>   `core.ts`/`intelligence.ts`/`physics.ts`, and the absence of any CAS/risk
>   engine. Relayed as "reported, not re-checked," not as fact.
> - **Not found anywhere actually fetched this session:** any file, export,
>   or string matching this task's pasted `LEADOS.compound` spec. It is
>   treated as an **unverified specification supplied by the task prompt**,
>   implemented fresh here — not ported, forked, or copied from the repo.
>
> This sandbox began with no files at all (no prior `index.html`/`README.md`
> existed here before this delivery), so nothing below claims continuity
> with any other session's history or storage key.

## Run it

Open `index.html` in any browser. No build step, no dependencies beyond the
Tailwind CDN script already in the `<head>`. Zero other network calls at
runtime.

State (the 12 maturity-dimension slider values) lives in `localStorage`
under `leados-compound:v1`. Use the **Reset to 3** preset to clear it back
to a neutral profile.

## What's in the app

| Area | What it does |
|------|--------------|
| **Compound Engine tab** | 12 sliders (0–5), one per maturity dimension, plus presets (`Max synergy`, `Mixed profile`, `Low maturity`, `Reset`). Runs `LEADOS.compound.identifyCompoundEffects()` on every change and renders each triggered effect as a card (name, paired dimensions, description, evidence, leverage), a running compound score, and the overall label string. |
| **Provenance & Session Log tab** | The verified-vs-unverified-vs-contradicted breakdown from inspecting the real GitHub repo, in the app itself (not just this README). |

## What's original, what's ported, what's invented-for-completeness

- **Ported as-given, functionally unchanged:** `LEADOS.compound` — same
  effect names, thresholds (`>= 4` for pairs, `>= 3` for all twelve), same
  descriptive copy, same `{ effects, compoundScore, label }` return shape,
  taken directly from this task's pasted "Part 2" code block.
- **Verified directly from that pasted code (not the repo):** the function
  signature accepts `P` and `today` but never reads either — both are wired
  through in the UI for signature fidelity only (a JSON textarea for `P`, a
  date input for `today`), and this is called out in-app.
- **Invented for completeness, clearly flagged:** two of the twelve
  dimension keys — `OPERATIONAL_EXCELLENCE` and `GOVERNANCE_MATURITY`. The
  pasted spec's five pairwise effects only name 10 distinct dimensions, but
  its own `ORGANIZATIONAL_CONSCIOUSNESS` effect requires "all 12." The two
  extra keys exist solely to make that check reachable in the demo; they are
  marked with `*` and a tooltip in the UI and documented here so they are
  never mistaken for part of the original spec.
- **Original to this delivery:** all HTML/CSS/UI, the slider-based
  maturity-profile input, presets, card rendering, color coding, the
  Provenance tab content, and the `localStorage` persistence layer.

## Project structure

```
index.html            — everything: markup, Tailwind (CDN), LEADOS.compound, app glue
AI-SESSION-LOG.md      — full ledger of what was fetched/verified/contradicted this session
README.md              — this file
```

Single-file by design (per this task's required stack: Tailwind CDN + inline
`<script>`), unlike the real repo's React+Vite build — there is no build
step here to reconcile, so the "open one file" property is literal, not the
product of a bundler.

## Changelog

- **Inspected `github.com/wbweve/Leados` first** — via GitHub's REST/Contents
  API and raw fetches of its root `index.html`, `README.md`, `package.json`,
  and `AI-SESSION-LOG.md`, before writing any code — *why*: the task
  requires inspecting actual code, not trusting a README's self-framing.
- **Found and disclosed a direct contradiction**: the repo's own prior
  session log claims the root `index.html` is a 54KB hand-authored demo;
  direct fetch shows it's a 7-line Vite shell — *why disclosed prominently*:
  a repo whose own provenance chain already contradicts itself needs that
  surfaced before anything else it says is used as a foundation.
  "`src/`-internal" claims (info-theory chain, orphaned modules, no
  CAS/risk engine) as explicitly second-hand — *why*: budget for this
  session didn't include re-fetching `src/main.tsx`/`src/App.tsx`/`src/lib`;
  rather than silently inheriting those claims as fact, they're labeled
  by source.
- **Treated the task's pasted `LEADOS.compound` block as an unverified
  external spec, not repo fact** — *why*: no matching string/module was
  found anywhere actually fetched this session.
- **Built a single-file vanilla HTML/CSS/JS app instead of React+Vite** —
  *why*: this task's required delivery format is one `index.html` using the
  Tailwind CDN script; the real repo's own stack (React+Vite+Tailwind) is
  not reproducible under that constraint, so the compound-logic spec was
  ported into plain JS instead, preserving its behavior exactly.
- **Added two invented dimension keys, clearly flagged with `*` in the UI
  and in this README** — *why*: the pasted spec's "all 12 dimensions" check
  is unreachable with only the 10 named dimensions; inventing two minimally,
  and disclosing it, was preferred over silently hardcoding `12` as `10` or
  hiding the discrepancy.
- **New storage key `leados-compound:v1`** — *why*: this sandbox had no
  prior files or state; claiming continuity with any other session's key
  would misstate history that doesn't exist here.
