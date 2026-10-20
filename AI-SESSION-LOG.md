# AI Session Log

## Part 05 — Causal reasoning with stated assumptions

**Scope delivered:** structural causal model (SCM) layer, identification-before-estimation
pipeline (backdoor + frontdoor), doubly-robust/IPW/regression estimation with E-value
sensitivity, counterfactual engine (why / what-would-move-this / what-if), a structural
language-enforcement layer, placebo/negative-control falsification, claim expiry, and a
synthetic ground-truth evaluation harness wired into `npm run verify`.

### Files read before writing (per standing order)

The standing order named `src/lib/causal.ts`, `causalInference.ts`, `causalChain.ts`,
`bayesianNetwork.ts`, `inference.ts`, `simulation.ts`, `orgODE.ts`, `scenarioEngine.ts`,
`wargameEngine.ts`, `metricsIntelligence.ts`, `knowledgeGraph.ts`, and Part 04's `Explain<T>`
contract. This sandbox's checkout of `https://github.com/shahramclaude/Leados` contained none
of those files yet (only the Next.js/Drizzle starter scaffold: `src/db/schema.ts`,
`src/db/index.ts`, `src/app/page.tsx`, `src/app/api/health/route.ts`, `tsconfig.json`,
`package.json`). I read all of those starter files first (listed in the tool-call transcript),
confirmed none of the named causal/Explain files existed, and therefore authored them fresh
this session, consistent with the Part 05 mission rather than editing non-existent code. If a
later upload reveals these files already exist upstream with different contents, the next
session should diff against this delivery and reconcile rather than silently overwrite.

### What was built

- **`src/lib/explain.ts`** — the `Explain<T>` contract (Part 04), reused by every causal
  answer: `{ result, reasoning: { summary, steps }, evidence, confidence, caveats }`.
- **`src/lib/causal/types.ts`** — typed SCM data model (`CausalVariable`,
  `StructuralAssignment`, `StructuralCausalModel`) and the `CausalEstimate` contract exactly as
  specified in the mission, including `associationOnly`, `confoundersSuspected`, `sensitivity`,
  `minimumN`, `asOf`/`revalidateBy`.
- **`src/lib/causal/dag.ts`** — graph builder, **acyclicity validation that throws a named
  cycle** at load time, backdoor-path enumeration + adjustment-set search (bounded power-set
  search over observable non-descendants), d-separation blocking check (collider vs
  chain/fork), and a frontdoor-criterion search.
- **`src/lib/causal/identification.ts`** — runs backdoor first, then frontdoor, else declares
  `identifiable: false` and names the suspected latent confounders (ancestors shared by
  treatment and outcome that are unobservable). Identification never computes a number.
- **`src/lib/causal/scm.ts`** — structural function evaluation (linear/logistic), noise
  sampling, forward simulation (`simulate`) for synthetic ground truth, and the
  **abduction-action-prediction counterfactual algorithm** (Pearl, 2009) producing a full trace
  of real DAG-path variables recomputed in topological order.
- **`src/lib/causal/linalg.ts`** — hand-rolled OLS-grade linear algebra (no new heavy
  dependency): matrix invert, matmul, Pearson r.
- **`src/lib/causal/estimation.ts`** — OLS regression adjustment, IRLS logistic regression for
  propensity, IPW, **cross-fitted doubly-robust (AIPW)** estimation, association-only (Pearson
  r + Fisher-z CI), and **E-value sensitivity analysis** (VanderWeele & Ding, 2017), with a
  documented minimum-N policy per method (`MINIMUM_N`).
- **`src/lib/causal/query.ts`** — `runCausalQuery`: the single entry point enforcing
  identification-before-estimation; degrades to association-only below each method's minimum
  N or when the treatment is continuous (IPW/AIPW here only support a binary treatment's
  propensity model — documented, not silently wrong).
