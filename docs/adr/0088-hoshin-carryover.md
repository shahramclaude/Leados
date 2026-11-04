# ADR-0088: Hoshin Carryover Terminal — a thesis-invalidated pact settles its bet (Session 128, Schema v94)

**Status:** Accepted, 2026-11-04. Extends [ADR-0084 (Hoshin Kanri & Catchball Cascade)](./0084-hoshin-catchball-cascade.md): the cascade's `settles` verb needed a terminal, and a settled bet needed its resource consequence to be a record, not a rumour.

**Provenance note.** This feature landed on `main` through PR #147 with its merge conflicts left unresolved and its session claims unreconciled (it called itself ADR-0085 / Schema v91 / CSV #80, colliding with the Board Room's numbers). This ADR file and the Session 128 / ADR-0088 / Schema v94 / CSV #83 numbering were assigned during the reconciliation that merged it with the Operating Cadence Clock and The Attested Commit; the feature's code and tests were preserved unchanged apart from that numbering sweep and registering its reads in the gateway's safe-read set.

## Context

A Catchball pact can end in `thesis-invalidated`: the strategy bet it deployed did not survive contact with the world. Two things then matter, and before this terminal neither was a record. First, the *stop rule* of the bet must be judged by a human — retire, revise the stop rule, or reaffirm — not silently ignored. Second, the frozen resource bundle the pact encumbered (person-days and budget line) must be released into the *next* allocation cycle with its arithmetic printed, or the organisation keeps paying for a bet it has already stopped believing in. Settled records must then be graded once, later, against the prediction frozen at decision time — never re-graded against a revised world.

## Decision

One first-class record per settled pact (`carryoverRecords`), idempotency markers (`carryoverMarkers`), and once-only gradings (`carryoverGradings`), driven by `carryoverRule` (`RULE-CO-01..04`) on the existing post-commit spine:

- **RULE-CO-01** creates one carryover record per Catchball pact settled as thesis-invalidated, with its frozen resource bundle (person-days + encumbered budget line); writes `carries-over` / `settles` edges and one `rolls-up-to` edge per leadership ancestor of the receiving span in the SAME atomic transaction; and opens ONE governed stop-rule settlement decision per resolved bet (retire / revise stop rule / reaffirm) with the bundle printed in the question.
- **RULE-CO-02**, on `decision.made`, records the verdict and — for retire — releases the encumbered budget line (committed → released, never erasing a spent actual) and returns the person-day commitment in the same transaction, writing `releases-resource` edges.
- **RULE-CO-03** settles pending records when a bet is retired or a retire verdict is recorded by a human.
- **RULE-CO-04** grades settled records once, later, against the prediction frozen at decision time, and opens one governed review decision per altitude cell below the reliability floor per ISO week.

The rules are marker-idempotent, pausable via `carryoverAutoPropagate`, and an explicit `carryoverScan()` always runs. `sealRule` still runs absolutely last and attests the whole write.

## Consequences

- Altitude calibration cells (n, hold rate, Wilson 95% bounds) are computed on read; a refused rate is BLANK, never zero.
- Aggregate-only CSV #83 (`carryover-settlement`) carries counts, next-cycle released capacity and calibration cells — no pact id, bet id, record id, title, name or budget name crosses the boundary.
- Additive `MIGRATIONS[93]` (`93 → 94`): an upgraded workspace opens with an EMPTY carryover ledger rather than back-filled settlements. Five clamped settings (`carryoverCellFloor`, `carryoverReliabilityFloorPct`, `carryoverGradingDelayDays`, `carryoverDecisionReviewDays`, `carryoverAutoPropagate`).
- Local seats remain auditable workspace declarations, not authenticated access controls (the limit printed since [ADR-0076](./0076-operating-seat.md)).
