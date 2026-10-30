# ADR-0042 — The Information Value Terminal: price the decision before buying information

**Status:** accepted · **Date:** 2026-10-30 · **Schema:** v54 · **Session:** 77

## Context

Seventy-six sessions of this workspace price almost everything a leader decides
*after* the decision: a delay (Tempo), a commitment (Capacity), an intervention
(Impact, Fidelity), a structure (Structural Design), pay (Merit), an exit
(Workforce Transition). The Premise Sentinel pre-registers the beliefs a decision
rests on and names "buy information (probe)" as one of its four responses to a
breached signpost.

Nothing anywhere in the product could answer the question a manager asks at
exactly that moment: **how much is it worth to find this out before I commit?**

In the absence of a number, two failure modes dominate real management. "Let's
get more data" becomes a socially acceptable way of not deciding, with an
unpriced delay attached. "Let's just decide" becomes a way of not thinking, with
an unpriced risk attached. Every consulting engagement runs on the gap between
these two sentences, and no software prices it.

## Decision

Ship an **Information Value Terminal** (`#/voi`, Schema v54) that (a) takes a
declared decision frame — states, probabilities, options, payoffs — and (b)
computes what perfect and imperfect information about that frame are worth.

1. **EVPI is exact, not simulated.** `EVPI = Σ p(s)·max(o,s) − max(o)Σ p(s)·o(s)`
   is enumerated over the declared state space (Raiffa & Schlaifer 1961; Howard
   1966). It is an *upper bound given the leader's declarations*, and the page
   says so next to every figure. No Monte Carlo, no seed, no approximation.
2. **A missing payoff is null, never zero.** One blank cell anywhere in an
   option's column makes that option unpriced and makes EVPI `null`, with the
   count of missing cells printed. A zero would silently become the most
   persuasive number on the page — the unpriced option would look free.
3. **Probabilities must sum to 100.** The register refuses a set that does not,
   rather than renormalising. Rescaling three typos produces a confident answer
   from numbers the leader never declared, and nothing downstream can tell.
4. **EVSI uses the test's own declared accuracy.** A two-signal test with declared
   sensitivity and specificity yields an exact posterior by Bayes' rule and
   `EVSI = E_signal[max_o E[u | signal]] − max_o E[u]`. A test whose sensitivity
   and specificity sum to 100% is a coin flip and is **refused at entry**, because
   a coin flip that costs money is a negative-value purchase dressed as diligence.
5. **Information is priced against its price.** Net value = EVSI − declared cost;
   a negative net value is reported as *not worth buying*, including the case
   where no achievable accuracy pays for it. The **break-even sensitivity** is
   found by bisection, which is valid because EVSI is monotone in accuracy
   (Blackwell 1951, 1953 sufficiency ordering).
6. **Expected value is not the only defensible rule.** Minimax regret (Savage
   1951) is computed beside it and the page says plainly when the robust choice
   differs. Deciding against the expected-value option requires a written reason:
   not to push the leader towards the arithmetic, but so a legitimate judgement
   is recorded as one rather than absorbed as an accident.
7. **A settled test is evidence in the belief ledger.** `RULE-VOI-03` converts the
   arrived signal into the diagnostic likelihood ratio `LR+ = se/(1−sp)` or
   `LR− = (1−se)/sp` and appends **one dated observation** to the premise the
   frame's target states rest on, in the same transaction as the money result.
   The join is the point: the decision frame and the Assumption Ledger are the
   same uncertainty seen from two sides. One observation does not settle a
   belief, and the Sentinel's own Wald-style boundaries say so.
8. **Decisions resting on one premise are one bet.** A Herfindahl index and a
   declared flip-stress (swap the two probabilities that carry the premise) show
   how many open frames change their preferred option if that premise is wrong.
   The flip is a *declared stress*, not a probability that the premise is wrong,
   and no covariance is estimated. `RULE-VOI-04` opens **one** decision about
   de-risking the shared assumption — never one per frame.
9. **A decided frame is held to its own number.** `decideVoiDecision` freezes
   EVPI, the per-option expected values and the declared distribution in the same
   write; `RULE-VOI-05` schedules one dated review restating them. Settling
   records the state that actually occurred, scores the frozen distribution
   (multi-class Brier 1950 and log loss) and writes the **regret actually
   incurred**. Nothing is back-filled and nothing is rewritten.
10. **The demo cannot open on a dead end.** The demo workspace carries two priced
    frames over its own assumption ledger, one live investigation and one settled
    one whose evidence is written by the real rule — the lesson Session 76
    recorded after the structural terminal shipped against a roster with no
    reporting lines.

## Consequences

- The product now answers the question that decides whether the other terminals
  are worth opening: *is this worth finding out, and at what accuracy does the
  answer stop being worth its cost?*
- New schema surface: `voiDecisions`, `voiStudies`, seven clamped settings, CSV
  scope #48, the `Information value` Insights bucket, entity types `voi` /
  `voistudy` and relations `rests-on` / `buys-information`.
- The arithmetic is only as good as the declared payoff table, and the page says
  so. A leader who omits the state that actually happens gets a precise, wrong
  bound — which is a property of the method, not a defect of the implementation.
- Deliberately **not** shipped: any automatic estimate of payoffs, any market or
  benchmark fill, any AI-generated probability, any covariance estimate between
  decisions, and any claim that a positive EVSI means the investigation will
  succeed.
