# LEADOS Feature & Capability Matrix

Last verified against code: **Part 19 release prep (this document ships with v0.1.0)**.
Status definitions:

| Status | Meaning |
|---|---|
| 🟢 Live | Implemented, exercised by the running app, and you can hit it right now. |
| 🟡 Partial | Some of it is real; the rest is documented as a gap, not hidden. |
| ⚪ Planned | Design intent only. No code. Listed so the roadmap is honest about what it is promising. |

| Capability | Status | Evidence (file) | Notes |
|---|---|---|---|
| Create a lead via API | 🟢 Live | `src/app/api/leads/route.ts` (`POST`) | Validates name/email, rejects duplicate emails (409). |
| List / filter leads via API | 🟢 Live | `src/app/api/leads/route.ts` (`GET`) | `?status=` filter only; no pagination yet. |
| Fetch a single lead + score history | 🟢 Live | `src/app/api/leads/[id]/route.ts` (`GET`) | Returns last 10 `score_events`. |
| Update a lead / record a decision | 🟢 Live | `src/app/api/leads/[id]/route.ts` (`PATCH`) | Status must be one of `LEAD_STATUSES`. |
| Delete a lead | 🟢 Live | `src/app/api/leads/[id]/route.ts` (`DELETE`) | Hard delete; cascades `score_events`. |
| Force rescoring | 🟢 Live | `src/app/api/leads/[id]/score/route.ts` | Useful after editing rule weights. |
| Rule-based lead scoring (0–100) | 🟢 Live | `src/lib/scoring.ts` | Deterministic, additive, fully explainable. **Not ML.** |
| Score audit trail | 🟢 Live | `src/db/schema.ts` (`scoreEvents`) | Append-only; every score write is recorded with a reason. |
| Dashboard: add lead, see score, record decision | 🟢 Live | `src/app/page.tsx`, `src/components/LeadBoard.tsx` | Client-side table, no realtime push (manual refresh after each action). |
| Health check (DB + version) | 🟢 Live | `src/app/api/health/route.ts` | Used by `build_and_start` and Docker `HEALTHCHECK`. |
| Seed data for onboarding | 🟢 Live | `scripts/seed.ts` | 4 sample leads with varied inputs, see `docs/tutorials.md`. |
| Schema management without migration files | 🟢 Live | `drizzle.config.json`, `npm run db:push` | Fine for this stage; see `docs/RELEASING.md` on when to switch to generated migrations. |
| Authentication / authorization | ⚪ Planned | — | **There is none.** Every API route and the dashboard are open to anyone who can reach the process. Do not deploy this past a private network without adding it. See `docs/explanation.md` → Security posture. |
| Multi-tenancy | ⚪ Planned | — | Single shared table, no `tenant_id` column, no isolation. `docs/how-to-guides.md` → "Configure tenancy" describes the intended shape, explicitly marked not-yet-built. |
| Fairness / bias auditing | ⚪ Planned | — | There is no ML model to audit. The only fairness claim this repo makes today is a negative one: no protected-class or demographic field exists in `src/db/schema.ts`. See `docs/explanation.md` → Fairness posture. |
| Scenario / simulation replay | ⚪ Planned | — | No simulation engine exists. `docs/how-to-guides.md` → "Run a scenario" documents a manual workaround using `scripts/seed.ts` plus `/api/leads/:id/score`, labeled as a workaround, not a feature. |
| Realtime updates (websocket/SSE/push) | ⚪ Planned | — | The dashboard is request/response only; it refetches after each action it took, nothing pushes to other open tabs. |
| Credential rotation tooling | ⚪ Planned | — | `docs/how-to-guides.md` → "Rotate credentials" is a manual procedure today; no automation exists. |
| Internationalization | ⚪ Planned | — | UI strings are hardcoded English. |
| Rate limiting / abuse protection | ⚪ Planned | — | None. Relevant because there is also no auth yet. |
| Automated test suite (unit/integration/e2e) | ⚪ Planned | — | **No test files exist in this repository.** `npm run verify` runs lint + typecheck + docs-link-check + production build; it does not run behavioral tests because none exist. This is the single biggest honesty gap in the project right now — see `docs/RELEASING.md` and the adversarial self-review in the Part 19 delivery notes. |
| Mutation testing / coverage reports | ⚪ Planned | — | Depends on the test suite above existing first. |
| Email/company enrichment via external API | ⚪ Planned | — | `computeScore()` uses only the data the user typed in; no outbound calls. |

## What "intelligence" means in this codebase today

LEADOS's only "intelligence" feature is `computeScore()` in `src/lib/scoring.ts`: a hand-written,
additive, fully-inspectable point system. There is no training data, no model file, no
probabilistic output, and no calibration. If future parts of this program add a learned model,
this table and `docs/explanation.md` must be updated in the same change — not after.
