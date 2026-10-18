# LEADOS — pt-Q sandbox: Cascade, Meetings, Performance & Compensation

A single-file (`index.html`) leadership-intelligence sandbox implementing
four modules from a pasted specification: an **information cascade**
engine, a **meeting intelligence** system, a **performance architecture**
(activity → output → outcome → impact), and **compensation equity**
analytics — plus a 15-rule "Health Wall" (R161–R175) that reads findings
out of all four.

Everything runs client-side against a seeded synthetic dataset stored in
`localStorage`. No network calls, no real org data, no backend.

## ⚠️ Provenance — read this before assuming anything about `github.com/wbweve/Leados`

This file is **not** a fork, export, or continuation of
`github.com/wbweve/Leados`. Before writing any code this session, that repo
was inspected directly (GitHub REST `contents`/tree API + raw file fetches),
not taken on faith from the task prompt or from the repo's own README.

**Verified this session, independently:**
- The repo root holds a large **flat set of `.tsx` files** (`App.tsx`,
  `AboutView.tsx`, `HealthView.tsx`, `FinanceDashboard.tsx`,
  `RosterView.tsx`, `Network.tsx`, dozens more) plus `README.md`,
  `AI-SESSION-LOG.md`, `AI-SESSION-LOG.append.md`, `SESSION-3.patch.md`.
- A **separate `src/` tree** also exists (`src/App.tsx`, `src/main.tsx`,
  `src/lib/`, `src/components/`, `src/utils/`) — the repo genuinely contains
  two parallel deliveries, not one coherent app.
- A root `index.html` exists; its `<title>` reads "LEADOS Sandbox — CAS
  Engine, Risk Intelligence & Thermodynamics" (title only — body/script not
  read line-by-line this session).
- The repo's own `README.md`, fetched raw, is itself a provenance ledger
  from an earlier session. It states that session verified
  `src/lib/infoTheory.ts` is live (wired through `Thermodynamics.tsx` →
  `IntelligenceView.tsx` → `src/App.tsx`), found `core.ts`/`intelligence.ts`
  orphaned/broken, and found **no CAS engine, no risk register, and none of
  a prior pasted "pt-L" brief's claimed 58/62-file, 144-rule history**
  anywhere in the repo — and explicitly labels that earlier brief
  "unverified," not repo fact.

**Not independently re-verified this session:** the specific internal
import-wiring claims inside that fetched README (e.g., exactly how
`infoTheory.ts` connects to `App.tsx`). Those are the real repo's own prior
session's claims, relayed here — not re-checked line-by-line by this
session. Full detail in `AI-SESSION-LOG.md` and the in-app **About /
Provenance** tab.

**Bottom line:** the "pt-Q" brief this build implements (cascade/meetings/
performance/compensation, rules R161–R175, "83 files," prior "Parts 1–2")
has no corresponding evidence anywhere in the real repo, and no prior
`index.html`/log/README existed in *this* sandbox project before this
session either. It is treated as an unverified task prompt and implemented
as an original, fresh build — the same convention the real repo's own
sessions already use for their own pasted briefs.

## Run it

Open `index.html` in any browser. That's it — no build step, no server.
Click **↻ Reset synthetic data** (top right) to regenerate the seeded
roster/event log with a new random seed.

## What's in the sandbox

| Tab | What it shows |
|---|---|
| Today | Rollup: open findings by severity, influence leaders, 30-day meeting spend, people below market, decision velocity, performance snapshot. |
| Cascade | Informal influence network (inferred from event co-occurrence), dark-matter detection, and an interactive "predict a cascade" simulator. |
| Meetings | Meeting cost (€/person-hour × hours), decisions/action items produced, closure rate, per-person meeting load, decision velocity (open/closed/aged). |
| Performance | The activity → output → outcome → impact chain, causal-chain hypotheses (explicitly labeled ASSUMED vs EVIDENCED), leading/lagging indicators. |
| Compensation | Compa-ratios vs. synthetic market benchmarks, band-level equity spread, at-risk list, promotion-pattern / overdue-review detection. |
| Health Wall | All 15 rules (R161–R175) from the pasted brief, evaluated live against the synthetic dataset, each with its severity and an explicit "labeled" note where the underlying signal is a proxy or assumption. |
| Event Log | Raw synthetic event counts by type and a scrollable log, for auditing where every number on every other tab comes from. |
| About / Provenance | The full ledger above, plus a list of what in this build is a transcription of the pasted spec vs. an original, disclosed gap-fill. |

