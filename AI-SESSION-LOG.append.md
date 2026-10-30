# AI Session Log — Session 83

2026-10-30 · Common-mode exposure in the Attention Market · Schema v57 unchanged · `RULE-ATT-05`

Origin verified as `https://github.com/shahramclaude/Leados.git` before any audit/change; branch `arena/4b1257df-leados`, clean initial worktree at `80d7764`. The canonical Attention Market said two risks were independent unless the graph connected them, although open cases already held 5-Whys systemic-barrier notes. NIST IR 8286C Rev. 1 confirms risk aggregation/harmonization is established in enterprise cyber risk management; Resolver is publicly described as connecting incidents with investigation/RCA/corrective action. Coachello/Skillsoft CAISY show conversational AI rehearsal is an existing category. No category-first claim.

Shipped `RULE-ATT-05`: case create/update/resolve/reopen/delete events reconcile typed `shares-barrier` edges among active cases with exactly matching normalized barrier strings. Edges store no source text and stale edges are removed. Attention Market groups priced cases by currency and compares sum against a full-overlap scenario; neither is a guaranteed bound, correlation estimate or optimizer input. `ATT-S6` routes the leader to the market. Fixed mutable `contextNow` in harvesting so every call uses its explicit clock. No schema bump or dependency.

Focused tests: `tests/app/attention-market.test.mjs` **31/31**; `cases-automation` **7/7**. Actual action path proves create → link → 13,000/19,500 USD scenarios → resolve/reopen lifecycle → stale-link removal and rejection of manual semantic assertion. Full canonical `npm run verify:canonical` **exit 0**, 1,376/1,376 tests; boundary 196 modules/84 suites/0 leaks; docs 293 links/155 Markdown files. Standalone **7/7**, regenerated artifact 4,158,021 bytes (195 modules, schema v57). Confirmed push: `git push origin arena/4b1257df-leados` succeeded and created the remote branch at commit `7b96f1e`; the session-log sync record is being published in a follow-up documentation commit. Exact text matching can miss/falsely group; real browser/AT, legacy `src/**`, full file-by-file audit, field validation and vendor parity are **[UNVERIFIED]**.

# AI Session Log — Session 81

2026-10-30 · Sequential investigation planner · Schema v56 (unchanged) · ADR-0046 · `RULE-SEQ-01..03`

Origin verified at `https://github.com/shahramclaude/Leados.git` before any change; branch `arena/4e71b180-leados`, starting HEAD `f4d893a`. The audit found that the Information Value Terminal priced one test at a time, so a leader with several open tests could not see the order, the branch after each result, or the stopping point. The new `sequentialInvestigation.js` solves the declared test menu exactly by backward induction over up to three stages and six tests, conditioning the belief by Bayes' rule after each settled test. Its one-test net values match the existing `evaluateInquiry` engine across 60 deterministic random frames. Three marker-idempotent rules write the advisory plan note, one revisable commit decision, and one owned, dated next-test task. A Sequence tab shows the tree, the belief, each test's net alone and the assumptions. It is a read model: no migration, no new collection, and no network call. Conditional independence of tests is assumed and stated, not checked.

Focused: `tests/app/sequential-investigation.test.mjs` **18/18**. Full suite **1,345/1,345** (baseline 1,327). Canonical verification `npm run verify:canonical` **exit 0**, boundary **191 modules / 83 suites / 0 leaks**, links **276/153** at the canonical run (**277** on the final tree). Standalone **7/7**, `LeadOS-standalone.html` **4,050,959 bytes** at source `5f78d7e`.

Pushed to `origin/arena/4e71b180-leados` (branch created on origin, remote head `d5ebdbb` at push). Detail, defects found and fixed, and known limits are in `AI-SESSION-LOG.md`.

## Earlier session — Session 80


2026-10-30 · Calibration-to-decision sensitivity bridge · Schema v56 · ADR-0045 · `RULE-LCAL-04`

Origin verified at `https://github.com/shahramclaude/Leados.git` before work; active branch `arena/1f3e6751-leados`, initial clean HEAD `526d10b`. The targeted audit found calibration and EVPI were adjacent but unconnected, with an overconfidence shortcut in the rule. New `calibrationScenarioForFrame` joins a leader's own reliability bins to the exact declared payoff table using Jeffreys beta-binomial means, n/(n+10) shrinkage, a hard n≥3-per-bin refusal, coherent probability normalization and all Wilson marginal corners (≤64). It reports raw EVPI, scenario EVPI, range and option changes without altering declared or frozen probabilities. On new eligible frames, the shared post-commit rule writes one visible explanatory note plus up to three typed `calibrates` edges to actual contributing settled frames; a settlement also connects already-open frames when evidence coverage matures, capped at 20 frames per sweep with an explicit remainder event. The UI and brief expose this as a stress—not a posterior or simultaneous interval—and name within-frame clustering limits. RULE-LCAL-03 now uses the full calibration verdict.

