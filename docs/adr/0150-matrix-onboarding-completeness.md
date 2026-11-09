# ADR-0150 — Matrix Onboarding Completeness

**Status:** Accepted (Session 208, Schema v125)
**Date:** 2026-11-09
**Altitude:** frontline / mid-manager PRIMARY × matrix (every altitude reads the same ledger)
**Rule:** `RULE-ONB-01`
**Surface:** `#/onboarding?panel=matrix` · CSV scope #112

## The duty

On Monday Sam joins. Dana is her functional manager and owns the 30-60-90 plan.
Priya holds 40% of her for a project that starts the same week. The plan names
role clarity, a buddy, the stakeholders to meet, an early win and three
check-ins — all of it written by one line about one job.

Nothing in the workspace records that Priya's line has any onboarding obligation
at all. A project manager has never said, in writing, what Sam owes that project
or who she must meet on it, and Sam has never been told. The plan nevertheless
reads as the whole story, and a *completed* plan reads as a completed onboarding
of a person with two managers.

There is a second, quieter failure. `onboardingSummary` counts **plans**. A
matrix person can hold two concurrent 30-60-90 plans, one opened by each line, so
the workspace reads two plans as though the person had been onboarded twice — or
as though either plan described the whole job. Both readings are wrong and both
are silent.

## The decision

Add one bounded read model over the **existing** 30-60-90 machinery, plus two
dated human commands, and change nothing about how a single-chain plan behaves.

### What is stored

One new top-level collection, `onboardingLineBriefs`: one row per **dated human
statement about one line's onboarding of one person** —

```
{ id, planId, personId, lineKey, lineRole, lineKind, managerId,
  outcome: 'brief' | 'declined', declaredOn, declaredBySeatId, declaredSource,
  scope, firstWork, stakeholders[], reason,
  acknowledgedOn, acknowledgedBySeatId, acknowledgementSource, acknowledgement }
```

`onboardingLineBriefMarkers` is `RULE-ONB-01`'s idempotency ledger.

**A brief is not stored on the plan row.** It is a different human's act from the
person who owns the plan, and it must survive a plan edit, reopen or replacement.
Hanging it off the plan would let the home manager's edit silently re-scope a
project manager's words. It is also why a **re-brief is a NEW ROW, never an
edit**: the earlier statement is history, and the person's acknowledgement of it
is a fact about a text that no longer stands.

### What is derived, never stored

Every line state, every overdue flag with whole days, every window, the verdict,
the duplicate-plan detection, the presumption and every total. A stored state is a
verdict waiting to disagree with the record that produced it.

### The states (eight, printed with eight different words)

| state | meaning |
| --- | --- |
| `acknowledged` | the line wrote its brief **and** the person acknowledged it. The only state that counts as coverage |
| `briefed` | the line wrote its brief; the person has not acknowledged it yet |
| `acknowledgement-overdue` | a standing brief whose acknowledgement window has passed |
| `declined` | the line holder stated, with a reason, that this person carries no onboarding obligation there yet — an **answer**, not a gap, and explicitly **not** coverage |
| `unbriefed` | no brief, past the declared brief window. The gap this ADR exists to name |
| `awaiting-brief` | no brief, window still open. Nothing late; nothing settled |
| `presumed` | the home line with no brief: the plan itself carries it. A **presumption**, printed as one, never upgraded to evidence and never counted as a settled line |
| `excluded` | the line does not overlap the window. Not a gap and not a zero |

### The verdicts (nine, with declared precedence)

`unplanned-matrix` → `duplicate-plans` → `unbriefed-line` →
`acknowledgement-overdue` → `awaiting-brief` → `unacknowledged` →
`settled-with-declines` → `complete` → `single-line`.

### Two claims, two figures

`crossLineComplete` means **every line in force wrote what it expects and the
person acknowledged it**. The plan's own `status === 'completed'` is a *different*
claim and is printed beside it, labelled as such. A line that declined is settled
but the onboarding did not happen there, so the case reads `crossLineSettled`, a
weaker word, and never `complete`.

## The refusals that are the product

1. **No share is computed.** A declared allocation is printed as declared, or as
   undeclared. No per-line split of a person is derived anywhere in this module.
2. **No zero for silence.** A line that wrote nothing reads `unbriefed` or
   `awaiting-brief`, never `0% covered`.
3. **One person, one case.** Two concurrent plans are one case with the duplicate
   named on it, and `peopleN` is a set of distinct people, never a count of
   plan-line pairs.
4. **A brief is first-person.** Only the seat that holds the line may write it (or
   the local operator, recorded as `declaredSource: 'operator'`). A peer, another
   line's manager or the home manager is refused.
5. **An acknowledgement is first-person.** Only the person may give it. A manager
   acknowledging for a report is the shadow accountability this step exists to
   prevent.
6. **A decline needs a reason.** A bare refusal is indistinguishable from a missed
   deadline.
7. **An acknowledged brief cannot be overwritten in place.** A correction is a new
   dated row that re-asks the person.
8. **No plan is invented.** A multi-line person with no plan reads
   `unplanned-matrix`; the rule issues no brief obligation against an imaginary
   window.

## `RULE-ONB-01`

Fires on a created or updated plan, a declared second line, and an explicit scan —
never on a read and never on an acknowledgement. For every line in force that has
written nothing it issues **one** owned, dated delegation to the manager who holds
that line (due at the plan's own deadline while that is still ahead, otherwise a
fresh declared window — an ask with a past due date is not an ask). For every
standing brief it issues **one** dated acknowledgement ask to the **person**.

It writes typed provenance only (`concerns`, `issues-obligation`, `rolls-up-to`),
is idempotent through a per-obligation marker (keyed on the **brief** for
acknowledgements, so a re-brief re-asks), bounded by a per-transaction cap whose
remainder is counted and retried by a scan, and inert in a single-chain workspace.

## Consequences

- A workspace with one line behaves exactly as it did before: no case, no row, no
  ask, no edge. The single-chain plan screen gains one informational card.
- Upgrading to v125 adds an **empty** ledger. No brief is invented at upgrade
  time — that would be words nobody said — so every existing matrix plan opens
  reading `unbriefed` or `awaiting-brief` for its declared lines, which is the
  truthful state.
- CSV scope #112 is aggregate-only: no person, no name, no manager id, no brief
  text, no stakeholder name. A figure that does not exist is BLANK, never a zero.

## Known limits

- The home line's presumption is a presumption. LeadOS still does not know who
  wrote a plan, so the module cannot prove the home line agreed to it; it prints
  that limit rather than inferring an author.
- The duplicate-plan guard lives in `createOnboardingPlan`; this read model still
  has to be safe against a workspace file that already holds two, which is what
  the duplicate verdict exists for.
- Seats are workflow declarations, not authentication.
