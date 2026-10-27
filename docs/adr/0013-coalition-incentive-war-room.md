# ADR-0013: Coalition & Incentive War Room — a computational political-economy engine on the event-driven spine

## Status

Accepted — 2026-10-27 (Session 46). Extends the canonical zero-build app
(ADR-0006) and the generalized post-commit rules hook (ADR-0008). Schema v29 →
v30.

## Context

LeadOS already models stakeholders (a Mendelow-style influence register),
negotiations (BATNA/ZOPA), decisions, cases, delegations, goals and decision
tempo. But none of these answer the question a first-time leader actually loses
sleep over: **"Given who holds power and how everyone is incentivised, will my
preferred outcome actually hold, and what do I say to the person who can block
it?"**

A 2026 competitive hunt (RESEARCH §54) confirmed a genuine product gap. The
best decision-intelligence platforms (IBM Decision Intelligence, Aera, Palantir
AIP, Quantexa, Tellius) reason over warehouse/graph *data*; ONA tools
(Worklytics, Viva Insights, Humanyze) map collaboration *networks*; AI-coaching
platforms (BetterUp Grow, Skillsoft CAISY, Tough Tongue AI, Valence/Nadia)
generate LLM role-play *scripts*. Exact cooperative power indices live in
academic/SMT tools (e.g. `pouvoir-de-coalition`, InfluenceNet); mechanism design
is a graduate theory (revelation principle, DSIC, VCG). **No leadership product
combines exact voting-power indices, 2×2 Nash equilibria, mechanism-design
incentive alignment, robustness-scored recommendations and a deterministic
influence script, then propagates the result atomically across modules.**

The owner is a non-technical first-time leader. Any solution must be local,
deterministic, honest about assumptions, and require no backend.

## Decision

Add a `powerGames` collection (`#/power`, `#/power/:id`) backed by a pure engine
`app/core/domain/power.js`, wired into the event-driven spine via a new
`powerRule` (registered in `DEFAULT_POST_COMMIT_RULES` before
`decisionTempoRule`). The engine implements, explicitly and by name:

1. **Cooperative game theory** — exact Banzhaf (2ⁿ coalitions) and
   Shapley-Shubik (n! orderings) power indices, minimum winning coalitions
   (Riker), veto players (Tsebelis), dummy players and dictators over a weighted
   voting game. Players are capped at 8 so both indices are exact by enumeration
   (40,320 permutations worst case, ~1–3 ms).
2. **Non-cooperative game theory** — a 2×2 normal-form game (leader vs one
   pivotal counterparty): pure & mixed Nash equilibria (Nash 1950), dominant
   strategies, Pareto frontier, social welfare, price of anarchy
   (Koutsoupias–Papadimitriou) and coordination loss.
3. **Mechanism design** — the minimal transfer that makes the leader's target
   outcome (Nash-)incentive-compatible (Hurwicz / Myerson; revelation
   principle), with an explicit feasibility bound. Honestly scoped to a
   single-outcome transfer, NOT a full dominant-strategy/VCG mechanism.
4. **Confidence-scored recommendations** — an equilibrium robustness margin
   (distance to the nearest best-response boundary, relative to payoff scale)
   combined (weaker-of) with the leader's declared estimate confidence. A
   heuristic management convention, not a statistical interval — labelled so.
5. **Deterministic influence script** — an SBI/DESC-framed, per-stakeholder
   rehearsal script and a board-ready brief derived from the computed numbers.
   Explicitly labelled as template generation, not a language model; it never
   reads confidential conflicts or anonymous pulses.

A game's mathematics depends **only on its own inline fields** (players,
weights, stances, payoffs, quota, target, confidence). This is deliberate:
external records never silently overwrite a leader's situational estimate.

## Cross-module propagation (the core mandate)

`powerRule` runs inside the store's single atomic transaction. On a
`power.created` / `power.updated` / `power.reanalyzed` / `power.settled` event
it fans one game out, idempotently and in parallel, into:

- **RULE-PWR-01** — typed graph links (`power → stakeholder/case/decision/
  negotiation/goal`, `person → power`) and a derived verdict/confidence/
  alignment-cost/robustness snapshot on the game, refreshed on drift.
