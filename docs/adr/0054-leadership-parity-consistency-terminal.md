# ADR-0054: The Leadership Parity & Standard Consistency Terminal — LMX disparity decomposition, promise reliability, and intra-leader threshold audits

- **Status:** Accepted
- **Date:** 2026-10-31
- **Session:** 91 (Schema v65)

## Context

Every performance, coaching, and people-analytics suite in the market (Lattice, Culture Amp, Betterworks, 15Five, Leapsome, Visier, Workday) treats fairness and calibration as a **post-hoc cross-manager exercise**: ratings are collected once or twice a year, compared across managers or demographic cohorts, and smoothed in a calibration room after the working period has already closed. Inside a single team during the working year, no category tool audits the **leader's own dyadic allocation, promise reliability, and evidentiary consistency** across their own records.

Meanwhile, LeadOS already holds the dated primary records where intra-leader disparity and standard drift actually occur across ten modules: 1:1 cadence and reschedule/skip history (`oneOnOnes`), SBI feedback specificity and latency (`feedback`), outcome delegation authority (`delegations`), public/logged recognition (`recognition`), GROW commitments and review deferrals (`growthPlans`), 30-60-90 onboarding check-in promises (`onboarding` / `managerSupport`), succession nominations and behavioural evidence (`readiness`), formal performance-concern thresholds (`performanceConcerns`), and period review assessments (`reviews`). Sessions 88, 89, and 90 explicitly flagged the missing cross-concern and intra-leader consistency audit as the highest-value unbuilt screen in the workspace.

The design challenge is strict:

1. **Grade the leader's consistency, never the employee.** No person may be scored, ranked, or labelled as "low-LMX" or "underperforming." Every metric must describe the leader's allocation of scarce managerial capital, the leader's fulfillment of recorded promises, or the leader's consistency in applying evidentiary bars.
2. **Zero protected-attribute collection or inference.** LeadOS does not store demographic attributes, scrape messages, or infer sentiment. Structural decomposition must operate strictly over declared job/ramp facts already in the workspace (`level` and active `onboarding` ramp state), keeping unrecorded fields explicitly unclassified rather than guessed.
3. **Separate legitimate role variety from unexplained peer disparity.** Giving a Day-20 joiner weekly 30-60-90 check-ins is functional scaffolding (*LMX Variety*, Buengeler, Piccolo & Locklear 2021), whereas concentrating 80% of stretch `own`/`act-inform` delegations and recognition onto two peers in the same steady-state cohort is status concentration (*LMX Disparity*).
4. **Refuse arithmetic below honest sample floors.** Inequality indices on two people, dispersion across one formal plan, or rank concordance on two reviews are statistical theatre and must be refused with plain-English reasons while still printing the underlying raw counts.

## Decision