- **`src/lib/causal/counterfactual.ts`** — `whyIsThisHappening`, `whatWouldMoveThis` (ranks
  interventions by expected effect per unit cost, excluding non-identifiable levers from the
  ranking), and `whatIf` (feeds Part 06's simulator), all returning `Explain<T>` with evidence
  and real DAG paths.
- **`src/lib/causal/language.ts`** — the **only** function allowed to turn a `CausalEstimate`
  into prose (`renderClaimSentence`); it reads `identifiable` to choose "drives/causes" vs
  "is associated with/moves with". `scanForBannedLanguage` / `assertLanguageMatchesIdentifiability`
  are the enforcement primitives used by the test suite.
- **`src/lib/causal/metricsIntelligence.ts`** — the "correlation logic" the standing order
  asked to be fixed: it no longer computes a correlation and hands it to copy directly; every
  relationship routes through `runCausalQuery` + `renderClaimSentence`.
- **`src/lib/causal/validation.ts`** — placebo/permutation test (shuffle treatment, effect
  should vanish), negative-control test, falsification report builder, and claim
  freshness/expiry (`fresh` / `aging` / `expired`) based on `asOf` + a 90-day revalidation
  window.
- **`src/lib/causal/domainModel.ts`** — the concrete LEADOS people-analytics SCM: team size,
  manager tenure, compensation, 1:1 frequency, role clarity, engagement, retention, and a
  **latent `managerQuality` confounder**, explicitly built so the flagship "1:1 frequency ->
  retention" claim is honestly non-identifiable.
- **`src/lib/causal/store.ts`** + **`src/db/schema.ts`** — SCMs and claims persisted as JSON in
  Postgres (`causal_models`, `causal_claims`) so Part 06 and Part 10 can load them.
- **API routes** — `GET /api/causal/model`, `GET|POST /api/causal/query`,
  `POST /api/causal/counterfactual`, `GET /api/causal/claims`.
- **`src/app/causal/page.tsx`** — dashboard contrasting the confounded flagship claim against
  an identifiable comparison, the DAG table, why/what-if/what-would-move-this panels, and the
  saved-claims list with freshness badges.
- **`scripts/seed-causal.ts`** — idempotently seeds the SCM and two demo claims (with
  falsification reports) into Postgres.
- **`scripts/eval-causal.ts`** (`npm run eval:causal`) — three synthetic SCMs with known ground
  truth: an observed confounder (must recover ATE within ±0.2), a hidden confounder (must
  refuse identification), and a frontdoor-identifiable mediator case (must recover ATE within
  ±0.6). Exits non-zero on any failed check.
- **Vitest suite** (`src/lib/causal/__tests__/*.test.ts`, 26 tests) covering acyclicity/cycle
  naming, backdoor/frontdoor adjustment, identification refusal + confounder naming, OLS/AIPW
  recovery, minimum-N degradation, E-value correctness, the banned-language scanner, placebo
  vanishing, negative controls, claim expiry boundaries, and counterfactual DAG-path rendering.
- **`package.json`** scripts added: `test`, `eval:causal`, `seed:causal`, `verify` (lint ->
  typecheck -> test -> eval:causal).

### Honesty-rule compliance

- `CausalEstimate.identifiable` is a required boolean in the type itself; `estimate.ate` only
  exists alongside `identifiable: true` by construction in every code path in `query.ts`.
- `renderClaimSentence` is the only place that emits "drives"/"causes", and only when
  `identifiable === true`. `metricsIntelligence.ts` never bypasses it.
- No individual-level causal claim is ever produced: `counterfactual()` is explicit in its
  caveats that it is "a model-based counterfactual for ONE entity under stated structural
  assumptions... it does not replace running the actual intervention," and the ATE pipeline
  only ever produces population-level estimates.

### Known limitations (see adversarial self-review below for detail)

- IPW/AIPW only support a binary treatment's propensity model; continuous/count treatments
  degrade to regression adjustment (still backdoor-valid under the linear-SCM assumption, but
  not doubly robust).
- E-value for continuous outcomes uses a standardized-effect-to-odds-ratio approximation
  (Chinn, 2000) rather than an exact conversion; documented in `estimation.ts`.
- Frontdoor estimation supports a single mediator variable. If identification ever returns a
  multi-mediator frontdoor set, `query.ts` deliberately degrades to association-only (with an
  explanatory assumption string) rather than silently dropping mediators and reporting a
  point estimate that would be wrong — a documented, tested gap, not a silent one.
