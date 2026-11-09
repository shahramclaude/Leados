# ADR-0153 — Cross-Line Role Clarity Reconciliation

**Status:** Accepted (Session 211, Schema v128)
**Date:** 2026-11-09
**Altitude:** director / VP PRIMARY × matrix (every altitude reads the same lens)
**Surface:** `#/onboarding?panel=clarity` · CSV scope #115
**Rule:** none, by design — see "Consequences"

## The duty

Sam sits on two lines. Dana's functional brief says the person **owns the migration
end-to-end** — `delivery`, `technical` and `risk`, `decides`, `written`. Priya's
project brief for the same person says **support the migration when asked** —
`delivery` alone, `informed`, no criteria at all. Both briefs are dated, both read
as reasonable sentences, and nothing in the workspace ever put them side by side.

Two managers grading the same work against different definitions of good is not a
performance problem and it is not a calibration problem. It is a **role problem**,
and it is visible the moment the two definitions are read together — which is
*before* any assessment happens, not after it becomes "her performance review was
harsh this cycle". Kahn, Wolfe, Quinn & Snoek (1964) named the failure 60 years
ago: **role conflict** is incompatible prescriptions held by different senders;
**role ambiguity** is missing information about duties, rights and criteria. A
matrix doubles the senders and adds nothing to the workspace that made the two
accounts comparable — until now.

Session 208 (ADR-0150) closed *did every line say what it expects?* Session 209
(ADR-0151) closed *did every line agree about what happened?* This closes the
question between them: **did the lines agree what the person was for?**

## The decision

Add one bounded read model over the briefs the workspace **already stores**. Change
nothing about a single-chain workspace, nothing about the onboarding ledger's
own claims, and nothing about any existing reading of a brief.

### What is stored (additive, optional, fail-closed)

Three OPTIONAL fields on the existing `onboardingLineBriefs` rows:

```
domains        (string[])  closed accountability-domain lexicon, deduplicated,
                           capped at ten, unknown keys dropped with a warning
decisionRight  (string)    'decides' | 'advises' | 'informed', or absent
criteria       (string)    'written' | 'verbal' | 'unstated', or absent
```

They are declared **by the line that wrote the brief, or they do not exist**. A
brief with no marks is still a valid brief — it is simply not comparable, and the
lens reads the line as `unscoped-line` and refuses the comparison. The write
path (`onboardingMatrixBriefLine`) refuses an unknown domain, right or standing
with the closed vocabulary printed — nothing is dropped silently, nothing is
coerced into a plausible mark.

### What is never stored

No state, no verdict, no finding, no spread, no total. Every one of those is
re-derived on read from the stored briefs plus the plan window plus the live
matrix — so what the panel printed and what the record says cannot drift apart,
and a hand-edited file cannot invent a comparison.

The migration (127 → 128) adds nothing and invents nothing: existing briefs gain
the three fields **empty**, so every upgraded line reads `unscoped-line` rather
than a comparison nobody made.

### The comparison, exactly

For one plan window, in force lines are read through the same `buildMatrix` +
`periodLinesFor` path every matrix module uses. The comparable set is the lines
holding an effective brief of outcome `brief` that declare at least one mark.

* **Domain claims** — each claimed domain is counted across the comparable set.
  Claimed by two or more lines → `overlapping-scope` (the normal shape of a
  matrix, and the place two managers grade the same deliverable against
  different bars; always printed, never treated as automatically wrong).
* **Decision-right spread** — exact integer ranks (`decides` 2 / `advises` 1 /
  `informed` 0). A spread of **two or more steps** → `contested-authority`
  (one line briefed a decision-maker, another briefed a bystander).
* **Criteria spread** — exact integer ranks (`written` 2 / `verbal` 1 /
  `unstated` 0). A spread of **two or more steps** → `divergent-criteria`
  (one line will grade against a bar it wrote; another never named one).
* A one-step spread is a note, never a conflict — the scales are three steps
  wide, so two is the widest spread there is; declaring it declares the scale,
  not a fitted threshold. **There are no conventions to clamp.**

