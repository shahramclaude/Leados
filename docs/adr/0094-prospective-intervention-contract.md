# ADR-0094 — The Prospective Intervention Contract (Schema v97)

**Status:** Implemented, 2026-11-05 (Session 134).
**Route:** `#/prospective` · **Rules:** `RULE-PIC-01..04` · **CSV:** scope #92 `prospective-contracts`
**Altitudes:** frontline lead → manager → director → VP/executive → CEO/chief (all five, one instrument, five different jobs)

## 1. The gap this closes

The workspace already had a decision system of record (decisions, premises, forecast challenges, a graded calibration ledger) and a hierarchy-native graph. What it did **not** have was a way to say, *before doing the work*, "here is exactly what I expect to happen, over exactly these records, by exactly this date" — and then have the machine grade that statement later **without letting anyone re-select the population, reinterpret the outcome or claim causality**.

Every retrospective "were we right?" report is vulnerable to hindsight: the population quietly becomes the cases that closed, the threshold becomes the number that was achieved, and the narrative becomes the reason it was inevitable. A decision journal that stores what was decided, why and with what result (Cloverpop Decision Bank, Aera Decision Data Model) is necessary but not sufficient: it records the *decision*, not a **frozen, falsifiable probability over a frozen cohort**.

The competitive hunt ([RESEARCH.md](../../RESEARCH.md), 2026-11-05) found the ingredients scattered across categories: enterprise performance/people-analytics tools (Lattice, Culture Amp, Betterworks, Workday Peakon, Leapsome, 15Five, Valence, Visier/Vee, ChartHop, One Model) sell predictive attrition, NLP review drafts and calibration prompts; forecasting research (Tetlock's Good Judgment Project, *Superforecasting*, Foresight Arena's commit–reveal + Brier/Alpha proper scoring, ForecastBench) formalises disciplined probability and out-of-sample grading; org-chart-aware platforms (OrgVue, ChartHop, Visier, SAP SuccessFactors, Nakisa) model hierarchy-scoped permissions, governed snapshots and roll-up/drill-down. **No surveyed product was shown to combine all three** — a pre-registered probabilistic cohort, a proper score against a strictly-prior base rate, and a hierarchy-native roll-up of the calibration signal — inside the same zero-build leadership workspace. This ADR ships that combination.

## 2. Decision

Add a **Prospective Intervention Contract**: a frozen pre-registration is a first-class graph node, separate from the governed operational work it authorises and separate from the once-only grade that judges it. All three are produced/extended by the **same shared post-commit rule spine** already used by every other module. Altitude is not a second architecture; it is a dimension of the same seat scope, rule fan-out and disclosure compiler.

### The frozen claim

`prospectiveContracts` stores, at declaration: `id`, `title`, `declaredOn`, `horizonOn`, `scopeSeatId`, `altitudeKey`, `rank`, `instrumentKey`, `probabilityPct`, `thresholdPct`, `cohortN`, `cohortIds` (the **exact sorted record ids**), `cohortFingerprint`, `engineVersion`, `createdAt`. There is deliberately **no status field**: gradedness is derived from the grade ledger, so a contract cannot claim to be resolved without a grade.

Four observable instruments, each read **only** from collections other modules already own — the ledger writes into none of them:

| Instrument | Collection | Terminal state | Written by |
|---|---|---|---|
| `case-resolution` | `cases` | closed/resolved with `resolvedOn ≤ horizonOn` | Case lifecycle |
| `delegation-closure` | `delegations` | `done` with `completedOn ≤ horizonOn` | Delegation actions |
| `decision-review` | `decisions` | `reviewedOn ≤ horizonOn` | Decision review |
| `oneonone-cadence` | `people` | a held 1:1 in `(declaredOn, horizonOn]` | 1:1 actions |

This is the pre-registration discipline from clinical-trial registries and the Good Judgment Project: the population, probability, threshold and horizon are fixed **before** any intervention work exists. A cohort below the declared evidence floor, above the bounded cap (60) or with no eligible records is **refused**, not scored.

### The once-only grade

