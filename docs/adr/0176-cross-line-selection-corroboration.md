# ADR-0176 — Cross-Line Selection Corroboration & Co-Hiring Stewardship (`RULE-HLC-01`)

- **Status:** Accepted and implemented (2026-11-11, Session 240)
- **Schema:** v141 (additive migration `140 → 141` adds two EMPTY collections, `hiringLinePlans` and `hiringLineMarkers`, plus `settings.hiringLineAskDueDays` and `settings.hiringLineAutoPropagate`)
- **Altitude:** director / VP PRIMARY (the seat that staffs a shared hire across two managers and may scan), with frontline / mid-managers receiving and answering the asks and CEO / C-suite reading the same aggregate board.
- **Structure:** matrix PRIMARY; single-chain supported (a one-line plan reads `single-line-heard` or names the home manager who never assessed). A workspace that declares no line plan is inert.
- **Surface:** `#/matrix?panel=hiring`; CSV scope `#131` (`hiring-lines`), aggregate and identity-free.

## Context

`hiring.js` models a requisition, its interview panel, candidates and their evidence. It had no notion of **which managers the hire will report to**. In a matrix organisation that is the question that matters at offer time: a person who will work on a functional line and a project or product line is, in practice, assessed by whoever opened the requisition, and the second manager meets them on day one. Nothing could say that the loop was a home-line-only loop, that a line manager sat on the panel and recorded nothing, or that two managers both assessed the candidate and disagreed by three anchors.

Frameworks applied:

- **Structured selection validity** (Sackett, Zhang, Berry & Lievens, 2022): predictive validity comes from independent structured judgements. A line that did not assess is missing evidence.
- **Adverse selection** (Akerlof, 1970): the line that did not assess buys the hire on the other line's description.
- **Multi-task, multi-principal agency** (Holmström & Milgrom, 1991): each principal observes part of the job; a loop staffed by one principal prices only that part.
- **Role-episode consensus at entry** (Kahn et al., 1964): divergent role senders at the offer are tomorrow's role conflict, so divergence is printed and never averaged.

## Decision

1. **A line plan is a dated human declaration.** `hiringLinePlans` holds append-only acts: `declared` (one home manager, up to six additional line managers) and `withdrawn` (with a reason). The latest act per requisition is the effective plan. Nothing is inferred from a team name, a panel or a title; on upgrade every requisition reads `undeclared`.
2. **Nothing derived is stored.** Line states, verdicts and rates are re-derived on every read by `buildHiringLines` from the acts, the candidates' evidence and the live matrix graph (`buildMatrix`).
3. **Line states** per (decision-stage candidate, declared line): `heard` (the manager's own evidence), `represented` (evidence only from somebody in that manager's matrix-DAG span), `silent` (on the panel, no evidence), `unasked` (not on the panel, no evidence), `unreadable` (manager no longer on the roster).
4. **Matrix crediting rules.** A line is credited only with its own manager's evidence. An interviewer who sits under more than one declared line credits **no** line by representation; the signal is counted `ambiguous`. No signal is ever counted for two lines.
5. **Verdicts** per candidate, closed and in precedence order: `undeclared` (REFUSED), `unreadable`, `line-unasked`, `line-silent`, `line-represented`, `divergent` (every line heard, lower-median ratings ≥ 2 anchors apart), `corroborated`, `single-line-heard` (never counted as corroboration).
6. **Two reconciliation claims, printed apart:** `verdictsReconcile` (eight verdict counts sum to candidates read) and `linesReconcile` (five line-state counts sum to the (candidate, line) pairs).
7. **Refusals.** The every-line-heard rate is whole permille by truncated division with the remainder flagged; it is `null` with a printed reason below three tested candidates or when any candidate sits under an unreadable line. The CSV cell is blank, never zero.
8. **After the hire.** For a filled requisition the declared plan is compared with the reporting lines the person actually holds in the live graph: `realised`, `drifted` (with what is declared-not-held and held-not-declared) or `unreadable`. Nothing is repaired.
9. **`RULE-HLC-01`** on the shared post-commit spine (109 rules / 109 contracts), before the seat roll-up rule. For a final/offer-stage candidate on an in-flight requisition it issues at most one dated delegation per (candidate, manager, plan act) to the **named** manager of a `silent` or `unasked` line, with `concerns` (requisition), `issues-obligation` (candidate) and `rolls-up-to` (every roster ancestor of that manager in the matrix DAG) edges; capped at eight per commit with the remainder counted; closes its own asks when no longer owed; records an observation, never a task, for a departed manager. It never blocks an offer, moves a candidate, records evidence or substitutes one manager for another. Pausable with `hiringLineAutoPropagate`; an explicit scan always runs.
10. **Authority and scope.** `hiringLineReport` is a safe read scoped inside the read model: a declared seat reads only requisitions whose plan names it or its span; out-of-span manager names and ratings are withheld; candidate names are printed only to the operator view and to managers the plan names. `hiringLineScan` requires `govern-hiring-lines` (rank 3–5) or the operator view. `hiringLineDeclare` / `hiringLineWithdraw` are operator-view only: a plan names managers in more than one span, and hiring writes have no seat-scoped adapter in this workspace.

## Not in this slice

- A seat-scoped declaration door (a hiring manager proposing a plan and the counterpart manager consenting, as ADR-0148 does for live lines).
- A line held by the workspace leader: evidence recorded by the leader carries no attributable interviewer, so such a line is refused at declaration rather than read as permanently silent.
- A settings form for `hiringLineAskDueDays` (the value is stored, clamped 1–30 and honoured; it has no dedicated control yet).
- Small-cell suppression: the board counts candidates, who are not roster members, and the CSV is one identity-free summary row; no per-manager rate is printed anywhere.

## Consequences

- A matrix hire can no longer reach offer with a declared line silent without that fact being printed, counted and put in front of the manager who owes the judgement.
- A workspace that never declares a plan behaves exactly as before: the rule exits in O(1) and no requisition is read as a finding.
- Evidence: `app/core/domain/hiringLine{Registry,Schema,Actions,Rules}.js`, `app/core/domain/hiringLines.js`, `app/views/matrixHiringPanel.js`, `tests/app/hiring-lines.test.mjs`.
