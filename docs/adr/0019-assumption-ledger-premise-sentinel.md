# ADR-0019 — Premise Sentinel: pre-register, sense, re-decide

- **Status:** Accepted — 2026-10-27 (Session 53, Schema v35)
- **Deciders:** LeadOS product architecture
- **Supersedes / extends:** ADR-0008 (generalized post-commit rules), ADR-0011 (Decision Tempo), ADR-0015 (Impact Ledger)

## Context

The workspace already had rich decision records, forecast calibration, decision tempo,
impact studies, operational cases, resilience topology, coalition analysis, cognitive load
and a typed relationship graph. None of those subsystems answered the question that makes
a strategy fragile at speed: *is the load-bearing premise behind a decision still true?*

A decision log without dated premises becomes folklore. A review date without a
pre-declared invalidation signpost becomes a calendar reminder. A dashboard that shows a
KPI moved cannot tell a first-time leader whether the original reason for acting has
been contradicted. 2026 decision-intelligence platforms monitor decision flows and model
drift at enterprise scale [2](https://www.gartner.com/en/documents/7363830) [3](https://www.sas.com/content/dam/sasdam/documents/2026-09/idc-marketscape-worldwide-decision-intelligence-platforms-2026-vendor-assessment.pdf), while AI-governance writing calls for a structured assumption ledger with
premise, dated evidence, owner, invalidation signal and predefined response [1](https://www.business-powerhouse.com/ai-agents-need-an-assumption-ledger-before-strategy-moves-at-machine-speed). OKR products flag at-risk goals and generate AI briefs [12](https://www.okrstool.com/blog/best-okr-software), but the surveyed market did not expose a
local-first, deterministic, typed, cross-module mechanism that turns a broken premise
into governed leadership work. Vendor claims are search excerpts and remain
**[UNVERIFIED] by hands-on trial**.

## Decision

Add an **Assumption Ledger / Premise Sentinel** as a first-class collection, a pure
domain engine, a route, a declarative sensor registry, and four rules on the existing
ADR-0008 post-commit spine.

1. **Pre-registration (Dewar et al., RAND Assumption-Based Planning).** Each premise
   records a falsifiable statement, a pre-mortem signpost, a decision anchor, an owner,
   a criticality, typed evidence sources, a Cromwell-clamped prior (5–95%), a
   watch/breach policy, an evidence half-life, a review date, append-only observations
   and append-only human review history. The four breach options are explicitly RAND
   shaping/hedging actions: reaffirm and fund a hedge, pause/renegotiate, reverse with
   an exit path, or buy information with a timeboxed probe [1](https://catdir.loc.gov/catdir/samples/cam033/2002073460.pdf).
2. **Belief update (Bayes, Good, Wald, Kullback–Leibler).** Evidence is a dated,
   directional likelihood ratio. The engine accumulates log Bayes factors, discounts
   each weight by `2^(-age/halfLife)` with a 5% floor, transforms prior log-odds into a
   posterior, and reports information gain in bits. Wald-style SPRT boundaries
   `A=ln((1−β)/α)` and `B=ln(β/(1−α))` label support/challenge/continue states
   [2](https://ucb-stat-159-s21.github.io/site/Notes/sprt.html) [6](https://metricgate.com/docs/sequential-probability-ratio/). They are an explicit
   sequential-evidence discipline, NOT a formal significance claim on heterogeneous,
   non-independent leadership records.
3. **Generalized sensing.** `PREMISE_SENSORS` is an eight-entry declarative registry.
   Each sensor declares a source type, event prefixes, a framework and a pure
   extraction function; a two-hop typed graph walk scopes evidence from the anchored
   decision and attached sources. New modules plug into the registry, not into
   hardcoded per-module glue. Sensors never read conflicts or anonymous pulses.
   Unrated FMEA cases, unpriced budgets and settled work without actuals produce no
   fabricated evidence.
4. **Atomic governed fan-out.** On a fresh breach, `RULE-PREM-03` opens exactly one
   four-option DACI re-decision, copies value-bearing typed edges from the original
   decision, declares `decisionTempo` on the same event (the generalized downstream
   rule mechanism, respecting Tempo's own pause), creates one owner verification
   delegation and one blameless 1:1 prompt, and logs typed links/audit events. It never
   reverses a decision. `RULE-PREM-01` builds the typed scope, `RULE-PREM-02` appends
   keyed evidence, `RULE-PREM-04` queues and self-clears overdue signpost reviews.
5. **Human authority and privacy.** Reaffirmation is a dated human override with a
   monotonic review cycle; only evidence created after the acknowledgement can open a
   new cycle's decision. Retirement is permanent and recorded. Pausing
   `premiseAutoPropagate` suppresses governance writes but never suppresses sensing or
   belief updates; an explicit scan always runs. CSV scope #35 exports only opaque
   premise codes and numeric belief telemetry — no titles, notes, people names or
   source free text.
6. **Migration.** Schema v34 → v35 is additive: an empty `premises` collection and five
   validated settings. No historical decision is retro-assigned a premise and no
   belief is back-filled. Normalization recomputes status from dated evidence, repairs
   corrupt priors/refs and clamps future observations; point-in-time rewind removes
   future premises and observations; `clearDemo()` scrubs retained user premise
   pointers to removed demo records.

## Consequences

**Positive.** A decision now has a testable reason, a dated sensor history and a
pre-committed response to contradiction. Cross-module propagation is real and testable:
one priced decision + one dated observation produces a DACI re-decision, Decision Tempo
schedule, delegation, 1:1 prompt, links and signals in one atomic transaction. Product
differentiation is defensible against 2026 DIP and OKR categories because the math,
thresholds, provenance and governance are local and auditable.

**Costs / limits.** Likelihood ratios, half-life, watch/breach thresholds and SPRT
boundaries are transparent management conventions, not calibrated probabilities.
Evidence from different sensors is not independent; the SPRT boundary must never be
presented as a p-value. Typed value exposure is an attention signal, not accounting
provision. A premise with no scoped evidence is honestly `unobserved`, not 70% true.
Additional post-commit sensing runs a derived load report on relevant events; workspaces
with large graphs should be measured in a real browser (currently **[UNVERIFIED]**).

**Alternatives rejected.**
- **LLM-generated premises / sentiment inference:** would violate the zero-network
  boundary, private-data boundary and the requirement for traceable weights.
- **A static risk register with manual review dates:** fails the generalized event-spine
  requirement and cannot prove cross-module propagation.
- **Automatic decision reversal on breach:** removes human authority and is unsafe for
  irreversible calls; the engine creates a DACI decision instead.
- **Hardcoded `if (case) ... else if (budget)` coupling:** rejected in favour of the
  declarative sensor registry and typed graph scope.

## Verification

`tests/app/premises.test.mjs` covers pure math, sensor scope, normalization/rewind/
clearDemo, validated actions, pause/explicit scan, human review cycles, stale prompts,
one concrete priced cross-module cascade with `RULE-DLY-03` chaining, idempotency,
signals/Insights, CSV opacity, brief, demo and JSDOM+axe across all four tabs plus the
register dialog. Schema/rule/CSV/module-count pins are updated across the canonical
suite. Full gate results for this session are recorded in `AI-SESSION-LOG.md`.
