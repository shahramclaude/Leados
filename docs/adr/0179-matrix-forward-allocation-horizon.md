# ADR-0179 — Matrix Forward Allocation Horizon

**Status:** Accepted — 2026-11-11 (Session 245; built on Session 244's part 1). Fully wired: the panel `#/matrix?panel=horizon`, the `matrixHorizonReport` (safe read) and `matrixHorizonScan` (spine write) actions with both access-gateway lists, CSV scope #134, and `RULE-LHZ-01` registered immediately before `seatRule` in both the rule spine and the propagation contracts — with a spine-level proof that the rule issues one ask in one atomic commit under the savepoint, the derived-event cascade, the seat roll-up and the seal.  
**Schema:** v143, unchanged  
**Surface:** `#/matrix?panel=horizon` · CSV #134 `line-horizon` · `RULE-LHZ-01`

## Context

A reporting line is a dated agreement: it has a first day and often a last one. Every matrix surface reads those declarations either for **today** (`buildMatrix`, ADR-0140) or for a **closed period** (`linePeriodAllocation.js`, ADR-0158). The only forward signal is the `expiring` finding. The lines that start next month and the lines that end in three weeks are already stored, and nothing reads them forward.

A functional director running a weekly staffing review therefore cannot ask what that review exists to answer: who rolls off which line and into what, who is double-booked on a day that has not arrived, and how much of each manager's span is attributed week by week from here.

This is not the Planned *resource levelling of dated cross-line demands* (that levels dated **work items** inside their slack) nor the Planned *matrix transition overlap capacity ledger* (that records a declared **handover overlap**). It reads only the declared line shares that are already in the record.

## Decision

1. **One engine, evaluated on each day the line set changes.** The declared line set can change only on a day a line starts or on the day after one ends. `buildMatrix` + `matrixAllocations` — the functions behind the live ledger — are evaluated once per such day inside the horizon; the first evaluation is today. No second allocation model exists.
2. **Why a future day is sound where a past day was not.** `buildMatrix` reads three collections (`people`, `reportingLines`, `settings`; measured with a read-recording proxy). Only the declarations carry dates. A past day would pair old declarations with today's home pointers, which is why the as-of read was withdrawn in Session 207. A future day pairs the declarations on record with today's roster, and "today's roster, continuing" is a declared, printed convention.
3. **Horizon.** Whole ISO weeks from today, default 13, bounds 1–26. The first bucket runs from today to Sunday and prints its own day count. A value outside the bounds is refused, never clamped.
4. **Unit.** Integer share-days (hundredths of a person × calendar days). The balance tolerance and the lead window are the live ledger's own conventions (`matrixBalanceHundredths`, `matrixExpiringDays`); the horizon declares no threshold of its own.
5. **One verdict per person, worst first**, adding to the headcount: double-booked ahead, split unknown ahead, unallocated ahead, exposed today, changes and stays balanced, steady. "Ahead" means a state the person *enters* on a later day.
6. **Refusal instead of imputation.** Counts of people and person-days always print. A share-day total is withheld, with its reason, wherever an undeclared person-day or a refused declaration touches it — per week, per manager, per person and for the whole reading.
7. **Disclosure.** The seat's wall is today's, exactly as the live ledger draws it; manager names follow the same detail ceiling. A person who joins a scoped seat's span on a later day is listed only by the one line declared to that seat. The brief and the CSV rows are aggregate and carry no identifier.
8. **RULE-LHZ-01.** For an exposure that begins inside the lead window, one dated ask goes to the one seat that owns the fix — the lowest roster seat above every line in force (over-commitment), the line(s) with no declared share (unknown split) or the home-line manager (unallocated remainder). A leader-held, tied or off-roster owner is observed in one identity-free marker and nobody is substituted. The exposure is carried on the typed `issues-obligation` edge, so no marker field and no schema change is needed. The rule closes its own ask when the ledger no longer reads the exposure, never because the day arrived, and does not re-ask an exposure a person answered.

## What exists (part 1)

- `app/core/domain/lineHorizonRegistry.js` — closed vocabulary, conventions, method, limits, CSV header and descriptor.
- `app/core/domain/lineHorizon.js` — `buildLineHorizon`, `lineHorizonExposures`, `lineHorizonBriefText`, `lineHorizonCsvRows`, `resolveLineHorizon`.
- `app/core/domain/lineHorizonRules.js` — `lineHorizonRule` (RULE-LHZ-01).
- `tests/app/line-horizon.test.mjs` — 21 tests. Its first test pins that nothing is registered, so the wiring step must replace it with the positive check.

## What does not exist (part 2)

1. Registration: `MATRIX_PANELS` entry, `matrixHorizonReport` / `matrixHorizonScan` in `matrixActions.js` and the `accessGateway.js` lists, CSV scope #134 and its export case, the rule before `seatRule` on `DEFAULT_POST_COMMIT_RULES` with its `PROPAGATION_CONTRACTS` entry, the view dispatch.
2. The panel, `app/views/matrixHorizonPanel.js`.
3. Spine-level proof: the rule has only been called directly on a plain draft. It has never run under the copy-on-write savepoint, the derived-event cascade, the seat roll-up or the seal.
4. The rebuilt standalone artifact, and a by-name comparison of the suites that pin rule order or counts.
5. De-duplicating the operational-event predicate, which is a private copy of RULE-MTX-01's list.

## Verification (part 1 only)

- The first day's states, totals and line counts equal `matrixAllocations(buildMatrix(…))` for every person.
- Every weekly person-day and share-day figure equals an independent evaluation of the live ledger on each of the 89 days of the default horizon, while the engine itself was evaluated on 6.
- Reading stores nothing (stored bytes compared before and after).
- The rule's delegation, typed edges and marker survive `normalizeState`, and a second run after that round trip issues nothing.

## Limits

- An allocation is a declaration, not a measurement; share-days are not hours.
- The roster is today's; no hire, exit or planned reorganisation is read. Shares are held at today's figure; no line is renewed or ramped.
- A line's consent state (ADR-0148) is not joined, exactly as the live ledger does not join it.
- The record holds no clock. The rule runs on a write or a scan; a workspace nobody writes to issues and closes nothing.
- **Found while building, not fixed here:** the three matrix conventions (`matrixBalanceHundredths`, `matrixExpiringDays`, `matrixAutoPropagate`) are written by `matrixSetConventions` but are dropped by `normalizeState`, so after a reload the defaults apply again — including auto-propagation switching back on. Reproduced on the unmodified base commit `ad212b8`. Every matrix rule that reads those conventions is affected, and this one would be too.
