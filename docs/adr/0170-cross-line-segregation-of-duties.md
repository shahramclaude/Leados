# ADR-0170 — The cross-line segregation-of-duties register: two names, read against the reporting graph of the day

- **Status:** Accepted and implemented, 2026-11-11 (Session 234)
- **Decision:** Every decided decision already names a Driver and an Approver. Those two names are read against each other and against the reporting graph **of the day the call was made** — every line in force that day, not only the home chain — and each decision is published as *conflicted*, *independence unreadable* or *two independent hands*. A decision whose roles do not name two roster people, or whose day the structure cannot answer, is **refused with a printed reason** and is never counted as a pass.
- **Scope:** One pure read model (`sodRegister.js`), one closed vocabulary (`sodRegisterRegistry.js`), one rule on the shared spine (`sodRegisterRules.js`, `RULE-SOD-01`), one panel (`#/matrix?panel=sod`), one aggregate CSV scope (#125, `matrix-sod`) and one action (`matrixSodReview`). **No collection, no field, no migration, no schema bump** — Schema stays v135; the rule's idempotency marker goes on the existing `matrixMarkers`.

## Context

The decision log has stored a `driver` and an `approver` on every decision since it was built. The Matrix Accountability Ledger (ADR-0140) stores every declared additional line with its dates and its rights, and the structure-history ledger (ADR-0149) stores dated home-line periods. Nothing had ever read these against each other: a search of `app/` found no segregation-of-duties, self-approval or four-eyes check of any kind.

In a reporting tree, an Approver who reports to the Driver is at least visible on the chart. In a matrix the same dependence can exist **only** through a project, product, cross-functional or administrative line, and no chart shows it. A check that walks the tree alone passes exactly those decisions. That is the gap a chief owes an audit committee an answer on: *which of our calls had one pair of eyes, and who could have been the independent second hand?*

Session 233 planned this item as a **rights-pair** conflict register over the declared RAPID rights. This slice deliberately takes the part the record can already answer exactly — the roles actually exercised on decided decisions — and leaves the rights-pair reading as a stated remainder (see *Not in this slice*).

## Rule

1. **The population is decided decisions.** A decision is read once it records what was chosen. The most recent 400 are read; any older remainder is counted (`omitted`) and folded into no other figure.

2. **A hand is exactly one roster person, or the decision is refused.** The whole field is matched to the active roster, case-insensitively and in full; the workspace leader resolves through the leader name in settings. Four refusals, checked in this order so a decision lands in exactly one: `no-approver`, `no-driver`, `several-named` (a role listing more than one name is refused, **not split**), `unresolved-hand` (a title, a team, a body, an unknown name, or a name two roster people share). A conflict is never inferred from a title.

3. **Three conflict classes, closed.**
   - `same-hand` — the Driver and the Approver are one person. A recorded fact.
   - `dependent-hand` — on the decision day the Approver reported to the Driver. The route is `home-chain` or `second-line` (the dependence exists **only** through a declared additional line); the hop count is printed; where the Driver holds a *direct* line over the Approver, the rights that line declares are printed, because that is what the dependence consists of.
   - `custody-and-approval` — the Approver owns a case the decision is typed-linked to. Only a typed decision↔case edge counts.

4. **A finding states what it rests on.** `recorded` or `presumed`. A dependence walked over a home line with **no** recorded history uses today's pointer and is printed as a presumption. Custody is always presumed: ownership is read as the case stands today.

5. **The structure is the decision day's, never today's.** Declared lines are filtered by their own dated windows by the shared matrix engine, re-run at that day — an ended line still counts on a day inside its window, and a line not yet started does not. Home lines come from the structure-history ledger: `recorded` (a period covers the day), `presumed` (the person has no history at all), `unrecorded` (the person has history and none of it covers the day), `not-placed` (not on the roster that day, or the engine refused the line). Only `recorded` and `presumed` home lines are walked.

6. **Unreadable is a third state, not a pass.** If no dependence is found but the chain above the Approver is open — `home-line-unrecorded`, `not-placed`, or `no-decision-day` on a legacy record — the decision is `unreadable`: neither a finding nor a clear. A same-hand or custody conflict needs no structure and still stands.

7. **Materiality is the decision's own recorded reversibility.** An irreversible decision carrying a conflict is a control gap; a reversible one is counted and printed and **not** escalated — one hand on a call that can be undone is often a deliberate trade of control for speed. No other materiality score is invented.

8. **Who could supply the second hand.** For every conflict, the seat(s) directly above the *senior* hand on the decision day (the Driver, where the Approver sits below them): `unique`, `tie` (several seats — a tie the matrix created; the lowest seat above all of them is printed, or that there is none), `none` (the hand is the workspace leader: a second hand can only come from outside the reporting structure), or `unreadable`.

9. **A share is refused, not narrowed.** The per-mille of tested decisions carrying a conflict — overall and for irreversible decisions — is BLANK below 10 tested decisions, and BLANK while any tested decision in the denominator is unreadable. The reason is printed in its place and the export writes BLANK with its own `…_withheld` flag, never a zero.

10. **The same two hands are counted once.** Conflicts are also aggregated per Driver/Approver pair. A hundred calls signed by one hand are one fact about a control, not a hundred rows — and a count of recorded roles is not a rating of either person.

11. **The roll-up runs every line and says it is not additive.** Each conflict is carried to every leadership span that holds its senior hand today, through the home line and through every declared second line. A hand on two lines appears in two branches, so the distinct total is printed beside the rows.

12. **Scope is the seat's.** A decision with no hand inside the acting seat is counted as outside and folded into no figure. A hand outside the seat is withheld from the read model — **its name and its id** — and from the panel.

13. **Eleven identities, one claim.** `decided = read + omitted`, `read = in seat + outside`, `in seat = tested + refused`, `tested = conflicted + unreadable + clear` (and the same per tier), the seat states and the structure refusals summing to their totals, the routes summing to the dependent class, rows and pairs reconciling to the conflict count. `countsReconcile` is true only when every one holds, and the panel prints each.

14. **One consequence on the shared spine.** `RULE-SOD-01` runs on exactly one event — an explicit, human-requested review — and never when a decision is logged, decided or edited. It re-reads the register with the operator view (a recorded review is a workspace fact, whatever seat pressed the button) and appends one identity-free marker and one propagation trace carrying the counts. It is idempotent per day per reading; a changed record is a new reading. It opens no case, issues no task, edits no decision, revokes no right and names no person.

## Not in this slice

Stated so the next session does not have to rediscover it. Each stays **In Progress** in `ROADMAP.md`.

- **A compensating control and an owned ask.** The register names the seat that could supply the second hand; it does not record a compensating control against a conflict or put an owned request in front of that seat. Both need a stored record (a schema move) and are deliberately not improvised onto an existing collection.
- **Rights-pair conflicts.** Whether one person holds a pair of *declared* RAPID rights that must not sit together on the same subject across two lines — the reading Session 233 originally described.
- **Approval chains.** A role naming several people is refused. Whether one of several approvers was independent is not guessed.
- **Dated custody.** A case re-assigned after the decision is read against its present owner.

## Alternatives rejected

- **Reading today's chart for a past decision.** Rejected: it convicts people of dependences that did not exist and clears ones that did. Session 207's attempt at an as-of line reader failed for exactly this reason; this reader substitutes the recorded home pointers first and then re-runs the canonical engine at the day, and treats a home line the engine refuses as an open chain.
- **Counting an unreadable day as clear.** Rejected: it is the quiet way a control report turns green.
- **Splitting a plural role, or resolving a title to "whoever holds it".** Rejected: both manufacture a hand nobody recorded.
- **Blocking the decision, or revoking a right.** Rejected: this is a reading. A control that silently stops work is a different product and would need consent, an override path and an audit of its own.
- **Running the rule whenever a decision changes.** Rejected: it would change the behaviour of every existing decision flow and write to the ledger without anyone having reviewed anything.
- **A per-person conflict score.** Rejected: the finding is about a control, and the panel says so in its own words.

## Consequences

- A CEO, VP or director can read, for the decided record, how many calls name two testable hands, how many carry a conflict, how many of those are irreversible, which exist only through a second line, and which seat could have supplied the second hand — with every figure traceable to a named decision inside their seat.
- The register is meaningful in a single-chain workspace: same-hand and custody conflicts need no line at all, and the panel prints that every dependence it can find there runs through the home chain.
- **The demo workspace reads loud, and that is accurate.** Measured on 2026-11-11: 101 decided decisions, 84 testable, 17 refused (10 with no Approver, 7 naming a hand that is not one roster person), and all 84 tested carry a same-hand conflict — 20 of them irreversible — because the demo seed records one name in both roles. The reading is of the seed as it stands.
- **Recording a review is a commit like any other.** Every other standing rule on the spine therefore runs on it exactly as it would on the next save. In the test fixture the epistemic rule opened a decision it was already waiting to open. `RULE-SOD-01` itself writes one marker and one trace; the panel says both things.
- This is a second consumer of the as-of pattern (`meritStructure.js` was the first). It does **not** close the In-Progress item *As-of structure reads for the MATRIX layer itself*: the general reader, with seat scope applied before any line is exposed, is still unbuilt.
- No collection is added; the reading stores no verdict and no row. Everything is re-derived on read, so the screen cannot drift from the record.
- Named basis: segregation of duties as a control activity (COSO *Internal Control — Integrated Framework*, 2013, Principle 10); the four-eyes principle and reviewer independence; the reporting graph rather than the reporting tree (ADR-0140); RAPID decision rights (Rogers & Blenko 2006); decision reversibility (one-way and two-way doors); as-of structure with refusal instead of imputation (ADR-0149).

## Verification

`node --test tests/app/sod-register.test.mjs` — **22/22 PASS**. Every count is worked out by hand from one fixture (18 decided → 14 tested + 4 refused → 9 conflicted + 3 unreadable + 2 clear) and covers: the four hand states; each of the three classes; a dependence found **only** through a declared second line with the rights that line declares; the same two hands independent on a day the line's window does not cover, and still dependent on a day inside a window that has since ended; a recorded home-line move read as of the decision day in both directions against a chart that says otherwise today; the three structure refusals; the four record refusals and an ambiguous shared name; both rate refusals and a printed rate (833 ‰ = 10 of 12); the four seat states with the joint apex of a tie; the non-additive roll-up (6 + 3 under a span of 8); the row cap with its counted remainder; a seat-scoped read that carries no outside name **or id**; an identity-free brief; a CSV equal to the board, aggregate-only, reproducible from persisted bytes, with a refused share BLANK; the rule firing only on its own event, idempotent, and reading the whole workspace from inside a seat; the API writing exactly one marker; and a JSDOM render whose displayed cells equal the computed values while state is not mutated.

See `AI-SESSION-LOG.md` (Session 234) for the full verification record, including the suites that were run alongside and the failures on `main` that this change did not cause.
