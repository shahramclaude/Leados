# ADR-0230 — Vroom–Yetton Decision-Participation Selector: the leader chooses how much to involve others, across five altitudes, seven diagnostics, two trees and five styles, with per-line answers and cross-line decide-alone refusal

- **Status:** accepted and **shipped** — domain kernel, actions, seat rights, `#/vroom-yetton` route, CSV scope #171, schema v183 and the `RULE-VY-01` spine rule are all wired on this branch.
- **Date:** 2026-11-16
- **Deciders:** Director / VP / Chief / Enterprise (rank 3–5) select participation style. READ rank 2–5, DECLARE rank 1–5, ANSWER rank 2–5 (must hold a touched line), SELECT rank 3–5 (director+).
- **Schema:** **v183** (v182 → v183). Four new collections, all empty at upgrade: `vyDecisions`, `vyAnswers`, `vyStyleRecords`, `vyMarkers`. Nothing is inferred from existing records. No verdict, recommendation, style or count is **stored** — every one is re-derived on read by `vy.js`, so a hand-edited file cannot carry a verdict its own rows do not imply.
- **Surface:** route `#/vroom-yetton`, view `app/views/vroom-yetton.js`, CSV scope `vroom-yetton` (#171), actions `declareVyDecision`, `withdrawVyDecision`, `recordVyAnswers`, `selectVyStyle`, `recordVyCommitmentOutcome`, plus `buildVroomYetton`, `vyAttentionCount`, `vyCsvRows`.
- **Code:** `app/core/domain/vyRegistry.js` (closed vocabulary: styles, trees, questions, verdicts, rights, limits), `vySchema.js` (fail-closed normalizers), `vy.js` (pure reader `buildVroomYetton`, `vyAttentionCount`, `vyCsvRows`), `vyActions.js` (five human acts), `vyRules.js` (`RULE-VY-01`).
- **Tests:** `tests/app/vroom-yetton.test.mjs` (20, all passing) — schema migration, time-driven tree, development-driven tree, recommendation, decide-alone styles, per-line OR-combination, solo agreement, reader counts/rows/verdicts, answer-to-answered transition, style-selected verdict, override reason, commitment grading, self-grade refusal, frontline rank refusal, decide-alone cross-line refusal, withdrawal, CSV rows identity-free, rule pause governance, rule idempotence per signature, attention count.
- **Rule:** `RULE-VY-01` (post-commit spine, pause switch `vyAutoPropagate`, marker-idempotent per `vy1:<kind>:<decisionId>` signature)
- **Builds on:** ADR-0075 (command chain: one hierarchy, five altitudes, one clock), ADR-0076 (operating seat: one enforced boundary, one vertical roll-up), ADR-0008 (post-commit rules hook), ADR-0182 (automation pause permit register)

## Context

Every enterprise makes decisions where the participation question is as consequential as the substance: does the leader decide alone, consult individuals, consult the group, or seek group consensus? Vroom–Yetton–Jago answers this with seven yes/no diagnostics and two decision trees (time-driven and development-driven), producing one of five participation styles (A1, A2, C1, C2, G2). LeadOS holds no such selector: a decision could be declared but there was no structured way to record the diagnostics, compute the recommendation, select the style, or grade whether the predicted commitment materialised.

The altitude structure (rank 1 frontline → rank 5 chief/enterprise) creates a matrix problem: a decision may touch several reporting lines, each with its own manager who holds diagnostic answers on that line. A decide-alone style (A1/A2) must be refused where another line has answered — one line may not autocratically decide on another line's territory. The seat that selects the style must not be the same seat that answered the diagnostics for the same line — the choice and the evidence stay apart. Grading is director-and-above, and the seat that selected the style may not grade its own outcome.

## Decision

1. **Seven diagnostics, two trees, five styles.** `q1..q7` are per-decision yes/no questions. `q2/q5/q6/q7` are per-line answers (each line's manager answers for their line); `q1/q3/q4` are solo (the deciding seat answers once, requiring agreement across lines if more than one line is touched). The time-driven tree returns A1/A1/A2/A2/A2/C2/C1; the development-driven tree returns A1/A1/A2/C1/C1/C2/C2/G2. The recommended style is re-derived on read from the combined answers.

2. **Per-line answers are OR-combined; solo require agreement.** If any line says "no" on a solo diagnostic, the combined answer is "no". Per-line answers across lines are OR-combined (any "yes" on a line means "yes" for that diagnostic). `combinedAnswers` returns `null` when no answers exist — never synthesising false values.

3. **Decide-alone is unavailable where another line has answered.** A1/A2 is refused when any answer exists on a touched line from a seat other than the selector. C1/C2/G2 remain available — they are consultative, not autocratic. This is enforced in `selectVyStyle` before any style record is written.

4. **Five human acts, each a refusal door.** DECLARE (rank 1+, must hold each declared line), WITHDRAW (final, dated, closes all asks), RECORD ANSWERS (rank 2+, must hold the line, one answer per decision×line×seat), SELECT STYLE (rank 3+, accept or override the recommendation with a written reason ≥24 chars), GRADE COMMITMENT OUTCOME (rank 3+, the selector may not grade their own selection, lesson ≥24 chars). Every write is run through the loader and the stored row is the row the loader returns.

5. **Altitude-scoped rights.** `read-vroom-yetton` minRank 2, `declare-vroom-yetton` minRank 1, `answer-vroom-yetton` minRank 2 (must hold a touched line), `select-vroom-yetton` minRank 3. Mapped in `accessGateway.js` with `SAFE_READS` entries for `vyReport` and `sourcingVyScan`.

6. **Post-commit rule `RULE-VY-01` files asks, never edits decisions.** `vy.decision.owed` (decision declared, no answers yet → addressed to declaring seat). `vy.selection.owed` (answers exist, no style selected → addressed to a director+ seat holding a touched line). Marker-idempotent per `vy1:<kind>:<decisionId>` signature: one ask per (kind, decision). Paused by `vyAutoPropagate`. Closes asks on answers or style selection. Never edits, closes or re-types the decision.

7. **CSV #171 is identity-free.** `vroom-yetton` exports columns: `as_of`, `row_kind`, `decision_id`, `title`, `state`, `verdict`, `tree_variant`, `chosen_style`, `recommended_style`, `override_reason`, `commitment_materialised`, `line_count`, `answers_received`, `lines_answered`, `blank_reason`. No person name, no seat id, no note. A figure that cannot be computed is blank with a stated reason, never `0` and never `NaN`.

8. **Badge counter.** `vyAttentionCount` counts decisions owed a style selection (declared, no answers yet, or answers exist but no style). Displayed in the nav entry `vroom-yetton` (icon `⑃`).

## Consequences

- The participation question is now a structured, dated, named record — no more informal "should I consult?" calls with no trace.
- Decide-alone refusal is structurally enforced at the action layer: one line cannot autocratically decide on another line's territory, and consultative styles remain available even when another line has answered.
- The same seat cannot both answer per-line diagnostics and select the style — the evidence and the choice stay apart (enforced by the decide-alone cross-line rule and the answer/selection separation).
- Grading is independent: the selector cannot grade their own outcome; only rank 3+ seats may grade.
- Nothing derived is stored — every verdict, recommendation, style and count is re-derived on read, so a hand-edited file or partial reload cannot corrupt the record.
- The chief-queue reading for `selection.owed` asks routes to director+ seats holding touched lines, falling back to the workspace apex.

## Remainder

None. The slice is complete: schema, migration, four normalizers, five domain modules (registry, schema, reader, actions, rules), actions with refusal doors, seat rights, the post-commit rule with pause governance, CSV #171, route and panel, badge counter, and 20 passing tests.

## Benchmark

**`[BENCHMARK-UNVERIFIED]`.** No enterprise decision-participation product was run side by side. The bar was taken from the published Vroom–Yetton–Jago literature (Vroom & Yetton, 1973; Vroom & Jago, 1988): seven diagnostics, two trees, five styles, decide-alone styles A1/A2, consultative C1/C2, group consensus G2. Each is a property a reader can check in `vyRegistry.js` and `vy.js`.

On that bar the selector matches the guidance on four named dimensions:

1. **Seven diagnostics × two trees → one of five styles.** Implemented exactly as published; tests walk every diagnostic path.
2. **Decide-alone styles (A1/A2) vs consultative (C1/C2) vs consensus (G2).** `vyDecidesAlone` returns true only for A1/A2; the cross-line refusal applies only to A1/A2.
3. **Per-line answers for the matrix case.** q2/q5/q6/q7 answered per line, OR-combined across lines; q1/q3/q4 solo with agreement required.
4. **Autonomy vs participation trade-off.** The override path lets a leader choose a more participative style than recommended with a written reason — the documented "when to override" provision.

It does **not** match: probability-weighted decision trees, stakeholder salience modelling, or automated style selection without a human seat. Those are not in this slice and are not claimed.

## Sources

Vroom, V.H. & Yetton, P.W., *Leadership and Decision-Making* (1973); Vroom, V.H. & Jago, A.G., "The role of the situation in leadership" (American Psychologist, 1988); Vroom, V.H. & Jago, A.G., "The role of the situation in leadership: a critical review" (Leadership Quarterly, 2007).