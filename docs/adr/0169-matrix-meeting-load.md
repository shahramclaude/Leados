# ADR-0169 — The meeting-load & coordination-tax ledger: minutes × the room, or nothing

- **Status:** Accepted and implemented, 2026-11-10 (Session 233)
- **Decision:** Every held sitting already logged on `#/cadence` carries a day, a duration and an attendee list. Those three recorded fields are multiplied and summed into an exact meeting burden per person and per declared line, and the share of that burden convened by anyone other than the person's home manager is published as a cross-line rate — **or refused with a printed reason** whenever a sitting, a person's total, or a declared floor cannot support it.
- **Scope:** One pure read model (`matrixMeetingLoad.js`), one declared vocabulary (`matrixMeetingLoadRegistry.js`), one panel (`#/matrix?panel=meeting-load`), one aggregate CSV scope (#124), and one additive capture change on the existing sitting dialog. **No collection, no migration, no rule, no schema bump** — Schema stays v135.

## Context

The Matrix Accountability Ledger (ADR-0140) says what share of a person each line was *declared*. The period-allocation ledger (ADR-0158) prices that share across a named window, and the line-activity reconciliation (ADR-0160) reads what each line *originated*. None of them could answer the question every director of a matrix actually asks: **how much of my people's time is being convened by lines that are not mine?**

The workspace has stored the raw material since Schema v93 (ADR-0087, the Operating Cadence Clock): `cadenceForums` declares each standing forum's chair, and every `cadenceSessions` row stores `heldOn`, `minutes` and `attendeeIds`. Session 232's discovery named the gap precisely — it assumed no forum record of meeting hours existed. It does exist; **nothing had ever read it as a workload**. That correction matters: the capability was a *reader*, not a new instrument, and the reader was missing.

The consequence of the missing reader is the ordinary failure of matrix life. A person on three lines is booked into three lines' forums; the booking is visible only to each convener separately; the sum of the hours exists nowhere. The person carries the tax; the structure never sees it.

## Rule

1. **Duration comes from the sitting, never from a default.** Whole minutes recorded per sitting (`1 … 1440`). No nominal forum duration, no assumed hour. A sitting with no readable duration refuses the totals of everyone who attended it — printed BLANK with the reason, and the known part is printed only as a *floor* ("at least 270 known minutes"), never as the total.

2. **Attendance comes from the sitting's own room.** The forum's declared attendance is never substituted. A sitting that names nobody charges nobody (`no-attendees`); a sitting naming anyone outside the roster is refused whole (`unknown-attendee`) rather than charged to the people we recognise, because a room we cannot validate is not a room.

3. **Every charge is exact.** person-minutes = minutes × attendees, per sitting, in whole integers. There is no rounding anywhere in the pipeline, so the printed figure is the computed figure. The export's per-kind rows sum to its workspace row to the minute.

4. **Three figures are never collapsed.** `chargedMinutes` (every recorded minute in scope), `printableMinutes` (sums that can be printed as a person's total) and `refusedKnownMinutes` (the known part of refused people) are reported separately and the identity `charged = printable + refusedKnown` is asserted as a claim. A single "total" over a population that contains a refusal would be exactly the quiet drift the Bulletproof Reliability Mandate forbids.

5. **Attribution is by the chair, and requires exactly one line.** A sitting is placed in exactly one class: `home` (the person's own manager), `self` (the person chaired it), `line` (the chair holds exactly one active declared line for the person), `other` (no declared line), `no-chair` (the chair is not on the roster). The home manager's sittings are printed and **never** charged to a second line. There is deliberately no "chair holds two lines" class: the matrix engine stores at most one line per (person, manager), so that record cannot exist and the ledger will not declare a class nobody can reach. The match still requires *exactly* one, so a record that broke the invariant would fall to `other` — counted as cross-line and attributed to nobody — never split.

6. **Cross-line minutes are the coordination tax, measured as narrowly as the record allows.** Minutes in sittings chaired by anyone other than the person's home manager and by anyone other than the person themselves. The rate is `cross-line ÷ charged`, in whole per-mille, printed beside both numerator and denominator.

7. **The rate is refused, not narrowed.** Per person: BLANK below 12 recorded minutes, or when the person's total is refused. Per span: BLANK below 3 measured people, below 12 recorded minutes, over **any** unreadable sitting, or over **any** refused person total. The reason is printed in its own field, and the export writes BLANK (never a zero) with `tax_withheld`.

8. **A retired forum keeps its history.** Its past sittings happened and are charged. A cancelled sitting charges nothing and is counted (`cancelled`), because a cadence slip is a fact about the forum, not about anyone's time.

9. **Scope is the seat's, not a second hierarchy.** The panel reuses `buildSeats` with `matrixLineScope`, exactly as the matrix report does. Sittings outside the acting seat's scope are counted as withheld and their minutes are folded into no figure; attendees outside scope are counted, not shown.

10. **Two claims, printed separately.** `minutesReconcile` (the sitting log's own total, the charged total, and the printable + refused split all agree; and every charged attendee-sitting is on exactly one person row) and `figuresComplete` (every sitting and every total in scope was readable). Neither implies the other.

## Additive capture on the sitting dialog

The session dialog previously captured outcomes but not the two fields this ledger multiplies. It now captures **minutes actually spent** and **who was actually in the room** (defaulting to the forum's declared attendance). The action already persisted both fields; one semantic was corrected: an **explicit empty room is now recorded as empty**. Only an absent `attendeeIds` list falls back to the forum's declared attendance, so the ledger can never charge a sitting to people the recorder removed.

## Alternatives rejected

- **Assuming an hour when a sitting has no duration.** Rejected: it is the single most tempting default in this area and would silently corrupt every total the ledger prints.
- **Charging the sitting with an unknown attendee to the attendees we recognise.** Rejected: it shrinks the room without saying so.
- **Splitting a chair's minutes across two of a person's lines.** Rejected: the record does not say which declaration the sitting belonged to; a split would be an agreement nobody made.
- **Charging the home manager's sittings to a declared line.** Rejected: contradicts ADR-0158's home-line boundary and would inflate every line's tax.
- **Reporting a rate below the floor.** Rejected: a proportion over a handful of minutes is arithmetic, not a reading.

## Consequences

- A director or VP can now read, per person and per chair, exactly how many recorded person-minutes their span spent in meetings, and how much of it was convened outside the home line — with every figure traceable to a dated sitting.
- The ledger also works in a single-chain workspace: there, cross-line time is simply time convened by someone other than the person's own manager, and the panel prints that no line claim is made.
- The panel is empty in the demo workspace because the demo declares no forums. That is the honest state: the ledger reads sittings, and it does not invent them.
- No collection is added; the reading stores no verdict, no rate and no row. Everything is re-derived on read, so the screen cannot drift from the record.
- Named framework basis: time-driven activity-based costing (Kaplan & Anderson 2004), coordination cost in the matrix (Galbraith 1971; Bartlett & Ghoshal 1990), communication overhead as coupling (Brooks 1975), attention as a scarce resource (Simon 1971; Ocasio 1997), and refusal-instead-of-imputation as the measurement contract.

## Verification

`node --test tests/app/matrix-meeting-load.test.mjs` — **13/13 PASS**, including: exact minute arithmetic (925 charged = 180+135+60+180+90+60+180+40, with the placement split summing to the same total); a reloaded workspace printing identical figures while reads mutate nothing; a sitting without a duration refusing its attendee's total (BLANK, with "at least 270 known minute(s)" printed) while the record identity still holds; an unknown attendee refusing the sitting whole and charging it to nobody; the one-line-per-manager invariant charging a chair's minutes once; home/self/other placement and the retired forum's history; the rate floor refusing per person and per span and exporting BLANK with its reason; a window placing sittings by the day they sat; a single-chain workspace reading the same minutes with no line claim; an aggregate-only export whose per-kind rows sum to the workspace row and which contains no person, chair, forum title or sitting date; the sitting-capture path persisting minutes and an explicitly empty room and the ledger reading both back; and a JSDOM render printing the report's own totals with a refused total shown as an em dash.

Adjacent suites re-run because the CSV register grew to 123 scopes and the matrix panel list grew: `csv` 5/5, `line-activity` 11/11, `matrix-coordination` 11/11, `cadence-overdue` 4/4, `cadence-matrix` 5/5, `bench-evidence`, `merit-parity` and `role-clarity` 66/66 combined, and `access-audit` 14/14 with the new panel on the axe sweep. `npm run verify:standalone` **7/7** (10,754,567 bytes / 698 source modules / v135). `npm run check:boundary` PASS (700 modules, 220 suites, 23 documentation checks); `npm run check:links` PASS (1,048 links / 284 files). Targeted ESLint PASS.

Known pre-existing failures, unrelated and unchanged by this session: `operating-cadence` 15/17 — two stale pins that already failed on the branch point (`SCHEMA_VERSION` pinned at 123, CSV scope count pinned at 109). They are reported here rather than fixed, because they belong to a different item.
