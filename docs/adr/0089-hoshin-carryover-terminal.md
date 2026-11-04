# ADR-0089: The Hoshin Carryover Terminal — the falsified bet settles, and what it encumbered comes back

- **Status:** Accepted — Session 129 (originally authored as ADR-0085 in PR #147, renumbered here because `main` had already claimed ADR-0085 for the Board Room).
- **Schema:** v95 (additive `94 → 95`)
- **Surface:** `#/carryover` (5 panels), CSV scope **#84** (`carryover-settlement`)
- **Rules:** `RULE-CO-01..04` on the shared post-commit spine (69 rules / 69 contracts)
- **Graph:** node `carryover`; relations `carries-over`, `settles`, `releases-resource`

## 1. The gap

Session 124's Hoshin Catchball cascade gave LeadOS a way to detect the most
expensive kind of failure — a pact executed faithfully against an upstream
hypothesis that has since been **falsified**. When that happens the pact settles
as `thesis-invalidated`: nobody failed, and the strategy is still wrong.

Detection is not settlement. Three things were still unmeasured, and all three
are the same thing seen from three altitudes:

1. **The bet is never judged.** The falsification lands on a *pact*; the thing
   that actually has to change is the *strategy bet* the pact deployed. Nothing
   recorded whether that bet was retired, had its stop rule revised, or was
   reaffirmed with a new causal hypothesis.
2. **The resource never comes back.** An invalidated pact has already encumbered
   person-days and a budget line. In every workspace we can observe, that
   capacity simply evaporates at the moment of invalidation — it is neither
   spent nor released, so the next allocation cycle plans against a book that
   still pretends the work is live.
3. **The settlement is never graded.** Without a dated prediction frozen at
   decision time, there is no way to say whether a span's stop rules are
   trustworthy or merely busy.

The 2026 strategy-execution market (Cascade, AchieveIt, Workboard, Quantive,
Perdoo, Rhythm Systems) sells portfolio dashboards and OKR roll-ups. Every one
of them renders an invalidated initiative as a **status change** — red, closed,
archived. None of them treats invalidation as a *settlement event* with a
verdict, a released resource bundle and a graded prediction. That is the seam
this ADR closes.

## 2. The decision

A carryover record is a **first-class settlement object**, created only when a
Catchball pact settles as `thesis-invalidated`, carrying the resource bundle
frozen at the moment of invalidation.

- **One record per invalidated pact.** Status is a state machine:
  `pending-settlement` → `settled-pending-release` → `settled-released`, with
  `settled-withheld` as the honest fourth state (a release refused in writing,
  with the reason stored rather than the refusal hidden).
- **Three verdicts, recorded by a human.** `retire-bet`, `revise-stop-rule`,
  `reaffirm`. The engine opens the decision; it never records the verdict.
- **Release is an accounting event, not an erasure.** A released budget line
  moves `committed → released`. A line that was already spent reports
  `already-spent` — the money landed and no release is possible. Nothing is
  rewritten to make the book look clean.
- **The bet basis is printed, never guessed.** A record resolves its bet from
  `pact.strategyBetId`, a goal tag, a trade-off tag, or a premise — or reports
  `unresolved`. A settlement with an unresolved bet is a visible defect, not a
  silent inference.

### Named machinery

| Concept | Where it is used | Why it is the right instrument |
| --- | --- | --- |
| Stop-rule settlement | verdict recorded against `bet.stopRule` | Retiring against a *declared* rule is falsification; retiring against a feeling is politics |
| Resource release (`committed → released`) | budget + person-day bundle | Released capacity must re-enter the next allocation cycle visibly |
| Once-only grading | prediction frozen at decision time, graded once later | A prediction graded twice, or after the outcome is known, is not a prediction |
| Wilson interval on the hold rate | calibration panel | n is small by construction; Wald would report impossible bounds |
| Blameless framing | every panel | A faithful execution of a falsified hypothesis is not underperformance |

## 3. Integration, not a silo

- **Typed graph.** `carryover` is a link entity type resolving to
  `carryoverRecords`, with a resolver returning
  `#/carryover?panel=queue&record=<id>` and a focused card in the view, so an
  edge lands on a real record rather than on a terminal.
- **Three relations, all spine-written.** `carries-over` (invalidated pact →
  settlement terminal), `settles` (record or decision → the bet's stop rule),
  `releases-resource` (settled record → the released budget line). None may be
  asserted by hand.
- **One transaction.** `RULE-CO-01` creates the record, writes the
  `carries-over` / `settles` edges and one `rolls-up-to` edge per leadership
  ancestor of the receiving span, **and** opens one governed stop-rule
  settlement decision — in the same atomic write as every other module's
  propagation, covered by that transaction's seal.
- **Spine position.** `carryoverRule` runs after `catchballRule` (it reads the
  cascade's output) and after `cadenceRule`, and before `concordanceRule` and
  the market. `seatRule` stays second-to-last and **`sealRule` is still
  absolutely last.**
- **Marker-idempotent, pausable.** `carryoverScan()` always runs on demand;
  `carryoverAutoPropagate` only governs whether the spine harvests.

## 4. Consequences and limits

**What this buys.** An invalidated pact now has a dated, auditable end: a
verdict against a declared stop rule, a released bundle that re-enters the next
cycle, and a graded prediction that says whether this span's stop rules can be
trusted.

**What it costs.** Four more rules on a spine that is already 69 long, three new
collections, and one more screen.

**Honest limits.**

- A bet with no declared stop rule settles as `unresolved`; the terminal prints
  that and refuses to invent one.
- `already-spent` is a terminal state. Releasing money that has already landed
  is impossible and the terminal says so rather than showing a reclaimable
  figure.
- Grading is an **association, never a causal claim**: a span whose stop rules
  hold more often may simply be making safer bets.
- Small-cell suppression below `carryoverCellFloor` is withholding, not
  differential privacy.
- Local seats remain workflow declarations, **not authentication**.

## 5. Verification

- `tests/app/carryover.test.mjs` — 16 tests, all passing.
- `tests/app/typed-links-lineage.test.mjs` — the graph node, its fixture and its
  focused route are asserted alongside every other registered type.
- Rule/contract parity: 69 rules / 69 contracts, asserted 1:1.
- CSV scope #84 and the brief leak no pact id, bet id, record id, title, name or
  budget name.
- Full canonical suite green on the merged tree (see `AI-SESSION-LOG.md`,
  Session 128/129).
