# ADR-0237 — Standard-work revision register: what changed in the standard, who approved it, and who was briefed before it applied

- **Status:** accepted and built — Schema v192, the `Revisions` panel under `#/standard-work?panel=revisions`, the report and act surface, and the focused suite are on this branch. **Partially built**: CSV, the effective-date gate, briefee acknowledgement, the briefing reminder rule and the conventions are the remainder (see *Limits*).
- **Date:** 2026-11-16
- **Deciders:** The holder of the line a routine is owed under (rank 2+) approves a revision; the same holder records briefings. The owner of a standard may never approve a change to it.
- **Schema:** **v192** (v191 → v192). Two additive collections, both **empty at upgrade**: `standardRevisions`, `standardRevisionBriefs`. No revision, prior text, approver, effective day or briefing is inferred from existing routines.
- **Surface:** `#/standard-work?panel=revisions`. Stats, a revisions table with prior and new text, a routines table with declared and in-force text side by side, and a Method card. Two dialogs: approve (two steps) and record a briefing (two steps).
- **Code:** `standardRevisionRegistry.js` (leaf vocabulary), `standardRevisionSchema.js` (fail-closed loader), `standardRevision.js` (pure reader), `standardRevisionActions.js` (seat-checked acts), `standardRevisionPanel.js` (view). Wired through `schema.js`, `actions.js`, `accessGateway.js`, `seatRegistry.js`, `standardWork.js`.
- **Tests:** [`standard-revisions.test.mjs`](../../tests/app/standard-revisions.test.mjs) — 12/12 focused tests pass.
- **Builds on:** ADR-0190 (leader standard work: routines and their declared text), ADR-0212 (waiver register: the same two-holder door, owner-cannot-authorise-self, and the reach model), ADR-0140/0141 (matrix line scope), and the standing rule that a figure is derived on read, never stored.

## Context

A leader standard work routine stores its written standard once, on the day it is declared (`standardWorkRoutines[].standard`), and nothing in the workspace changes that text. The only way to change a standard was to retire the routine and declare another. That loses four things the planned gap named: the version link, the previous text, the approver, and the list of people who had to be re-briefed before the new text applied.

The consequence is the failure ISO 9001:2015 §8.5.6 (control of changes) and §7.5.3 (control of documented information) are written to prevent. A standard changes on a day nobody recorded; the approver is the person who owes the work; a reader six months later cannot say what the standard was on a given day; and the people who now owe the new text were never told it applied. Clause 7.3 (awareness) makes that last point an obligation.

Verified before building: no `standardRevision` vocabulary existed in `app/` or `tests/`; `routines[].standard` was written only by `standardWorkDeclareRoutine`; and no action updated it.

## Decision

**A revision is an approved, dated, append-only row. A briefing is a dated row. Everything else is derived.**

1. **The previous text is read, never typed.** A revision's `priorStandard` must equal the text the chain holds immediately before it (the routine's declared text for revision 1, the previous revision's text thereafter). The loader and the reader each check this; a mismatch drops the revision and every later revision of that routine.
2. **The approver is the holder of the line the routine is owed under.** The gate reads the owner's *active* lines from the one matrix engine. If the routine names a line, that line's manager must be the approver. If it names none and the owner holds exactly one line, that manager approves. If the owner holds two or more lines and the routine names none, the act is **refused** and the refusal names the lines — LeadOS does not choose the approving line. A top-tier routine has no line above it and cannot be revised here.
3. **The owner cannot approve their own standard.** An operator acting as the workspace leader approves only where the leader is the line holder.
4. **The effective day is declared and bounded.** It is a real calendar day, not in the past, not earlier than the routine starts, not after the routine ends, strictly after the previous revision's day, and at most 90 days after approval.
5. **The owner is always owed the new text.** The people owed it are the owner and the people who report to the owner on any line, each listed once, and each within the approver's reach. A person outside the approver's reach cannot be named.
6. **Briefings are dated and are recorded by the approver only.** A briefing cannot predate approval or be future-dated, and a person is briefed once per revision.
7. **Derived states.** A revision is `lapsed` (its routine ended on or before its effective day), `pending`, `in-force` or `superseded`. Each owed person is `briefed-before`, `briefed-after`, `due` (not yet in force, not briefed), `overdue` (in force, not briefed) or `not-owed` (lapsed). A revision's verdict is `ready`, `briefing-due`, `briefed-in-time`, `briefed-late`, `briefing-overdue` or `not-owed`. `briefed-after` is never merged into "briefed".
8. **Two claims are printed apart.** `countsReconcile` says the partitions add to their rows. `figuresComplete` says the reading covers the record the seat may see, with nothing withheld, outside reach or future-dated. A reading can reconcile and be incomplete for a seat; the panel prints both.
9. **Display equals stored.** The routine record keeps its declared text. The panel prints the declared text and the text in force side by side, and marks a routine whose in-force text differs from the declared text. A reload reproduces every figure (tested).

