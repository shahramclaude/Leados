# ADR-0172 — Cross-Line Meeting-Time vs Declared-Share Parity

**Status:** Accepted (2026-11-11)  
**Decision:** Extend the existing Matrix Meeting-Load & Coordination-Tax Ledger (ADR-0169) with a read-only per-person/per-additional-line comparison. Do not create a second hierarchy, schema collection, allocation rule, performance score, or automatic reallocation.

## Duty

A director or VP needs to know whether the meeting time convened by a line resembles the share of a person's capacity that the line declared. A 40% project line may be convening 10% or 70% of that person's logged meeting minutes. This is a calendar-mix diagnostic, not proof of all work consumed or delivered by that line.

## Method

- Declared share uses `buildLinePeriodAllocation` and its canonical `shareTimelineFor` / `shareOnDay` day sweep. The exact share-days and day denominator are retained; the displayed per-mille is rounded only for display.
- Observed minutes are the exact person-minutes in held cadence sessions chaired by exactly one of that person's declared additional-line managers, using the existing meeting-load placement. Observed share is that line's minutes divided by the person's total readable meeting minutes.
- Compare only when the declaration is provable, the line covers the whole requested window, the person has a complete meeting total above the existing floor, and one declaration uniquely names the manager. Otherwise print BLANK and the reason. Do not infer an attribution for a historical line that was not active for the entire period.
- Preserve the source's refusals. A session missing duration or containing an unknown attendee already refuses the person's meeting total; parity refuses too.
- Show per-person rows to the same acting-seat scope as the existing ledger; export only aggregate counts and reconciliation state. No work is changed by reading this report.

## Integration and consequences

The report extends `matrixMeetingLoad.js` and its existing panel/export. It reads the canonical matrix graph, the share-day allocation reader, and cadence sitting records; it introduces no parallel line model and is inert in single-chain workspaces. Existing cadence writes continue through LeadOS's shared store/post-commit event engine. No new automatic task is issued: a mismatch is evidence for a human to interpret, not an instruction to rebalance a person's calendar or capacity.

The scope is intentionally bounded: if a line's effective dates do not cover the entire requested period, parity is refused rather than pretending current chair attribution is historical. A future as-of line-attribution reader may widen that scope only with dated-line and seat-scope proofs.

## Verification

`tests/app/matrix-meeting-load.test.mjs` asserts the declared share-days, line-chaired minutes, observed and declared per-mille, exact rendered values, refusal handling in the existing reader, and read-only behavior. Full repository tests and browser/assistive-technology walkthrough are not claimed by this ADR.
