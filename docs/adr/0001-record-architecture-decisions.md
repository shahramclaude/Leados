# ADR-0001: Record architecture decisions

## Status
Accepted

## Context
LEADOS has already accumulated at least one undocumented architectural decision (schema managed
via `drizzle-kit push` with no migration files, chosen implicitly by using the project's starter
template). Undocumented decisions get silently relitigated or silently violated later. The repo
also previously carried scaffold branding ("Arena Next.js PostgreSQL Starter") that no one decided
to keep — it just wasn't removed. We need a lightweight record of decisions that matter, from now
on.

## Decision
We will use Architecture Decision Records, one Markdown file per decision, stored in `docs/adr/`,
numbered sequentially, never renumbered or deleted — only superseded. `CONTRIBUTING.md` lists the
triggers for when a change requires a new ADR.

## Consequences
- Every future PR that changes schema-migration strategy, adds a required runtime dependency,
  changes deployment topology, or replaces the scoring approach must link an ADR.
- ADRs are not a substitute for `docs/reference.md` or `docs/explanation.md` — they record the
  *decision point*, while the reference/explanation docs describe the *current* system. An ADR can
  be "Accepted" and still describe a decision that was later superseded; the reference docs always
  describe only what's true now.
