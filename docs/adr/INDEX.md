# Architecture Decision Records

ADRs capture architecturally significant decisions: why, not just what. See `CONTRIBUTING.md` →
"When you need an ADR" for the criteria that trigger writing a new one.

Format: copy `0001-record-architecture-decisions.md`, number sequentially, status one of
`Proposed`, `Accepted`, `Superseded by ADR-000N`.

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](./0002-rule-based-lead-scoring-v0.md) | Use rule-based scoring, not ML, for v0 | Accepted (legacy `src/` scope) |
| [0006](./0006-canonical-zero-build-app.md) | Zero-build local-first app at the root is canonical (supersedes 0001-canonical-app) | Accepted |
| [0007](./0007-legacy-next-tree-disposition.md) | Explicit disposition & automated quarantine boundary for legacy Next.js / Vite trees | Accepted |
| [0008](./0008-post-commit-rules-hook.md) | Generalized post-commit rules hook for cross-module propagation | Accepted |
| [0009](./0009-single-file-offline-distribution.md) | Ship a single-file, offline, double-clickable LeadOS distribution | Accepted |
| [0010](./0010-on-device-nl-intake-triage.md) | On-device natural-language intake triage with confidence-gated, human-confirmed routing | Accepted |
