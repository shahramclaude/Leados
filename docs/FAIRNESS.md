# FAIRNESS.md — LEADOS People Intelligence (Part 09)

This document is the single source of truth for: the protected-attribute
exclusion contract, the proxy analysis behind it, the declared privacy
policy, the fairness-gate thresholds and their justification, and the
model card for the flight-risk engine.

## 1. Protected attributes are excluded by construction

`src/lib/protectedAttributes.ts` defines the canonical denylist
(`PROTECTED_ATTRIBUTES`) and the proxy denylist (`EXCLUDED_PROXY_FIELDS`).
Neither list has a corresponding column anywhere in `src/db/schema.ts` — we
do not collect age, date of birth, gender/sex, ethnicity/race, national
origin, religion, disability/health condition, pregnancy/parental leave,
union status, sexual orientation, marital status, genetic information,
veteran status, or citizenship/immigration status. This is "excluded by
construction," not just policy: there is nowhere to put the data even if
someone tried.

Every engine that builds a feature vector for scoring (`flightRisk.ts`,
indirectly `succession.ts` and `teamHealth.ts` via their inputs) calls
`assertNoProtectedFeatures(Object.keys(features))` before scoring. The
assertion throws if any feature name is, or normalizes to, an entry in
either denylist. `scripts/test-proxy-exclusion.ts` exercises this directly:
it asserts (a) the real flight-risk feature builder passes, and (b) a
synthetic feature vector containing a protected/proxy field throws.

The flight-risk feature set is additionally a **closed allow-list**
(`FLIGHT_RISK_ALLOWED_FEATURES`): the scorer only accepts the nine named,
job-relevant signals listed there. Defense in depth: even a future bug that
tried to pass an extra field through the pipeline could not reach the model
without both passing the allow-list and failing the denylist check.

### Proxy analysis

| Candidate field | Why it was considered | Decision | Evidence basis |
|---|---|---|---|
| `tenureMonths` | Correlates with age in many workforces | **Kept**, but only as a weak, slightly negative, bounded coefficient; monitored every recalibration for drift toward an age-like pattern via the synthetic-group audit in `test:fairness` | Tenure is a direct, job-relevant fact LEADOS already needs for many other legitimate purposes (vesting, notice periods); excluding it entirely would remove a legitimately predictive, low-weight signal. We mitigate by keeping its coefficient small and reviewing it monthly. |
| `compaRatioBelowBandGap` | Pay can correlate with gender/ethnicity in orgs with unexamined pay equity issues | **Kept**, flagged for the HR pay-equity process | This is pay **relative to the person's own band**, not raw pay — it is the standard pay-equity-review metric precisely because it is normalized. Using it to flag retention risk is consistent with using it to flag pay-equity risk, which HR already does for its own purposes. |
| `name`, `home address`, `school/graduation year`, `photo`, `accent`/`first language` | Can proxy ethnicity, age, national origin, or class | **Excluded entirely** (`EXCLUDED_PROXY_FIELDS`) | These are not used anywhere in scoring and are not stored in `people`/scoring tables at all. |
| `role`/`title` | Could proxy gender in heavily gender-skewed occupations | **Not used as a flight-risk feature.** `role` is used only as a lookup key for skill requirements (succession/skills-gap), not a scored input to flight-risk. | Role-skill mapping is necessary to compute coverage; it is not treated as a predictor of an individual outcome. |
| `location` | Could proxy national origin/ethnicity in some labor markets | **Not used as a flight-risk, succession, or team-health feature** anywhere in this codebase. Stored only for operational routing (e.g. time zone display), never read by any scoring module. | Verified by `grep` over the scoring modules in `scripts/verify.ts`'s review notes; no import of `people.location` exists in `flightRisk.ts`, `succession.ts`, or `teamHealth.ts`. |

**Limitation, stated plainly:** LEADOS does not have, and does not collect,
real demographic labels for its population. That is a deliberate design
choice (see §1 above), but it means a *true* demographic-parity or
equalized-odds audit against real protected-group membership is not
possible from inside this system, and should not be — collecting
demographic data for the purpose of auditing an employee-facing risk score
is itself a decision that belongs to Legal/HR under a separate, consented,
access-controlled process (e.g. anonymous/aggregated self-ID surveys held
outside the people-analytics pipeline), not to an engineering team.

`npm run test:fairness` (see §3) therefore validates the **fairness-testing
methodology** against synthetic group labels that are generated
independently of, and never fed into, the model. This proves the pipeline
(parity/odds/calibration/error-rate computation, and the gate that fails
the suite on breach) works correctly and will catch a real breach the day
real, lawfully-collected group labels are available for a proper audit. It
is explicitly **not** a claim that the live model has been validated
against real demographic outcomes yet.

## 2. Privacy policy (role-based visibility), as implemented

Enforced exclusively in `src/lib/accessControl.ts`, called from every
repository function in `peopleIntel.ts`, `flightRisk.ts`, `succession.ts`,
`oneOnOne.ts`, `growthPlans.ts`, `skillsGraph.ts`, `orgNetwork.ts`,
`teamHealth.ts`, and `transparency.ts` — never only in a UI component.

- **Self**: own aggregate, own shared 1:1 notes/agenda, own growth plans, own
  flight-risk score, own transparency report. **Cannot** see their manager's
  private prep notes about them, and cannot see HR-only fields.
