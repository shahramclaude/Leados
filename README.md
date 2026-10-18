# LEADOS — Cognitive Workspace (original single-file build)

A hand-authored, single-file `index.html` (vanilla JS, Tailwind via CDN, no
build step) implementing a Signal-Board-driven leadership-intelligence
workspace: a Now surface, a 50-rule Signal Board across 8 domains, a
Thermodynamics panel (entropy / SNR / bottlenecks), a CAS engine (feedback
loops / bifurcations / attractors), an 8-category Risk Register with
cross-domain amplification, an audit log, and a command palette.

> **Provenance — read before assuming this is a continuation or port of
> `github.com/wbweve/Leados`:** that repo was inspected directly this
> session (GitHub REST API file tree, raw `README.md`, raw root `App.tsx`,
> raw `AI-SESSION-LOG.md`). Full ledger in `AI-SESSION-LOG.md`, short
> version in **About / Provenance** inside the app. Headline findings:
>
> - The real repo's own README and its own root-level `App.tsx` **disagree
>   with each other** — the README publishes a 6-route table
>   (`today/signals/thermodynamics/cas/risk/about`); the actual `App.tsx`
>   only recognizes 5 different routes (`today/intelligence/data/health/about`).
> - The real repo's root file tree (verified via GitHub's REST API) contains
>   dozens of files — chart primitives, finance/people dashboards, roster
>   and playbook views — that neither the README nor its own prior session
>   log mentions at all. Their contents were **not** fetched this session,
>   so what they do is unverified; only their existence is confirmed.
> - This delivery **does not copy or port any code** from that repo. It
>   reimplements, from scratch, the *ideas* the repo's README describes in
>   prose (Signal Board, entropy/SNR/bottleneck metrics, CAS engine,
>   8-category risk register).
>
> **Design-system note:** the task brief described a "frozen" design system
> as already built in this project's `index.html` ("pt-R Cognitive
> Workspace") to be copied exactly. **This workspace's `index.html` was
> checked directly before writing any code: it did not exist.** There was
> nothing to copy pixel-for-pixel. This build instead implements the
> brief's *written* token list literally (backgrounds, text/border scale,
> indigo accent, severity colors, card/rail shapes, mono/system fonts) and
> discloses the one place it had to invent rather than copy: the 8
> domain-dot colors.

## Run it

Open `index.html` in any browser. No install, no build step, no network
calls beyond the one Tailwind CDN `<script>` tag. State persists to
`localStorage` under `leados-cognitive-workspace:v1`; use **Reset all** (Now
view) to clear it.

## Layout (matches the frozen token spec)

- Left nav rail, `w-16`: route icons + command-palette trigger.
- Center workspace: one `<div class="route-view">` per route, toggled by a
  tiny hash router (`#/now #/signals #/thermo #/cas #/risk #/log #/about`).
- Right proactive rail, `w-[280px]`: health widget, interrupt cards (sev5
  findings), snapshot stats.
- Background stack `#0a0c10` (body) → `#0d1016` (rails) → `#10131a`
  (workspace) → `bg-slate-900/60` (cards), exactly as specified.
- Severity colors: `red-600` sev5, `amber-600` sev4, `slate-700` sev3/2.
- Domain dots: `[data-domain]` + CSS var `--dc`, 8 original hues (see
  provenance note above — not recoverable from any prior file).
- Fonts: `ui-monospace` for IDs/numbers, `system-ui` for prose.
- Cards: `bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2`.
- 12 component patterns reused throughout: finding-card, domain-dot, zone,
  nav-btn, preset-btn, health-widget, toast, interrupt-card, cmdk,
  now-surface, signal-table row, audit-log row.

## Pages

