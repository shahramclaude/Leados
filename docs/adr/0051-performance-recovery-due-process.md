# ADR-0051: The Performance Recovery terminal (due process, evidence and the cost of waiting)

## Status

Accepted — 2026-10-30. Implements Schema v62, RULE-PERF-01..05, CSV scope #52.

## Context

Every other terminal in this workspace grades an artefact: a decision, a
forecast, a structure, a channel, a coalition. When somebody is not delivering,
the artefact is a *person's work*, and the tooling available to leaders at that
moment is almost uniformly bad. The dominant category sells one of three
things: a rating instrument (nine-box grids, potential scores, stacked
rankings), a workflow that automates the adverse action (write-up templates,
PIP generators that produce a defensible-looking document with the conclusion
already in it), or a listening product that infers sentiment from messages and
calls it engagement. Each of those makes an organisation feel decisive while
making it less fair, and all three are explicitly refused by this codebase
(`docs/FAIRNESS.md`, `views/settings.js`).

What is actually missing is not another opinion about the person. It is the
leader's own audit trail: what was expected, when it was said, what was
observed rather than remembered, whether the person was heard before the
verdict, whether anything was changed to make the expectation achievable, and
what the gap costs the team while it waits. Those are facts. A tool can hold
them, refuse to proceed without them, and price the delay — without ever
producing a judgement about the human being at the centre of the record.

The relevant literature is old, specific and unfashionable:

- **Mager & Pipe (1970, 1997), _Analyzing Performance Problems_.** Seven
  questions separate a *skill/knowledge* deficiency from a *performance*
  deficiency, and each implies a different remedy. Almost every bad management
  response is a skill remedy applied to a system problem, or the reverse.
- **Leventhal (1980); Colquitt, Conlon, Wesson, Porter & Ng (2001).** Procedural
  justice is not a feeling; it is a set of checkable properties — consistency,
  accuracy, correctability, bias suppression, representativeness and
  ethicality — and their presence predicts acceptance of an outcome far better
  than the outcome's severity does.
- **Locke & Latham (1990, 2002).** Specific, difficult, time-bounded goals with
  feedback outperform "do your best"; vague plans fail predictably.
- **Bies & Moag (1986); Edmondson (1999).** Voice and psychological safety are
  preconditions for the conversation that turns a gap into a plan people stay
  for.
- **Brier (1950).** A stated probability can be graded. The plan's own
  probability is frozen at adoption and scored at review, which makes the
  leader's optimism auditable too.
- **Reinertsen (2009), cost of delay; standard replacement-cost convention.**
  Waiting has a price. The module prints it from declared inputs or prints that
  it is unknown — never zero.

## Decision

**Performance Recovery (`#/performance`) is a due-process audit of the leader's
own record, plus the arithmetic of waiting. It is not a performance-management
system, and it cannot take an adverse action.**

1. **A concern is a record, not a verdict.** It carries the declared expectation
   and its source/date, the observed gap and its impact, dated observations,
   conversations, support actions, the seven analysis answers and an append-only
   history. Bounds are enforced (120 concerns, 80 observations, 60 conversations,
   60 supports, 4 objectives, 80 history rows, 160 markers, 20 notes).

2. **Evidence is scored for answerability, not for volume.** `evidenceAudit`
   computes live observations inside the window, distinct dates, the count whose
   SBI quality clears the floor (the feedback module's 0–4 scale), the stale
   count and the average specificity. Three observations on one date is one
   moment dressed as a pattern, and the reading says so.

3. **Six justice rules gate the plan.** Notice, accuracy, consistency, voice,
   bias suppression and support are each `met | gap | unknown` with a one-line
   fix. A named diagnosis is a seventh gate: a plan without a cause is an action
   looking for a reason.

4. **The app refuses to make an adverse action easy.** A plan can only be adopted
   when every gate is met, or when the leader writes an override of at least 40
   characters that is stored verbatim and displayed beside the plan for the life
   of the record. There is no field anywhere for a rating, a rank, a potential
   score, a nine-box cell, a sentiment reading or an exit recommendation.

5. **The prediction is frozen and scored once.** Adoption stores the objectives,
   the review date and a 5–95% probability; review is single-scoring, cannot be
   backdated before adoption and cannot be dated in the future. Calibration is
   withheld below five resolved plans.

6. **Waiting is priced honestly.** `costOfInaction` prices the declared share of
   missing output against recorded pay, and the declared team hours against a
   declared hour value; the replacement convention is months of pay. A person
   with no pay row is *unpriced*, not free.

7. **Propagation is support work, never sanction.** On the shared post-commit
   spine: RULE-PERF-01 opens one owned task and one blameless 1:1 prompt when no
   expectation is recorded; RULE-PERF-02 opens the missing two-way conversation
   once the evidence floor is met; RULE-PERF-03 opens one DACI decision about
   the support mechanism, one `concern→person` link, one `decision→concern` link
   and a dated check-in when a plan is adopted; RULE-PERF-04 opens exactly one
   decision about the next *process* step when a review says not met, with no
   exit option; RULE-PERF-05 sweeps a passed review into one owned task on an
   explicit scan. All are marker-idempotent and deterministic.

8. **The pause is real and separate.** `perfAutoPropagate=false` suppresses
   automatic work but never an explicit scan. `coupledLoadAutoPropagate` was
   split out of the continuity module's key in the same migration, fixing a v61
   collision in which pausing one module paused the other.

## Consequences

- The terminal is slower to use than a PIP generator, deliberately. Its value is
  the refusals: it will not let a leader convert irritation into a plan.
- Nothing here is legal advice, and the screen says so in as many words. The
  audit is a procedural-fairness checklist, not an employment-law opinion.
- CSV scope #52 exports one row per concern under opaque codes (`PC01`, `P01`)
  with counts, verdicts and the scored prediction — no labels, names,
  observation text, conversation notes, support notes or override text.
- The person page, the case graph (`perfconcern` node, `concerns` relation) and
  the insights roll-up (`Performance recovery` bucket) all resolve the same
  record, so a concern cannot exist in one surface and be invisible in another.
- The app still can't stop a leader acting badly outside it. It makes the record
  of what was actually done visible, which is the strongest claim a local-first,
  offline tool can honestly make.
