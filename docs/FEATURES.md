# FEATURES.md

Complete feature list as actually implemented in this repository, grouped by
navigation group. "Interactive" means state changes in the browser in
response to user action; "Static" means the module renders mock data with no
mutation UI.

## Core

- **Dashboard** — Interactive. Cross-module rollup (open ethics cases, queued
  drafts, board readiness, evidence counts), click-through navigation,
  crisis-aware copy.
- **Conversation** — Interactive. Scripted chat with keyword-matched replies;
  real Draft → Review → Commit gate state machine; audit-style system message
  on commit.
- **Crisis Mode** — Interactive. One toggle, observable effect across
  Sidebar, TopBar, and Dashboard simultaneously.

## Decide

- **Ethics Flags** — Static kanban (Proposed/Review/Approved/Blocked) with
  per-case risk badges and flag lists.
- **Recommender** — Interactive (expand/collapse lint notes). Visible
  pass/fail honesty lint per recommendation, confidence bars.
- **Industry Benchmarks** — Static table with A/B/C evidence-class badges and
  source captions per row.
- **Reorg Simulator** — Interactive slider driving a live-computed savings
  estimate paired, every time, with a Human Impact Ledger card.
- **Legal Drafts** — Interactive. Checkbox-gated "Finalize" button per draft
  (disabled until human-confirmation checkbox is checked).
- **Proactive Drafts** — Interactive. Send/dismiss actions spend a shared
  attention-budget resource; budget exhaustion blocks sending with an explicit
  message, never a silent failure.

## People

- **Org / Spatial View** — Interactive toggle between a tree (spatial) and a
  flattened list (semantic) rendering of the identical underlying org data.
- **Coaching** — Static skill bars + a private reflection textarea (not
  persisted); explicit "data wall" banner.
- **Collective Intelligence** — Static, always renders both majority and
  minority viewpoint clusters with vote counts.
- **Time Analytics** — Static stacked bar + legend of hours by category;
  explicit "visible to: only me" badge.
- **Leader State** — Static self-only wellbeing indicators with explicit
  non-sharing badge.

## Govern

- **Board Readiness** — Interactive checklist with live completeness
  percentage and a "not board ready until 100%" warning state.
- **Algorithm Registry** — Static table of every scoring/ranking mechanism
  referenced anywhere in the product, each tagged with an evidence class.
- **Evidence Ledger** — Static, live-rendered mirror of
  `docs/EVIDENCE-LEDGER.md` with verified/simulated/planned counts.

## Cross-cutting, code-level features

- Global `AppStateContext` (crisis mode + attention budget) consumed
  consistently by Sidebar, TopBar, Dashboard, and Proactive Drafts.
- `ErrorBoundary` wraps the whole app so a single module's render error
  degrades gracefully instead of blanking the page.
- `safeId()` utility avoids a crash path in non-secure/older-browser contexts.
- Single shared mock dataset (`src/data/mockData.ts`) — no module maintains
  its own divergent copy of shared concepts (org chart, evidence claims).
- `scripts/check-ledger.mjs` + `scripts/gate-all.sh` — a real, re-runnable
  local gate matrix (tsc, ledger structural check, production build).

## Explicitly not built (see Evidence Ledger + Vision §3 roadmap)

- Any backend, database, authentication, or multi-tenancy.
- Any live LLM integration.
- Any persistence across page reloads.
- Any CI pipeline.
- Any internationalization/localization.
