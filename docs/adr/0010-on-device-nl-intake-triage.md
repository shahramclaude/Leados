# ADR-0010: On-device natural-language intake triage with confidence-gated, human-confirmed routing

## Status

Accepted — 2026-10-26, Session 43.

## Context

The product doctrine (master prompt §2–§3) requires natural-language case intake that
auto-classifies and auto-routes into the cross-module propagation engine, with
confidence-scored recommendations rather than flat advice. Two architectural paths
were available:

1. **Cloud LLM classification.** Send the leader's note to a hosted model and receive
   labels and entities back.
2. **A deterministic on-device triage engine** inside the canonical zero-build app.

Three constraints rule out path 1 for LeadOS:

- **ADR-0006/0007 boundary.** Canonical `app/**` modules may make zero outbound network
  calls and use zero runtime npm dependencies. A cloud call would break the local-first,
  offline, single-file distribution promise of [ADR-0009](./0009-single-file-offline-distribution.md).
- **Confidentiality of the input.** Intake text describes employees, conflicts, safety
  incidents and commercial exposure. The 2026 HR-NLP evidence base (FINDHR survey,
  `arXiv:2410.16498`) documents that employee text is frequently too sensitive to leave
  the organization's control, and GDPR-grade deployments default to on-prem/on-device
  processing for exactly this reason.
- **Calibration honesty.** ICLR 2026 cascade research notes that LLM confidence is
  poorly calibrated out of the box. A transparent evidence-scoring engine exposes every
  term, weight and probability so a first-time manager can see *why* a label was produced.

2026 ITSM triage practice (Moveworks, Zendesk, DevRev, ServiceNow; reviewed in
`RESEARCH.md` §51) converges on four engineering controls regardless of model choice:
probabilistic confidence scores, explicit human-review thresholds, low-confidence
fallback with reasoning attached, and treating every manual override as a training
signal. Those controls — not any particular model family — are what make triage safe.

## Decision

Ship a pure, deterministic **`app/core/domain/intake.js`** engine plus a human-in-the-loop
**`#/intake`** terminal:

1. **Weighted-evidence multi-label classification** over 14 leadership-operations
   categories using a stemmed lexicon with term weights, phrase matching and
   NegEx-style negation windowing (Chapman et al., 2001). Raw scores map to
   probability-like values through temperature-scaled softmax with uniform-prior
   shrinkage so thin evidence cannot look certain.
2. **Four uncertainty controls** matching 2026 best practice: a completeness gate
   (minimum evidence weight and token count), a top-1/top-2 margin ambiguity flag,
   a stakes check that forces human review for safety/legal/confidentiality markers
   regardless of score, and explicit negation handling.
3. **Entity extraction with provenance** — roster people (with ambiguity never
   auto-resolved), money in US/EU/Danish formats with currency-assumption flags,
   durations and person-days, percentages, recurrence and severity markers — every
   extraction carrying sentence index and character offsets.
4. **Privacy wall (RULE-INTAKE-04).** Interpersonal-conflict language never produces
   an operational case suggestion; the leader is routed to the confidential conflict
   workspace and must create that record themselves. The engine never reads
   `conflicts` or `pulses`.
5. **Human-confirmed routing only.** The engine prepares a draft and a pre-filled case
   payload; the standard case dialog is the only path to creation, and it runs the
   existing event-driven `propagateCaseEvent` engine unchanged. There is no parallel
   write path and no silent automation.
6. **Calibration ledger (RULE-INTAKE-07).** Every confirmation records whether the
   primary label and entities were accepted or edited. The measured construct is
   *human agreement*, honestly named — never claimed as ground-truth accuracy — with
   counts-only reporting below n=5, matching every other calibration ledger in LeadOS.
7. **Schema v27** adds the append-only `intakeDrafts` collection via a purely additive
   migration; no historical record is converted into a draft.

## Consequences

- Triage works fully offline, inside both the served app and the double-clickable
  standalone HTML file, with zero data egress.
- Determinism makes the engine testable: 35 dedicated tests cover classification,
  negation, extraction, privacy guards, migration, calibration and an axe-clean UI.
- The lexicon is transparent and editable but narrower than a learned language model;
  novel phrasing with no term overlap produces an *insufficient evidence* verdict
  rather than a confident guess, which is the intended failure mode.
- The calibration ledger creates the substrate for a future empirical confidence-band
  recalibration once enough confirmed drafts exist; no band threshold is claimed
  calibrated until the data supports it.
- Rejected alternative: a cloud LLM proxy. Rejected on the boundary, confidentiality
  and offline-availability grounds above; revisiting it would require an explicit
  opt-in, encrypted, redaction-gated connector, not a silent dependency.
