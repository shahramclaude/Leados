# ADR-0193 — Cross-line goal commitment conflict register

Date: 2026-11-13 · Session 261 · Schema v153 · Status: accepted, shipped end to end

**Follow-on:** [ADR-0194](./0194-cross-line-goal-commitment-target-magnitudes.md) extends this register in Schema v154 with optional exact target values and units, same-unit `magnitude-conflict`, and the existing rule's bounded joint-apex reconciliation. It does not alter this ADR's line/authority, capacity, history, or no-line doctrine.

## Duty and scope

Director / VP primary (the lowest joint apex of two conflicting lines is usually
one), frontline / mid-manager as the declaring holders, CEO roll-up; matrix and
single-chain (a one-line workspace reads `inert` with the reason printed).
`state.goals` carries one `ownerId`, a target and a due date, and any manager in
the chain may set one — but before this ADR nothing compared **the commitments
two reporting lines have each taken on the same person**. `goalCarriage`
(ADR-0163 family) audits that a goal is counted once in a span; ADR-0143
arbitrates two managers' dated work items; ADR-0191 ranks a person's live items
today. None notices that a project line promised a window the home line's goal
already consumes, or that two goals for one person ask for mutually exclusive
weeks, or that the concurrent promises add up to more than one person.

Frameworks: Galbraith's matrix organisation (multiple legitimate principals over
one person), transaction-commitment theory (a commitment is a dated promise of
a bounded resource, not an intention), and capacity accounting (effort is a
stock consumed per day, never a score attached to a person).

## Record and authority

- `goalCommitments`: append-only dated declarations — one goal, one reporting
  line (or the explicit `no-line`), an inclusive window, an exact integer
  `effortShareH` (hundredths of ONE person; 100 = the whole person), an optional
  measure key + direction (both or neither), and, since ADR-0194, optional exact
  non-negative `targetValue` + `targetUnit` declared together or absent together;
  the declaring holder, and closed states (`superseded*`, `released*`) that keep
  every predecessor as history.
- `goalCommitmentMarkers`: the rule's bounded identity-free observation ledger
  (kind `goal-commitment`), capped oldest-first like every matrix marker ledger.
- Settings conventions `goalCommitmentAskDueDays` (3), `goalCommitmentHorizonDays`
  (90), `goalCommitmentMinOverlapDays` (5), `goalCommitmentMinGoals` (3),
  `goalCommitmentAutoPropagate` (true) — carried by their own normalizer in BOTH
  `DEFAULT_SETTINGS` and `normalizeSettings`, so they survive a reload.
