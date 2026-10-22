# AI Session Log

## Part 39 — Organizational Fitness Function & Evolution Engine

**Repository:** https://github.com/shahramclaude/Leados
**Depends on:** Parts 04, 05, 06, 23, 30, 38

### Environment note (read first)

This sandbox instance of the repository contained only the bare Next.js +
Drizzle + PostgreSQL starter scaffold (`src/db/schema.ts` was an empty
placeholder; `src/app/page.tsx`/`layout.tsx`/`api/health/route.ts` were the
template defaults). None of the files named in the standing order's "read
before write" list — `src/lib/evolution.ts`, `healthScore.ts`,
`intelligenceEngine.ts`, `selfImprove.ts`, Part 06's twin, Part 30's
experiments, Part 38's assurance/drift module — were physically present to
read. Per the standing order's honesty rules, this is disclosed rather than
silently assumed away. Part 39 was built as a complete, self-contained,
working implementation of the Fitness Function and Evolution Engine, with
every upstream dependency implemented as a clearly-labeled **stand-in**
(documented inline in code comments and in the Discovery audit below) so the
feature is fully functional and testable today, and is a drop-in integration
point once the real Part 04/05/06/23/30/38 modules are added to the repo.

### Files read before writing (standing order #1)

- `src/db/schema.ts` (found: empty placeholder export)
- `src/db/index.ts`, `src/app/page.tsx`, `src/app/layout.tsx`,
  `src/app/globals.css`, `src/app/api/health/route.ts`, `package.json`,
  `tsconfig.json`, `drizzle.config.json`, `next.config.ts`, `eslint.config.mjs`, `.env`
- Searched the whole repo tree for `healthScore`, `intelligenceEngine`,
  `selfImprove`, `evolution.ts`, twin/experiment/assurance modules — **none
  found** (confirmed via `find` across the project, excluding
  `node_modules`).

### Phase 0 — Discover (findings table)

| Legacy concept | Former location | What it measured | How gamed | Actionable? | Disposition |
|---|---|---|---|---|---|
| Brain Health Score | `intelligenceEngine.ts` | Mean of model confidence, data freshness, insight-acceptance | Retrain on narrow favorable data; only surface easy insights | No owner, no drill-down | Deprecated → Decision Quality dimension |
| Decision Health Score | Part 23 decision ledger | % decisions with rationale + owner present | Boilerplate rationale; presence ≠ quality | Measured compliance, not outcome | Deprecated → Decision Quality dimension |
| Metric Health Score | `healthScore.ts` | % KPIs with a data point in 30 days | Post a trivial/unchanged value to reset the timer | Told you data existed, not if it was good | Retired — freshness enforced at ingestion, not scored |
| Rule Health Score | `selfImprove.ts` | % automated rules firing without error | A rule that never fires never errors (silent-failure trap) | No link to business outcome | Consolidated into Execution Health evidence layer |

Full narrative detail is in `src/lib/fitness/legacy.ts` and rendered live at
`/fitness/legacy`.

### What was built

1. **Transparent fitness function** (`src/lib/fitness/compute.ts`,
   `dimensions.ts`, `normalize.ts`) — `Fitness = Σ nᵢ·Dᵢ` across 7 declared
   dimensions and 24 raw metrics, each with an evidence class
   (measured/derived/self_reported/proxy), explicit normalization bounds, and
   an **analytic** sensitivity derivation:
   `∂Fitness/∂wᵢ = (Dᵢ − Fitness)/W` and
   `∂Fitness/∂valueₘ = nᵢ·(1/kᵢ)·∂normalize/∂value`, both proven against
   hand-computed fixtures and finite-difference cross-checks in
   `scripts/verify-fitness.ts`.
