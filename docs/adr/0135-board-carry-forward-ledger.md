# ADR-0135: The carry-forward ledger — a board pack is a series, not an event

- **Status:** accepted
- **Date:** 2026-11-08
- **Deciders:** LeadOS session 182 (CEO / C-suite rotation)

## Context

ADR-0085 gave the chief altitude a board memo: seven pre-registered claims, each
measured against a declared threshold, each verdict decided on the conservative
end of a stored interval, and — on commit — a frozen snapshot of exactly what the
board was shown (`memo.snapshot`, `takenAt`, verdicts, point estimates, interval
bounds, observation counts, thresholds, disclosure tags).

That record has been accumulating a history since Schema v91, and **nothing has
ever read across it**. `boardRead` selects one memo and evaluates it live;
`boardAttentionCount` looks only at the newest snapshot's failing verdicts;
`boardRules` takes one frozen memo at a time. The consequence is a hole in the
chief's actual duty. At the second board meeting the question is not "what do the
numbers say today" — it is **"what moved since the pack you froze, and what is
still broken?"** A workspace that can only show the current pack forces the chief
to regenerate the pack each cycle, re-present figures the board has already
argued over, and silently lose the thread:

- a claim that has failed three quarters running reads exactly like a claim that
  failed for the first time;
- a figure the organisation could not produce last cycle reads exactly like one
  it cannot produce today, although the first is a measurement debt with a date
  on it;
- a verdict that moved because the point estimate moved is indistinguishable
  from one that moved because the declared threshold was quietly changed;
- a verdict that flipped inside the noise band is presented as movement.

Every one of those distinctions is already decidable from the stored snapshots.

Two smaller defects sat in the same path and were reproduced while building this:

1. **A refused figure was frozen as zero.** `normalizeSnapshot`'s `num()` was
   `Number.isFinite(Number(v))`, and `Number(null) === 0` — so a WITHHELD or
   REFUSED claim was written into the frozen snapshot as a **0% reading**. That
   is a fake number inside the one record the board is shown, against the
   module's own "blank, never zero" contract (the same defect class ADR-0130
   fixed in `fit`).
2. **A superseded pack lost its snapshot.** The normalizer nulled the snapshot
   for any status other than `committed`/`frozen`, including `superseded`. The
   Board Room's own copy promises "a committed pack stays readable forever", and
   the new ledger needs that history. Nothing read it before, so nothing noticed.

## Decision

Add one **pure read model** — `app/core/domain/boardContinuity.js` — that reads
every frozen snapshot on the record, oldest first, and derives per claim:

- a **transition class** between the last two looks: `steady`, `separated`
  (verdict changed and the stored 95% intervals do not overlap), `inside-noise`
  (verdict changed, intervals overlap), `ruler-moved` (the declared threshold
  changed, so the movement belongs to the ruler), `unclassified` (a reading has
  no interval), `first-look`;
- **streaks**: consecutive looks carrying a FAILING verdict, and consecutive
  looks carrying a figure the workspace refused or withheld;
- **carry-forward**: a streak at or above the declared floor (2 packs), with the
  carried-since date being the oldest look in the current unbroken carry.

It stores nothing. No collection, node, relation, rule, event, action, setting,
CSV scope or schema bump. The snapshots are taken as given, exactly as
RULE-BRD-01 takes them, and the ledger cannot change a verdict or a threshold.

**Wiring (not an isolated dashboard):** the read is computed inside the existing
`boardRead` (`report.continuity`), rendered as a sixth panel in the existing
`#/board` terminal, appended as a sentence to the existing identity-free
`boardBriefText` consumed by Today/Signals, exported as seven additive columns on
the existing `board-claims` aggregate CSV, exposed through
`boardContinuity()` / `boardContinuityText()` and registered in `SAFE_READS` so
it is readable under enforcement. The nav badge is deliberately unchanged.

**Two repairs carried with it**, because the ledger reads both paths: `num()` in
`normalizeSnapshot` no longer coerces absent to zero, and a `superseded` memo
keeps its frozen snapshot across a reload.

## Alternatives considered

- **Compare the two most recent memos only.** Rejected: a chief needs the
  streak, not just the last step, and the streak is the part that cannot be
  reconstructed by eye from two documents.
- **Store a derived "carry" flag on the memo.** Rejected: a stored derivation
  goes stale the moment the next pack is frozen, and doctrine refuses a second
  copy of a fact the record already holds. The read is re-derived from snapshots.
- **Publish a p-value for the movement.** Rejected: consecutive looks are drawn
  from the same, changing record, so the samples are dependent; and overlap of
  two confidence intervals is a conservative screen, not a test. The ledger
  prints `separated`/`inside-noise` and explicitly refuses a p-value.
- **Open a governed decision per carried claim.** Rejected for this session:
  RULE-BRD-01 already opens one decision per failing claim per frozen revision,
  so a second escalation would add work without adding information. The carry is
  a review prompt with an age on it, and it is shown to the chief, not assigned.

## Consequences

- The chief can answer "how long has this been on the board's list?" in one
  screen, and the answer is derived, not remembered.
- A repeated refusal is now visible as measurement debt with a length, which is
  the honest framing: nobody is failing, the number is not producible.
- Two consecutive packs is a **declared convention**, not a measured optimum,
  and the floor is printed everywhere it is used. Changing it changes what the
  ledger calls "still broken", so it is stated rather than tuned.
- The ledger carries no person, name, note, span or role — the snapshot holds
  none, so none can reach the read. It is identity-free at construction.
- **Debt / revisit trigger:** a claim's continuity is only as good as the pack
  cadence. If a workspace freezes once a year, a two-pack carry spans two years;
  if the cadence becomes monthly, two packs is one month and the floor may need
  to become a period rather than a count. Revisit when a workspace's frozen
  packs are less than 30 days apart on average, or when the memo ledger's
  `BOARD_LIMITS.memos` cap of 40 starts evicting history that the ledger was
  reading (currently the last 24 looks are read).