## What's original, what's a disclosed gap

- **Implements the pasted brief closely:** `LEADOS.cascade`, `LEADOS.meetings`,
  `LEADOS.performance`, `LEADOS.compensation`, and rules R161–R175 — the
  brief's own pasted JavaScript, adapted minimally to run standalone.
- **Original glue, because the brief didn't define it this part:**
  `LEADOS.engine._days` and a small `LEADOS.wargame` stand-in
  (`_computeVelocityMean`, `_latestMetric`, `_computeWinRate`), which
  `LEADOS.performance` calls but which were never provided in this part of
  the spec.
- **Disclosed proxy, not a real module:** `LEADOS.flightRiskProxy` stands in
  for a `js/flight_risk.js` the brief *names* (for R161) but never supplies
  source for. It is clearly labeled in the UI as a simplified combination of
  1:1 recency, pulse mood, feedback frequency, and compa-ratio — not a
  validated attrition model. Same treatment for the causal-graph dependency
  behind R166.
- **All synthetic roster/event generation, UI, and rule runner:** original
  to this delivery.

## Data model (synthetic, in `localStorage` under `leados:pt-Q:v1`)

A seeded roster of 6 direct reports + 4 skip-level reports, and ~180 days of
synthetic events across every event type the brief references
(`oneonone.logged`, `feedback.given`, `blocker.logged`, `goal.progress`,
`conflict.logged`, `meeting.logged`, `meeting.followup`, `strategy.decision`,
`decision.outcome`, `pulse.recorded`, `sprint.review`, `sales.deal.closed`,
`fin.pl.logged`, `hr.started`, `hr.attrition.logged`, `comp.logged`,
`comp.benchmark`, `comp.review`, `goal.closed`). The dataset is deliberately
shaped so each of the 15 rules has at least one real example to show.

## Changelog

- **Inspected `github.com/wbweve/Leados` via GitHub's REST API and raw file
  fetches before writing any code** — *why*: the task requires inspecting
  actual code, not trusting the pasted brief's own "pt-Q / 83 files / R161+"
  framing, or the repo's README, at face value.
- **Found the repo is two parallel deliveries (flat root `.tsx` files +
  separate `src/` Vite app) and that its own README already flags an
  earlier "pt-L" brief as unverified** — *why disclosed this way*: a
  half-right provenance claim is more dangerous than a fully-wrong one; the
  README and in-app About tab spell out exactly what was checked vs. relied
  on from a prior session's own claim.
- **Started this sandbox project from zero rather than inventing "Parts
  1–2"** — *why*: no `index.html`, log, or README existed in this workspace
  before this session; continuing a history that doesn't exist here would
  misrepresent the project.
- **Built a single hand-authored `index.html` (Tailwind CDN + inline JS)
  instead of mirroring the real repo's React/Vite `src/` layout** — *why*:
  this tool environment's deliverable is one static HTML file; presenting a
  framework-based structure here would misstate the environment.
- **Transcribed `LEADOS.cascade` / `meetings` / `performance` /
  `compensation` from the pasted brief near-verbatim** — *why*: the pasted
  code was internally consistent and ran correctly once wired to a real
  data model, so rewriting it from scratch would add risk without benefit.
- **Added `LEADOS.engine._days` and a minimal `LEADOS.wargame` stand-in** —
  *why*: `LEADOS.performance` calls both, but neither was defined anywhere
  in this part of the brief; without them the performance chain throws.
- **Added `LEADOS.flightRiskProxy` instead of a file named
  `flight_risk.js`** — *why*: inventing a module under that exact name
  would imply it came from somewhere verified; the proxy is original and
  labeled as such so R161 is demonstrable without misattributing it.
- **Generated a seeded, deterministic-by-default synthetic dataset shaped
  to trigger every one of R161–R175 at least once** — *why*: a Health Wall
  that never lights up can't be evaluated; the seed is reproducible
  (`mulberry32(42)` on first load) and only reseeds randomly on explicit
  "Reset synthetic data."
- **Used a fresh storage key (`leados:pt-Q:v1`)** — *why*: no prior session
  state exists in this workspace; reusing another session's key would
  assert false continuity.