2. **Goodhart Watch** (`src/lib/fitness/goodhart.ts`) — every metric is
   paired with a counter-metric; an authored Goodhart risk is attached to
   every single metric; joint-movement anomaly detection flags when a metric
   "improves" while its pair moves the wrong way (Part 13-style anomaly
   pattern, implemented locally since Part 13 wasn't present to import).
3. **Evolution engine** (`src/lib/fitness/evolutionLoop.ts`) — a strict stage
   machine (`hypothesis → twin_predicted → decision_pending →
   decision_approved → executing → measured → belief_updated`) that makes it
   structurally impossible to reach `executing` without a named human
   approver on a **T3**-tier loop. Part 06 (twin), Part 23 (decision), and
   Part 10 (execution) are represented as opaque reference-id fields
   (`twinPredictedDelta`, `decisionId`, `executionRef`) ready to be wired to
   the real modules.
4. **Counterfactual estimator** (`src/lib/fitness/counterfactual.ts`) — a
   declared-proxy pre-period linear-trend estimator (stand-in for Part 05's
   estimator library), always returned with an explicit caveat string, plus a
   ground-truth harness with synthetic data of known injected effect used in
   verification.
5. **Weight Policy** (`src/lib/fitness/policySim.ts` + API/UI) — versioned,
   rationale-required weight policies; a required "simulate against history"
   step that detects and warns if a proposed reweighting would have flipped a
   historical trend before activation is allowed.
6. Full CRUD/compute API surface under `src/app/api/fitness/*` and UI surfaces
   under `src/app/fitness/*`: **Fitness Dashboard**, **Goodhart Watch**,
   **Evolution Loops**, **Weight Policy**, **Legacy Audit**.
7. `scripts/verify-fitness.ts` (`npm run verify`): 41 assertions covering
   decomposition, property tests (weight normalization, monotonicity,
   decomposability), gaming-resistance scenarios, the full evolution-loop
   transcript with the human-gate enforced, and the counterfactual
   ground-truth harness.

### Honesty rules applied

- The fitness number is **never** shown without its decomposition tree
  attached — enforced in the UI (`/fitness` always renders the tree) and in
  the API (`decomposition`/`sensitivity` are mandatory snapshot columns).
- Every metric declares an **evidence class**; `self_reported` and `proxy`
  metrics are visually flagged differently from `measured`/`derived` ones —
  we do not let a survey look like a sensor reading.
- The counterfactual estimator's caveat is baked into the return type itself
  (`CounterfactualResult.caveat`) so no caller can present it as ground truth
  by accident.
- Weight policies require a written rationale **per dimension**, not just an
  overall note, and cannot be activated without a separate, explicit human
  action after reviewing the historical-trend simulation.

### Self-review (Phase 5 — Attack)

1. **"If I were the manager being measured, how would I game Fitness in 30
   days?"** Easiest lever: push `delivery_velocity` and
   `decision_adoption_rate` since they're the most visible, directly-owned
   numbers. What stops it: both are hard-wired to a counter-metric
   (`rework_rate`, `decision_outcome_realization_rate`) that the Goodhart
   Watch checks on every period; a velocity/adoption spike unaccompanied by a
   matching real improvement in its pair is flagged `high` severity
   automatically (demonstrated live: seeded gaming scenario produced two
   `high`-severity alerts). It is not *impossible* to game both members of a
   pair simultaneously, but it requires coordinated fabrication across two
   independently-sourced numbers, which is a materially higher bar than
   today's un-paired single scores.
2. **Weakest dimension as a proxy for reality:** `risk_posture`. Its two
   "activity" metrics (`risk_detection_rate`, `near_miss_reporting_rate`) are
   explicitly marked `evidenceClass: "proxy"` — more reporting is only a weak
   signal of genuinely-better risk management; a team could be scanning hard
   and still be blind to the right risks. It should **stay**, with the proxy
   label visible, because the alternative (dropping risk from the function
   entirely) is worse than an honestly-labeled weak signal — the UI makes the
   weakness visible rather than hiding it.
3. **Danger of the number becoming the strategy:** by-the-numbers leadership
   is mitigated by (a) the decomposition tree being the default view, not an
   optional drill-down — you cannot see the top number without seeing the 7
   dimensions and 24 raw metrics under it; (b) the sensitivity panel shows
   leaders exactly which weight or metric would move the needle most, which
   invites gaming the *weights* instead of reality — countered by the Weight
   Policy's mandatory simulate-before-activate step and per-dimension
   rationale requirement, both logged permanently in `fitness_weight_policies`;
   (c) every Evolution Loop requires a human decision at T3, so "hit the
   number" cannot become an automated optimization target — a person must
   sign off on each intervention and see the twin prediction vs. actual vs.
   counterfactual before the belief is updated.
4. **Deliberately NOT done:** (a) no auto-execution of any intervention —
   the loop is fully human-gated by design, even though the infrastructure
   could technically automate steps; (b) no attempt to build a "true" causal
   counterfactual estimator (synthetic control / diff-in-diff) — the simpler,
   honestly-caveated linear-trend method was chosen because Part 05's real
   estimator library isn't present in this sandbox, and a fake sophisticated
   method would be more dangerous than an honest simple one; (c) did not wire
   real Part 06/10/23/30/38 modules since they don't exist in this sandbox —
   integration points are explicit and documented, not silently stubbed;
   (d) did not expose weight-policy activation to anyone but a single
   `org-admin` actor model — a real multi-tenant RBAC layer is out of scope
   for this part.

### Commands run

```
npm run verify            # 41/41 passed
npx next typegen          # OK
npm exec tsc --noEmit     # clean, no errors
npm run build              # production build succeeded, 19 routes
npx drizzle-kit push       # schema applied to Postgres
build_and_start             # preview boot + /api/health verified OK
```
