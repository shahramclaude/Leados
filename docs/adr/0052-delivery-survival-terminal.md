# ADR-0052: The Delivery Survival terminal (censoring, competing risks and the hazard of waiting)

## Status

Accepted — 2026-10-30. Implements Schema v63, RULE-SURV-01..05, CSV scope #53.

## Context

Every queue in this workspace — and in every other leadership tool we could
find — answers *what is open*. None of them answers the question a manager
actually asks on a Monday morning: **"which of these thirteen things has
already taken longer than work like this normally takes, and if I wait two more
weeks, what is the chance each one is still sitting there?"**

There are two statistical reasons that question is not answered anywhere, and
both are corrections a dashboard cannot make:

1. **Censoring.** At any moment most items are *open*. Every "average cycle
   time" tile in every product drops them, because they have no end date. That
   is survivorship bias: you compute the average of the work that went well.
   Kaplan & Meier (1958) keep open items in the risk set and censor them at the
   last day they were observed.
2. **Competing risks.** Work does not only finish; it is *abandoned*, cancelled,
   returned or paused. Counting an abandoned item as "still going" makes every
   team look like it eventually completes everything, because the failures
   never leave the numerator or the denominator. Aalen & Johansen (1978) split
   the exit into causes, and the difference between the two readings is
   precisely the amount of work the organisation starts and does not finish.

The second correction is the uncomfortable one, and it is why this terminal
exists as a product rather than a chart: in a workspace where a quarter of the
exits are abandonments, the naive "eventually completes" figure and the true
completion incidence diverge by exactly that quarter, and no existing tool
prints either.

## Decision

Add `#/survival` — the Delivery Survival Terminal — computed **entirely from
records the leader already keeps**, with no new data entry required to get a
first reading:

| Class | Source collection | Completion | Abandonment | Censored |
|---|---|---|---|---|
| Funded work | `portfolio` | `done` + `completedOn` | — | open / released |
| Operational cases | `cases` | `resolved`/`closed` + `resolvedOn` | — | open/mitigating/monitoring |
| Hiring requisitions | `requisitions` | `filled` + `closedOn` | `cancelled` | open/on-hold/offer |
| Org-change programmes | `changes` | `anchored` + `anchoredOn` | `abandoned` **without a date** → censored and counted as `abandonedUndated` | proposed/active/stabilising/paused |
| Delegations | `delegations` | `done` + `completedOn` | `returned` + `returnedOn` | active |
| Decisions | `decisions` | `chosen` + `decidedOn` | — | undecided |

An abandoned change carries no terminal date in the workspace — `anchoredOn` is
the only terminal field the record keeps — so it is censored at its last write
and counted separately. Crediting it with today would be an invented event;
dropping it would be an invented completion.

The estimators, named:

- **Kaplan & Meier (1958)** product-limit survival over all exits, with
  **Greenwood (1926)** variance and the **Kalbfleisch & Prentice (2002)**
  log–log band so the interval stays inside [0, 1].
- **Aalen & Johansen (1978)** cumulative incidence of completion with the
  **Aalen (1978)** variance estimator.
- **Nelson (1972) / Aalen (1978)** cumulative hazard, differenced into
  elapsed-time buckets, with a **Katz** log-rate ratio and interval.
- **Mantel (1966) / Cox (1972)** log-rank test on one degree of freedom, with
  the exact tail `2·(1 − Φ(√χ²))` rather than a table lookup.
- **Brier (1950)** for the frozen reading, scored against the class's own base
  rate so "the curve is useful" is a measured claim.
- **Kahneman & Tversky (1979) / Flyvbjerg (2006)** for the outside view: the
  class median from the leader's own record, never an external benchmark.
- An **empirical age percentile** — the share of past exits that took less time
  than this item already has — for the many items whose conditional probability
  cannot be read because too few comparables remain at risk. It is labelled as
  a percentile and never as a probability.

### The refusals, encoded

- No probability below the declared at-risk floor. A conditional completion
  figure needs comparables *still at risk at the item's age*; below the floor
  the page prints the refusal text and the item's age instead.
- No tail beyond the observed record drawn silently. A horizon past the longest
  observation is flagged on the row as extrapolated.
- No "median" that was never reached. If the incidence curve never crosses 50%,
  the page says *not reached* rather than printing the maximum as a percentile.
- No skill score below five settled items. Four items cannot demonstrate that a
  model beats a base rate.
- No scoring of a person. Every sentence is about a class of work in a system.
  The app cannot reassign work, extend a deadline or close an item.
- No rewriting a frozen reading, and no deleting a graded one. A scored
  forecast is the only evidence the workspace has that its curve was ever right
  or wrong.

### Persisted state (Schema v63, additive `62 → 63`)

`survivalReadings` and `survivalMarkers` only. The curve, the incidence, the
hazard and the percentile are recomputed on every read from the source
collections, so no stored statistic can drift from the records that produced
it. A reading freezes the *prediction*: per-item probability, the at-risk count
it was conditioned on, the curve digest, and a review date. An empty
`survivalReadings` list is the correct upgrade state — a prediction cannot be
back-filled, because back-filling it would be a prediction made after the
answer was known.

### Propagation (RULE-SURV-01..05)

| Rule | Trigger | Writes |
|---|---|---|
| SURV-01 | `survival.reading.frozen` | typed `endangers` edges reading→item for every item below the floor; one owned task per item (max 5) for the item's **recorded** owner — never an invented one |
| SURV-02 | `survival.reading.graded` | one owned repair task when the skill score is negative above the settled-item floor |
| SURV-03 | `survival.scan` | exactly one DACI decision per class per week when abandonment reaches the declared share of exits |
| SURV-04 | `survival.scan` | one owned task per returned delegation with no recorded reason |
| SURV-05 | `survival.scan` | one owned task per frozen reading still ungraded past the stale margin |

All marker-idempotent. `survAutoPropagate=false` pauses automatic work; an
explicit scan always runs and reconciles anything a pause skipped.

### New graph relation

`reading` → `survivalReadings`, relation **`endangers`** (reading → any dated
work item). The edge is what lets a leader navigate from a prediction to the
work it named — including after the prediction turns out to have been wrong.

## Consequences

- The workspace gains a defensible answer to "how long does work like this take
  here?", including the honest refusals, without asking the leader to enter a
  single extra field.
- Classes with fewer than the at-risk floor cannot produce a reading. That is a
  visible prompt to record more closed work, not a bug, and it is stated on the
  screen.
- The independence-of-censoring assumption is stated rather than assumed, and
  the abandonment-as-competing-risk model exists precisely because that
  assumption is doubtful when a leader stops the slowest work first. A
  Fine–Gray subdistribution hazard model is **not** implemented; the
  cumulative incidence is the extent of the claim.
- Exchangeability within a class is an assumption the page prints. Narrowing a
  class is the remedy, and the readings panel is the evidence about whether the
  pooled answer beat the base rate.
- Effort-days and calendar days are never divided. The planning-fallacy ratio is
  computed only where the workspace recorded both quantities in the same unit
  (a declared PERT most-likely estimate and a recorded actual effort on a
  portfolio item).
