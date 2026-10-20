# Documentation index

| Doc | What it covers |
| --- | --- |
| [`../README.md`](../README.md) | Vision, architecture diagram, quickstart, capability matrix, roadmap. Start here. |
| [`../FEATURES.md`](../FEATURES.md) | Capability matrix: what's live vs. planned, with evidence (file paths). |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Layer rules (`app` → `lib` → `db`), dependency direction, why. |
| [`CONFIG.md`](CONFIG.md) | Every environment variable, where it's read, how to add a new one. |
| [`SLO.md`](SLO.md) | Availability/latency/freshness/success-rate objectives, error budgets, alert rules. |
| [`RUNBOOKS.md`](RUNBOOKS.md) | Trigger → diagnosis → action → verification for every known failure mode. |
| [`RELEASING.md`](RELEASING.md) | Semver policy, expand/contract migration strategy, release checklist, rollback. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | The one deploy command, staging procedure, secrets handling. |
| [`adr/`](adr) | Architecture Decision Records — one file per non-obvious, hard-to-reverse call. |
| [`history/`](history) | Superseded/stale documents kept for provenance instead of silently deleted. |
| [`api/openapi.json`](api/openapi.json) | Machine-readable spec for the current API surface. |

## Conventions

- Every doc in this list describes **only what exists in this working tree
  today**, verified by reading the referenced source files. Where a
  capability doesn't exist yet, the doc says so explicitly (see
  `FEATURES.md` → Roadmap) instead of staying silent.
- When you change behavior, update the doc in the same commit/PR. A stale
  doc is treated as a bug.
