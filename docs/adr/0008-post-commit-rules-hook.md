# ADR-0008: Generalized post-commit rules hook for cross-module propagation

## Status

Accepted — 2026-10-26, Session 41 (Schema v26).

## Context

[ADR-0006](./0006-canonical-zero-build-app.md) made `index.html` + `app/**` the
canonical zero-build application. Cross-module propagation rules accumulated in
`app/core/domain/automation.js`, but each new module still had to find the right
action call site and remember to invoke its rules. That is per-module glue code,
not the generalized event-driven spine the product requires.

Session 41 adds the Forecast Integrity Terminal: it must observe outcomes from
decisions, cases, portfolio work, budgets and negotiations, and fan out to
challenges, DACI decisions, delegations and typed graph links **in the same
atomic transaction**. Adding seven more `store.update` call-site edits would
make the next module just as brittle.

## Decision

`app/core/store.js` keeps the atomic write boundary. After the mutator and the
source audit event, but before persistence, it calls
`runPostCommitRules(draft, { event, now, idFactory, logEvent, warnings })` from
`app/core/domain/postCommit.js`.

- The default rule list is `DEFAULT_POST_COMMIT_RULES`, currently containing the
  pure `forecastIntegrityRule`.
- `createStore({ postCommitRules: [] })` disables rules for focused tests; other
  rule arrays can be injected without changing the data layer.
- Rules receive the full event object. An action may declare
  `rules: ['forecastIntegrity']` on an event to opt in explicitly; outcome event
  types are also derived from the adapter registry's declared events.
- Rule errors are appended as `automation.rule_error` audit events and pushed
  into visible warnings. They are never silent failures.
- Rules mutate only the draft; they never call `store.update`, which prevents
  recursive transactions.

This is a small, explicit layering change: the store depends on a pure domain
entry point, not on any UI, framework, network or database. The domain rule
still receives an injected clock and id factory, so it remains deterministic
and testable in Node.

## Consequences

**Benefits**

- Every future module can join the propagation spine by registering a rule or
  a forecast adapter; it does not need to edit the store or every action.
- Cross-module writes, source mutation and audit event remain one atomic
  localStorage write.
- The rule catalog (`AUTOMATION_RULES`) stays inspectable by the UI and tests.

**Accepted costs**

- `store.update` now performs a pure workspace scan on declared outcome events.
  The scan is O(records) and DOM-free; large workspaces remain to be measured.
- A bad rule can add an audit event on every write until fixed. Warnings and
  the event log make that visible rather than hidden.
- Tests that need a rule-free store must pass `postCommitRules: []`. Existing
  tests keep the default rule set to exercise real behaviour.

## Alternatives rejected

| Alternative | Reason |
|---|---|
| Edit every action to call the new rule | Per-module glue; easy to miss the next source module and breaks the Section 3 mandate. |
| Put the rules inside `createApi` as a wrapper | Actions sometimes use the store directly (import, demo, encryption); the write boundary would be incomplete. |
| Derive challenges only at render time | No persistent, reviewable response, no append-only history and no cross-module automation. |
| Add a framework/backend event bus | Violates the zero-build local-first architecture without a demonstrated requirement. |
