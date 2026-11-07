# ADR-0125 — Window-specific cover exercise: evidence must arrive before the absence starts

**Session 171 · 2026-11-07 · Schema v115 unchanged · `#/duty-cover?panel=plan`**
**Primary altitude: frontline (rank 1)** — last primary in Session 167, the most-neglected rung in the Session-170 coverage map. The real duty: a shift lead preparing a handover for a specific week must know whether each declared cover actually practised the duty in time for those dates. Mid-manager, director, VP and CEO read the same derived counts inside their own spans.

## 1. The gap

ADR-0121/0122 graded a cover as exercised when any recent work touched the holder's span. That is a standing-register reading anchored to today. It cannot answer the dated handover question: an old case, a goal in a different duty line, or a record dated after the absence starts does not prove readiness for the exact window. Session 170's own Next target named the remainder: date the cover's exercise evidence to the exact shared window.

## 2. The derivation

For one duty line and one declared cover, the preparation evidence window is:

    [absence.from - dutyCoverageExerciseDays, absence.from - 1]

inclusive ISO days, anchored to the absence start rather than to today. Evidence counts only when it is:

- of one of the duty's declared `SIGNAL_SOURCES` (not any work in the span);
- dated inside that preparation window;
- already recorded by today (future-dated work is not observed evidence);
- touching the holder's span, with the cover appearing on the record.

Closed work is included through the shared harvester's `includeClosed` path, so a completed rehearsal does not vanish. Derived 1:1 cadence items are excluded: an overdue-cadence synthesis is not a held conversation. Actual held 1:1s credit the report and the report's manager.

Statuses are `valid`, `stale`, `late`, `future`, `missing`. The dated plan's `covered` band now requires at least one available, eligible cover with `valid` window exercise; otherwise an available eligible cover reads `thin`. The standing register remains a separate, today-anchored reading.

## 3. Wiring, not a bolt-on

`app/core/domain/dutyWindowExercise.js` builds one historical index per holder seat and grades one cover/window. `absenceWindowPlan` carries `exerciseWindow`, per-cover `windowExercise`, and `summary.exercise`. `dutyAbsenceRollup`, `buildAbsenceSection` and `absenceConcurrency` reuse the same derivation, so the shared dates and the preparation cutoff agree. `dutyAbsenceDeclare` writes the exercise finding onto the governed decision and audit event in the same transaction; `dutyAbsenceScan` re-derives it. The upward brief prints counts only. The plan panel shows the preparation window, evidence badges, per-cover reasons and provenance, and roll-up/concurrency tables carry the same counts.

No new collection, rule id, event type, convention or schema bump. Nothing about the verdict is stored. CSV row kinds are unchanged.

## 4. Identity and limits

Above rank 2 the source record id is withheld at construction; dates, statuses and counts survive. The reason text carries no person name and no source id. Seats remain workflow declarations, not authentication. The reading measures recorded duty-specific work, not skill, hours, calendar load or future arrivals. Closed records without a usable close date remain outside the shared harvester's history.

## 5. Verification (one focused pass, 2026-11-07)

`duty-window-exercise` 7/7 plus adjacent `duty-absence`, `duty-absence-concurrency`, `duty-cover-capacity`, `duty-coverage`: 46/46 total. `npm run lint` PASS; `npm run check:boundary` PASS (572 modules / 172 suites / 23 doc checks, 0 leaks); standalone rebuilt (9,341,407 bytes / 571 modules / v115 / sha256 155e37397082fec1) and `standalone` 7/7. Three initial failures were corrected in one consolidated pass: a future-date fixture that the schema clamps (moved to a direct reader assertion), a 1:1 fixture that credited the wrong manager, and an event summary truncated before the new finding. Full canonical suite and real-browser AT walkthrough [UNVERIFIED].
