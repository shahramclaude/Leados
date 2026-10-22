# Feature Capability Matrix

Status legend: **Live** (implemented, tested, in `main`) · **Partial** (implemented but with real gaps
called out) · **Stub** (a doc or placeholder exists, no real implementation) · **Roadmap** (intent only,
not started).

| Capability | Status | Evidence | Notes |
|---|---|---|---|
| Multi-tenant data storage (`tenant_id` FKs) | **Live** | `src/db/schema.ts` (every table) | Isolation is enforced in every query; no authentication yet — see Security row. |
| Deterministic rules-based lead scoring | **Live** | `src/lib/scoring.ts`, `tests/scoring.test.ts` (7 passing cases) | Not ML, not causal. See `docs/explanations/intelligence-methodology.md`. |
| Evidence ledger (append-only decision log) | **Live** | `src/db/schema.ts` (`decisions` table), `docs/EVIDENCE-LEDGER.md` | Only 2 decision types exist today: `scored`, `rotated`. |
| Round-robin rep rotation | **Live** | `src/lib/rotation.ts`, `tests/rotation.test.ts` (5 passing cases) | No capacity/skill/territory awareness. |
| REST API (tenants, rules, leads, scoring, rotation, decisions, health) | **Live** | `src/app/api/**/route.ts`, `docs/API.md`, `openapi.yaml` | No auth; see Security row. |
| Dashboard UI | **Partial** | `src/app/page.tsx` | Single page, server-rendered, no live updates, no per-lead detail view, no triage/sort. |
| Authentication / authorization | **Absent** | `docs/SECURITY.md`, `docs/THREAT-MODEL.md` | Explicitly not built. Any caller naming a tenant slug can read/write that tenant's data. |
| Rule editing/deletion | **Absent** | `docs/how-to/rules.md` | Only create + manual `psql` deactivation exist. |
| Scenario / what-if modeling | **Stub** (manual workaround only) | `docs/how-to/scenarios.md` | No API/UI; `scoreLead()` can be called client-side as a pure function, documented as a workaround. |
| Machine learning / predictive modeling | **Roadmap** | `docs/explanations/intelligence-methodology.md` | Not started. No training pipeline, no model artifacts. |
| Causal inference | **Roadmap** | `docs/explanations/intelligence-methodology.md` | Not started. |
| Retrieval / RAG / LLM reasoning | **Roadmap** | — | No embeddings, vector store, or LLM calls anywhere in the codebase. |
| Automated fairness/bias auditing | **Roadmap** | `docs/explanations/fairness-posture.md` | Manual review is possible (rules + ledger are inspectable); nothing automated exists. |
| Real-time updates / event streaming | **Roadmap** | `docs/REALTIME.md` | Request/response only. |
| Formal SLOs / load testing | **Roadmap** | `docs/SLO.md`, `docs/PERFORMANCE.md` | No targets published; no load test run. |
| i18n / localization | **Roadmap** | — | All UI/copy is English-only; no i18n framework installed. |
| Mutation testing | **Roadmap** | `docs/TESTING.md` | No mutation testing tool installed. |
| End-to-end (browser) tests | **Roadmap** | `docs/TESTING.md` | No Playwright/Cypress suite. |
| Container image + SBOM release pipeline | **Live** (pipeline), triggered on tag | `.github/workflows/release.yml`, `Dockerfile` | SBOM generated via `npm sbom`, a real npm CLI feature, not a placeholder. |
| CI (lint/typecheck/test/build) | **Live** | `.github/workflows/ci.yml` | Runs `npm run verify` equivalent on every push/PR. |
| Docs freshness CI (link check) | **Live** | `.github/workflows/ci.yml`, `scripts/check-docs-links.mjs` | Checks internal markdown links resolve; does not check external URLs. |
| Rollback drill (expand/contract) | **Live**, tested once | `docs/ROLLBACK-DRILL.md` | Real transcript from a drill run against the migrated dev database during Part 21. Re-run before every schema-changing release. |

See `README.md`'s claim-to-file table for the top 20 claims verified against this matrix.
