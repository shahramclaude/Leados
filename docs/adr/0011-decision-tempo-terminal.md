# ADR-0011: Price the option to wait — decision tempo as a first-class, measured record

## Status

Accepted — 2026-10-26, Session 44.

## Context

Every other module in LeadOS assumes the leader eventually *makes* the decision. The
product had no answer to a different and more common failure: the decision that is never
made, or made late, while the value it governs quietly erodes. Three properties of the
problem made a new subsystem necessary rather than another card on the Decisions page:

1. **Delay is a price, not a feeling.** "We should decide faster" is unactionable. Cost of
   delay has a rate (money per week), a profile (linear, fixed-date, expedite, standard),
   and — crucially — a *counterweight*: waiting also buys information. Reinertsen's
   product-development-flow economics gives the first half; Raiffa–Schlaifer preposterior
   analysis gives the second. A tool that shows only the cost of delay produces a
   recklessly fast leader; a tool that shows only the value of information produces an
   analysis-paralysis machine. The decision is the comparison.
2. **The record was missing the moment of the call.** Decisions stored a *date logged* and
   a *review date* but never the moment the call was actually made, so the app could not
   measure its own latency, let alone calibrate it. Any latency number would have been
   invented.
3. **A timebox is a commitment, so automation must not make it.** The engine can derive
   the money at stake and a guardrail date. It cannot know the edge the leader believes
   the leading option has. Arming a timebox is therefore always a human act; the machine
   may only *propose*.

The 2026 evidence base (RESEARCH §52) shows both halves of the market failing: decision
intelligence platforms optimise operational decisioning (credit, claims, next-best-action)
with no notion of the leader's own tempo, while decision-logging tools capture a decision
and a review reminder but never price delay or information. A general-purpose LLM can
narrate the trade-off but cannot show a monotone, auditable curve or an empirical latency
band.

## Decision

Ship **Schema v28: the Decision Tempo & Timing Terminal**, as one pure engine, one ledger,
one terminal, and one registered post-commit rule set:

1. **`app/core/domain/decisionTempo.js` is a pure module** with no I/O and no ambient
   time. All money comes from typed graph links (case exposure, budget commitments,
   portfolio value, negotiated stakes), split by currency and never summed across
   currencies. A decision with no linked money is labelled *unpriced*, never zero.
2. **Delay cost is an integral over a recorded profile** (Reinertsen), capped at the value
   at stake, with the cap and the profile both stated in the UI. The rate defaults to
   *value at stake ÷ erosion window* and any recorded rate wins over the derivation.
3. **The option to wait is priced in closed form.** With a normal prior on the edge
   between the leading option and the runner-up, EVSI(t) = E[max(0, posterior mean)] −
   max(0, prior mean), where the posterior-mean spread is √(s₀² − s_t²). This is exact,
   monotone, requires no simulation or model call, and satisfies EVSI ≤ EVPI by
   construction. The optimal decision date is the horizon maximising EVSI − carrying cost
   − evidence cost, and a verdict (`gather-first`, `decide-now`, `unpriced`,
   `needs-economics`) is derived from it against a 1% materiality band.
4. **Latency is measured, never inferred.** A `decidedOn` date is stamped when a call is
   recorded, and legacy decided records stay `null` (unmeasured) forever. The empirical
   latency band is a split-conformal order statistic over the workspace's own settled
   decisions, counts-only below n = 5, with its finite-sample coverage bound reported.
5. **One live timebox per decision** is a normaliser invariant: duplicates are demoted to
   `abandoned` with a written supersession reason, never deleted.
6. **Five post-commit rules** run inside the existing atomic transaction (ADR-0008):
   settle-and-measure (DLY-01), overdue → one owned blameless delegation to the recorded
   approver (DLY-02), priced-and-untimed → one *proposed* timebox (DLY-03), material
   linked-value drift → derived-value refresh that never overwrites human inputs (DLY-04),
   and one class-level DACI tempo-policy decision when a measured class p80 breaches its
   own guardrail (DLY-05). The read-side signals are DLY-06.
7. **`tempoSchedules` is the ledger** (`proposed | armed | settled | abandoned`) with an
   append-only history, a one-click pause on automatic propagation, and a data-minimised
   CSV scope (#28) that exports timing economics with no titles, rationale or names.

## Consequences

- The Decisions page, Today, Signals, the nav badge and the CSV export all read the same
  report, memoised per (state, day) — no render can disagree with another.
- The engine can be wrong about money (it uses PERT expectations from other modules), but
  it can never be silently wrong: every term is listed with its source route and basis,
  and overrides are labelled.
- Latency calibration stays honest for a long time: workspaces with fewer than five
  measured decisions get counts and an explanation, not a band.
- Decision debt now exists as a first-class signal, which will make some previously
  comfortable workspaces look worse. That is the intended effect; the debt is real, and
  RULE-DLY-02 answers it with support rather than blame.
- A new setting family (`tempo*`) is a management convention, editable in Calibration;
  none of these numbers is presented as a standard.

## Deliberately rejected

| Idea | Why not |
|---|---|
| Auto-arm timeboxes when a CD3 threshold is crossed | Arming is a commitment; the machine cannot know the edge or the leader's risk appetite. Proposals only. |
| Monte Carlo simulation of the wait decision | The closed form is exact for the normal/normal case and auditable line by line; a simulation would add variance to a number a leader is asked to defend. |
| A single "decision velocity score" per person | A tempo score attached to a human turns a systemic symptom into a performance rating, and the latency band is a class-level planning range, not a judgement of anyone. |
| Using `reviewedOn`/`date` as a proxy for `decidedOn` | That is fabricated evidence; legacy records stay unmeasured. |
| Blending currencies with an assumed FX rate | The product has no FX source and no honest way to get one; currencies are shown separately and the dominant currency alone drives the model. |
| Cloud-hosted decision analytics | Violates the zero-network, offline, single-file promises of ADR-0006/0007/0009. The engine is ~1,000 lines of pure JavaScript. |
