# ADR-0001: Append-only event log as the truth core (Layer 1), not full event sourcing yet

## Status
Accepted — Part 00 (this delivery). Supersedes nothing; the subject repository already contains a
materially similar decision at `docs/adr/0005-event-versioning-posture.md` (append-only `event_log`
with `event_version`, state tables remain primary). This ADR adopts and extends that position at the
program level rather than re-litigating it, and names it explicitly as Layer 1 in
`docs/LEADOS-ARCHITECTURE-2026.md`.

## Context
Ten layers are specified for LEADOS (`docs/LEADOS-ARCHITECTURE-2026.md`). Nine of them — reasoning,
causal inference, the digital twin, autonomous operations, memory/sensing — all need the same thing
underneath them: an authoritative, ordered, append-only record of "what happened, when, by whom,
with what payload, at what schema version." Without this, every layer either invents its own
ad-hoc history (observed already: `events` table vs. `findings` table vs. per-engine state with no
shared event trail — `docs/FINDINGS-2026-PART-00.md` F2/F5) or has no history at all, which makes
T1 (evidence over assertion) and T3 (reversible, attributable autonomous action) structurally
impossible to satisfy, not just currently unsatisfied.

Two designs were on the table:
1. **Full event sourcing**: all read-side state (`orgs`, `users`, `findings`, people profiles,
   financial figures) is a projection rebuilt from the event stream; no table is directly written
   outside of a projector.
2. **Append-only audit log alongside primary tables**: state-changing use cases write to their
   normal tables *and* append an event; the event log is a secondary, queryable record, not the
   source of current state.

## Decision
Adopt option 2 for the program as a whole, consistent with the subject repository's own
`ADR-0005`. The event log (`events` table, `src/db/schema.ts`) is the **truth core** in the sense
that it is the one place every layer is required to write to and read from for "what happened" —
but it is not (yet) the mechanism by which current state is derived. Every Layer 2–9 module that
produces a fact a human or an agent will act on must:
1. Perform its primary write to its own table(s).
2. Append an event (`event_type`, `event_version`, `payload`, `actor`) in the same transaction (or a
   documented, tested saga if cross-service).
3. Attach that event's id as the `proof` for any downstream ledger row that depends on the fact.

Full event sourcing is deferred, explicitly, as its own future ADR — not silently dropped, not
implicitly assumed. A part that wants to introduce a true event-sourced read model (state rebuilt
from the stream, snapshotting, replay) must write a new ADR, because it changes the failure modes of
every layer that reads "current state" today.

## Consequences
- Every part from 02 onward gets a free, consistent audit trail for anything it adds, by calling the
  Layer 1 append function — this is the mechanism that makes T1 and T3 enforceable in code rather
  than policy.
- Two or more parallel event-store implementations currently exist in the subject repository
  (`src/lib/eventStore.ts` and `src/lib/events/eventStore.ts` — `docs/EVIDENCE-LEDGER.md` row
  `LD-006`). This ADR does not retroactively fix that; Part 02 (`docs/PART-DEPENDENCY.md`) is
  explicitly scoped to consolidate to one.
- Because current state is *not* derived from events, a bug that updates a table without appending
  an event is invisible to any downstream auditor relying on the event log alone — this is a real,
  named risk (`docs/LEADOS-ARCHITECTURE-2026.md` Layer 1 failure modes, "dual-write"), mitigated only
  by future parts adding a reconciliation check (state table row count/hash vs. derivable-from-events
  count), not by this ADR alone.
- `event_version` must be checked by every reader; this ADR does not grant permission to assume the
  latest payload shape.

## Alternatives considered
- **Full event sourcing from Part 00.** Rejected for the same reason the subject repository's own
  ADR-0005 rejected it: there is no stable, de-duplicated set of consumers yet (Part 01 has not run).
  Building replay/projection machinery before there is one canonical event-store module to replay
  from would mean maintaining the complexity against a moving, duplicated target.
- **No shared event log; each layer keeps its own history.** Rejected: this is the status quo found
  in discovery (`events` table, `findings` table, and numerous engines with no shared trail) and is
  the direct cause of T1/T3 being unenforceable today.
- **A message bus / external event broker.** Rejected as premature: there are zero consumers that
  need at-least-once delivery to an external subscriber today; introducing broker infrastructure
  before Part 13 (autonomous operations) exists to consume it would be speculative infrastructure
  with no caller, which `ADR-0005` in the subject repository already correctly identifies as an
  anti-pattern for this program.
