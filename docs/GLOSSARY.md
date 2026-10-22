# LEADOS Glossary — one vocabulary, enforced codebase-wide

This file is the single source of truth for product vocabulary. Every
schema name, API field, log message, and UI label in this repository uses
these terms. Synonyms are banned; where a synonym was found during the
Part 22 audit it was renamed (see `docs/AUDIT-2026.md` and
`EVIDENCE-LEDGER.md` for the before/after list).

## Core nouns

| Term | Definition | Rejected synonyms (do not use) |
|---|---|---|
| **Signal** | A raw, low-level, unprocessed observation about a lead (an email open, a webhook payload, a firmographic fact, an imported CSV row). Signals are *inputs*. They carry their own per-signal confidence, but a signal is never itself a judgement. | "finding", "event" (see below), "fact" |
| **Decision** | A committed, attributable, single choice about a lead (a stage change, a score commit, an outreach draft, a send). Every decision has exactly one actor (`human`, `agent`, `llm`, or `system`), a confidence, a basis, and a rationale. Decisions are *outputs*. | "choice", "judgement", "recommendation" (a recommendation that has not been committed is represented as an `Explain<T>` returned to the caller, not a `decision` row, until something commits it) |
| **Event** | The immutable audit row written by the write envelope (`src/lib/envelope.ts`) for *every* mutation in the system, including the mutations that create signals and decisions. An event describes "what changed", not "what was observed" (signal) or "what was chosen" (decision). | "log entry", "audit record" (both used informally in prose, but the table/API name is always `events`) |
| **Explain\<T\>** | The generic envelope (`src/lib/explain.ts`) wrapping any derived value shown to a human: `{ value, confidence, basis, uncertainty, generatedBy, policyViolations }`. Nothing model- or heuristic-derived is rendered without this wrapper. | "result", "output" (used only for raw tool return values before they are wrapped) |
| **Tier** | The authorization level (0–3) assigned to an agent, gating which tools (`src/lib/tiers.ts`) it may invoke server-side. | "level", "role" (role is reserved for human `users.role`) |
| **Tool** | A named, catalogued capability an agent can invoke (`src/lib/tiers.ts` `TOOL_CATALOG`), each with a `minTier` and a compute cost. | "action", "capability" |
| **Budget** | The per-org, per-period compute allowance (`src/lib/budget.ts`) that every tool invocation must reserve units from before it runs. | "quota", "allowance" |
| **Registry** | The explicit allow-list (`src/lib/registry.ts`) of routes reachable through the public API. If a route is not in the registry, the handler refuses to serve it even if the Next.js route file exists. | "route table", "API docs" |
| **Org** (organization) | The tenant boundary. Every row in every multi-tenant table carries `orgId`. | "tenant", "account" (used interchangeably in prose only) |

## Conventions this implies

- A webhook/API ingest handler **creates a signal**, never a "finding" and
  never directly a "decision".
- An agent tool that proposes something for human approval **returns an
  `Explain<T>`**; only tools whose tier permits autonomous commitment write a
  **decision**.
- Every table name, TypeScript type, API JSON key, and UI label uses exactly
  these nouns. `grep -rn "finding\|\bchoice\b" src/` (excluding this file and
  the docs that discuss the convention) is expected to return nothing — this
  is checked in `docs/AUDIT-2026.md`.