We introduce the **Leadership Parity & Standard Consistency Terminal** (`#/parity`, Schema v65, CSV scope #55), implemented across decoupled pure domain, schema, post-commit automation, modal, and view modules:

### 1. Multi-Channel LMX Allocation & Exact Theil Decomposition (`app/core/domain/parity.js`)

Over a configurable rolling window (`parityWindowDays`, default 90 days) with exact tenure-overlap proration per active person and an early-ramp floor (`parityRampFloorDays`, default 14 days), the engine measures four natural-unit channels of managerial capital per 30 active days — **never collapsing them into a single composite "fairness score"**:

- **Conversational presence (`coaching`):** held 1:1 rate per 30d weighted by schedule reliability (`1 - skipOrMoveShare`), alongside raw held/skipped/moved counts and overdue days.
- **Developmental specificity (`feedback`):** dated feedback items in window weighted by SBI specificity (`1 + sbiScore / 4`), tracking praise-vs-constructive symmetry and observation-to-discussion latency.
- **Stretch authority (`authority`):** active and in-window completed delegations weighted by decision boundary (`recommend = 1`, `agree = 2`, `act-inform = 3`, `own = 4` from `DELEGATION_AUTHORITY`).
- **Sponsorship & growth (`sponsorship`):** logged recognition in window plus active GROW `will` actions backed by a delegation plus active succession nominations.

When at least `parityMinTeam` (default 3) post-ramp active people exist and channel volume is positive, each channel reports:

- **Finite-sample-corrected Gini (Gini 1912):** $G = \min\!\left(1,\, \frac{\sum_i \sum_j |x_i - x_j|}{2 n^2 \bar{x}} \cdot \frac{n}{n - 1}\right)$, avoiding the small-team downward bias of the uncorrected population formula.
- **Zero-safe Atkinson index at $\varepsilon = 0.5$ (Atkinson 1970):** $A_{0.5} = 1 - \frac{1}{\bar{x}}\left(\frac{1}{n}\sum_{i=1}^n \sqrt{x_i}\right)^2$, remaining exact when individual channel allocations are zero.
- **Additive Theil $T$ entropy decomposition (Theil 1967; Buengeler et al. 2021):** $T = T_{\text{between}} + T_{\text{within}}$ across structural cohorts (`level × ramp state`, with $0\ln 0 \equiv 0$), explicitly partitioning total dispersion into structural role/ramp **Variety** ($T_{\text{between}}$) and unexplained within-cohort **Disparity** ($T_{\text{within}}$).
- **Structural Fringe ("Invisible Zone") detection:** identifies post-ramp active team members who simultaneously experience overdue or $\ge 50\%$ skipped/moved 1:1s, zero feedback in window, and zero stretch (`act-inform`/`own`) delegations or recognition while at least one peer receives multi-channel investment.

### 2. Psychological Contract & Leader Promise Reliability Ledger

Drawing on psychological-contract breach theory (Rousseau 1989, 1995; García-Selva et al. 2025), the engine harvests **only promises owed by the leader**: `oneOnOnes[].actions` with `owner` in `['leader', 'shared']`, `managerSupport` commitments from 30-60-90 check-ins, leader-owed `feedback` follow-ups (`followUpOn`), and deferred `growthPlans` review dates (`reviewDeferrals`). Per person (including early-ramp joiners, whose onboarding promises matter most), it computes fulfillment rate with **Wilson (1927) 95% score intervals**, carry-forward chains ($\ge 2$ carries), dropped promises, and 1:1 skip concentration, surfacing `promiseGapPp` (the spread between highest- and lowest-served reports among those with $\ge 2$ due promises).

### 3. Intra-Leader Standard Consistency & Noise Audit

Applying Kahneman, Sibony & Sunstein's (2021) intra-judge pattern/occasion noise framework and Leventhal's (1980) consistency rule across three evaluative thresholds:

1. **Performance Recovery Bar (`concernConsistency`):** across `performanceConcerns` with adopted plans (`plan.adoptedOn`), compares pre-adoption specific observation count, distinct dates, days from opening to plan adoption, recorded support count, and written override usage (`overrideReason`). Refused below 2 adopted plans; otherwise reports range, median absolute deviation (MAD), and override asymmetry.
2. **Succession Sponsorship vs. Behavioural Evidence (`readinessConsistency`):** compares `readiness` nominations (`ready-now`, `ready-later`) against the 5-signal behavioural rubric in `readiness.js` (`assess`), flagging **halo nominations** (nominated with $< 3$ evidence signals while a peer holds $\ge 4$) and **overlooked bench** ($\ge 4$ behavioural signals and zero nomination while a lower-evidence peer is nominated).
3. **Review Evidence-to-Rating Concordance (`reviewConsistency`):** across reviews with a recorded `REVIEW_RATINGS` ordinal, compares rating rank against recorded period evidence (goal progress, completed autonomous delegations, net SBI specificity) via **Kendall's $\tau_b$**, exact discordant pairs within comparable cohorts, and **recency share** (share of dated review evidence falling in the final 25% of `[periodStart, periodEnd]`, flagging $> 65\%$ peak-end/recency concentration). Refused below 3 rated reviews.

### 4. Prescriptive 14-Day Rebalancing Solver, Frozen Audits, & Spine Rules (`RULE-PAR-01..05`)

- **Counterfactual Rebalancing Planner (`planParityRebalance`):** given a bounded 14-day coaching/follow-through hour budget, evaluates candidate leader actions (holding overdue 1:1s, closing overdue leader promises, logging missing SBI observations, rebalancing stretch delegation concentration, auditing discordant bars) by greedy marginal reduction in within-cohort Theil $T_{\text{within}}$ and promise debt, reporting exact before/after metrics.
- **Persisted Schema v65 (`paritySchema.js`):** adds `parityAudits` (frozen baseline snapshots with a future `reviewOn` date and optional `predictedImprovementPct` graded once via Brier 1950 after `reviewOn`, capped at 60) and `parityMarkers` (idempotency markers capped at 400), plus clamped `parity*` settings and an additive `64 → 65` migration that invents zero historical audits.
- **Typed Graph & Post-Commit Rules (`parityRules.js`):** registers entity type `parity` (`parityAudits`) and system/operational relations `rebalances-attention`, `audits-consistency`, and `repairs-contract`. `parityRule` runs on `DEFAULT_POST_COMMIT_RULES` **before `decisionTempoRule`**:
  - `RULE-PAR-01`: opens at most one DACI standard-calibration decision per ISO week when cross-concern override/threshold inconsistency, succession halo-vs-overlooked inversion, or review rank discordance is present, linked via `audits-consistency`.
  - `RULE-PAR-02`: on scan or audit freeze, queues one idempotent blameless leader reflection prompt and one leader-owned follow-through task per Structural Fringe report (up to `parityMaxTasksPerScan`), linked via `rebalances-attention`.
  - `RULE-PAR-03`: opens one leader-owned recovery task when a report's leader-promise ledger breaches the reliability floor ($\ge 2$ overdue/carried leader promises), linked via `repairs-contract`.
  - `RULE-PAR-04`: appends one blameless growth/sponsorship 1:1 prompt for overlooked high-evidence bench members so quiet delivery is reviewed before succession seats lock.
  - `RULE-PAR-05`: reconciles stale parity edges and opens one grading task when a frozen parity audit passes `reviewOn` ungraded.

## Consequences & Explicit Refusals

- **Zero employee scoring or ranking:** every row and CSV column describes leader allocation, leader promises, or process thresholds. CSV scope #55 (`parity`) exports opaque channel/audit codes (`CH-*`, `PA01..`) with zero person names, person IDs, concern titles, or free-text notes.
- **Hard privacy wall preserved:** `conflicts` and `pulses` are never read by `parity.js` or `parityRules.js`.
- **Hard statistical refusals:** Gini/Atkinson/Theil refused below `parityMinTeam` ($\ge 3$) or when channel volume is zero; cross-concern dispersion refused below 2 adopted plans; Kendall's $\tau_b$ refused below 3 rated reviews; Brier calibration average withheld below 5 graded audits; joiners under `parityRampFloorDays` protected from deficit flags.
- **Not legal or HR compliance advice:** structural cohort decomposition uses job level and ramp state only, never protected classes or disparate-impact legal tests.