`prospectiveGrades` is append-only, one row per contract, normalised fail-closed (a duplicate id, duplicate `contractId`, malformed outcome or unknown instrument is dropped with a warning). At the horizon, `resolveOutcome` reads the frozen ids back from their owning collections. It refuses:

- a missing cohort member (no silent "0 of 4");
- an undated terminal event (no inference from status alone);
- a terminal event after the horizon (a late success is **not** a hit);
- any outcome before the horizon is reached.

The declared threshold is compared with **exact integer arithmetic** `reachedN * 100 >= thresholdPct * observedN`, so float rounding cannot decide whether the bet was met. The score is the **Brier proper scoring rule** `(p − y)²`. Brier skill is published **only** against each cell's own **strictly-prior** sequential base rate (`prospectiveBaseRate`), so no cell's skill is flattered by its own first trials; below the declared prior floor the reference and the skill are refused (`null`), never zero.

`prospectiveMarkers` is the rules' idempotency ledger. Refused figures are printed as `withheld`/BLANK with a reason; every pooled rate carries a **Wilson (1927) score interval**; pooled rates are withheld below the declared cell floor **and** below director rank; a sub-floor cell blanks its smallest surviving sibling (complementary suppression) so the group total cannot be subtracted to recover it. A refused or suppressed figure in CSV scope #92 is BLANK, never `0`.

### The shared spine: `RULE-PIC-01..04`

Registered in `DEFAULT_POST_COMMIT_RULES` after `differencingRule` and **before** `attentionMarketRule`, `successionRule`, `seatRule` and `sealRule`, so everything it opens is priced, certified, rolled up and sealed in **one atomic transaction**.

- **RULE-PIC-01 DECLARE.** One `prospective.declared` event → one governed DACI decision (the approved operational work, kept deliberately separate from the frozen numeric assumptions — `chosen: ''`, `outcome: 'pending'`, human resolves it), one owned and dated outcome-evidence task, one `pre-registers` edge to that decision, one `tracks-followup` edge to that task, and **one `rolls-up-to` edge per leadership ancestor** of the declaring seat. Cross-module propagation and cross-altitude roll-up are literally one write.
- **RULE-PIC-02 GRADE.** On an explicit `prospective.scan` (or an automatic pass when `prospectiveAutoPropagate` is on), each due, resolvable contract in the acting seat's scope gets exactly one immutable grade, a `grades-outcome` provenance edge and the same vertical fan-out. An unresolvable cohort is **refused loudly**, with one owned reconciliation task and a weekly `ungradable` marker — never scored as a miss, never a silent no-op. Bounded to 40 grades per commit; the remainder is carried forward with a printed note.
- **RULE-PIC-03 CALIBRATE.** A cell `(altitude × instrument)` whose Brier skill is below the declared floor, with enough graded evidence to publish, opens **one** governed calibration decision per cell per ISO week at the altitude that can change the practice. The engine never adjusts a declared probability and never rates a person.
- **RULE-PIC-04 OVERDUE.** A contract past its horizon plus review window with no grade opens **one** governed outcome-integrity decision per ISO week. Waiting is never a silent dismissal.

All four are marker-idempotent and pausable via the reviewed settings convention; an explicit scan always runs. `propagationContracts.js` declares the writes, and `tests/app/propagation-ledger.test.mjs` refuses an undocumented default rule.

### Altitude is a dimension, not a second system

