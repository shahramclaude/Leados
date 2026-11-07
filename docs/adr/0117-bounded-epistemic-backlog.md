# ADR-0117 — The bounded epistemic backlog: a per-span weekly escalation budget with a deferred, printed remainder

- **Status:** Accepted — 2026-11-07 (Session 159, Schema v112 unchanged)
- **Deciders:** LeadOS product architecture
- **Surface:** The Epistemic Ledger (`#/epistemic`) on the shared post-commit spine
- **Extends:** ADR-0103 (the Epistemic Ledger), ADR-0110 (derived-event budget); revises the RULE-EPI-02 scan semantics declared in ADR-0103

## Context

Session 150 measured what an unbounded escalation backlog does to an ordinary
write: one demo `case.updated` paid down the accumulated epistemic/coupling
backlog as **63 engine-authored `decision.created` events in a single
transaction**, and the only reason work was not silently lost afterwards was the
64 → 256 event-budget fix. The session wrote down the fix it deliberately did
not make: *"a bounded-backlog policy inside `RULE-EPI-02` (N per span per week,
remainder deferred and printed) — needs its own ADR."* This is that ADR, carried
on the roadmap through Sessions 151–158.

The defect class underneath the measurement is a cascade fact: the per-pass
budget (`findingsPerPass: 6`) bounds one rule invocation, but every governed
decision a rule opens publishes its own `decision.created` lifecycle event, and
each of those re-invokes the rule with a fresh budget. Marker idempotence caps
the total at one decision per unknown — "ever" — so nothing duplicates, but the
ENTIRE eligible backlog still drains into the decision inbox at the speed of the
event queue, not at the speed any human can read. A span that ignored twenty
signals woke up to twenty "read it or dismiss it" decisions, and the busiest
writers — the leaders doing frequent small saves — paid the most.

## Decision

1. **A declared, clamped weekly budget per owning span (`epistemicEscalateMaxPerWeek`,
   default 5, bounds 1–52).** RULE-EPI-02 opens at most this many escalations per
   owning span per ISO week — a work-in-progress limit on one span's escalation
   inbox (Anderson's bounded WIP; Reinertsen's small-batch economics), so a large
   harvested backlog drains as a weekly batch a human can work through. The
   budget is a convention in the same governance band as the module's other
   floors: director-or-above **and** a full-access seat re-declares it, it is
   clamped to its band, and it is printed wherever its effect is printed.
2. **One quota per week, shared by every transaction — scans included.** The
   quota's bookkeeping is the marker ledger: every escalation marker is written
   in the same transaction as the decision it opened and now carries
   `ownerSeatId` and `weekKey`, so every later transaction in the same ISO week
   reads the same remaining quota. A transaction can never open more than the
   week's remainder for a span, so the weekly bound bounds every transaction
   automatically. This deliberately revises ADR-0103's "an explicit scan opens
   the whole ledger" semantics: the scan still harvests, expires and re-grades
   everything and still runs even when `epistemicAutoPropagate` is off, but
   RULE-EPI-02 openings obey the budget like every other pass. Within the same
   module this is the established idiom — RULE-EPI-03 already prompts once per
   unknown per ISO week and RULE-EPI-04 once per span per ISO week, and neither
   is bypassed by a scan.
3. **Oldest condition first; the quota defers the newest.** The queue is ordered
   by the age of the CONDITION (`evidencesOn`, falling back to `harvestedOn`) —
   the same age the rule escalates on — with deterministic tie-breaks, so the
   longest-waiting debt is bought back first and fairness does not depend on
   storage order.
4. **The remainder is deferred and PRINTED — a queue, never a silence.** An
   over-budget unknown stays `unopened` and eligible; nothing is dropped, closed
   or marked. One dated `escalate-deferred` marker per span per ISO week records
   the deferral in the audit trail (idempotent — a repeat pass cannot re-log it),
   and the read model prints the live queue everywhere the leader looks: a Desk
   stat (`opened/cap`, deferred count, renewal week), a deferred-backlog card
   with the per-span breakdown at director rank and below, a `deferred to next
   week` badge on each queued ledger row, and an identity-free brief line ("A
   deferral is a queue, not a resolution"). The renewal week is printed as a
   date, not implied.
5. **Escaping the queue is a governed act, not a silent one.** A span that must
   move a larger backlog now re-declares the budget in the Method panel
   (director+, full access) — the same declared-clamped-printed discipline the
   module applies to every other threshold.

## Consequences

- A demo-seeded or history-loaded workspace turns its first writes into at most
  `cap` new escalations per span instead of dozens; the queue becomes visible
  work with a renewal date instead of an inbox flood.
- Per-pass `findingsPerPass` remains as the spine-cost governor shared with
  RULE-EPI-03/04/05; the weekly budget is the workload governor and binds every
  pass including scans.
- A rescan is still idempotent in the sense that matters (no state change, no
  duplicate decision, no re-logged deferral); it no longer "opens everything",
  and it now says so in its own audit summary.
- Honest limits: the quota's bookkeeping is the marker ledger (capped at 800
  rows, the same retention that already guarantees "one per unknown, ever" — a
  pre-existing limit, shared and unweakened here). Attribution is ADR-0103's:
  an unknown is owned at the span that manages the work's named people
  (`responsibleNodeId`), so the budget protects the managing span's inbox — in a
  real roster, a frontline lead's own span for their team's work. Seats remain
  workflow declarations, not authentication. Real-browser AT walkthrough
  remains `[UNVERIFIED]` (automated axe-core in jsdom is what ran).
