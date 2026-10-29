# ADR-0039 — Pay architecture and equity as a first-class, local-first vertical

**Status:** Accepted · 2026-10-29 · Schema v51
**Supersedes:** nothing. **Extends:** ADR-0008 (rule spine), ADR-0036 (typed links), ADR-0038 (declared denominators).

## Context

LeadOS modelled what a leader decides, delegates, observes and learns. It did not
model what people are paid. That is a strange omission for a leadership workspace,
because pay is the decision a first-time manager is most likely to get wrong and
least able to examine: a starting-pay number agreed in a hurry compounds for a
decade, and a merit matrix that looks fair person by person can preserve a gap
indefinitely.

Two things made the omission consequential rather than merely incomplete:

1. **The regulatory clock.** Directive (EU) 2023/970 required transposition by
   7 June 2026 and introduces pay-gap reporting, a right to pay information and a
   *joint pay assessment* where a gap of at least 5% in a category of workers is
   not justified by objective, gender-neutral criteria. A manager in the EU now
   has an obligation and no tool that fits a five-person team.
2. **The market answers enterprise, not leadership.** Every credible product in
   this space — Syndio, beqom/PayAnalytics, Trusaic PayParity, Figures, Sysarb,
   Pihr, Workday's Pay Transparency Analyzer, SAP's EU Pay Transparency Insights —
   is sold to a reward function, priced by quote, and fed from an HCM system. Their
   output is a report for a compliance file. None of them turn a filed finding into
   the specific work a leader must do next, and none of them will hold a
   manager's pay data in a browser with no server at all.

## Decision

Ship pay as a full vertical on the existing spine, with the following non-negotiable
boundaries.

### 1. Append-only pay, derived placement

`payAssignments` is a ledger of dated records: person, role family, level,
currency, base, optional variable target, effective date and reason. The current
rate is *derived* — the latest effective record not in the future — never a field
that is overwritten. A correction is a new record, so the history of what was paid
and when survives.

Bands are separate declared ranges (`family × level × currency`), and a person's
band is *looked up* rather than pointed at. A pay record that cannot be matched to
a band is reported as `unbanded`; it is never silently attached to the nearest
range. Placement yields compa-ratio (pay ÷ midpoint), range penetration
((pay − min) ÷ (max − min)) and one of five statuses: in range, below minimum,
above maximum, unbanded, invalid band.

### 2. A model, not a mean

The equity audit fits `ln(pay) = a + b·group + controls` by OLS, where the controls
are the leader's declared subset of level, role family and tenure. The log
specification makes `b` the approximately proportional difference, which is the
quantity transparency law is written in.

Four refusals are part of the design, not edge cases:

- fewer than eight comparable people → no model;
- fewer than three people in either group → no model (a group mean from two people
  describes nobody in particular and could point at an individual);
- a control set that is singular on this cohort → an explicit fallback ladder, with
  the attempted and used control sets both reported, because a control that
  perfectly separates the groups is a finding about segregation, not a coefficient;
- unwritable residual degrees of freedom → no model.

A classical 95% interval, the residual degrees of freedom, the R² and the p-value
are printed next to the coefficient. Nothing is described as discrimination, as a
legal conclusion or as a substitute for a job evaluation.

### 3. Filing freezes; corrections do not rewrite history

Filing an audit stores a snapshot: status, cohort counts, the control set used, the
raw and adjusted differences, the interval, the quartiles and the flagged
categories. Later pay corrections do not touch it, the normaliser preserves it
exactly, and a filed audit cannot be deleted. This is the same declared-denominator
discipline as ADR-0038, applied to an assessment rather than an intervention.

### 4. Projections are re-fitted, never assumed

Two features need to answer "what happens if we do this next". Both re-fit the same
design matrix on projected pay instead of adjusting the coefficient arithmetically:

- **Merit rounds.** A matrix distributes a declared envelope by rating and position
  in range; if the matrix would exceed the envelope the allocation is scaled
  proportionally. On commitment the projection is frozen on the round.
- **Remediation costing.** Up to three designs are priced (uniform correction to the
  lower-paid group, a lift of the lowest-placed people to their level median, and a
  fix of confirmed below-minimum placements). The uniform case has a closed form —
  a level shift on a group dummy moves the coefficient by exactly `ln(1 + p)` — and
  is still re-fitted, because the closed form is a claim about the specification.

### 5. Propagation opens work, never adjusts pay

`RULE-PAY-01..05` run on the shared spine, in the same transaction as the event:

| Rule | Trigger | Effect |
|---|---|---|
| 01 | filed audit with a flagged category | one joint-assessment decision + one owned task to write the criteria *first*, typed links both ways |
| 02 | filed audit, significant whole-cohort gap, no flagged category | one structural remediation decision naming the lever |
| 03 | recorded placement below minimum / above maximum | one owned task / one red-circle decision, marker-idempotent and capped |
| 04 | committed merit round projected to widen the gap | one fairness decision, with the projection frozen on the round |
| 05 | a single-step pay change above the declared threshold | one blameless 1:1 talking point about criteria |

No rule writes a pay record, approves an increase, rates a person or sends a
message. `payAutoPropagate: false` pauses the automatic side; filing an audit and an
explicit scan still run.

### 6. Currency, privacy and scope are hard boundaries

- No FX conversion anywhere. Analyses are per currency cohort; filing is refused
  with a choice of cohort when the workspace holds more than one currency.
- Pay stays in the browser. There is no network call, no benchmark feed and no
  market data the app cannot cite.
- CSV scope #45 is the narrowest export in the app: opaque person and audit codes,
  model output only, no names, notes, labels or audit ids.
- Only two Directive mechanics are modelled (quartile distribution and the 5%
  threshold). A gender-neutral job evaluation and a pay-information route are
  recorded as *dated leader attestations*, labelled as attestations, and never
  presented as something LeadOS observed.

## Consequences

**Good.** The gap between "we have a report" and "we have work" closes inside one
transaction. A first-time leader gets the three analyses a compensation committee
runs, with the refusals that keep them honest, on a five-person team, offline.
Every number is traceable to a dated record, a control set and an interval.

**Costs and limits.** The model is one equation with up to three controls; omitted
variables (prior pay, negotiation, scarce skills, location, performance) can move
the coefficient either way, and the page says so. Per-category differences are
within-level and unadjusted, which is stated where they are printed. The
interval is a classical cohort interval, not a population inference. A uniform
correction is exact only relative to the fitted specification. The worked example
is synthetic and is labelled everywhere it appears. Regional law beyond the EU
Directive, job-architecture grading and multi-entity reporting are out of scope.

## Alternatives considered and rejected

- **Benchmark against market data.** Would require a network dependency, a licensed
  dataset and an FX assumption; the first two break the local-first invariant, the
  third fabricates numbers. A band is what the leader declares, and the page says
  the market view is not modelled.
- **A single "pay equity score".** Collapses a coefficient, an interval, a cohort
  size and a threshold into one number that cannot be argued with.
- **Auto-adjusting pay from the model.** The largest possible failure mode: it would
  let a statistical estimate change someone's salary, and it would destroy the
  audit trail that makes the assessment meaningful.
- **Storing the fitted model as the record.** The snapshot stores the fitted output
  and its inputs, not a model object, so a later change to the fitting code cannot
  rewrite a filed assessment.
- **Inferring group membership.** Never. An unrecognised value becomes
  `unrecorded`, which excludes the person from the model and is counted.
