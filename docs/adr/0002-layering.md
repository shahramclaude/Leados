# ADR-0002: Four-layer architecture with a pure domain layer

## Status
Accepted — Part 00.

## Context
LEADOS is planned as a 21-part program culminating in autonomous agent behavior over
leadership-intelligence data. Without an enforced boundary between "business logic" and "I/O", a
codebase of this scope reliably accretes database calls and framework code directly inside scoring
and rules logic, which then becomes impossible to unit test, reuse from a future CLI/API surface, or
safely hand to an autonomous agent loop that needs deterministic, replayable decisions.

## Decision
Adopt four layers, outside-in: `src/app/**` (routes/UI) → `src/lib/app/**` (use-cases/orchestration)
→ `src/lib/domain/**` (pure engines, zero I/O) → `src/lib/platform/**` (db, events, storage, clock,
randomness). Full dependency rules and the diagram are in `ARCHITECTURE.md`. The rule that matters
most: `src/lib/domain/**` cannot import `src/lib/platform/**`, `src/lib/app/**`, `src/app/**`, or
`@/db` — every input is a function argument, every output is a plain value, "now" and "random/new
id" are supplied by the caller (see `src/lib/platform/clock.ts`, `src/lib/platform/id.ts`).

## Consequences
- Every new scoring/rules/simulation engine added by Parts 01–20 is independently unit-testable with
  no database, no mocking framework, and no network — pass arguments, assert on the return value.
- The orchestration layer (`src/lib/app/useCases/**`) is where validation, event emission, and
  composition of multiple engines/repositories happens — it is the layer every later part should add
  a new file to for a new capability, not a new top-level directory.
- This is a constraint, not a convenience: some future feature will want to "just" call `Date.now()`
  inside a scoring function for a quick fix. The lint rule in `eslint.config.mjs` blocks that; the
  correct fix is always to thread the value through from the use case.

## Alternatives considered
- **Three layers (collapse `app` and `domain`).** Rejected: this is the single most common failure
  mode in similarly-scoped codebases — "pure" logic silently gains a database call because nothing
  stops it, and six months later nothing in the scoring path is testable without a live Postgres
  connection.
- **Feature-folder structure instead of layer-folder structure (e.g. `src/features/leaders/{ui,logic,data}`).**
  Rejected for this program specifically: the autonomous agent loop planned for later parts needs to
  compose engines *across* features (e.g. a leadership engine informing a succession-planning
  engine), which a strict feature-folder boundary makes awkward. Layer-folders keep that composition
  natural inside `src/lib/app`.
