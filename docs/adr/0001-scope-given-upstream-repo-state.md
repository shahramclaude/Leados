# ADR-0001: Build Part 14 on an honest minimal core instead of patching the upstream repo's existing breakage

- **Status:** accepted
- **Date:** 2026-10-20
- **Deciders:** AI session (SRE/release-manager role for this part)

## Context

The task brief for this part ("Part 14") assumes a mature, mostly-working
LEADOS codebase with an orchestrator, agents, five separate health
endpoints (`system-health`, `brain-health`, `decision-health`,
`metric-health`, `rule-health`), eval/calibration tooling, Docker/deploy
artifacts, and a `CHANGELOG.md`.

Before writing anything, per standing order #1, the actual
`shahramclaude/Leados` GitHub repository (`main` branch) was cloned and
inspected. Findings, all directly observed, not inferred:

- `npx tsc --noEmit` on that branch reports **2,863 errors**, the large
  majority inside `src/` (2,343), not just in legacy files.
- `src/db/schema.ts` on that branch defines **6 tables**
  (`organizations`, `users`, `sessions`, `people`, `auditLog`, plus an
  enum) — it has no `events`, `decisions`, `findings`, `comments`,
  `metricDefs`, `agentCycleRuns`, or dozens of other tables that ~150 API
  route files under `src/app/api/**` import and query against.
- The repository root also contains a large, separate, Vite-era
  application (`App.tsx`, `Shell.tsx`, `index.html`, `vite.config.ts`, and
  ~35 more `.tsx`/`.ts` files) that the repo's own `README.md` claims does
  **not** exist in the working tree ("there is no legacy Vite/vanilla-JS
  duplicate to remove... it is not part of this working tree") — this
  claim is false for the commit that was actually cloned.
- No `Dockerfile`, `docker-compose*.yml`, `deploy-production.sh`, or
  `CHANGELOG.md` exist anywhere in that repository, contrary to the task
  brief's assumption.

Given the standing orders also require **no regressions**, **no fabricated
results**, and **a green build before finishing**, attempting to "fix" a
2,863-error, ~150-route codebase whose authorship and intent this session
has no visibility into — within one session's tool budget — would mean
either (a) silently deleting most of the API surface without understanding
what it was for, or (b) writing new schema/logic to make routes compile,
which is indistinguishable from inventing features and would violate "no
stubs, no fabricated results."

## Decision

Treat this session's actual, tool-verified working tree (a blank Next.js +
Drizzle + PostgreSQL starter, since that is what the sandbox this session
operates in actually contains) as the canonical base, and deliver Part
14's mission — observability, health consolidation, runbooks, deployment,
release engineering, and an honest public face — as a complete, working,
verified layer on top of it, scaled to match what actually exists rather
than what the brief assumed exists. Every doc written in this part
(`README.md`, `FEATURES.md`, `CHANGELOG.md`, etc.) describes only this
tree's real, tested state, and explicitly calls out capabilities the brief
mentions (five separate health endpoints, orchestrator-driven automation,
calibration/forecast evaluation, i18n, a dedicated security suite) that do
not exist, with a pointer to `FEATURES.md` → Roadmap instead of silence or
fabrication.

This is the "safest reversible option": nothing in the broken upstream
`main` branch is deleted or destructively modified by this session (this
session cannot push to that repository at all — its deliverable is file
contents for a human to apply), and every new file here is additive and
independently buildable.

## Alternatives considered

- **Attempt a full repair of the cloned `main` branch's 2,863 errors.**
  Rejected: infeasible within the tool budget, and the only way to make
  ~150 routes compile against a 6-table schema in one sitting is to invent
  tables/columns/business logic whose correctness nobody has specified —
  that is fabrication, explicitly disallowed.
- **Silently ignore the upstream repo's real state and only address the
  sandbox template, without disclosure.** Rejected: violates "read before
  write," "ground every claim in a file you actually read," and "say
  'unverified' when you didn't verify" — the honest path is to disclose
  the discrepancy, not paper over it.
- **Refuse to proceed and ask the user to reconcile the two repos first.**
  Rejected by explicit standing instruction: "Do not ask me for anything.
  Go with your recommendation" — a reversible, documented default was
  required instead of stopping.

## Consequences

- Everything delivered in this part is real, typechecked, built, and
  demonstrated against a running Postgres instance — no claim in
  `README.md`/`CHANGELOG.md`/`FEATURES.md` is aspirational.
- The mission items that depend on subsystems the brief assumed exist
  (per-subsystem health endpoints beyond the composite, calibration drift,
  eval:intelligence, i18n:check) are explicitly marked "not implemented /
  not applicable" with a reason, in `docs/RELEASING.md` and `FEATURES.md`,
  rather than faked.
- **Trigger to revisit:** when the actual upstream `main` branch is made
  to compile and its schema reconciled with its route layer (a dedicated,
  much larger remediation effort), re-run this part's observability/health
  work against that real codebase — the health-check/metrics/logging
  modules here were written to be schema-light and easy to point at a
  richer `automation_runs`-equivalent table once one exists for real.