- Authority: the holder of a named line declares, re-baselines and releases for
  that line; a `no-line` declaration belongs to the goal's owner or the operator
  view (a manager may not withdraw somebody else's goal from the comparison);
  peers, later holders and leaders-on-behalf are refused by name. Governing
  (scan, conventions) is director-and-up (`govern-goal-commitments`, minRank 3).
  Reads are `SAFE_READS`; the candidate list is not (it names lines and seats).

## Read model (`buildGoalCommitments`)

One reader, nothing derived stored. It joins every pair of LIVE commitments on
one owner through `buildMatrix` — the ONE matrix engine — and prints exactly one
of six exhaustive pair verdicts (`single-principal | same-line | compatible |
date-overlap | target-conflict | magnitude-conflict`) beside a separate capacity sweep
(`fits | overcommit | share-undeclared | unmeasurable` per person and per line).
A target conflict requires the SAME canonicalised measure in OPPOSITE directions
over at least `minOverlapDays` overlapping days; the exact overlap from/to and
the basis measured against are printed in integer hundredths. Capacity is a
stock: the peak day is swept exactly (step function, ties to the earliest day),
and a line's own peak above its declared share is its own verdict while the
whole week still fits. Pair verdicts and capacity verdicts are separate
vocabularies and are never collapsed into one word.

Refusals are counted and printed, never repaired: an undeclared line share
refuses only that line's reading (the whole-person reading stands); a window
running past its goal's due date is printed as a contradiction, not clamped; a
window starting before the goal's creation date is refused at the door; a goal
with no declared line is `unattributed` and is never charged to the home line;
`inert` (fewer than two lines) and `undeclared` (nothing declared) never print
the same words as "no conflict found". The attribution rate carries a Wilson
interval and is **withheld below the declared goal floor** — blank with its
reason on every surface, never zero.

## Governance (`RULE-GCC-01`)

Registered on the shared post-commit spine immediately before `seatRule`
(index 119 of 122) with a matching propagation contract
(`writes: delegations, links, goalCommitmentMarkers`). Four partitioned
conditions file at most ONE open dated `act-inform` ask each:

1. `target-conflict` → the LOWEST joint apex (`matrixJointApex`) of the two
   holders, because neither promise can be kept by working harder;
2. `magnitude-conflict` → that same joint apex, only for two named lines with
   same-unit declared targets at/above ADR-0194's exact divergence floor;
3. `capacity-overcommit` → with named peak declarations only, the joint apex of
   EVERY holder carrying a live commitment on the peak day; if an explicit
   `no-line` declaration contributes to that peak, its effort stays in the
   capacity arithmetic but the incomplete named set records one identity-free
   observation rather than a partial apex ask or roll-up;
4. `line-share-exceeded` → THAT line's holder alone, and only where (3) did not
   fire, so one week is never double-asked.

A bare window collision escalates nowhere. Asks are idempotent per deterministic
`gcc1:…` signature, bounded at six per commit with the remainder counted as
deferred, carry `issues-obligation` plus per-ancestor `rolls-up-to` provenance
links, close themselves when the condition clears or its seat moves, and never
re-ask a human who closed or returned the ask while the condition stands. A
condition whose apex is the leader seat, off-roster or ambiguous files ONE
identity-free marker and substitutes nobody. The conflict is never settled on
the shared person: no ask, no marker and no figure is ever addressed to them.
`goalCommitmentAutoPropagate` governs EVERY path, including explicit scans, and
is registered in `PAUSE_PERMIT_MATRIX_REACH_SWITCHES` with a reach rule, because
silencing it silences a second reporting line.

## Surfaces

- `#/matrix?panel=commitments` — the 36th matrix panel: board and method tabs,
  per-owner cards with pair and capacity tables, declare / re-baseline /
  release / conventions dialogs, an identity-free brief and a CSV export that
  serialises the current report (export == displayed).
- CSV scope **#145** `matrix-goal-commitments`, aggregate-only (`sensitive:
  false`): seven row types; withheld cells export blank with their reason.
- Conceptual method diagram `app/assets/goal-commitment-conflict.jpg`, inlined
  byte-exact by the offline builder like every other diagram.

## Competitive benchmark (Step 3.5)

No mainstream OKR tool detects a cross-line goal conflict on a shared person.
The named category leaders do cascading alignment maps (Perdoo, Quantive/Gtmhub,
Profit.co, Betterworks/Lattice, Effortbox) or team-level capacity planning
against OKR commitments (Craft.io — the closest analogue, per-team bandwidth
rather than per-person-per-line). The bar this register holds itself to is
therefore structural and dated detection: WHICH two lines, WHICH exact
overlapping days, against WHAT declared basis, routed to a governing apex — none
of the surveyed tools routes a conflict to a joint apex or prints the overlap in
days. Supporting figures: PMI reports 37% of cross-functional projects fail
from misalignment; the 2023 OKR Pulse Survey found only 28% of employees check
OKRs monthly, so drift stays invisible until quarter end. Competitor internals
that could not be substantiated from public material are flagged
**[BENCHMARK-UNVERIFIED]** in the session log rather than claimed.

## Not built, deliberately

No inference of a measure or direction from goal text or key results; no
per-person conflict score; no automatic re-dating, release or re-assignment; no
invitations or reminders; no multi-currency effort (hours, money) — hundredths
of one person only; no historical (closed-window) conflict archive beyond the
ledger rows themselves.
