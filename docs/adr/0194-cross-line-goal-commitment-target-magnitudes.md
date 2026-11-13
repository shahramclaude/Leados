# ADR-0194 — Exact target magnitudes on cross-line goal commitments

Date: 2026-11-13 · Session 262 · Schema v154 · Status: accepted, bounded follow-on slice

## Duty and scope

Director / VP primary for governed cross-line reconciliation; frontline and
mid-manager holders make the declarations; CEO receives the same aggregate
roll-up. This extends, rather than replaces, [ADR-0193](./0193-cross-line-goal-commitment-conflicts.md) for matrix and single-chain workspaces.

Two reporting lines can promise the same person that the same measure will move
in the same direction over the same dates, yet name incompatible magnitudes. For
example, both may promise to decrease cycle time, while one says 20 hours and
the other says 30 hours. Direction alone calls that aligned, but it leaves the
actual promise ambiguous. The register must expose that divergence without
inventing a target, converting a unit, or choosing which principal wins.

## Record and authority

`goalCommitments` gains two optional declaration fields:

- `targetValue`: one canonical, exact, non-negative decimal string;
- `targetUnit`: one canonical, non-empty unit label.

They are present together or absent together. A target declaration also requires
the ADR-0193 measure and direction declaration; neither a goal title nor a key
result fills any missing field. Scientific notation, padded alternate numeric
spellings, negative values, fractional `effortShareH`, and half-declarations
are refused at the action boundary; unreadable imported rows are dropped with a
normalization warning rather than repaired into a different promise. The
displayed decimal spelling is the declared promise; it is not float-normalized
into a different promise.

The existing named-line holder authority remains unchanged. A re-baseline writes
a successor and closes its predecessor in the same atomic commit; release and
normalization preserve append-only history. Explicit `no-line` remains a valid
person-capacity declaration and a `single-principal` pair, but it has no second
named reporting-line principal: it never receives a guessed holder, target
magnitude comparison, magnitude refusal, or cross-line escalation. If it helps
create a person-capacity overcommit, the arithmetic remains visible but the rule
records an identity-free unattributed observation instead of routing a partial
set of named holders as though they owned the no-line declaration.

Schema v154's `153 → 154` migration adds blank target fields to retained
commitments. It infers neither a value nor a unit from old goals, notes, or
other fields.

## Exact read model

`buildGoalCommitments` remains the one reader. It compares a magnitude only for
two different named reporting lines that:

1. overlap on at least one inclusive ISO day;
2. name the same canonical measure; and
3. name the same direction.

It parses canonical decimal strings into scaled integers and lifts both values
to their common decimal scale using `BigInt`. Let `delta = |a - b|` and
`basis = max(a, b)`. The declared divergence percentage is `delta / basis ×
100`; the reader compares it against the convention by cross multiplication,
not JavaScript floating point. Two zero targets agree; zero versus a positive
target is 100% divergent. The printable percentage is descriptive only; the
verdict uses the exact comparison.

The new convention `goalCommitmentMagnitudeDivergencePct` defaults to 10 and is
validated as an integer at the same governed conventions door as the ADR-0193
settings. It means: a same-measure, same-direction, same-unit pair is
`magnitude-conflict` when its absolute divergence is at least that percent of
the larger declared target.

Pair verdict precedence is deliberately closed:

1. `single-principal` for any explicit `no-line` declaration;
2. `same-line` for two declarations on one named line;
3. `compatible` for non-overlapping named lines;
4. `target-conflict` for the same measure in opposed directions;
5. `magnitude-conflict` for aligned measures/directions with same-unit declared
   targets at or above the exact divergence floor;
6. `date-overlap` otherwise.

A missing magnitude is `magnitude-undeclared`; different declared units are
`magnitude-unit-mismatch`; a pair outside the named aligned comparison is
`not-applicable`. The first two are named refusals, never compatibility or
agreement. Units are compared as declared canonical labels: no conversion,
dimensional inference, currency arithmetic, percentage-point substitution, or
hidden equivalence is attempted.

## Governance and roll-up

`RULE-GCC-01` adds one bounded condition to ADR-0193:

- `magnitude-conflict` routes one dated `act-inform` reconciliation ask to the
  unique lowest joint apex of the two named-line holders.

The condition uses the reader's deterministic `gcc1:` signature, carries the
same typed `issues-obligation` and per-ancestor `rolls-up-to` provenance as a
target conflict, is capped by the existing six-asks-per-commit budget,
idempotent under re-scan, self-closing after clearance or seat movement, and
never overwrites a human closure. A leader-held, ambiguous, unattributed, or
off-roster apex records one identity-free `goalCommitmentMarkers` observation
instead of substituting a person. The pause switch applies to explicit scans as
well as declaration, re-baseline, release, reporting-line, roster, goal, and
convention writes.

Owner cards, holder/apex roll-ups, the aggregate identity-safe brief, and CSV
scope #145 all consume the same reader totals. Holder and apex roll-ups retain
opposed-direction and magnitude conflicts as separate counts plus their checkable
total; each printed cross-line pair reaches one resolved joint-apex row, and a
single-line share excess remains on that holder rather than becoming an apex
finding. The export does not disclose person, holder, line, goal, raw target
value, target unit, note, or record id. A withheld/refused magnitude count is
not serialized as zero.

## Surface and disclosure

`#/matrix?panel=commitments` shows target value and unit only on the
seat-authorised pair table, alongside the exact declared divergence and floor
when a `magnitude-conflict` exists. It labels missing magnitude and mismatched
unit as refusals rather than a clean fit. A live `no-line` row remains
re-baselinable/releasable to its authorised owner or operator, despite being
excluded from cross-line magnitude comparison; the controls never manufacture a
holder. The board banner, owner verdict, capacity sweep, brief, and export
retain their distinct claims: target-magnitude compatibility is not capacity,
capacity is not a person rating, and no decision is automatically re-dated,
released, reassigned, or approved.

## Deliberate limits

This slice does not infer targets from goal text/key results, convert units,
compare measurements with different units, add actual-outcome tracking,
calculate a person score, choose a prevailing promise, send invitations, or
create reminders. Closed historical declarations remain history; this reader is
a live cross-line commitment check, not a retrospective performance evaluator.