| Route | What it does |
|---|---|
| `#/now` | Now surface: sev≥4 findings needing attention, scenario presets, per-domain finding counts. |
| `#/signals` | Signal Board: all 50 rules, filterable by domain or text, toggle on/off, simulate recurrence (feeds CAS attractors). |
| `#/thermo` | Shannon entropy of active findings across domains, signal-to-noise ratio, information bottlenecks, co-activation pairs (illustrative mutual-information proxy). |
| `#/cas` | Feedback loops (reinforcing/balancing), bifurcation points, attractors (recurrence ≥ 3). |
| `#/risk` | 8-category risk register (always shows all 8) + cross-domain amplification. |
| `#/log` | Full audit log of every toggle/preset/recurrence/reset action. |
| `#/about` | Provenance ledger — what was verified against the real repo and what wasn't. |

## What's original vs. modeled vs. disclosed gap

- **Original, written from scratch:** the 50-rule catalog, all 8 domains,
  presets, the entropy/SNR/bottleneck math (standard Shannon 1948
  formulas — not copied from any fetched file), the CAS heuristics, the
  risk register, the audit log, the command palette, and all UI/CSS.
- **Modeled on a concept described in the real repo's README prose only**
  (not on any read file content): the general shape of "Signal Board →
  Thermodynamics / CAS / Risk Register" as three lenses on one toggleable
  rule set.
- **Disclosed gap:** domain-dot exact colors could not be inherited from a
  prior build because none existed in this workspace; an original 8-color
  palette was chosen instead and flagged in-app.

## Self-tests

**About → Run self-tests** executes a small original assertion suite
in-browser (risk register always has 8 domains, toggle-twice is a no-op on
state but +2 on the audit log, `R08` alone triggers a Financial bifurcation,
uniform one-per-domain activation ≈ 100% entropy, "Calm baseline" clears all
signals). Results render pass/fail inline — nothing here claims to reproduce
any `T_L_*`/`G_L_*` test names, since no such test suite was ever verified
to exist in the real repo's reachable files.

## Changelog

- **Inspected `github.com/wbweve/Leados` via GitHub's REST API and raw file
  fetches before writing any code** — *why*: the task requires inspecting
  actual code, not trusting a README's self-framing.
- **Found and disclosed that the repo's README and its own root `App.tsx`
  contradict each other on the route list, and that its root file tree is
  far larger than either document describes** — *why disclosed*: a
  half-verified claim is more dangerous than a fully-unverified one; listing
  exactly which claims came from which fetched byte avoids repeating the
  real repo's own internal inconsistency in this delivery.
- **Checked this workspace's own `index.html` with `read_file` before
  accepting the brief's claim that a "pt-R" design system was already
  built here, and found no file existed** — *why*: the "FROZEN, DO NOT
  REDEFINE" instruction only makes sense against a real prior artifact;
  since none existed, copying the brief's *written* tokens literally (rather
  than inventing a fictional "exact match") was the only verifiable option.
- **Invented an 8-color domain-dot palette, disclosed as invented, instead
  of asserting an unverifiable "exact match" to a non-existent prior file**
  — *why*: silently presenting a guess as "exactly as in pt-R" would
  misstate provenance.
- **Built as a single hand-authored `index.html`, vanilla JS, Tailwind CDN,
  no build step** — *why*: matches both this task's explicit requirement and
  the frozen spec's "No framework. No build step" instruction; the real
  repo's own root-level single-file demo (referenced in its README) was the
  closer structural analog, not its separate `src/` Vite/React tree.
  **Note:** the root-level `index.html` mentioned in the real repo's own
  README/log text was not itself fetched or read this session — its
  existence is reported secondhand (from the repo's own `AI-SESSION-LOG.md`,
  call #5) and is **unverified** by this session directly.
- **Did not copy any CAS-engine or risk-register logic from the real
  repo** — *why*: no such file was found anywhere this session looked
  (REST API tree + the repo's own prior session log both independently
  report its absence), so there was nothing verified to copy; the modules
  here are original implementations of the described behavior only.
- **Used a new `localStorage` key
  (`leados-cognitive-workspace:v1`)** — *why*: this workspace had no prior
  state of any kind; claiming continuity with any other key/session would
  assert a shared history that doesn't exist here.
