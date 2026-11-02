# LeadOS documentation index

LeadOS has **one** application: `index.html` + `app/**` — browser ES modules, no build step, no
backend, no database, no network calls. Everything else in this `docs/` directory is either a
decision record or an archive. Read this page, not the file list.

## Start here

| Doc | What it is |
|---|---|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | **The onboarding page.** Architecture in one screen, module wiring checklist, style, test expectations, PR checklist. |
| [LEGACY-TREES.md](LEGACY-TREES.md) | What is quarantined (`src/**`, root `*.ts(x)`), why it is still in the repository, and how the boundary is enforced. Read this before you get confused by the file count. |
| [../README.md](../README.md) | Product vision, capability matrix and roadmap. Long, and it contains dated historical sections — but the top and the capability matrix are current. |
| [../ROADMAP.md](../ROADMAP.md) | Living backlog, tagged by altitude and by module. |
| [../RESEARCH.md](../RESEARCH.md) | Competitive and framework research feeding the backlog. |
| [../FEATURES.md](../FEATURES.md) | Capability matrix: live vs. partial vs. not built. |
| [../AI-SESSION-LOG.md](../AI-SESSION-LOG.md) | Session-by-session work log, including failed and unverified attempts. |

## Decisions

- [adr/INDEX.md](adr/INDEX.md) — every architecture decision record, numbered.
- [adr/0006-canonical-zero-build-app.md](adr/0006-canonical-zero-build-app.md) — why the zero-build root app is the product.
- [adr/0007-legacy-next-tree-disposition.md](adr/0007-legacy-next-tree-disposition.md) — why the Next.js tree was quarantined rather than deleted.
- [adr/0072-ci-verifies-canonical-app.md](adr/0072-ci-verifies-canonical-app.md) — why CI runs the canonical suite and not `next build`.

## Architecture of the current app

There is no separate architecture manual, deliberately: the authoritative map is the
one-screen diagram in [CONTRIBUTING.md](../CONTRIBUTING.md) plus the module contracts enforced by
`npm run check:boundary` and asserted in `tests/app/*.test.mjs`. The `app/**` tree is organised as

```
index.html → app/main.js (router, renderers, nav)
             app/views/*.js      one surface per route
             app/actions.js      every mutation, one exported function per action
             app/core/schema.js  versioned state, normalisers, migrations
             app/core/domain/*.js  pure domain logic, no DOM
             app/ui/*.js         components, modals, charts
```

## Archive — frozen pre-ADR-0006 material

Everything below documents the **quarantined** Next.js/PostgreSQL application (`src/**`) or the
programme that produced it. These pages are kept as history, evidence and citation targets, per
[ADR-0007](adr/0007-legacy-next-tree-disposition.md). **Their commands do not work in this
repository** — `db:push`, `DATABASE_URL`, `npm run dev` on port 3000 and `npm run verify` all refer
to a tree that is not built or served. Each carries a "Historic" banner at the top.

| Group | Pages |
|---|---|
| Onboarding that no longer applies | [tutorials.md](tutorials.md), [tutorials/first-hour.md](tutorials/first-hour.md), [how-to-guides.md](how-to-guides.md), [how-to/tenancy.md](how-to/tenancy.md), [how-to/rules.md](how-to/rules.md), [how-to/rotations.md](how-to/rotations.md), [how-to/scenarios.md](how-to/scenarios.md) |
| Reference for the old stack | [reference.md](reference.md), [reference/api.md](reference/api.md), [reference/config.md](reference/config.md), [reference/events.md](reference/events.md), [API.md](API.md), [CONFIG.md](CONFIG.md) |
| Operating the old stack | [RUNBOOKS.md](RUNBOOKS.md), [MAINTAINER-RUNBOOK.md](MAINTAINER-RUNBOOK.md), [RELEASING.md](RELEASING.md), [ROLLBACK.md](ROLLBACK.md), [ROLLBACK-DRILL.md](ROLLBACK-DRILL.md), [DEPLOYMENT.md](DEPLOYMENT.md) |
| Old quality posture | [TESTING.md](TESTING.md), [PERFORMANCE.md](PERFORMANCE.md), [SLO.md](SLO.md), [SECURITY.md](SECURITY.md), [THREAT-MODEL.md](THREAT-MODEL.md), [REALTIME.md](REALTIME.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), [VERIFICATION-LOG.md](VERIFICATION-LOG.md) |
| Explanations of the old system | [explanations/architecture.md](explanations/architecture.md), [explanations/intelligence-methodology.md](explanations/intelligence-methodology.md), [explanations/attention-philosophy.md](explanations/attention-philosophy.md), [explanations/fairness-posture.md](explanations/fairness-posture.md), [explanation.md](explanation.md), [LEADOS-ARCHITECTURE-2026.md](LEADOS-ARCHITECTURE-2026.md) |
| Programme records (dated) | [AUDIT-2026.md](AUDIT-2026.md), [AUDIT-2026-10-28-constrained-effects.md](AUDIT-2026-10-28-constrained-effects.md), [CONSISTENCY-SWEEP.md](CONSISTENCY-SWEEP.md), [PART-DEPENDENCY.md](PART-DEPENDENCY.md), [FINDINGS-2026-PART-00.md](FINDINGS-2026-PART-00.md), [MANIFEST.md](MANIFEST.md), [PROGRAM-COMPLETION-REPORT.md](PROGRAM-COMPLETION-REPORT.md), [RED-TEAM-PROGRAM.md](RED-TEAM-PROGRAM.md), [RED-TEAM-FINAL.md](RED-TEAM-FINAL.md), [history/README.md](history/README.md) |
| Superseded snapshots | [LEADOS-STATE.md](LEADOS-STATE.md), [SYSTEM-MAP.md](SYSTEM-MAP.md), [GLOSSARY.md](GLOSSARY.md), [FEATURES.md](FEATURES.md), [part28-process-intelligence.md](part28-process-intelligence.md), [part49-spatial-analytics.md](part49-spatial-analytics.md), [model-cards/briefing.md](model-cards/briefing.md) |

Session-level audit transcripts (`AUDIT-2026-10-2x-session-*.md`, `VALIDATION-*.md`) are in `docs/`
too; most of them are canonical-app audits from the sessions that built `app/**`, so read the
session number before assuming which tree they describe.
