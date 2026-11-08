# ADR-0132 — The inference-only handover digest: a review queue for covers whose only pre-window evidence is inferred work

- **Status:** Accepted
- **Date:** 2026-11-08
- **Session:** 178
- **Schema:** v118 unchanged
- **Surface:** `#/duty-cover?panel=desk`
- **Primary altitude:** frontline (rank 1) and mid-manager (rank 2); director/VP/CEO read the same counts inside their own spans

## Context

ADR-0125 tied cover exercise to the exact absence preparation window. ADR-0128 added the explicit rehearsal record and deliberately left one gap in its own words: *"Surfacing 'covers exercised only by inference' in the digest is a separate, tagged roadmap slice."* The navigation badge was left unchanged because a badge that fires on every absence without a drill is a badge people stop reading.

The real duty is ordinary handover triage. A shift lead preparing tomorrow's absence, or a manager checking two leads' leave weeks, can see that a named cover touched a case in the window. That proves contact with the duty's records. It does not prove the stand-in practised being answerable. Before this ADR the fact was buried in each plan row; the seat had no daily queue of the handovers still resting on inference alone.

## Decision

Add a **derived, bounded Desk digest** to the existing duty-coverage report: `report.absences.handoverDigest`.

One row is one **cover × duty × unended absence** where:

- the absence is active and has not ended (`to >= today`);
- the cover is available and eligible;
- `windowExercise.status === 'valid'` (inferred duty-specific work inside the preparation window);
- there is no `gapsRehearsal` on that exercise reading. A gaps rehearsal is explicit evidence with its own governed decision, not an inference-only cover.

Ready rehearsals, missing/stale/future/late evidence, absent covers and ineligible covers keep their existing states and do not enter this queue.

The queue is ordered by **open work on the duty descending**, then **earliest preparation cutoff**, then absence start, then a stable record-pair id. This is constraint-first dispatching (Goldratt's Theory of Constraints): protect the duty carrying open work before an idle one, then work the nearest deadline. It is a review order, not a risk score and not a person rating. The value-of-information premise (Raiffa & Schlaifer, 1961) is the reason the row exists: an explicit rehearsal can change the handover decision that inferred contact alone cannot settle.

The Desk prints at most `DUTY_COVERAGE_LIMITS.handoverDigestRowCap = 40` rows. The full count, open-work count, cutoff-passed count, window count and deferred remainder are always printed. Nothing is silently dropped.

## Wiring

No new collection, node, relation, rule, event type, convention or schema bump.

- `handoverChecksForPlan` derives rows from the **same** `absenceWindowPlan` already built for the dated roll-up; `buildAbsenceSection` merges own + span checks without a second harvest or plan build.
- The existing ADR-0128 `dutyRehearsalRecord` transaction clears a ready check on the next read: row + `attests-rehearsal-of` edge + holder-chain `rolls-up-to` edges + audit event. A gaps record opens its governed decision and leaves this queue. Revocation, cover revocation, absence revocation, roster change and window end re-derive the queue.
- `dutyCoverageScan`, `dutyAbsenceScan` and `dutyRehearsalScan` print the handover count in their existing audit events; the absence/rehearsal scans return the summary.
- The identity-free upward brief carries counts only. The CSV adds three columns to the **existing** `absence` row kind (`absence_handover_checks_n`, `absence_handover_open_work_n`, `absence_handover_cutoff_passed_n`); row kinds are unchanged.
- The navigation badge is deliberately unchanged (ADR-0128's alert-fatigue refusal stands).

## Privacy

Identity is redacted at construction, not in the view. At or below rank 2 the holder/cover names and inferred source id may print. Above rank 2 there is no holder name, no cover name, no person id and no source record id; duty label, role label, rank, dates and counts survive. The cover-row id addresses the declaration (ADR-0131), never the person. No absence reason, cover note or rehearsal note is copied into the digest. The brief and CSV carry no name, seat id, record id or free text.

## Limits

- Seats remain workflow declarations, not authentication.
- The digest is a review prompt, not a readiness verdict. It does not schedule, remind, assign cover or open a decision by itself.
- It covers unended windows only; an ended window exports zero checks. A started window whose cutoff has passed stays visible and prints `cutoff passed`.
- `openN` is the duty line's existing open-work reading; it is not an effort, hours or calendar-load estimate.
- Full canonical suite and real-browser assistive-technology walkthrough were not run in this session; jsdom + axe-core is what ran.

## Verification

One focused pass: new `duty-handover-digest` 5/5 plus adjacent `duty-rehearsal`, `duty-absence`, `duty-window-exercise` 31/31 (36/36 total); lint, canonical boundary, docs links, standalone rebuild and standalone 7/7 passed. See `AI-SESSION-LOG.md` Session 178 for the exact commands and honest unverified list.
