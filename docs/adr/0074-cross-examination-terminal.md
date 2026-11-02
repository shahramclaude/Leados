# ADR-0074: The Cross-Examination Terminal — the record arguing against itself, and a published false-alarm rate

Date: 2026-11-02 · Status: implemented · Schema: v81 · Surface: `#/sceptic`

## Context

Every one of the hundred and thirteen sessions before this one added an instrument
that reads the leader's record. Each is honest about what it measures and explicit
about what it refuses. Together they constitute something no other leadership tool
has: a workspace that can tell a first-time manager what their promise book is worth,
how much of their belief about the team survives its own measurement error, which
refusal is starving, and what the waiting costs.

All of them share one property, and it is the defect this session exists to remove.
**They are all on the leader's side.** Every screen computes what the record says the
world is like; none of them attacks what the leader has *written down about it*. A
goal marked done with no observation behind it is reported as done. A performance band
with an empty evidence list is reported as a band. A case marked resolved while the
delegation opened to mitigate it is still active is reported as resolved. A probability
on a decision whose review date passed eight weeks ago is reported as a probability. The
workspace has never once noticed that its own records contradict each other, even though
it holds both sides of every one of those contradictions and has held a typed link
between them for twenty schemas.

That is not a cosmetic gap. For a leader who has never managed before, the expensive
error is almost never a decision they knew was hard. It is a claim they never
cross-examined — and the next decision is made on it. There is also a second-order
problem: 113 sessions of statistical honesty produced a product that is *mostly about
its own error rates*, and yet the one thing it never audits is the claims it reports
from. A terminal that argues against the record has to be able to lose, or it is just
another opinion with a serif font.

The competitive picture, surveyed 2026-11-02 (RESEARCH §97): the category is moving
hard toward "AI insight" surfaces — Lattice AI, Culture Amp's performance reviews,
Betterworks, 15Five, Workday Illuminate, and the new AI-native entrants — and every
one of them reports findings. None of them (a) derives a finding from *two records the
customer already holds that cannot both be true*, (b) publishes the false-alarm rate of
its own findings, (c) refuses a probability where no base rate exists, or (d) prices the
cost of the audit that would settle the question. The vendors that do publish a
confidence figure publish it about the *model*, never about their own hit rate on the
customer's own resolved history. That is the gap this terminal occupies, and it is a gap
that only exists because this workspace has a typed record rather than a chat log.

## Decision

Build `#/sceptic`, a seventh-generation statistical terminal whose subject is the
workspace's own assertions, in six families and twelve structural detectors.

### 1. Claim families, not scores

The claims a leader makes about their own work sort into six *kinds of sentence*, and
each kind has its own reliability:

| family | the sentence | the question |
|---|---|---|
| completion | "it is done" | when I say something is finished, is it? |
| assessment | "this is how good it is" | are the judgements I record about people supported? |
| prediction | "this will happen" | do my forecasts get scored, and do on-track labels survive contact? |
| diagnosis | "this is why it happened" | did I fix the cause, or did I write it down? |
| alignment | "they are with me" | is the support I believe I have being maintained? |
| capacity | "we can deliver by then" | is the week I promised arithmetically possible? |

The family is what carries an error rate, because "how often are my completion claims
contradicted" is an answerable question and "how often am I wrong" is not. There is no
composite score anywhere in the module, and no leaderboard: a single number over six
incommensurable families would be exactly the kind of claim this screen exists to catch.

### 2. Detectors are structural, answerable, and few

Twelve detectors. Each compares two records the workspace already holds, or a record
against a hole where another record should be. None reads prose for sentiment, intent
or tone; none infers what a person meant. Every detector carries a **refuter** — the one
observation that would settle the argument — because a detector that cannot be answered
is an accusation, not an audit.

`SCP-CM-01` completed goal with no check-in · `SCP-CM-02` resolved case with its
mitigation still open · `SCP-CM-03` change closed with no closing reason · `SCP-AS-01`
review band with an empty evidence list · `SCP-AS-02` band recorded before the person's
own account · `SCP-PR-01` "on track" behind its own straight-line pace · `SCP-PR-02` a
stated probability whose review date passed unscored · `SCP-PR-03` a load-bearing
premise past its own review date · `SCP-DG-01` a cause recorded and nothing changed ·
`SCP-DG-02` a case resolved with no residual risk · `SCP-AL-01` declared support at
twice the promised cadence with no contact · `SCP-CP-01` more promised next week than
the record has ever closed in a week.

`SCP-PR-01` is the only detector with arithmetic in it: the pace line is the linear
interpolation its own `start`, `target`, `dueDate` and `createdAt` imply, and the gap is
reported in percentage points so the reader can see how far behind the label is. The
threshold (5pp) is a declared convention and is clamped.

### 3. The rate is a Beta posterior over every verdict ever recorded

