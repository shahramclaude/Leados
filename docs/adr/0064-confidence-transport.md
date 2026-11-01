# ADR-0064: Certify the leader's probability words, and transport them only when the record earns it

- **Status:** accepted
- **Date:** 2026-11-01
- **Deciders:** product owner (sole operator), engineering (agent session 102)

## Context

By Session 101 the workspace held more than a hundred places where a leader writes
a probability: a decision's "P(this works out well)", an assumption's prior, a
study's expected confidence, a recovery plan's adopted probability, a deferral's
P(commit by the deadline), a monitoring review's P(any false alarm), a survival
reading's per-item chance. Almost every one of those numbers is then *used as an
input to arithmetic elsewhere* — expected value, cost of carry, value of
information, queue forecasts, WACC-style discounting of a wait.

An existing terminal (Session 79, ADR-0044, `#/voi`'s calibration panel) already
answers one question about one source: *on my priceable frames, am I over- or
under-confident, in five coarse bands, in sample?* It reports a signed
reliability gap and an advisory remap, and it is right not to act on them.

That leaves four questions unanswered, and they are the ones that decide whether
the arithmetic downstream is worth anything:

1. **One instrument, many ledgers.** The leader writes the same probability
   vocabulary into seven different records. Measuring one of them measures the
   module, not the instrument.
2. **Fitted is not forecast.** A map fitted on all of a record and scored on the
   same record always looks better than it is. The honest question is what the
   map would have said *at the time*, in the order reality arrived.
3. **A correction that cannot be checked is a belief.** An advisory remap that is
   never graded is a suggestion. It needs to be frozen, applied prospectively and
   scored — once.
4. **What about the numbers written today?** A calibration statistic about the
   past is interesting; the open promises that will be read wrong tomorrow are
   actionable.

There is also a governance constraint that rules out the obvious shortcut.
Silently rewriting declared probabilities would make the calibration read itself
a target ("declare 40%, mean 80%"). The declaration has to stay the record.

## Decision

Ship a **Confidence Transport** terminal (`#/confidence`) that treats the leader's
probability vocabulary as a measuring instrument, on Schema v72:

- **Harvest** every *settled* declaration from seven registered sources (assumption
  outcomes, decision reviews, scored impact studies, recovery-plan reviews, graded
  deferral timing calls, graded monitoring reviews, survival predictions), each
  oriented so `1` means the declared event happened. Ambiguous outcomes (`mixed`,
  `partial`, `inconclusive`) are **excluded and counted**, never treated as a coin.
- **Race three instruments** — `identity` (the declarations as written), Platt
  scaling with a Gaussian prior toward identity, and binned isotonic regression
  solved by PAV with a Beta(1,1) pseudo-count per occupied bin — under a
  **prequential** (walk-forward) protocol: every test settlement is predicted by a
  map fitted only on the settlements before it. Brier is the only score; a
  **paired bootstrap** interval on the per-settlement Brier difference decides.
- **Refuse** to call transport supported unless a map beats the declarations by a
  material margin *and* the interval's lower bound is above zero. Below the sample
  and warm-up floors the terminal prints counts and no map at all. If every map is
  materially worse the verdict is `harmful` — a real finding about a well-calibrated
  record, not a failure.
- **Never rewrite a declaration.** Every open promise is printed with its declared
  number and, beside it, the certified reading. The gap is the finding.
- **Freeze a certificate** (map type, parameters, prequential scores, pace, window)
  the moment transport is supported, and **grade it exactly once** from the
  forecasts that resolved inside its window. A window that closes empty *lapses*;
  absence of resolutions is not a win.
- **Propagate on the shared spine** (ADR-0008): RULE-CTR-01 certify, RULE-CTR-02
  re-read (one owned task per source module per ISO week, typed
  `recalibrates-belief` edges), RULE-CTR-03 grade/lapse/challenge, RULE-CTR-04
  reconcile. Marker-idempotent, inside the caller's transaction.

## Alternatives considered

- **Rewrite the declarations** (`confidence = certifiedReading(p)`) — rejected: it
  destroys the record the measurement depends on, makes the metric a target, and
  removes the only thing a reader could audit.
- **Add an eighth "calibration" module with its own stored numbers** — rejected:
  it would duplicate the ledgers that already hold declarations, and the second
  copy would drift from the first.
- **Fit and report one curve in sample (extend ADR-0044)** — rejected: in-sample
  calibration curves cannot distinguish "your words are wrong" from "the curve fit
  noise", which is exactly the question. The prequential protocol is the answer,
  and the extra module is the place to pay its cost.
- **Choose the map by AIC/BIC or by hand** — rejected: neither answers "would
  translating have helped *this* record", and both invite a model-selection debate
  in place of a measurement.
- **Per-person calibration** — rejected outright: the unit is the leader's own
  vocabulary. There is no control that produces a per-person reading and never
  will be.

## Consequences

- **Easier:** every declared probability in the product now has a second reading,
  with the out-of-sample evidence and the interval that produced it; the demo's
  decision journal makes three terminals (calibration, forecast integrity,
  confidence transport) tell one coherent story about one record.
- **Harder:** the verdict depends on how much of the workspace's history is
  settled, so a new workspace sees a refusal. That is correct and will read as a
  non-feature to anyone who expects a curve on an empty record — the Method panel
  and the empty state say so in words.
- **Debt accepted:** the prequential score removes look-ahead but **not**
  model-selection bias — the instrument was chosen on the same record it is scored
  on, and the screen says so. Only the frozen, graded certificate tests the claim
  prospectively, and one grade is one window.
- **Revisit if:** a graded certificate loses to the declarations while the
  prequential race keeps calling transport supported (that is a real contradiction
  and the rule already opens the governed decision), or if the harvest's source
  list grows past the point where "one instrument" stops being credible.