- **Manager**: direct reports' work-relevant aggregate, shared 1:1s, growth
  plans, individual flight-risk score, and succession/team aggregates for
  teams they manage. **Can** see their own private prep notes. **Cannot**
  see another manager's reports, HR-only fields, or any employee's
  transparency report (including their own reports') — transparency is
  self+HR only, specifically so a manager cannot use "show me what we know
  about you" as a surveillance channel.
- **HR**: full roster, all private 1:1 notes (duty-of-care/compliance), all
  HR-only fields, all transparency reports, and can trigger erasure. HR's
  broad access is a deliberate, declared trade-off (someone has to be able
  to act on duty-of-care concerns); the self-review below names the misuse
  risk this creates and what currently constrains it.
- **Executive**: team-level aggregates only (team health, bench strength).
  **Cannot** see any individual's flight-risk score, 1:1 notes, or
  transparency report. This cap exists specifically so a score cannot be
  used to single out a named individual outside the HR/manager process.

**Declared answer to the standing order's privacy test**: *a manager cannot
read HR-only fields*, and *an employee cannot read their manager's private
prep notes about them, even though they can read everything else about
their own 1:1 (shared agenda, shared notes, commitments)*. Both are tested
in `scripts/test-privacy.ts`.

## 3. Fairness gates (`npm run test:fairness` / `scripts/test-fairness.ts`)

All thresholds are declared here and enforced in code as hard failures.

| Metric | Threshold | Justification |
|---|---|---|
| Demographic parity difference (positive-rate gap between synthetic groups at the 0.5 decision threshold) | ≤ 0.10 | Common industry starting point (related to the "four-fifths rule" tradition in US adverse-impact analysis, translated to an absolute-difference budget appropriate for a continuous score with no automated action attached). |
| Equalized-odds gap (max of \|TPR gap\|, \|FPR gap\| across synthetic groups, against synthetic realized-outcome labels) | ≤ 0.10 | Same order of magnitude as the parity threshold; chosen so the two gates are consistent with each other and neither dominates by construction. |
| Calibration-by-group gap (max difference in actual-vs-predicted rate per probability decile, across groups) | ≤ 0.08 | Slightly tighter than the odds/parity thresholds because miscalibration directly misleads the human reading the number — this is the metric most tied to the "calibrated probability" promise in the UI. |
| Equal error rate gap (difference in overall misclassification rate at threshold, across groups) | ≤ 0.10 | Consistent with parity/odds; included because parity and odds alone can both pass while one group is simply scored less accurately overall. |

Any breach **fails the suite** (non-zero exit code) — see
`scripts/test-fairness.ts` for the assertions and
`scripts/verify.ts` for how it is wired into the overall gate.

## 4. Flight-risk model card

- **Inputs**: exactly the 9 features in `FLIGHT_RISK_ALLOWED_FEATURES`
  (compa-ratio gap below band, tenure, days since last 1:1, manager change
  in 90d, team attrition rate in 90d, growth-plan activity in 180d,
  commitment follow-through rate, months since last skill evidence,
  promotion-gap placeholder — currently always 0, see code comment).
- **Method**: fixed-coefficient logistic regression (`MODEL_COEFFICIENTS`),
  **not** trained from this deployment's own outcome data yet — coefficients
  are an explicit, documented starting point pending enough realized
  outcomes to refit responsibly. Refitting (`src/lib/scheduler/recalibration.ts`)
  only ever uses `attritionOutcomes` (did this person leave, voluntarily, in
  the window) — never demographic data, by code contract (same
  `assertNoProtectedFeatures` call path).
- **Causality**: **none claimed.** All drivers and counterfactuals carry
  `causalStatus: "association"`. UI copy is scanned by
  `scripts/scan-causal-language.ts` for banned causal phrasing ("causes",
  "will leave", "due to", etc.) — see `src/lib/causalLanguage.ts` for the
  full rule set (Part 05).
- **Uncertainty**: the credible interval is a **documented heuristic**
  (narrower with more underlying observations), not a sampled Bayesian
  posterior. This is stated in the `uncertaintyNote` of every
  `Explain<number>` the model returns and is intentionally conservative.
- **Decision rights**: decision support only. No automated action (e.g.
  auto-flagging to a manager, auto-triggering a retention offer) is wired to
  this score anywhere in the codebase.

## 5. Org-network hard rule (Part 09-F)

`src/lib/orgNetwork.ts` and the `collaborations` table are **metadata
only**: who interacted with whom, in which closed-enum category
(`meeting | review | project | one_on_one`), when, and for how long. There
is no content/body/subject/transcript column, and
`assertMetadataOnlySchema()` fails the verify suite if one is ever added.
This module must never be extended to ingest free text, message bodies, or
calendar event titles/descriptions.

## 6. What this view deliberately does not claim

`HighPotentialView.tsx` reports skill-coverage toward a different role from
declared+observed evidence only. It does not claim to measure ambition,
leadership "presence", communication style, or any trait LEADOS has no
evidence for, and does not use a single composite "potential" score.

## 7. What was deliberately NOT done in Part 09

- No real demographic data is collected or used (see §1's limitation).
- No sentiment/NLP analysis of 1:1 notes, messages, or any free text —
  signals are strictly structured events/metadata.
- No automated adverse action (PIP triggers, auto-termination flags, etc.)
  is wired to any score.
- The Part 07 scheduler integration is a seam
  (`src/lib/scheduler/recalibration.ts` + a manual trigger route); the
  actual unattended cron/queue infrastructure is out of scope for this part
  and documented as Part 07's responsibility.
- The Part 11 playbooks engine is a seam (`src/lib/playbooksSeam.ts`) with
  illustrative, clearly-labeled-as-illustrative content; the real
  evidence-graded intervention catalog is Part 11's responsibility.
