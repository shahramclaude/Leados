# LEADOS-STATE — Continuity Record

> This document is the authoritative "what is actually built" record for the LEADOS
> application living in **this** repository/sandbox. It intentionally does not assume
> history from any external clone (e.g. `github.com/shahramclaude/Leados`) — per the
> Part 59 dry-run's own finding #2 ("git history / another repo's artifacts are not part
> evidence"), nothing is treated as delivered here unless it is live code in `src/`,
> verified by build + `build_and_start`.

## What this build is

A from-scratch, working Next.js (App Router) + Drizzle/PostgreSQL implementation of the
LEADOS concept: an executive decision-intelligence cockpit. Rather than attempting to
simulate 59 parts / 155 route families / 219 API families as hollow stubs, this build
picked a **curated, fully-functional vertical slice** across the themes the coverage
matrix flagged as highest priority (the 🔴/🟡 rows), plus the core spine every other
part depends on (decisions, sensing, agents).

Every module below is real: Postgres-backed schema, REST API routes with validation,
and interactive pages — not placeholders.

## Canonical modules delivered (this repo)

| Module | Route | Parts referenced | Notes |
|---|---|---|---|
| Executive Cockpit | `/` | 00 | Aggregates live counts + recent items across all modules |
| Decisions | `/decisions`, `/decisions/[id]` | 01, 23 | Event-sourced: every create/status-change/commit writes an immutable `decision_events` row |
| Signals | `/signals` | 13 | Sensing & early warning, triage/resolve/dismiss workflow |
| Risk Register | `/risks` | 29 | Was 🔴 absent in the matrix seed — implemented here as the canonical GRC register with likelihood×impact and a status lifecycle |
| Agent Kernel | `/agents`, `/agents/[id]` | 10, 33, 40, 58 | **Single canonical agent spine** per the interface-spine rule — one `agents`/`agent_runs` schema, kernel types (sensing/decision/execution/governance/learning) instead of parallel systems. Includes a real run-trigger endpoint that executes a kernel-specific playbook and logs the run. |
| Cadence | `/cadence` | 25 | Recurring rituals with automatic next-occurrence advancement |
| Board Packs | `/board-packs` | 55 | **One** canonical board-pack family (the matrix seed flagged 4 overlapping legacy names — this build keeps exactly one) with a draft→in_review→approved→published workflow |
| Org Fitness | `/fitness` | 39, 57 | Self-evolving-organization capstone — dimension scoring (agility/alignment/resilience/talent/innovation/execution) with trend tracking; this is the seed for assembling the Part 57 capstone instead of a hollow stub |
| ESG Metrics | `/esg` | 36 | Environmental/social/governance KPI tracking against targets |
| Interventions | `/interventions` | 51 | Action-recommender marketplace ranked by impact − effort leverage |
| Leader State | `/leader-state` | 52 | Decision-load / stress / focus tracking per leader over time |

## Database schema

Twelve tables in `src/db/schema.ts`: `decisions`, `decision_events`, `signals`, `risks`,
`agents`, `agent_runs`, `cadence_items`, `board_packs`, `fitness_metrics`, `esg_metrics`,
`interventions`, `leader_states`. All foreign keys cascade appropriately
(`decision_events.decision_id`, `agent_runs.agent_id`).

## Decisions carried over from the coverage-matrix seed

1. **No second agent system.** Every autonomy-related part (10 Autonomous operations,
   33 Multi-model orchestration, 40 Capstone, 58 Agent kernel) is represented through the
   *one* `agents`/`agent_runs` schema and `/agents` UI. New kernel behaviors should be
   added as new `kernelType` playbooks in `src/app/api/agents/[id]/run/route.ts`, not as
   a parallel table or route family.
2. **No duplicate board-pack / strategy / finance families.** The matrix seed's
   Divergences section flagged `board/board-pack/boardpack` and `strategic/strategy`
   style duplication as a C3 risk. This build ships exactly one route family per concern
   (`/board-packs`, `/decisions`, etc.) — extend these, do not fork new ones.
3. **GRC (Part 29) and the two capstones (40, 57) were the most at-risk rows** (🔴 in the
   seed matrix) — they are implemented here as first-class modules (`/risks`, the agent
   kernel, and `/fitness`) rather than left absent.
4. **Case-colliding filenames** (`monteCarlo.ts` vs `montecarlo.ts`) referenced in the
   seed matrix do not exist in this codebase — there is no Monte Carlo module in this
   build yet. If one is added later, it must have exactly one canonical filename.

## Extending this build

- Add new tables to `src/db/schema.ts`, run `npx drizzle-kit push`.
- Add a `src/app/api/<resource>/route.ts` (list/create) + `[id]/route.ts` (update/delete)
  pair following the existing pattern.
- Add a page under `src/app/<resource>/page.tsx` using the shared primitives in
  `src/components/ui.tsx`, and register it in `src/lib/nav.ts` so it appears in the
  sidebar.
- Keep one canonical family per concern. If a future request implies a "new" subsystem
  that overlaps an existing module (e.g. a second meetings system, a second risk
  register), extend the existing module instead of creating a parallel one.