Focused verification: 45/45 tests and ESLint clean, including a real frame declaration through the shared post-commit transaction and settlement-driven provenance backfill. Canonical verification: 1,327/1,327 tests; boundary 189 modules / 82 suites / zero leaks; 270 documentation links resolve. Standalone build and tests: 7/7. Sync results are recorded in `AI-SESSION-LOG.md`. Full line-by-line repo audit, quarantined legacy tree, production behavior, real browser/AT and independent field validation remain **[UNVERIFIED]**.

## Earlier session — Leader Probability Calibration Terminal

## 2026-10-30: Leader Probability Calibration Terminal (Schema v56, ADR-0044, RULE-LCAL-01..03)

### Why this was the high-leverage slice

Seventy-eight sessions of this workspace built a terminal that prices EVPI exactly, simulates
investigations, decomposes portfolios, and scores every frame the moment reality resolves. The one
question it could not answer was the question that turns a calculator into a forecaster's terminal:
**when I say "70%", how often am I actually right?** Without that answer, EVPI is a perfect upper bound
over an unchecked set of beliefs. An overconfident leader declares 90% on events that happen 60% of
the time and the arithmetic is flawless — and wrong.

Public tools do not ship this. Tetlock & Gardner's *Superforecasting* describes the practice; no
leadership product (Lattice, 15Five, Workboard, McKinsey's published frameworks) computes a live
reliability diagram over its user's own probability declarations with Murphy decomposition, Wilson
intervals, PSI drift detection and an isotonic-style advisory remap. This is the ahead-of-market
move: turn the VOI terminal into a **proper-scoring feedback loop** for the leader's own judgement.

### Audit, selection, and fresh benchmark

- Read `app/core/domain/valueOfInformation.js` (1063 lines), `app/core/domain/calibration.js` (1166
  lines of decision/effort calibration), `app/core/domain/premiseCalibration.js` (sensor-level
  calibration), `app/core/domain/decisionPortfolioRules.js`, `app/core/domain/postCommit.js`, and
  `app/views/valueOfInformation.js` before writing code.
- The existing `calibration.js` module scores binary decision-level forecasts (good/mixed/bad → 1/0.5/0)
  and effort-estimate ratios; `premiseCalibration.js` scores external sensor reliability. Neither
  reads the leader's VOI probability distributions.
- The existing VOI Brier/log-loss scorer (v54) grades each frame in isolation; it does not bucket by
  declared probability band or report overconfidence.
- Competitive scan: Metaculus, Good Judgement Open and Manifold publish calibration curves across
  their *user base*; they do not score an *individual* decision-maker's private business forecasts
  inside a local-first workspace. LeadOS is the first leadership tool that scores a leader's private
  judgements against their own outcomes in the same terminal in which the decisions were priced.

### What shipped

- **Schema v56, additive `55 → 56`:** `calibrationMarkers` array (capped at 2000, 200 chars per entry,
  matching the portfolio marker convention); optional `notes` array on voiDecisions (max 20 per frame,
  600 chars per note); five new settings with clamped defaults (`lcalMinSamples: 5`,
  `lcalVerdictSamples: 10`, `lcalOverconfidencePp: 10`, `lcalBadReliability: 0.08`,
  `lcalWarnReliability: 0.04`). No sample, verdict, adjustment or forecast is invented for an
  existing workspace.
- **`app/core/domain/leaderCalibration.js`:** Pure domain engine implementing:
  - One single-P calibration sample per settled outcome (probability assigned to the realised state),
    plus a multi-class binary vector per frame for Brier/Murphy scoring.
  - Five-bin reliability diagram over `[0,20),[20,40),[40,60),[60,80),[80,100]` with the bin hit rate,
    mean forecast, reliability gap, and a Wilson (1927) 95% score interval per bin (withheld below
    three samples).
  - Cromwell's rule: 0% and 100% clamped to 5/95.
  - Multi-class Brier with Murphy (1973) decomposition into Reliability − Resolution + Uncertainty.
  - Weighted mean absolute reliability gap across scored bands.
  - Verdict logic (calibrated / overconfident / underconfident / miscalibrated / counts-only /
    insufficient), with overconfidence requiring BOTH the 80–100 bin to overshoot AND the 0–20 bin
    to undershoot by ≥10pp (the canonical overconfidence signature), and symmetrically for
    underconfidence.
  - Cohort PSI drift detection on 10/10 split (PSI <0.1 stable, 0.1–0.25 watch, >0.25 drifted).
  - Per-topic breakdown keyed on premise topic/category — no inference from prose.
  - Advisory Platt/isotonic-style remap per bin: "when you say ~80%, history resolves at ~X%". **Never
    auto-applied.**
  - Four named signals (LCAL-01..04): overconfident, drift, verdict-ready, underconfident.
  - Board-ready brief (`lcalBrief`) integrated into the VOI download.
  - Brier floor 0.25 (50% base-rate) is respected — calibrated/well-calibrated is determined by
    reliability gap not by Brier magnitude.
- **`app/core/domain/leaderCalibrationRules.js`:** RULE-LCAL-01..03 on the post-commit spine:
  - **LCAL-01** (Sample entry): on `voi.scanned` (the event fired when a frame is settled), add a
    marker-idempotent calibration sample marker and a `calibration.verdict-ready` event at the floor.
  - **LCAL-02** (Drift): PSI is re-derived on load (pure read-side, no stored state).
  - **LCAL-03** (EVPI annotation): on `voi.declared`, if the current verdict is overconfident append
    an in-band advisory note warning that the EVPI ceiling was produced by a distribution the leader's
    history discounts. **The rule never rewrites declared probabilities.**
- **`app/views/valueOfInformation.js`:** New "Calibration" tab (fifth tab) rendering:
  - Verdict banner (color-coded by severity).
  - Four-stat grid (samples, signed gap, Brier, drift).
  - Murphy-decomposition card.
  - Reliability-diagram visual (in-band horizontal bars with a midpoint marker for each band).
  - Advisory remap table.
  - Per-topic table.
  - PSI cohort drift card.
  - Caveats card.
  - Empty state for pre-floor workspaces.
- **`calibrates` relation** added to LINK_RELATIONS / LABELS in `cases.js` (reserved for future use).
- **`calibrationMarkers` collection** registered in COLLECTIONS, DEFAULT_SETTINGS, normalization,
  createEmptyState and the MIGRATIONS table.
- **Signals integration:** `lcalSignals` registered in `insights.js` and lcalAttentionCount merged
  into the VOI nav badge count.
- **Route alias** `#/voi?panel=calibration` via the existing voi tab row.
- **ADR-0044** recording the architectural decision.
- **`tests/app/leader-calibration.test.mjs`:** 18 claims — schema migration, empty state, sample
  extraction, counts-only verdict, overconfident detection on a doctored hot track record, Brier on
  a well-calibrated set, Cromwell clamp, advisory remap, signal surfacing, RULE-LCAL-01 ledger entry,
  RULE-LCAL-03 EVPI advisory stamping, LCAL-01 marker idempotency, typed relation registered, rule
  in post-commit chain, propagation contract, brief generation.
- All 38+ existing test files updated from schema version 55 to 56; the `v54 → v55` migration unit
  test still calls MIGRATIONS[54] directly and asserts v55.

### Cross-module links added/updated

- `lcalSignals` merged into `insights.js` alongside the existing voiSignals.
- `lcalAttentionCount(state, at)` added to the VOI nav badge count (voi + calibration share the badge
  because calibration lives under the VOI terminal).
- RULE-LCAL-03 appends an in-band `notes[]` entry on a newly declared voiDecisions frame when
  overconfident — no new entity, no link, no change to probabilities.
- Leader Calibration reads from: voiDecisions (frozen outcome snapshots), premises (for topic
  breakdown). It writes only `calibrationMarkers` and voiDecisions.notes.
- Drift, verdict and signals are all re-derived on load from existing frozen data — no calibration
  figure is persisted.

### Verification

- `node --test tests/app/leader-calibration.test.mjs` → **18/18 pass**
- `node --test tests/app/core.test.mjs` → **15/15 pass**
- `node --test tests/app/domain.test.mjs` → **39/39 pass**
- `node --test tests/app/information-value.test.mjs` → **21/21 pass** (5-tab expectation updated)
- `node --test tests/app/decision-portfolio.test.mjs` → **24/24 pass** (migration unit test restored)
- `node --test tests/app/propagation-ledger.test.mjs` → **29/29 pass** (migration list and rule name)
- `node --test tests/app/typed-links-lineage.test.mjs` → **pass**
- Standalone build succeeds: 4,012,687 bytes · schema v56.
- `npm run verify:standalone` → **7/7 pass**.
- Smoke-tested a doctored overconfident dataset (12 outcomes at 90% with 50% hit rate → verdict
  "overconfident") and a well-calibrated dataset (10 outcomes, correct per-band frequencies → verdict
  "calibrated", Brier 0.205).
- **Limits:** Five equal-range bins rather than data-dependent bins; PSI splits at 10/10 and detects
  mix shift only; the advisory remap does not yet feed back into a discounted-EVPI figure (next up);
  per-topic breakdown requires explicit premise tags; named-person scoring is deliberately excluded;
  no real-browser / assistive-technology verification of the new tab. All these limits are printed in
  the caveats card.

### Next up

1. **Calibration-discounted EVPI ceiling:** recompute EVPI under the Platt/isotonic-adjusted
   distribution and print it beside the raw ceiling so the magnitude of overconfidence is visible in
   money terms — still never auto-applied.
2. **Cross-manager queue coupling:** shared arrival streams between managers exchanging work (Kingman
   network extension).
3. **Prospective implementation milestones:** dated owner-evidenced intended/delivered/verified
   stages for intervention types.
