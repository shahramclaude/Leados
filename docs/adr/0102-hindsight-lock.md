# ADR-0102 — The Hindsight Lock: freeze the information set, then judge the process

- **Status:** Accepted
- **Date:** 2026-11-05
- **Session:** 142
- **Schema:** v104 (additive `103 → 104`)
- **Route:** `#/hindsight`
- **CSV scope:** #98 `hindsight` — aggregate only
- **Engine:** `hindsight-lock-2026.11-v1` (`app/core/domain/hindsight.js`)

## The question this module answers

Every workspace in this product can tell you whether a decision *worked*. Almost
none can tell you whether it was *knowing*, and the difference is the whole
discipline: a good outcome from a thin process is a lesson that will not survive
the next decision, and a bad outcome from a sound process is evidence about the
world, not about the leader.

The workspace already holds the evidence needed to separate those two. Decisions
carry a date, a chosen option, a recorded outcome and the module's own six-free
`decisionQuality` bar. Cases, goals, forecasts, premises, delegations, conflicts
and every other record are linked to decisions by typed hierarchy edges, and each
linked record carries its own date. What was missing was a **reader** that freezes
the information set once, at the moment of the decision, and later asks what was
knowable but not consulted — without letting the answer change as the workspace
grows.

The tempting shortcut is to compute coverage *now* and call it hindsight. That is
not an audit; it is a scoreboard that punishes a decision for facts that did not
exist when it was taken, and it drifts every time the workspace is edited. This
ADR refuses that shortcut explicitly.

## Decision

### 1. The lock is written in the transaction that records the decision

`RULE-HND-01` reads every typed link to a decision whose `createdOn` is on or
before the decision date, resolves each linked record's **own** record date, and
freezes the resulting set on a `decisionLocks` row. The lock stores the fact
identifiers, their types, their resolved dates and their class — never the
content of the fact. From that moment the set is history: it is not
recomputed, and a later reader cannot rewrite it.

The lock also stores the frozen **process claim** (how many of the five
`decisionQuality` requirements were met, and which were missing) so the process
axis is judged on the record as it stood, not on a record edited afterwards.

A lock is *not* re-created on later scans. `RULE-HND-01` is marker-idempotent and
skips a decision that already carries a lock.

### 2. Four partitions, and only two of them can enter a rate

Every fact that is currently linked to the decision is placed, using its **own**
record date against the **decision** date:

| class | meaning | in coverage? |
| --- | --- | --- |
| `known` | linked when the lock was written, and dated on or before the decision | **yes** |
| `missed` | dated on or before the decision, but not linked when the lock was written — the workspace found it relevant afterwards | **yes** |
| `later` | dated after the decision | never |
| `undated` | the record's own date cannot be resolved | never |

`later` is printed, not charged: no decision is punished for a fact that arrived
afterwards. `undated` is excluded rather than guessed, because an undated fact
cannot be placed on either side of the decision. **`missed` is a claim about the
workspace, not about the person**: it says the record existed and this decision
did not rest on it.

Facts pointed at by the module's *own* rules (`ruleId` beginning `RULE-HND`) are
excluded from the partition. Without that guard the audit's own findings — a
process review it opened, a gap decision it raised — would appear as facts that
"arrived later" and would inflate the set on every pass.

### 3. Coverage is an interval, and it refuses itself below a floor

`coverage = known / (known + missed)`, carrying a Wilson (1927) score interval at
95%. Below `hindsightFactFloor` (= 3) knowable facts the rate is **REFUSED** with
a printed reason — two of three is not a rate, it is a coin toss with a decimal
point. A refused cell prints `refused`, never `0%`.

### 4. Quadrants are process × information × outcome

- process sound: `met >= hindsightQualityFloor` (= 4 of 5)
- information closed: coverage interval point estimate `>= hindsightCoveragePct` (= 60%)
- outcome: recorded and good / recorded and bad

| | closed information set | open or unmeasurable |
| --- | --- | --- |
| **worked** | `earned` — repeat the method | `resulted` — luck, and the dangerous lesson |
| **failed** | `variance` — do not abandon the method | `fixable` — name the missing requirement |

A decision whose information axis cannot be measured is `unmeasured` with its
reason printed. It is excluded from every rate and every test; it is never
silently promoted into a process failure and never counted as informed. An
ungraded decision is `pending` and likewise excluded.

### 5. The resulting share is gated twice

`resultingShare = resulted / measured`. It is printed only above
`max(3, hindsightCellFloor)` measured decisions, and the Fisher exact test
(two-sided, exact rational arithmetic) is refused below
`hindsightSettledFloor` (= 8) settled decisions. Every refused figure prints the
floor that refused it.

### 6. Roll-up is above director rank, in cells, with suppression

The per-span table prints counts and a resulting share per span **and per
altitude × quadrant cell**. A cell below `hindsightCellFloor` (= 3) is
**suppressed** — the row prints nothing rather than a count that identifies one
decision. Per-span rows are withheld above director rank; counts by altitude
survive. The brief is identity-free: no name, no title, no decision text, no fact
content, and it prints its refusals instead of a number.

