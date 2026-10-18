# LeadOS pt-R — The Cognitive Workspace

A single-file (`index.html`, vanilla JS + Tailwind via CDN) implementation
of the pasted **"pt-R" Cognitive Workspace** specification: an attention
model, a generative layout engine, a proactive next-action surface, an
intent-resolving command palette, an adaptive notification system, and an
8-domain organizational health score — all wired together over a small
synthetic "signal board" so the ideas are actually interactive, not just
described.

> **Provenance — read before assuming this continues `github.com/wbweve/Leados`:**
> that repo was fetched and inspected directly this session (GitHub REST
> API file tree, raw root `index.html`, raw root `package.json`, the
> repo's own `README.md`/`AI-SESSION-LOG.md`, and the `src/` directory
> listing). Full ledger in `AI-SESSION-LOG.md`, and in-app at the **ℹ️
> About** rail item. Short version:
>
> - The real repo's live app is a genuine **React + Vite + Tailwind +
>   TypeScript** build under `src/` (confirmed via `package.json` and a
>   `src/` directory listing), covering **Thermodynamics / CAS Engine /
>   Risk Intelligence** — a different subject than this spec.
> - The repo's root `index.html`, fetched raw just now, is a **26-line
>   Vite entry stub** — this directly **contradicts** the repo's own prior
>   `AI-SESSION-LOG.md`, which described a 54KB hand-authored demo at that
>   same path. That contradiction is disclosed as-is, not resolved.
> - **Nothing found anywhere in the real repo, this session:** any
>   attention-modeling, generative-layout, proactive-intelligence,
>   command-intent, notification, or health-score code.
>
> **This app does not fork, copy, or continue the real repo's code.** It
> is a fresh, original build implementing the pasted brief's *ideas* for
> this task's own tool environment (a single hand-authored `index.html`,
> which cannot run the real repo's Vite/React stack).

## Run it

Open `index.html` in a browser. No build step, no network calls beyond the
one Tailwind CDN `<script>` tag. State is in-memory only (refreshing resets
the demo); attention dwell data is cached in `sessionStorage` under
`leados:attention`.

## What's in the app

| Area | What it does |
|---|---|
| **Today** (generative workspace) | `LEADOS.layout` classifies the current "situation" (multi-crisis, single-crisis, board-prep, sprint-close, deep-work, fatigue-reduced, or standard) from the active signal board + simulated hour/fatigue, solves a zone geometry for it, injects the generated CSS live, and renders each zone's content. A "view generated CSS" link in the situation banner shows the literal CSS the engine produced. |
| **Control Deck** | The synthetic "signal board": toggle any of 32 rule IDs (with severity), set simulated hour/fatigue/runway, flip board-meeting/sprint-due switches, or use one-click presets (Multi-crisis, Single crisis, Board prep, Sprint close, Deep work, Fatigue reduced) to watch the generative layout change shape live. |
| **Roster** | 6 synthetic people with flight-risk scores; feeds `LEADOS.flightRisk` and the proactive surface's retention actions. Hoverable rows feed the attention model (`data-person-id`). |
| **Playbooks** | 8 synthetic playbooks, one per domain; the crisis zones in the generative workspace auto-match the best playbook for the dominant finding's domain. |
| **Work Queue** | Synthetic "finished work products" (a board-narrative draft, a risk-register export) prepared without being asked, per Part 3's "produces finished work products" requirement — mark them reviewed and the proactive surface's review-prompt clears. |
| **Audit Log** | Every layout generation, notification delivery, and command execution is logged here via `LEADOS.store.auditLive`. |
| **About** | Full in-app provenance note, consistent with this README and `AI-SESSION-LOG.md`. |
| **Proactive "Now" rail** (always visible) | `LEADOS.proactive.generateNowSurface()` — the single highest-priority action right now, plus the full ranked queue, plus live attention-focus telemetry at the bottom. |
| **⌘K command palette** | `LEADOS.commandIntel.resolve()` — type natural language ("feedback for Dana," "1:1 with Marco," "what if we lost our biggest customer," "why is churn risk high") and see the resolved intent, confidence, and action string live, matched via the pasted spec's regex intents + fuzzy person-name matching. |
| **🔔 / health widget (header)** | `LEADOS.notifications` delivery log and `LEADOS.healthScore`'s 8-domain breakdown + trend, each with their "how to read this" label carried over from the pasted spec. |

