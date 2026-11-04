# ADR-0088: Hoshin Carryover Terminal — a thesis-invalidated pact settles its bet: stop rule judged, encumbered resources released, and the next allocation cycle actually sees them

Date: 2026-11-04 · Status: Accepted · Session 128 · Schema v94 (additive `93 → 94`) · `#/carryover` · RULE-CO-01..04 · CSV #83

## Context

Session 124's double-loop detector (ADR-0084) can prove that a Hoshin Catchball
pact was settled as `thesis-invalidated` — faithful execution, falsified
upstream hypothesis. But the falsification stopped there. Nothing connected it
to:

1. **the bet's stop rule** (`strategyBets.killCriterion`), which the Strategy
   Coherence Terminal only notices when the rule's date passes with no human
   verdict (RULE-SCO-04) — an invalidated pact could sit unexamined for a whole
   horizon while its bet stayed `active`;
2. **the resources the pact encumbered** — `effortDays` of receiving-span
   capacity and the `committed` budget line (`encumberedLineId`) — which stayed
   locked after the thesis died; and
3. **the next allocation cycle**, which never saw the released person-days and
   budget authority again.

Vendor portfolio tools (PlanView, i-nexus; see `RESEARCH.md` §109) support
reviewed carryover of unfinished work between planning cycles, but none ties
release to a *falsified thesis with an immutable receipt*, and none treats the
release as an authority transfer that must be visible to the budget read
models in the same atomic commit.

## Decision

A pact settled as `thesis-invalidated` creates exactly one **carryover record**
— a first-class, append-only receipt that freezes the resource bundle
(person-days + encumbered budget line) at settlement time, fans typed
`carries-over`/`settles`/`rolls-up-to` provenance up the leadership chain, and
opens **one governed stop-rule settlement DACI decision** per resolved bet
(retire / revise stop rule / reaffirm) with the bundle printed in the question.

- **RULE-CO-01** creates the record, edges and settlement decision in the SAME
  transaction as the Catchball settlement. Marker-idempotent.
- **RULE-CO-02** on `decision.made` records the human verdict and — for
  *retire* — releases the encumbered budget line (`committed → released`,
  never erasing a spent actual) and returns the person-day commitment in the
  same transaction, writing `releases-resource` edges. Resolutions are visible
  to Decision Tempo and the budget read models in the same commit.
- **RULE-CO-03** settles pending records when a bet is retired or a retire
  verdict is recorded by a human; withdrawal never reopens a settled source.
- **RULE-CO-04** grades settled records **once, later**
  (`carryoverGradingDelayDays`) against the prediction frozen at decision
  time, and opens one governed review decision per altitude cell below the
  declared Wilson reliability floor per ISO week.

Unknown or withdrawn effort releases **zero** person-days rather than a guess.
Receiving lines start `planned` and a finance actual changes only on explicit
human consent. `sealRule` attests the whole write.

## Consequences

- The schema grows additively (`93 → 94`): three collections
  (`carryoverRecords`, `carryoverMarkers`, `carryoverGradings`), idempotency
  markers, and five clamped settings. An upgraded workspace opens with an EMPTY
  carryover ledger — a settlement history back-filled from records would claim
  a stop-rule discipline the organisation never actually ran.
- The release is honest about entropy: a released line returns *authority*, not
  money already spent; the brief and CSV rows (aggregate CSV scope #83
  `carryover-settlement`, no ids, no names, refused rates BLANK) state both.
- Calibration is graded against the frozen prediction with a Wilson interval
  and a declared floor, so the terminal can be wrong about its own settlements
  and say so.

## Honest limits

Local seats remain auditable declarations, not authentication. Grading waits a
declared delay by design — a fresh settlement is ungraded, not successful. The
person-day release assumes span capacity is fungible inside the horizon; where
it is not, the released figure overstates the next cycle's real supply, and the
calibration cell is where that bias becomes visible.