### 7. Four rules on the shared spine

| rule | fires when | opens |
| --- | --- | --- |
| `RULE-HND-01` | a decision exists without a lock (on scan, and on any `decision.*` event) | the lock, plus `locks` / `consults` / `rolls-up-to` edges in the same transaction |
| `RULE-HND-02` | a settled decision lands in `resulted` | **one** governed process review per decision, ever |
| `RULE-HND-03` | `missed >= hindsightGapFloor` (= 2) | one governed decision asking why knowable facts were left unconsulted |
| `RULE-HND-04` | a decided-but-ungraded decision passed its own review date + `hindsightReviewGraceDays` | one ask per decision per ISO week |

Every finding is scoped to the seat that owns the lock and rolls up one edge per
leadership ancestor. The engine opens **no** decision about a person: every
finding is about a decision, or about the workspace's information set.

### 8. Nothing here grades a person

There is no score, no ranking and no per-person table anywhere in the module.
The unit of judgement is the decision. A person's name appears only as the owner
of a governed decision, exactly as it does everywhere else in the product.

## Propagation — the shared spine, not module glue

`hindsightRule` is appended to `DEFAULT_POST_COMMIT_RULES` (83 rules) with one
`PROPAGATION_CONTRACTS` entry (`writes: decisionLocks, decisionLockMarkers,
decisions, links`, `scansWorkspace: true`), placed after the Reputational Capital
Ledger and before the Operating Seat rule, so every finding it opens is priced by
the attention market and rolled up by the Operating Seat in the same transaction.

## Seat boundary

A declared seat reads the locks it owns and the locks in its own scope, never a
peer's and never a manager's. The undeclared operator view reads the workspace
(pre-ADR-0076 behaviour, preserved deliberately). Rights: `record-decision-lock`
(rank 1–5) covers `hindsightLock` / `hindsightScan`; `govern-hindsight`
(rank 4–5) covers `hindsightSetConventions`. Six reads are registered as safe
reads in the access gateway.

The seat is a **workflow declaration, not authentication**. There is no server, no
tenant isolation and no cryptographic authorship in this module; a person holding
the keyboard can declare any seat. That limit is printed, and unchanged from every
earlier ADR.

## Export

CSV scope **#98** `hindsight`, aggregate only, 24 columns: one row per scope, one
per altitude × quadrant cell, plus the resulting-share and Fisher rows. It carries
**no decision id, lock id, person id, case id or fact content**; suppressed and
refused figures are **BLANK, never zero**. The disclosure manifest declares the
`unit` class, the five-item detail ceiling and a scoped adapter, so raw locks
never enter a declared-seat projection.

## Consequences

- A leader can now answer "were we right, or were we lucky?" from their own
  record, and the answer cannot be rewritten after the fact.
- The workspace gains a durable, dated statement of what each decision rested on
  — usable by every later module (the parting-shot audit reads it as evidence).
- The audit can say *nothing* about a decision with fewer than three dated,
  typed links. That is a deliberate refusal, and it will be the common case in a
  workspace that has not been used with discipline.
- Coverage measures **the workspace's link hygiene** as much as the decision. A
  fact nobody linked is invisible to `known` and only becomes `missed` if it was
  later linked. This is a real limitation, printed in the product.
- `missed` depends on later links, so the number grows as the workspace grows.
  The lock is what keeps that honest: the *denominator's history* is frozen, and
  only the partition of currently-linked facts moves.

## Rejected

- **Recomputing coverage from scratch at read time.** It would drift with every
  edit and would charge decisions for facts that arrived later.
- **Treating `undated` as `known`.** It would inflate coverage using the very
  records whose date the workspace cannot establish.
- **Grading the person.** A "decision quality score" per leader is precisely the
  rating this product refuses; the module judges decisions and prints the
  missing requirement by name.
- **A single composite "hindsight index".** It would hide the refusal, and the
  refusal is the most informative output on the screen.
- **Back-filling locks for historical decisions.** A lock written today for a
  decision taken a year ago is a retrospective reconstruction; the engine writes
  it only when the link history can support it, marks it `retrospective` on the
  record, and says so on the screen — it never pretends to be contemporaneous.

## References

- Wilson, E. B. (1927), *Probable inference, the law of succession, and
  statistical inference*, JASA 22 — the score interval used for coverage.
- Fisher, R. A. (1935), *The Design of Experiments* — the exact two-sided test
  used for the process/outcome association, refused below its floor.
- Rosenzweig, P. (2007), *The Halo Effect* — outcome bias as the reason the
  quadrant separates process from result.
- Kahneman, D. & Tversky, A. (1979) on hindsight and outcome framing; Baron, J.
  & Hershey, J. (1988) on outcome bias in evaluation.
- Internal: [ADR-0044](./0044-leader-probability-calibration.md) (probability calibration,
  not re-implemented), [ADR-0091](./0091-aggregate-determinacy.md) and
  [ADR-0092](./0092-differencing-defender.md) (suppression and the release
  register), [ADR-0101](./0101-reputational-capital-ledger.md) (the module this
  one is placed after on the spine).