## What's a faithful implementation vs. what had to be invented

- **Kept close to the pasted spec's own code:** all six `LEADOS.*` modules
  (`attention`, `layout`, `proactive`, `commandIntel`, `notifications`,
  `healthScore`) — method names, signatures, and internal scoring/severity
  logic are adapted near-verbatim from the pasted pseudocode.
- **Invented because the spec assumes but never defines them:** the entire
  data substrate (`RULES`, `PEOPLE`, `PLAYBOOKS`, the signal board,
  synthetic work queue, synthetic pre-fire calendar) and every stub the
  spec calls but doesn't implement (`LEADOS.engine`, `LEADOS.workQueue`,
  `LEADOS.flightRisk`, `LEADOS.finIntel`, `LEADOS.predict`,
  `LEADOS.autonomous`, `LEADOS.circadian`, `LEADOS.fatigue`,
  `LEADOS.store`, `LEADOS.ui`, `LEADOS.signals`, `LEADOS.haptics`).
- **Invented because the spec leaves a rendering gap:** `renderZoneContent()`
  — `applyLayout()` in the pasted spec never specifies how to turn a zone's
  `content` string into actual markup.
- **A disclosed simplification:** `healthScore`'s 30-day trend compares
  against a page-load snapshot, not a real historical event-log replay
  (this build has no event log to replay).
- **Kept as-is even though it looks like a bug:** the notification rate
  limiter's `3 - (recentDeliveries % 3)` formula, exactly as pasted.

See `AI-SESSION-LOG.md` §5 for the full fidelity ledger.

## Changelog

- **Inspected `github.com/wbweve/Leados` directly this session (GitHub
  REST API tree, raw root `index.html` in both text and HTML mode, raw
  `package.json`, raw root `README.md`/`AI-SESSION-LOG.md`, `src/`
  listing) before writing any code** — *why*: the task requires inspecting
  actual code, not trusting a README's self-framing or the pasted spec at
  face value.
- **Caught and disclosed a contradiction inside the repo's own history**
  (current root `index.html` is a 26-line Vite stub; the repo's own prior
  session log claims a 54KB demo at that path) **instead of repeating
  either claim uncritically** — *why*: a text-mode fetch of the same URL
  returned only a page title and could have been mistaken for "empty file";
  re-fetching in HTML mode surfaced the real stub and the discrepancy with
  the repo's own log. Reporting the contradiction is more honest than
  picking a side.
- **Declared the pasted "pt-R" brief an unverified external specification**
  — *why*: no string match for `attention`, `generative layout`,
  `proactive`, `commandIntel`, `notifications`, or `healthScore` concepts
  was found anywhere fetched from the real repo; its own verified subject
  matter is Thermodynamics/CAS/Risk Intelligence, a different spec.
- **Built as a single hand-authored `index.html` (Tailwind CDN + vanilla
  JS) instead of attempting to extend the real repo's Vite/React app** —
  *why*: this task's tool environment only supports a single `index.html`
  with no build step; it cannot run the real repo's confirmed
  Vite+React+TypeScript stack, so presenting anything else as "the same
  app" would misstate the environment.
- **Implemented all six `LEADOS.*` modules near-verbatim from the pasted
  pseudocode, but built an entirely original synthetic data substrate
  around them** — *why*: the brief is internally consistent and worth
  preserving faithfully; the substrate it assumes (a findings engine, a
  roster, a work queue, etc.) doesn't exist anywhere verified, so it had
  to be invented rather than guessed at from the real repo.
- **Added `renderZoneContent()`** — *why*: without it, the generative
  layout engine would correctly compute zone geometry and CSS but render
  visually empty boxes, since the pasted spec stops at `className`/
  `dataset` assignment.
- **Left the notification rate-limiter formula and the trend's demo
  baseline exactly as implied by the pasted spec, both labeled in-UI
  rather than silently "fixed"** — *why*: changing pasted-spec math without
  disclosure would misattribute the correction as part of the original
  brief; disclosure preserves an accurate record of what came from where.
