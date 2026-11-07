# ADR-0124 — Cover capacity in a shared window: a named cover is not spare capacity

**Session 170 · 2026-11-07 · Schema v115 unchanged · `#/duty-cover?panel=plan`**
**Primary altitude: mid-manager (rank 2)** — last primary in Session 166, the most-neglected rung in the Session-169 coverage map. The real duty: a manager approving cover for a week in which two leads are out simultaneously must decide whether **the one person named as cover for both can absorb the work**. Director / VP read the same finding as counts on the same roll-up; frontline and CEO inherit the same reading inside their own scope.

## 1. The gap

ADR-0123 sweeps the declared absence windows for maximal shared date ranges, re-grades each absent seat's duty lines against the shared dates, and prints the single point of failure: one available, eligible cover who is the only answerable person for duty lines belonging to two or more absent seats. It deliberately stopped at the *name*. Session 169's own Next target recorded the remainder:

> "[mid-manager → director] grade the *cover's own capacity* across concurrent windows (one person declared cover for two absent seats reads as a finding today, but their own open workload is not yet weighed)".

A per-absence plan cannot see this: it grades one seat's covers against one window. A concurrency sweep that stops at `concentrated` implies the named person has room, which the workspace has never measured.

## 2. What is declared, what is derived

**Nothing new is declared.** No collection, no rule id, no event type, no convention and no schema bump. The absence windows (ADR-0122), the covers (ADR-0121), the altitude duty table (ADR-0075) and the shared open-work harvester (`harvestWork`, `SIGNAL_SOURCES`) already exist.

**Derived on every read, never stored:**

| Figure | Derivation |
| --- | --- |
| `ownN` | distinct open work items of the cover seat's own declared duty lines, inside that seat's span |
| `inheritedN` | distinct open work items of duty lines in the absent seats' spans for which this cover is the **only** available, eligible cover |
| `overlapN` | items present in both sets — the cover is usually an ancestor, so their span already contains the descendant's cases |
| `combinedN` | `ownN + inheritedN − overlapN` (inclusion–exclusion, not a sum) |
| `envelopeN`, `peersN` | the peak own open work among comparable seats in the acting seat's span, and how many there are |
| `ratio`, `band`, `reason` | `combinedN / envelopeN`; `over-envelope` / `at-envelope` / `within-envelope` / `refused`; one printed sentence with the arithmetic |

Items are keyed once as `<type>:<entityId>`. A case naming people in two absent leads' spans reaches two duty lines and two seats and is still one item (Simpson 1951: the composition of the parts is not their sum). A duty line with **several** available covers is printed as `sharedLinesN` and its work is attributed to no one — no split is declared, so no split is invented.

**The like-for-like envelope.** Little's Law (1961) makes work-in-progress the unit. The comparison set is every seat in the acting seat's span **at or below the cover's altitude, excluding the cover**; the peak of their current own open work is the *revealed* envelope. Comparing a manager's load to a chief's whole-span load would be a composition error (Simpson 1951; Greenland/Robins/Pearl 1999): the chief's duty lines legitimately see more work because their span contains everyone. The number is a reading of observed work, not a productivity constant fitted to a person, and **not** the `wipLimitPerPerson` convention — that one denominates funded plan items and belongs to a different ledger (ADR-0118's "no pooled currencies" rule).

**Refusals, printed not zeroed:** no comparable seat (there is no like-for-like load in the tree), no comparable seat carrying recorded open work (zero is not spare capacity), and a cover with no declared duty line (no denominator). A refusal keeps the concurrency finding; it does not erase it and is not a pass. The sweep grades at most `coverCap` (24) distinct covers per window and counts the remainder as `deferredCoversN`, printed in the brief and the card.

## 3. Wiring, not a bolt-on

`absenceConcurrency` in `app/core/domain/dutyCoverage.js` now collects, inside its existing per-window loop, the sole-answerable work and the shared lines per available cover; `buildCoverLoads` grades them against `coverLoadEnvelope` **at construction, before redaction**. Each window carries `coverLoads` and `capacity`; each single-cover finding carries its own `capacity`; the whole reading carries `coverLoad` at the top level. Therefore:

- `report.absences.concurrency` rolls the same figures up at every altitude — the chief does not receive a second computation or a copied record.
- `dutyCoverageBriefText` prints a counts-only capacity line plus its refusal.
- `dutyAbsenceDeclare` computes concurrency against a hypothetical state (the row not yet written) and now writes the capacity finding onto the **governed decision and the audit event in the SAME `store.update`**; the overlap and the load behind it are on the record at the moment the absence is created.
- `dutyAbsenceScan` re-derives and reports the same figures; it schedules nothing.
- `app/views/dutyCover.js` adds a "Cover capacity on the shared dates" table, a "Covers past observed load" stat, per-window reasons and the refusal/deferral banners.
- CSV row kinds are unchanged: this is a register reading, not a new export scope.

**Identity wall, one seam.** `namesVisible = fullAccess || rank ≤ 2`. Above rank 2, `coverId` and `name` are nulled *before* the reason text is built; labels, ranks, counts, bands, seat refs and the finding all survive. The test asserts that `JSON.stringify(concurrency)` at the director altitude carries no person name at all, and that the counts are byte-identical to the manager reading.

## 4. What it refuses to claim

It does not measure effort, hours, calendar load, skill or arrivals before the window opens; it counts the open work the workspace has actually recorded today. "Available" still means only that no absence is declared for the cover (ADR-0122). A small anonymous branch can be inferable from counts, and seats remain workflow declarations, not authentication. Nothing is auto-assigned: removing a single point of failure is still a human cover declaration.

## 5. Verification (one focused pass, 2026-11-07)

`duty-cover-capacity` **9/9**: honest refusal with no open work; set-union arithmetic with independent harvester parity and a case shared by two absent seats; over/at/within-envelope bands; shared lines never split; identity wall with counts intact; derived-not-stored with reload parity and a changed work record; report/brief at five altitudes with CSV kinds unchanged; declare transaction (decision + event) and scan; jsdom + axe-core renders at manager and director. Adjacent `duty-absence-concurrency` + `duty-absence` + `duty-coverage` **30/30**. `npm run lint` PASS; `npm run check:boundary` PASS (571 modules / 171 suites / 23 doc checks, 0 leaks); standalone rebuilt (9,332,496 bytes / 570 modules / v115 / sha256 f062bc5462829062), `standalone` **7/7**. Full canonical suite and real-browser assistive-technology walkthrough **[UNVERIFIED]**.
