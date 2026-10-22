# Features — LEADOS (as of this session)

Status values match `docs/EVIDENCE-LEDGER.md` exactly. If a feature is not
listed here, it does not exist in this build.

## Shipped (Verified)

| Feature | Where |
|---|---|
| Domain + metric tracking, with fitness scoring (0–100, 0 if no data) | `src/lib/fitness.ts`, `/api/domains`, `/api/metrics`, `/api/fitness` |
| Engine registry + assurance checks, with coverage/staleness/severity summary | `src/lib/assurance.ts`, `src/lib/assuranceData.ts`, `/api/engines`, `/api/assurance` |
| Risk register with belief scores, updated by chaos experiments | `src/lib/chaos.ts`, `/api/risks`, `/api/chaos` |
| Multi-entity financial consolidation into a disclosed board pack | `src/lib/consolidation.ts`, `/api/entities`, `/api/consolidation` |
| Voice-of-customer capture, theme urgency ranking, strategy linking | `src/lib/voc.ts`, `/api/voc`, `/api/strategy` |
| Process-mining event capture and automation scoring | `src/lib/automation.ts`, `/api/process-mining`, `/api/automation-score` |
| Single live dashboard covering all six seams with inline action forms | `src/app/page.tsx`, `src/components/ActionForm.tsx` |
| Health check endpoint backed by a real DB query | `/api/health` |
| Seed script producing a realistic, deliberately imperfect dataset (includes a failing engine, an escalated risk, a negative scenario covered in tests) | `scripts/seed.mjs` |
| Fast quality gate: lint + typecheck + 24 unit tests + ledger self-check in one command | `npm run gate:all`, `scripts/gate-all.mjs` |
| Evidence ledger with an automated self-check that fails the build if a "Verified" claim has no real proof | `docs/EVIDENCE-LEDGER.md`, `scripts/ledger-check.mjs` |
| CI workflow definition for the fast + slow tiers | `.github/workflows/ci.yml` |

## Explicitly not shipped

See `docs/LEADOS-VISION.md` §2 and §3 for the full, ranked list. Headlines:
authentication/authorization, multi-tenant isolation, real ML models behind
any "engine," live FX feed, intercompany elimination, audit logging,
scheduled/autonomous triggers, ESG external verification.

## Before / after (this session's baseline)

There is no prior in-repository baseline to compare against (see
`docs/PART-DEPENDENCY.md`). The table below is "session start" → "session
end," which is the only honest comparison available.

| Metric | Session start | Session end |
|---|---|---|
| Lines of application code (`src/`) | ~90 (starter template) | 1,693 (`find src -name '*.ts' -o -name '*.tsx' \| xargs wc -l`) |
| Database tables | 0 | 14 |
| API routes | 1 (`/api/health`) | 14 |
| Proven seams (test + route) | 0 | 6 |
| Unit tests | 0 | 24 |
| Docs | 0 | 11 (`docs/*.md` + root `AI-SESSION-LOG.md`) |
| Known duplicated business-logic implementations | n/a | 0 (one shared `assuranceData.ts`; verified by manual review — see Red Team #35 for how this was found and fixed) |
| Critical/High findings fixed this session vs. accepted with rationale | n/a | see `docs/RED-TEAM-FINAL.md` disposition column |
