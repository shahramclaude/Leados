# Part Dependency Map

LEADOS is being built in a series of 23 numbered parts. This document records how Part 21
(release management, documentation, and consistency sweep) depends on the parts before it, and is
honest about what this specific repository snapshot actually contains.

## Honesty note on this snapshot

The working copy handed to Part 21 contained only a generic Next.js + Drizzle + PostgreSQL starter
template — none of the application code, schema, or documentation that Parts 00–20 are assumed to have
produced was present (see `docs/AUDIT-2026.md` for the full discovery). Rather than inventing a fictional
history to match the expected part count, this part:

1. Treats the discovered starter template as the true starting point.
2. Builds a small, real, fully-tested baseline (deterministic lead scoring, round-robin rotation, an
   append-only evidence ledger, multi-tenant storage by `tenant_id`) that is consistent with the product
   name "LEADOS" and the vocabulary used across the part briefs (leads, rules, scenarios, rotations,
   tenancy, evidence ledger, fairness, attention).
3. Labels everything implied by earlier part numbers that is **not** present in code — causal inference,
   retrieval/RAG, real-time sensing feeds, LLM-based reasoning, automated fairness auditing, mutation
   testing, i18n, formal SLOs — as **roadmap intent** in `FEATURES.md`, not as delivered capability.

## Dependency chain (as designed, even where a part's artifacts were not found in this snapshot)

| Part | Assumed scope | Status in this snapshot |
|---|---|---|
| 00–09 | Project scaffolding, core domain model, intelligence/causal/retrieval/sensing engines, fairness tooling | Not present; superseded by the v0.1.0 baseline built in Part 21 (deterministic scoring only, no ML/causal/retrieval). |
| 10–18 | LLM integration, performance hardening, i18n, security hardening, threat modeling, SLOs, realtime layer | Not present; documented as roadmap in `FEATURES.md`, `docs/SECURITY.md`, `docs/THREAT-MODEL.md`, `docs/SLO.md`, `docs/REALTIME.md`. |
| 19 | Container image + SBOM pipeline | Not present as a prior artifact; built fresh in this part (`.github/workflows/release.yml`, `npm sbom`). |
| 20 | Pre-release hardening / test suite | Not present as a prior artifact; this part adds the first real test suite (`tests/*.test.ts`, 11 passing cases) and CI (`.github/workflows/ci.yml`). |
| **21 (this part)** | Release management & documentation | Delivered: Diátaxis docs set, README with claim-to-file table, CHANGELOG, CONTRIBUTING, release workflow, rollback drill, consolidated verification sweep. |
| 22–23 | Assumed: final hardening and launch | Not started. Out of scope for this part. |

## What Part 21 does not attempt to retroactively fix

This part does not add intelligence/causal/retrieval/sensing/fairness/LLM features, i18n, mutation
testing, or a real-time layer, because they were never present to document, and building them is outside
the release-management/documentation scope of this part. `FEATURES.md` and the consolidated verification
table in `README.md` mark each of these explicitly as **absent**, not merely "undocumented".