### Verdicts, in declared precedence

`unbriefed` → `contested` → `unscoped-pair` → `overlapping` → `partitioned`,
plus `single-chain` (inert). A **secondary line that never briefed** fails the
case to `unbriefed`; the **home line** carries the plan as a printed presumption
and is never decomposed into domains — it cannot block, and it is counted, never
upgraded to evidence. A **declined** line is an answer, never a definition and
never a zero: it leaves the comparison and is printed as the decline it is.

### The refusals that are the product

1. **Never parse the prose.** The `scope` text is printed; it is never classified,
   tagged, weighted or auto-compared. Guessing what a paragraph meant is the exact
   failure this module refuses to commit.
2. **Never impute a definition.** A line that wrote nothing reads `absent-line`;
   the home line reads the printed presumption. Nothing is invented for either.
3. **Never rate the person.** Every finding is on a LINE or a DOMAIN. There is no
   score, no ranking, no composite and no per-line share of anybody.
4. **Never settle the conflict.** `contested` names the two labels that cannot
   both be served. Which definition wins — which line's bar the person is graded
   against — is a human act this lens deliberately cannot perform.
5. **Never read across windows.** Briefs from a different 90-day window are
   history, not a contradiction in force today.
6. **Never inherit a re-brief's predecessors.** Marks supersede with the brief;
   an acknowledgement of superseded text is a fact about a text that no longer
   stands, and this lens does not re-read it.

## Frameworks applied

* **Kahn, Wolfe, Quinn & Snoek (1964)**, *Organizational Stress: Studies in
  Role Conflict and Ambiguity* — incompatible prescriptions from different
  senders (`contested`) and missing information about rights and criteria
  (`unscoped-line`, `divergent-criteria`).
* **Katz & Kahn (1978)**, *The Social Psychology of Organizations* — the role
  set: every sender whose expectations define the role must be heard, or the
  definition the person is graded against belongs to only one sender.
* **Galbraith (1973, 1982, 1994)** — matrix design criteria: clarity of
  accountability, decision rights and information channels as the
  information-processing cost of the matrix form; an unresolved role definition
  is unprocessed information that escalates into conflict at the worst time.
* **RACI / RAPID** — decision rights as a closed, declarable scale rather than
  free prose; the scale is exactly three steps wide.
* **Management by objectives (Drucker 1954)** — a criterion the holder of the
  work cannot state is not a criterion; `unstated` is printed as exactly that.

## Consequences

* A single-chain workspace is **inert**: no case, no finding, no row, no export,
  no behaviour change for any existing plan.
* `SCHEMA_VERSION` moves 127 → 128, additively: three optional fields re-normalized
  on brief rows; nothing else moves.
* CSV scope #115 is **aggregate only** — one row per case × line, carrying closed
  lexicon keys and counts only; no person, name, manager id, brief text or
  stakeholder name; a line with no brief exports BLANK marks, never a zero.
* **No rule is added to the spine, by design.** The reconciliation is a pure read
  over working records; the asks already exist (`RULE-ONB-01` issues them per
  unbriefed line). A rule that issued *more* asks about a *conflict* would route
  work without a human having looked at the two definitions — the exact
  auto-resolution this module refuses. The lens plugs into the same matrix
  engine, the same briefs ledger, the same seat-checked read path and the same
  CSV registry as every other matrix module; it adds no parallel edge.
* The marks extend the existing brief dialog: a line holder declares domains and
  scales **when they write the brief**, one act, one record, one place.

## Honest limits (printed on the panel)

* Domains are coarser than a job description; a domain nobody claims on either
  line is unclaimed ground, which this lens does not surface (absence of
  evidence about the unclaimed is not a finding).
* Two lines agreeing in their marks can still collide in execution; the lens
  reconciles definitions, not days.
* `overlapping` is the expected shape of a matrix, not a defect; only the spreads
  are conflicts, and the spread is the widest step on a three-step scale.
* Marks supersede only with a re-brief. A brief left standing with stale marks
  reads as the line's current definition until it is re-written — by design.
* Seats remain workflow declarations, not authentication.
