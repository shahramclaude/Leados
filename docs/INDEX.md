# LEADOS Documentation Index

This index organizes documentation in four voices ([Diátaxis](https://diataxis.fr/)): tutorials (learning
by doing), how-to guides (accomplishing a specific task), reference (looking up facts), and explanations
(understanding why). Cross-cutting engineering/governance docs (security, testing, release process) sit
alongside them since they don't fit neatly into one voice.

Start with [`AUDIT-2026-10-28-evidence-vintages.md`](AUDIT-2026-10-28-evidence-vintages.md) for the current audit and explicit limits; [`AUDIT-2026-10-28-constrained-effects.md`](AUDIT-2026-10-28-constrained-effects.md) records the preceding audit; use [`AUDIT-2026.md`](AUDIT-2026.md) for the historical story of what this repository contained before the larger product evolution. `FEATURES.md` (repo root) is the capability matrix, but older entries may be stale.

## Tutorials (learn by doing)

- [`tutorials/first-hour.md`](tutorials/first-hour.md) — install → push schema → seed → first insight →
  first decision, walked and verified step by step with real command output.

## How-to guides (accomplish a task)

- [`how-to/tenancy.md`](how-to/tenancy.md) — create tenants, scope requests, understand the isolation guarantee and its limits.
- [`how-to/rules.md`](how-to/rules.md) — author scoring rules, understand operators and weighting.
- [`how-to/rotations.md`](how-to/rotations.md) — assign leads to reps via round-robin.
- [`how-to/scenarios.md`](how-to/scenarios.md) — **honest gap**: scenario/what-if modeling isn't built; this explains the closest real workaround.

## Reference (look things up)

- [`reference/config.md`](reference/config.md) — every environment variable and config file that actually exists.
- [`reference/api.md`](reference/api.md) → [`API.md`](API.md) + [`openapi.yaml`](../openapi.yaml) — full endpoint reference.
- [`reference/events.md`](reference/events.md) — evidence-ledger decision types.

## Explanations (understand why)

- [`explanations/architecture.md`](explanations/architecture.md) → [`LEADOS-ARCHITECTURE-2026.md`](LEADOS-ARCHITECTURE-2026.md) — system diagram and design rationale.
- [`explanations/intelligence-methodology.md`](explanations/intelligence-methodology.md) — what the scoring engine is (deterministic rules) and is not (ML/causal/LLM), with honest limitations.
- [`explanations/fairness-posture.md`](explanations/fairness-posture.md) — what fairness auditing exists today (none, automated) vs. what's manually possible.
- [`explanations/attention-philosophy.md`](explanations/attention-philosophy.md) — why the UI always shows evidence next to a score.

## Engineering & governance

- [`AUDIT-2026.md`](AUDIT-2026.md) — Phase 0 consistency sweep and findings table for this part.
- [`PART-DEPENDENCY.md`](PART-DEPENDENCY.md) — how this part relates to Parts 00–23, and the honesty note on this snapshot.
- [`EVIDENCE-LEDGER.md`](EVIDENCE-LEDGER.md) — the append-only decisions table, in depth.
- [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) — honest stub: Tailwind utility classes only, no formal tokens yet.
- [`TESTING.md`](TESTING.md) — what's tested (unit, 11 cases, real coverage numbers), what isn't (integration, e2e, mutation, load, fairness, LLM eval).
- [`PERFORMANCE.md`](PERFORMANCE.md) — honest: not measured yet.
- [`SECURITY.md`](SECURITY.md) — no auth/authz yet; what's mitigated (SQL injection, secret handling) vs. not.
- [`THREAT-MODEL.md`](THREAT-MODEL.md) — STRIDE-lite pass over the current, unauthenticated surface.
- [`SLO.md`](SLO.md) — honest: no formal SLOs published, and why.
- [`RUNBOOKS.md`](RUNBOOKS.md) — real, executed operational procedures (start from zero, score a lead, rollback a deploy).
- [`REALTIME.md`](REALTIME.md) — honest: request/response only, no realtime layer.
- [`RELEASING.md`](RELEASING.md) — the release checklist used to cut v0.1.0.
- [`ROLLBACK-DRILL.md`](ROLLBACK-DRILL.md) — a real expand/contract rollback transcript run against the migrated database during this part.

## Root documents

- [`../README.md`](../README.md) — vision, capability matrix, architecture diagram, quickstart, claim-to-file table, roadmap.
- [`../FEATURES.md`](../FEATURES.md) — live/partial/stub/roadmap capability matrix.
- [`../CHANGELOG.md`](../CHANGELOG.md) — keep-a-changelog format, honest retroactive entries.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — setup, style, test expectations, ADR requirement, PR checklist.
- [`../AI-SESSION-LOG.md`](../AI-SESSION-LOG.md) — session-by-session log of AI-assisted work on this repository.
