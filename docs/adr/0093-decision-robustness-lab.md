# ADR-0093 — Decision robustness without exporting private survey evidence

Date: 2026-11-05. Status: implemented. Schema remains v96.

## Decision

Add `#/decision-robustness`, a pure, local scenario calculator, rather than another pulse score or an attrition predictor. Reuse the canonical case command and event rules for approved work. No new runtime dependency, network call, collection, migration or permission bypass.

## Mathematics

Manski partial identification: for a declared distinct respondent fraction `r`, respondent mean `m` and missing-group mean in `[a,b]`, the population mean lies in `[r*m+(1-r)*a, r*m+(1-r)*b]`. All scores are bounded 1–5. These are **conditional identification bounds**, not confidence intervals. Self-declared identities and submission counts cannot establish `r`; the app deliberately never reads pulse records or prefills it.

For target `t`, loss per point `L`, cost `C` and effectiveness `e`:

- Wait loss: `L * max(0,t-mean)`.
- Intervene loss: `C + (1-e) * waitLoss`.
- Benefit region: `[Bmin,Bmax] = e * L * [max(0,t-upper),max(0,t-lower)]`.
- Savage maximum regret: intervene `max(0,C-Bmin)`; wait `max(0,Bmax-C)`.
- The minimax decision switches at `(Bmin+Bmax)/2`; ties remain ties.

The difference between action losses is monotone, so endpoint evaluation is exact for this declared model, including the target kink. No Monte Carlo or distributional assumption is needed. Strict dominance, a five-point coverage stress table, unrestricted missing-group bounds and a perfect-information regret-removal ceiling are shown. The ceiling is **not expected value of information**. Effectiveness and loss prices are declarations, not causal estimates.

## Workflow and hierarchy

Five altitude duties and review defaults: frontline shift/7 days; manager coordination/14; director structural experiment/30; executive portfolio assumption/60; chief enterprise claim/90. These are editable workflow defaults, not empirical deadlines. The calculator is available at all five ranks via an explicit adaptive disclosure manifest. Its only roster input is the existing projected roster, further restricted to the active span.

After analysis the user independently selects intervene or wait, an owner, a review date, an observable action/review criterion and rationale. `robustnessCaseInput` builds an ordinary initiative. `api.addCase` enforces existing rank/span/date/write-lock checks. `case.created` invokes `caseCreatedRule`: `RULE-DEC-01` creates a DACI decision and `RULE-DEL-01` creates an owned task. `seatRule` creates `rolls-up-to` edges to roster ancestors; the synthetic root CEO participates in the derived digest, not a fake person edge. Reconciliation is existing marker/link-idempotent automation. Closure and follow-through use the normal case lifecycle.

Raw pulse records, comments, participation counts and numerical scenario assumptions are **not copied** into the operational case or graph. Only the approved plan/rationale travel. Free text is not automatically anonymized: the screen explicitly warns against pasting private material. Numeric worksheets are optional private JSON exports, never workspace records; replay validates size/version/inputs and ignores stored results. Navigating away loses unsaved assumptions. There is no claimed immutable replay ledger for the numeric scenario.

## Alternatives rejected

- Prefill coverage from submission count: confuses submissions with distinct people.
- Automatically open a case from a suppressed score: turns suppression into a side channel.
- Invent effectiveness or monetary ROI: would manufacture causal evidence.
- Build a second event bus: duplicates tested transactional and permission logic.
- Person-level risk ranking: unsupported by this model and outside its purpose.

## Evidence and limitations

`tests/app/decision-robustness.test.mjs`: edge cases, 500 seeded scenarios against a dense independent oracle, permission refusal, reload, cross-module + cross-altitude propagation, five scoped views, input invalidation, single-submit behavior, worksheet replay, axe in jsdom. `scripts/app-robustness-smoke.mjs`: real Chromium, WCAG A/AA checks including contrast, 390px overflow check, approval and reload.

This remains a local disclosure/workflow boundary, not server authentication or tenant isolation. No causal validation, calibrated predictions, automatic notifications, external spending or statistical anonymity guarantee. High-stakes safety/legal decisions need their own professional process, not this two-action linear model.
