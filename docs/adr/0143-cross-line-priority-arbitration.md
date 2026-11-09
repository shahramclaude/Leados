# ADR-0143: The Cross-Line Priority Arbitration — a measured order, and a human agreement that is the only thing that issues work

- **Status:** accepted
- **Date:** 2026-11-08
- **Deciders:** LeadOS session 194 (frontline / mid-manager rotation, matrix structure)
- **Extends:** ADR-0140 (matrix accountability ledger), ADR-0141 (matrix line seat),
  ADR-0142 (matrix budget exposure)

## Context

ADR-0140 made it possible to record that one person is accountable to two
managers, and to print the arithmetic — including the case where the declared
shares do not add up. ADR-0141 made the second manager's seat real. ADR-0142 made
money read once per seat without splitting it by a capacity share.

All three answer *who is accountable* and *how much of a person is declared*. None
answers the question the two managers actually meet to resolve: **which of two
dated demands on that one person goes first, and on what evidence?**

The distinction matters because the ledger's honest answer — "both managers hold
`priority` on this person, contested" — is structurally correct and operationally
useless. A contested right is a property of the structure. The two managers will
still each believe their work is first, the person will still be interrupted,
and the only record of the resolution will be a meeting nobody wrote down.

The failure modes this must not reproduce:

- An engine that **picks a winner**. Precedence between two principals who both
  hold an agent's capacity is a decision, and a decision has an owner above both
  (Bernheim & Whinston's common agency; Galbraith on matrix arbitration).
- A **score that cannot be argued with**. A ranking with no printed derivation is
  an assertion wearing a number.
- A **stored score**. Any persisted rank, ratio or capacity total is a number
  waiting to disagree with the numbers it claims to rank.
- A **recommendation that issues work**. If a measured order creates obligations,
  the engine has decided. The recommendation and the agreement must be separable
  acts, and only the second can put dated work on a person.
- **Silent consent.** An agreement that records the arbiter's ratification but
  nothing from the two parties turns a negotiation into a fiction the next
  escalation disproves.

## Decision

1. **Two acts, never one.** A case is frozen, scored and *proposed* — the
   recommendation is a read model. A binding precedence requires a separate
   `priorityAgreePrecedence` command that names the acting seat, states its
   reasoning, and confirms it read the refusals. Only an AGREED case issues work,
   and only `RULE-ARB-01` issues it.
2. **The measured order is WSJF, in integers, with the refusal printed.** Rank is
   derived from two integers each line declares — cost of delay and job size — as
   an exact integer cross-multiplication, never a float division that rounds into
   looking correct. A demand with a missing figure is not scored 0: the case
   prints `incomplete`, offers **no recommendation at all**, and names which
   demand refused. Chain remaining days enter the rank as an explicit multiplier
   (CCPM priority as a function of chain remaining, Goldratt 1997), so a small
   blocker on the longest chain can outrank a large piece of work beside it.
3. **Contention comes only from stated rights.** The contest is computed from the
   rights each line *declared* (`line.rights`), never from the home line's
   presumed stewardship rights. A presumption cannot manufacture a disagreement;
   only a declared competing right can.
4. **A tie names the whole top group.** When the top two demands are
   indistinguishable on the frozen scores, the verdict is `contested`, the case
   reports how many demands share the top, and no order is invented. Two demands
   that measure identically are not resolved by row order.
5. **The arbiter is a minimal common ancestor in the reporting DAG, or nobody.**
   The arbiter is resolved exactly as ADR-0141 resolves a joint apex. A diamond
   tie is printed as a tie (`unique: false`) rather than electing one branch.
6. **Dissent is recorded with the same weight as agreement.** Every frozen demand
   has a party. An answer is each party's own first-person act, recorded under the
   **acting seat's own identity** — never rewritten to the workspace leader. An
   agreement whose parties recorded nothing is flagged `no-dissent-recorded`
   rather than read as unanimity.
7. **Capacity is measured, not assumed.** The sequenced demands' declared shares
   are summed in whole hundredths and compared with the declared ceiling
   convention. Exceeding it reads `over-committed` with both numbers printed; it
   does not block the agreement, because the humans are entitled to accept a
   knowingly over-committed plan and the record must say what they accepted.
   Allocation resolution is shape-tolerant (function, `Map`, array or allocation
   list) so a missing allocation source yields a printed refusal, not a zero.
8. **Additive, and inert for a workspace that never uses it.** Schema v120 adds
   two collections (`priorityArbitrations`, `priorityArbitrationMarkers`) and
   three printed conventions. `RULE-ARB-01` fires on `arbitration.agree` (and an
   explicit retry scan), so a workspace with no case has no edges, no decisions,
   no obligations and no behaviour change.

## Rejected alternatives

- **Let the engine pick the winner when the scores are close.** It has no standing
  to decide between two principals, and a tie broken by iteration order is a
  fabricated fact.
- **Store the computed rank and the capacity total on the case.** Every figure is
  re-derived on read from the stated integers; a stored score is precisely the
  display-vs-record drift the reliability mandate rejects.
- **Issue obligations from the proposal.** That would make a recommendation
  binding without an agreement, i.e. the engine deciding.
- **Treat a missing cost of delay or job size as zero.** That ranks an unmeasured
  demand last and calls it measured. Refusal with a printed reason is the correct
  output.
- **Reset the contest using the home line's presumed pay/performance rights.**
  Presumption would turn every matrix person into a contested case on day one.
- **A separate arbitration store or automation rule.** The existing event spine,
  typed-link graph and matrix DAG are authoritative; a parallel ledger would
  create the drift this module exists to prevent.

## Consequences

- Two managers with dated work on one person get a frozen, arguable comparison
  and one recorded precedence with a review date, a window, and every party's own
  answer attached — readable from either manager's seat and rolled up the matrix
  DAG.
- The recommendation can be read and refused by people; it cannot act. Nothing is
  issued until a human agrees it, and the agreement opens one governed decision
  that carries the dissent.
- An unmeasured demand produces no order at all, at the cost of a case that some
  users will want ranked anyway. That refusal is deliberate.
- Fidelity limits: cost of delay and job size are declared integers, not measured
  money or effort; capacity is a declaration, not a calendar; the arbiter is
  derived from declared reporting lines, not from authority actually exercised.
  Seats remain workflow declarations, not authentication. This ADR does not claim
  workspace-wide matrix parity, authenticated identity or tenant isolation.
