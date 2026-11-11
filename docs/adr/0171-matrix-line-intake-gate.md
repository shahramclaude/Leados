# ADR-0171 — The matrix line intake gate: a WIP limit at the point of admission

- **Status:** Accepted and implemented, 2026-11-11 (Session 235)
- **Decision:** Nothing recorded, at the moment work was taken on, which declared line funded it and whether that line's declared share-days were already spent for the running period. A **dated intake act** names the line funding the work and the share-days it consumes, and the gate refuses an intake that would breach that line's declared share-day ceiling for the running period — unless a human decides otherwise (accept the over-share with a printed reason, re-route to another line, or retune the declaration), and the breach is recorded as a fact. The ceiling is the line's declared share-days swept day-by-day from its own share timeline — the same `shareTimelineFor` / `shareOnDay` the period-allocation ledger runs — so gate and ledger cannot disagree. No ceiling is stored; every figure is re-derived on read.
- **Scope:** One pure read model (`lineIntake.js`), one closed vocabulary (`lineIntakeRegistry.js`), four actions on the existing `declare-matrix-line` seat (`matrixRecordIntake`, `matrixRerouteIntake`, `matrixIntakeReport`, `matrixIntakeCandidates`), one panel (`#/matrix?panel=intake`), one aggregate CSV scope (#126, `matrix-intake`), one new collection (`lineIntakes`) migrated 135→136 with fail-closed normalization, one matrix panel entry (`intake`), one panel dispatch row in `app/views/matrix.js`, four access-gateway rights. Schema bumps v135 → v136; the migration appends an empty `lineIntakes` array and no record changes.

## Context

The Matrix Period-Allocation Ledger (ADR-0158) can SEE a line charged more than its declared share-days; nothing acted when the work was taken on. A search of `app/core/domain` found capacity, allocation, period-allocation and contention models but no intake-time line gate or per-line WIP ceiling. In practice, a line that is already over its share for the quarter is a control failure that the workspace should prevent at admission, not measure in arrears.

A person on two lines (home + project) can have work taken on under each line without either line's ceiling being checked at the moment the work is accepted. The intake gate closes that gap.

## Rule

1. **The intake is a dated act.** An intake is recorded against a person, a manager (the funding line), a period, a title, and a share-days estimate. The date determines the period: an intake dated 2026-11-11 belongs to 2026-Q4 (2026-10-01 to 2026-12-31). A backdated intake is gated against its own quarter.

2. **The line must exist and be in force.** A declared line joining the person to the manager must overlap the intake date. A line that ended before the date, or that starts after it, is out of scope — an absence of scope, not a zero ceiling.

3. **The ceiling is declared share-days swept day by day.** For each day in the line's overlap with the period, `shareOnDay` returns the declared share in force that day (the day of a retune is read at its closing share). The sum is the ceiling in hundredths of a person-day. Where the timeline cannot prove a day (refused line, history cap at its bound, days with no declared share), the ceiling is **refused** — never projected from today's share.

4. **Consumed is recorded intakes only.** Consumed = the sum of share-days of intakes recorded through the gate for that line and period, excluding re-routed intakes. Work taken on before the gate existed is not counted and not assumed zero; the panel says the ledger starts empty.

5. **Admit, refuse, or override.** If consumed + this intake <= ceiling, the intake is `recorded`. If consumed + this intake > ceiling, the intake is **refused** with the reason and the exact figures printed — unless `override: true` with an `overrideReason`, in which case it is `over-share`, recorded as a fact. A refused intake writes nothing. An override without a reason is refused.

6. **Re-route voids and re-records.** Re-routing an intake voids the old row (`status = 're-routed'`, naming its successor) and records a new intake on the target line through the same gate check. The funding history is append-only: nothing is rewritten.

7. **Verdicts are derived, not stored.** Per line and period: `ceiling-unprovable` (ceiling cannot be priced), `over-share` (consumed > ceiling), `exhausted` (consumed == ceiling), `within-ceiling` (headroom remains). No stored verdict.

8. **Scope is the seat's.** A seat may record intakes only for people and lines inside its scope; full-access seats may record for all. A peer cannot record inside another span.

## Not in this slice

Stated so the next session does not have to rediscover it. Each stays **In Progress** or unrecorded in `ROADMAP.md`.

- **Line attribution on work records.** A work item names the person but not the line it was taken on under, so an allocation-to-output comparison cannot be built honestly. This is a separate collection and schema decision.
- **Retune-triggered asks.** When a retune lowers a line's share, the gate does not automatically issue an ask about already-recorded intakes that now exceed the new ceiling. That is a deliberate future decision.
- **The ceiling-as-of-today reading.** The gate prices the line's own timeline; it never projects today's share backwards. A different product could offer a "what if today's share held" view; this one does not.

## Alternatives rejected

- **Projecting today's share backwards.** Rejected: it invents history. A day with no declared share is a refusal, not a zero.
- **Clamping the intake to fit the ceiling.** Rejected: clamping silently changes the user's intent. A breach is refused with the reason printed, or accepted as an over-share fact.
- **Counting pre-gate work as consumed.** Rejected: that invents history. The ledger starts empty.
- **Blocking work automatically.** Rejected: this is a gate with a human override path, not a hard stop. A line can exceed its ceiling by explicit human decision, recorded as a fact.
- **Storing the ceiling.** Rejected: a stored ceiling is drift waiting to happen. Everything is re-derived on read.

## Consequences

- A frontline or mid-manager can see, for each of their lines in the running period, the declared ceiling, what recorded intakes have consumed, the headroom, and the gate verdict — with every figure traceable to a dated intake and a dated declaration.
- A director or VP reads the same board, seat-scoped, with outside names and ids withheld.
- The register is meaningful in a single-chain workspace: one line, one ceiling, the same gate.
- Everything is re-derived on read, so the screen cannot drift from the record — the Bulletproof Reliability Mandate's display-vs-stored requirement is structural, not procedural.
- Named basis: kanban WIP limits (a limit at admission), Little's Law (throughput × cycle time), Goldratt's constraint logic (the declared share is the constraint; breach needs a human decision).

## Verification

`node --test tests/app/line-intake.test.mjs` — **15/15 PASS**. Every count is worked out by hand from one fixture (Q4 2026, one line at shareH 50, ceiling = 4600 share-days = 46 person-days): intake of 5 person-days recorded within ceiling (consumed 500, headroom 4100); intake taking the line to 47 person-days against a 46-person-day ceiling refused with the reason printed; over-share recorded as a fact with a human reason; override without a reason refused; re-route voids the old intake (`re-routed`) and records a new one on the target line through the same gate check; board counts reconcile; brief names no person, line or intake; CSV export is aggregate-only (no person id, name, manager, intake title, intake date, free text; refused ceiling/headroom BLANK with `figures_complete: false`); JSDOM render prints the period, ceiling (46.00) and consumed (5.00) cell-for-cell equal to the computed report; no stored verdict is driftable.

Adjacent suites re-run: `sod-register` 22/22, `bench-evidence` 16/16, `csv` 5/5, `review-stewardship` 15/15, `authority-continuity`, `authority-reaffirmation`, `role-clarity`, `assessment-reconciliation`, `structure-history` — all PASS with updated schema/CSV pins (135→136, 124→125). `check:boundary` and `check:links` pass.

See `AI-SESSION-LOG.md` (Session 235) for the full verification record.
