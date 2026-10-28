# ADR-0022: Operating System Dynamics Lab — stocks, delays and measured loop dominance

## Status
Accepted — 2026-10-28 (Session 57). Schema v37; additive migration (`dynamicsExperiments` only).

## Decision
Model the leader's operating system as five stocks (capacity, WIP, quality debt, perceived
pressure, dependency) integrated with RK4 at a one-week step, with parameters derived from the
records the workspace already holds and each parameter graded measured / estimated / convention.
Rank feedback loops by a **gain share** — the central-difference elasticity of each loop's own
flow terms with respect to its own driving stock — and diagnose Senge archetypes from that
measured dominance. Expose a policy lab that compares a lever set against doing nothing, freezes
the prediction at adoption, and propagates findings through the existing post-commit spine
(RULE-DYN-01..03).

## Guardrails
- Every bound (capacity floor, pressure ceiling, non-negative stocks) is reported as a clamped
  week, never applied silently.
- Calibration refuses to score below its data gates and reports negative skill when the model is
  worse than naive persistence; the demo is exactly such a case.
- Dominance is reported as "share of measured gain", never as LTM percentage influence.
- Stability is a local linearisation at week 0 and is labelled as such.
- Nothing ranks people; the bottleneck is a system constraint. Attrition is an editable rate, not
  a prediction about a person.
- An adopted experiment cannot be edited, only retired with a written reason.

## Alternatives rejected
- Raw flow magnitude as loop dominance (B1 wins every week; a flow is not a feedback).
- LLM-generated narrative diagnosis (unfalsifiable).
- Auto-adopting or auto-retiring experiments (the commitment belongs to the leader).
- Persisting a trajectory (recomputed from records on every read, so it cannot drift).
