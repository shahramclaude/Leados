# Maintainer runbook: triaging issues

This maps incoming issue reports to the part of the program (and the doc) that owns the answer, so
triage is quick and consistent.

## Label → routing table

| Label | Means | First doc to check | Likely owner area |
|---|---|---|---|
| `area:scoring` | "Why did this lead get score X?" or "I want a new rule." | `docs/how-to-guides.md` → Add a scoring rule; `src/lib/scoring.ts` | Intelligence (rule-based, see ADR-0002) |
| `area:api` | API route behaves unexpectedly, wrong status code, wrong shape. | `docs/reference.md` → API families | API |
| `area:dashboard` | UI bug in the lead board. | `src/components/LeadBoard.tsx` | Frontend |
| `area:schema` | Needs a new column/table, or a migration question. | `docs/explanation.md` → "Why no migration files yet"; `docs/adr/` | Data |
| `area:security` | Anything touching auth, access control, secrets. | `docs/explanation.md` → Security posture. **Treat as high priority by default** — there is no auth yet, so "security bug" often means "expected gap", but confirm it isn't a *new* exposure (e.g. a leaked secret in a log). | Security |
| `area:docs` | A doc contradicts the code, or a link is broken. | `docs/CONSISTENCY-SWEEP.md` for precedent; `npm run docs:check` to reproduce broken links | Docs |
| `area:release` | Release workflow, versioning, changelog. | `docs/RELEASING.md`, `.github/workflows/release.yml` | Release engineering |
| `area:deploy` | Deployment/Docker/health-check issues. | `docs/DEPLOYMENT.md` | Deployment |
| `needs-adr` | Reporter (or triager) believes the fix requires an architectural decision. | `CONTRIBUTING.md` → "When you need an ADR" | Governance |
| `good-first-issue` | Small, well-scoped, no ADR needed. | `CONTRIBUTING.md` | — |

## Triage steps

1. Reproduce. If it can't be reproduced against current `main`, ask for exact steps — do not guess.
2. Apply one `area:*` label from the table above, plus severity (`sev:1` outage/data-loss,
   `sev:2` broken feature, `sev:3` cosmetic/docs).
3. If it's a known, documented gap (check `FEATURES.md` first — e.g. "there's no login page"),
   close as `not-planned-yet` with a link to the relevant roadmap milestone in `README.md`, rather
   than leaving it open indefinitely as if it were a bug.
4. If it's a real bug, it needs a fix PR that follows `CONTRIBUTING.md`'s checklist, including a
   `CHANGELOG.md [Unreleased]` entry.
5. Security reports: if genuinely sensitive (e.g., credential exposure), ask the reporter to use a
   private channel (GitHub security advisory) rather than a public issue, per
   `CODE_OF_CONDUCT.md` → Enforcement.
