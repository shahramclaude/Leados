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
| [0011](./0011-decision-tempo-terminal.md) | Price the option to wait — decision tempo as a first-class, measured record | Accepted |
| [0012](./0012-operational-resilience-continuity-terminal.md) | Operational resilience, dependency topology, and verified continuity as a first-class ledger | Accepted |
| [0013](./0013-coalition-incentive-war-room.md) | Coalition & incentive war room: computational political economy as a first-class surface | Accepted |
| [0014](./0014-influence-network-intelligence.md) | Influence network intelligence derived only from the leader's own records | Accepted |
| [0015](./0015-impact-ledger-preegistered-evaluation.md) | An Impact Ledger: pre-registration, a counterfactual, and a refusal to claim causation | Accepted |
| [0016](./0016-stakeholder-comms-outbox.md) | A stakeholder comms outbox: drafts from recorded facts, never auto-sent, closure owed to the briefed | Accepted |