## Consequences

- **Good:** the question "what did this standard say on the 23rd, who approved the change, and did everyone who owed it know?" now has a dated, derivable answer, and the routine record is no longer silently out of date.
- **Good:** the matrix case is handled deliberately. A routine owed under a declared line is approved by that line's holder and nobody else; a multi-line owner with no named line is refused rather than guessed.
- **Cost:** the routine record and the standard-work reader still show the declared text. The panel says so; the standard-work board does not yet show the text in force (see *Limits*).
- **Cost:** the two-step dialogs and the owed-people checkbox group are bounded by the reach of the approver's seat.

## Limits — printed or declared, not claimed

- **Not built (remainder, In Progress):** (1) CSV export of revision aggregates; (2) the **effective-date gate** — a revision does not hold the routine's own slot checks back until its owed people are briefed, so the register informs and does not block; (3) **briefee acknowledgement** — the record is the approver's dated statement that a person was briefed, not the person's own confirmation; (4) an automatic briefing ask on the shared spine (a new `RULE-…` and a pause permit), so an overdue briefing does not yet raise an ask; (5) the seat conventions (window, reminder days); (6) the standard-work board reading the text in force rather than the declared text; (7) an attention count on the navigation badge.
- **Not claimed:** authenticated identity — the approver and briefer are declared seats, not authenticated people, as in every register in this workspace; a real-browser or assistive-technology walkthrough; a full `npm test` run on this branch.
- **Loader warnings:** rows dropped by the loader are counted in the load warnings, not in the reader. A reader cannot see what the loader dropped; the warning is the only place that fact is printed.

## Benchmark

**[BENCHMARK-UNVERIFIED]** — no hands-on run of any tool. The bar named from published material (no vendor environment was run): quality-management SOP systems (for example eLeaP and Complere product literature, 2026) and ISO 9001 SOP-change guidance. Their stated bar is: approval date kept separate from the effective date; training assigned on issuance with a deadline keyed to the effective date; the effective date held until training is verified for the affected roles; a documented decision on whether retraining was needed; and training records pinned to the revision they cover.

Against that bar this slice **clears** the separation of approval and effective date, the version-pinned previous text, the owed-people list and the dated briefing record. It **does not clear** the effective-date gate, the briefee's own acknowledgement, the automatic assignment, or the retraining-necessity decision. Those are named above as the remainder, and parity is not claimed.

## Verification

- `node --test tests/app/standard-revisions.test.mjs` — 12/12: registration and migration, the approval door (owner, line holder, matrix line, ambiguous line, top tier, frontline), the chain and states over time, briefing before/after/never and its refusals, counts against completeness, fail-closed loading, lapse on retirement, and display equals stored across a reload and a render.
- The five wiring suites that pinned the head schema at 191 were moved to 192, and one migration-array assertion now expects `['190 → 191', '191 → 192']`. This is the head-pin maintenance every session performs; it is listed in the session log.