`PROSPECTIVE_PLAYBOOK` gives five distinct jobs, horizons (Jaques' time-span of discretion: 7–14 days at the frontline → 90–365 days at the chief), questions, permitted actions and hand-ups. The **same record** renders differently:

- **Frontline:** own contracts and their frozen cohorts; no calibration rate is published at this rank.
- **Manager:** bets in the unit, grade counts, unobservable cohorts, open calibration findings; pooled rates still withheld.
- **Director:** unit-level calibration cells with intervals, complementary suppression, the conventions it may set.
- **VP/executive:** portfolio-level Brier skill, the governed findings it owns, an identity-free upward brief.
- **CEO/chief:** enterprise calibration posture, overdue/unobservable totals, one certificate that never names a person.

Above rank 2 the contract **title** is blank; the general-purpose graph resolver (`cases.js`) projects only ids, counts, dates and state names — never a title, cohort id, person name or amount. `RECORD_POLICIES` sets `detailCeiling: 0` on all three ledgers, so raw rows never enter declared-seat view state; the scoped report is the only reader. A peer sibling span reads zero contracts (subtree scope, not a shared dashboard).

## 3. Frameworks, named and applied

| Framework | Where it is computed |
|---|---|
| Pre-registration / cohort freeze (trial-registry discipline) | `freezeCohort`, `cohortFingerprint` |
| Brier (1950) proper scoring rule | `brierFor`, `resolveOutcome` |
| Good Judgment Project / Tetlock *Superforecasting* — disciplined probability, resolution, base rates | declaration validator, `prospectiveBaseRate` |
| Foresight Arena commit–reveal, Brier + Alpha as proper scores; ForecastBench reference skill | frozen claim + strictly-prior reference |
| Wilson (1927) score interval | `wilsonInterval`, coverage/cells |
| Jaques' time-span of discretion | `PROSPECTIVE_ALTITUDE_HORIZONS`, playbook |
| Ashby/Beer requisite variety | altitude × instrument cells and rank floors |
| Goldratt's Theory of Constraints (one named binding constraint) | one governed finding per cell per week |
| Statistical disclosure control: small-cell floors, complementary suppression, fail-closed refusal | `buildProspectiveCells`, disclosure manifest, CSV #92 |
| Cloverpop Decision Bank / Aera Decision Data Model (decision system of record) | what is deliberately *extended*: from "what was decided" to "what was expected, over whom, and was it calibrated" |

## 4. Persistence and safety

Additive `MIGRATIONS[96]` (`96 → 97`): three empty collections and five declared, clamped settings (`prospectiveEvidenceFloor 3`, `prospectiveCellFloor 4`, `prospectiveSkillFloorPct 10`, `prospectiveReviewDays 14`, `prospectiveAutoPropagate true`). An upgraded workspace opens with **no contracts** — that means "no bet has been frozen here yet", which is a different and honest claim from "a bet was frozen and missed". No probability, cohort, outcome or score is inferred from pre-existing cases, delegations, decisions or 1:1s.

Fail-closed normalizers drop malformed contracts, duplicate grades and inconsistent markers with warnings. `guardApi` declares `declare-prospective` (rank 1–5) as the right for the three commands; the four pure reads are `SAFE_READS`; an unknown method still fails closed, and `prospectiveSetConventions` additionally enforces director+ inside the action. No new dependency, no network call, no framework swap, no main-thread blocking: the arithmetic is O(cohort + grades) and synchronous in the existing atomic store write.

## 5. Verification

`tests/app/prospective.test.mjs` (16/16) proves a **real** `createApi → createStore → shared rule → persisted state** transaction: one declaration writes one decision, one task and three ancestor edges; a director reads the aggregate while a peer branch reads nothing; a due cohort closed by the case module produces one Brier grade (0.09 for a 70% bet that hit) with its own vertical fan-out; a second scan writes nothing; a deleted cohort member refuses the grade and opens owned reconciliation work; reload preserves every edge with no repair warnings; the brief, CSV #92 and all five panels at four altitudes contain no name, title, cohort id, `undefined` or `NaN`.

## 6. Honest limits

- Local Operating Seats are auditable workspace declarations, **not** authentication or server-side tenancy. No PKI, no network, no cross-workspace identity.
- A grade says only **that the declared threshold was reached**. It is **not** a causal estimate, not an intervention effect, not a person rating and not a performance score.
- The four instruments are deliberately coarse: they read status and dates only, not quality, sentiment, effort or outcome value.
- Brier skill needs a strictly-prior base rate; a new cell publishes counts only. Small-cell suppression is **not** differential privacy, and the differencing register does not yet govern these releases (see ROADMAP).
- The audit was targeted, not a line-by-line read of every source file; the full app under a real browser, all release channels and exhaustive permission walkthroughs remain **[UNVERIFIED]**.
- Vendor capability claims come from web-search excerpts, not installed products or independent audits. No market-first or comparative-efficacy claim is made.