- **RULE-PWR-02** — a blocked coalition opens **one** DACI decision comparing
  persuasion, redesign, an alternative coalition, or explicit delay. Because
  `decisionTempoRule` now also triggers on `power.*` events, that decision is
  classified/priced by the decision-tempo engine **in the same transaction**.
- **RULE-PWR-03** — a misaligned target opens **one** blameless
  incentive-alignment delegation (carrying the script) to the game's owner,
  plus a matching 1:1 talking point.
- **RULE-PWR-04** — coordination risk / fragility queues **one** estimate-
  verification 1:1 talking point, cleaned up when confidence improves.
- **RULE-PWR-05** — settlement records the realised outcome in append-only
  history for future calibration, never rewriting the frozen opening analysis.
- **RULE-PWR-06** — read-side `PWR-01..06` signals and a one-click
  `settings.powerAutoPropagate` pause (an explicit `reanalyzePowerGame` force
  scan still runs).

Idempotency uses embedded markers (`[RULE-PWR-02:<id>]`, etc.), link-existence
checks, and talking-point marker checks. `powerRule` runs **before**
`decisionTempoRule` so the DACI decision is visible to tempo atomically.

### Deliberate trigger narrowing (found during self-testing)

An early version let `powerRule` react to `decision.*` / `delegation.*` /
`case.*` / `stakeholder.*` events. Because game math is self-contained, those
events changed nothing but caused the rule to re-add 1:1 talking points during
unrelated workflows (a real regression in `decision-growth-prep.test.mjs`).
The trigger was narrowed to `power.*`, `person.archived/restored`, declared and
force events, and the entity-creating rules were scoped to the acting game.
This is the anti-alert-fatigue posture: propagation fires on a meaningful
change to the game, not on every workspace write.

## Data integrity

- Schema v30 is purely additive (`MIGRATIONS[29]`); no existing record becomes
  a game. `normalizePowerGames` coerces weights/payoffs into finite clamped
  ranges, repairs duplicate player ids and bad enums, clears dangling foreign
  keys with warnings, and drops titleless/<2-player games.
- `entityIdSetsForLinks` and `clearDemo` know about the `power` type so links
  survive reload and demo cleanup leaves no dangling pointers.
- `reconstructStateAt` drops games created after a point-in-time cutoff and
  unwinds post-cutoff settlements/derived refreshes with an explicit fidelity
  note.
- CSV scope #30 exports counts and dimensionless scores only — no titles,
  names or free text — with the shared formula-injection neutralizer.

## Consequences

**Benefits.** A genuinely ahead-of-market capability (no leadership SaaS does
computational cooperative/non-cooperative game theory + mechanism design); a
strong, testable demonstration of vertical/parallel cross-module automation;
confidence-weighted instead of flat advice; a first-time leader gets a concrete
script, not a platitude.

**Accepted costs / [UNVERIFIED].** All payoffs/weights are the leader's
estimates on an arbitrary utility scale — the engine reasons over them, it does
not validate them. The 2×2 game collapses a multi-party situation to a single
pivotal counterparty; multi-option EVSI / N-player general-sum solving is future
work. Robustness bands and price-of-anarchy on non-positive payoffs are
directional only. Deterministic scripts are templates, not generative AI.
Real graphical-browser rendering, screen-reader output (NVDA/JAWS/VoiceOver),
and field validation with live managers remain [UNVERIFIED]. Calibration of
predicted vs realised outcomes (RULE-PWR-05 ledger) is not yet statistically
scored — it awaits n≥5 settled games.

## Alternatives considered

| Alternative | Disposition |
|---|---|
| An LLM "stakeholder advisor" | Rejected as the core: non-deterministic, needs a backend/network (violates local-first), cannot be unit-tested, and would fabricate numbers. A deterministic engine is auditable and honest. |
| Extend the existing stakeholder register with power indices | Rejected as a coupling: situational stances must not overwrite register defaults, and a game needs its own 2×2 payoff layer. Linked, not merged. |
| Full N-player general-sum / VCG mechanism | Deferred: the 2×2 + single-transfer scope is exactly solvable, explainable and useful to a novice; a full mechanism would overwhelm the persona. |
| Heuristic power scores | Rejected: exact Banzhaf/Shapley-Shubik enumeration is cheap for n≤8 and defensible; a heuristic would be "vague best practice". |