A verdict is a human act with a required reason: **refuted** (the claim was wrong),
**held** (the claim survived scrutiny — the terminal was wrong), or **dismissed** (the
comparison itself is wrong). Refuted and held are scored; a dismissal never is, and the
dismissal rate is reported beside the hit rate instead of being folded into it.

A family's contradiction rate is `Beta(½ + refuted, ½ + held)` — the Jeffreys posterior
— with a 90% equal-tailed interval computed by bisection on the regularized incomplete
beta. Below the declared floor (4 by default), **no rate is printed and no claim in
that family is priced**. The posterior mean is displayed for the reader, but it never
reaches a probability on a finding, an exposure figure, or a frozen round: the mean of a
two-observation Beta is a rumour with a decimal point.

Rates are computed over **every verdict ever recorded**, not only the claims still on
file. A refuted claim usually gets fixed; a rate computed over surviving claims would
report that a family *improves* as its bad claims are repaired. That is survivorship
bias (Wald 1943), and it is the specific error this design decision exists to prevent.

### 4. Coverage is discovery sampling, and it is allowed to say "nothing is known"

The population is the number of records whose claim a detector actually read — not the
number of records on file. A detector that throws counts as having examined **nothing**,
because an error is not coverage.

The bound on the terminal's own false-alarm rate is Clopper–Pearson:
`Beta(1 − α; h + 1, k − h)`, of which the familiar rule of three
`1 − 0.05^(1/k)` is the `h = 0` case. With nothing examined it is **100%**, and the
screen prints that. With nine examinations and no false alarm it is 28.3%. The number of
examinations needed to bound it below 10% (29) and 25% (11) is printed, so the cost of
being able to say something about your own record is legible instead of implied.

### 5. Freeze refuses to price what it cannot price

A frozen round records, per claim, the probability that it is wrong, and is answered on
a review date. It cannot be frozen unless at least one family has cleared its floor: a
round of pure guesses would be graded later and teach nothing. Claims from unmeasured
families are excluded and **counted out loud** on the freeze dialog, never given a 50%.

Grading is exact and once: Brier and log loss per priced claim, against the same claims
scored at the round's own base rate, with a skill figure that is allowed to be negative
and is printed when it is. Only verdicts recorded **after** the freeze are scored — a
verdict recorded before it was already inside the rate the round quoted. A round whose
window closes with nothing scored **lapses**; it is not excused and never counts as a win.

### 6. Five rules on the shared spine, and not one of them records a verdict

`RULE-SCP-01` a freeze opens at most `scepticMaxTasks` cross-examination tasks carrying
the refuter, a `cross-examines` edge to every claim it priced (capped) and a
`finds-against` edge to the counter-record. `RULE-SCP-02` a family whose whole interval
sits above tolerance opens ONE governed DACI decision per family per 30-day bucket,
phrased as a process question with three process options. `RULE-SCP-03` a verdict writes
a `records-verdict` edge to the record whose claim it settles, and reconciliation drops
stale round edges. `RULE-SCP-04` an ungraded round past its window opens grading work.
`RULE-SCP-05` a dismissal rate above the leader's own cap opens one blameless question
per 30-day bucket — because a terminal that is mostly dismissed is either broken or
being closed, and the reasons on file distinguish the two.

All five are marker-idempotent, write inside the caller's transaction, and are pausable
by `scepticAutoPropagate`. None of them can write a disposition, re-score a round or edit
a claim. A verdict is a human act.

## Consequences

- **A new refusal class.** Six families × a scored floor means most workspaces open this
  screen with nothing priced and everything counted. That is the correct first reading
  and the panel says so in those words; the alternative (assume 50%) would reproduce the
  defect the module exists to catch.
- **The terminal can lose, publicly.** Precision, false-alarm bound and dismissal rate
  are printed on the same screen as the findings. If the detectors are bad, the record
  will say so, and the module has no mechanism for hiding it.
- **A first cross-reference from instruments to their own inputs.** `SCP-AS-01` audits
  the review instrument whose reliability `#/reliability` measures; `SCP-PR-02` audits
  the forecasts `#/forecast-integrity` scores. No edge was added between the terminals:
  the audit is a read, and duplicating the other instrument's computation here would let
  the two disagree.
- **No money anywhere.** Exposure is stake-weighted in declared units and the panel says
  why: no record in this workspace prices a wrong claim, and the terminal will not invent
  an exchange rate between credibility and currency.
- **Latest schema = v81**; `LeadOS-standalone.html` rebuilt; CSV scope #71 added; the
  canonical suite grew by one suite and 25 tests.
- **Not built, deliberately:** a composite "self-deception score" (incommensurable
  families, and an invitation to rank), prose or sentiment analysis of `conflicts`,
  `pulses` or `messages` (no validated reading, and it would rate people), automatic
  verdict inference from linked records (a verdict is a judgement, and inferring it would
  make the terminal grade its own homework), a person-level claim family (the review is
  the instrument, and no human may be an endpoint), and any use of the term "AI-detected"
  (every finding is a deterministic comparison, and that is the point).
