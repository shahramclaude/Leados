# ADR-0231 — Integrated Business Plan (S&OP) Cycle Register: five reviews, an unconstrained demand plan, demonstrated capacity, the counted gap, costed options and one approved plan whose residual is owned

- **Status:** accepted and **shipped** — domain kernel, actions, seat rights, `#/ibp` route, CSV scope #172, schema v184 and the `RULE-IBP-01` spine rule are all wired on this branch.
- **Date:** 2026-11-16
- **Deciders:** Director declares the cycle (rank 3+). Manager records demand and capacity on a line they hold (rank 2+). Director frames costed options (rank 3+). VP/chief approves the plan (rank 4+) and is refused if they framed the options. Director grades the demand plan (rank 3+). Read is rank 2–5, narrowed to a line the seat holds.
- **Schema:** **v184** (v183 → v184). Seven new collections, all empty at upgrade: `ibpCycles`, `ibpDemandRows`, `ibpCapacityRows`, `ibpOptions`, `ibpDecisions`, `ibpGrades`, `ibpMarkers`. Nothing is inferred from a budget, a target, a headcount or a rota. No gap, residual, verdict or contention figure is **stored** — every one is re-derived on read by `ibp.js`, so a hand-edited file cannot carry a reconciliation its own rows do not imply.
- **Surface:** route `#/ibp`, view `app/views/ibp.js`, CSV scope `integrated-business-plan` (#172), actions `ibpDeclareCycle`, `ibpWithdrawCycle`, `ibpRecordDemand`, `ibpRecordCapacity`, `ibpFrameOption`, `ibpApprovePlan`, `ibpGradeDemand`, plus `buildIbp`, `ibpAttentionCount`, `ibpCsvRows`.
- **Code:** `app/core/domain/ibpRegistry.js` (closed vocabulary: steps, capacity kinds, option levers, verdicts, states, rights, limits, method), `ibpSchema.js` (fail-closed normalizers and the exact integer kernel), `ibp.js` (pure reader `buildIbp`, `resolveIbpAuthority`, `ibpAttentionCount`), `ibpActions.js` (seven human acts and a scan), `ibpRules.js` (`RULE-IBP-01`), `ibpCsv.js` (CSV #172).
- **Tests:** `tests/app/integrated-business-plan.test.mjs` (28, all passing) — see §Verification.
- **Rule:** `RULE-IBP-01` (post-commit spine, pause switch `ibpAutoPropagate`, marker-idempotent per `ibp1:<kind>:<cycleId>` signature)
- **Builds on:** ADR-0075 (command chain), ADR-0076 (operating seat), ADR-0008 (post-commit rules hook), ADR-0140/ADR-0141 (matrix accountability), ADR-0182 (automation pause permit register), NORTH_STAR (bulletproof reliability, matrix mandate, competitive benchmark).

## Context

Sales & Operations Planning is the single most standard cross-functional planning duty a director or VP owns. It originated with Oliver Wight and Richard Ling (*Orchestrating Success*, 1988) and its shape has not changed in nearly forty years: five reviews in a fixed order — portfolio, demand, supply, reconciliation (pre-S&OP), executive — each producing the decision the next depends on, ending in one approved operating plan that every function works from until the next cycle.

The repository had **no trace of it**. A grep over all 736 domain modules and all 245 ADRs for `S&OP`, `sales and operations`, `consensus plan`, `demand plan`, `supply review`, `demand review`, `plan of record`, `unconstrained`, `frozen zone`, `time fence`, `available-to-promise`, `forecast accuracy` and `consensus forecast` returned zero hits against any planning-cycle capability. What existed was adjacent and *not* the same duty:

- `matrixDemandVariance` measures how much **decision queue** demand a line carries against a declared ceiling — an intake question, not a product-volume question.
- `supply.js` carries an **evidence-supply plan** — a plan to obtain evidence, unrelated to manufacturing supply.
- `forecastIntegrity` holds calibration over five forecast ledgers (Brier, reference-class, conformal bands) but does not record a consensus demand plan for a period, and does not reconcile one against capacity.
- `earnedValue` and `valueBridge` measure delivery and value, not what the business commits to sell and make next month.

So a director could not answer the question the cycle exists to answer: *what will this business commit to sell and make, what does our own line actually demonstrate it can produce, what is the gap, what does it cost to close, and who has accepted what is left unserved?*

The duty is also irreducibly **matrix**. The demand owner and the supply owner are almost never on the same reporting line — that is the whole reason the gap has no single manager and has to be escalated. A register that let either line approve on the other's behalf would reproduce the exact failure the process exists to prevent.

## Decision

1. **Five reviews, one plan, and the documented failure modes as printed verdicts.** The cycle carries the canonical five steps in `ibpRegistry.js` with their real accountable owner and their real output. The published practitioner literature is unusually consistent about *how the cycle breaks*, and every one of those failures is a **record** failure, so each becomes a verdict the reader computes rather than a warning it hopes for:

   | Verdict | The failure it names |
   |---|---|
   | `no-demand` | A cycle opened with no consensus demand plan on any month |
   | `demand-constrained` | The consensus was shaved to capacity in step two while the statistical baseline asked for more — the constraint is hidden until it bites |
   | `theoretical-capacity` | No demonstrated figure is on the record; the plan rests on nameplate or a claim |
   | `target-substituted` | The consensus equals the commercial target and differs from the baseline, so the sales target is standing in as the demand plan |
   | `reconciliation-open` | The gap is quantified and no costed option has been framed against it |
   | `escalation-open` | Options are framed and no executive has approved a plan with that residual |
   | `plan-approved-with-residual` | The plan was approved **with** a declared residual — an honest part-served plan |
   | `plan-approved` | The plan was approved and its residual is zero |

   Precedence is declared once in `IBP_VERDICTS` with an explicit `rank`, so the panel, the rule and the CSV cannot disagree about which verdict wins.

2. **Baseline, target and consensus are three separate stored figures.** This is the load-bearing design choice. A target is a wish with a bonus attached; a demand plan is what the market will take. Storing them apart and printing them side by side makes `target-substituted` *computable* instead of a matter of opinion, and makes the commercial adjustment behind a consensus a required part of the record.

3. **Capacity is evidence only when it is demonstrated.** A `demonstrated` claim must carry a real observation window of at least 28 days inclusive; a shorter window is refused at the door as an impression. A `theoretical` figure is **accepted, carried and printed** — the register refuses to *believe* it, not to record it — and any cycle relying on one reads `theoretical-capacity` with its gap **withheld rather than computed**. A gap printed against an unobserved number would be the most dangerous kind of false reassurance this system could produce.

4. **The reconciliation is exact integer arithmetic, and the residual is a separate figure from the gap.** Plan units are whole units: a fractional unit is refused rather than rounded, because a rounded plan is a different plan and its residual is a different residual. Money is whole cents parsed in `BigInt`, with a third decimal place refused. The **gap** is `consensus − demonstrated capacity`, signed and per month. The **residual** is what remains after the framed options are applied: `max(0, gap − capacity added − demand removed)`. The gap does not move when an option is framed; the residual does. A plan that closes to zero and a plan that honestly does not are printed as two different verdicts.

5. **"The figures add up" and "the printed figures are the computed figures" are two different claims, reported apart.** `totalReconcile` is a claim about arithmetic: each printed total equals the sum of its printed months. `figuresComplete` is a claim about completeness: no row was dropped, no option fell outside the declared horizon, and every printed figure is an exact integer. They are separate fields, printed as separate sentences, and neither is allowed to stand in for the other.

6. **The owner of a gap is computed from the graph, never chosen by the actor.** `resolveIbpAuthority` walks from the joint apex of the *demand* line and the *supply* line up to the nearest seat at rank ≥ 4. A director is walked past, never promoted — a branch whose graph holds no such seat prints `no-authority-at-rank` and the register prints the executive step as **owed** rather than inventing an approver. A genuine diamond (two joint apexes) files one ask per apex.

7. **Shared demonstrated capacity is summed, not compared per cycle.** Two cycles drawing on the same supply line in the same month consume the same capacity. The reader groups every live cycle by `(supply line, month)`, sums their consensus demand, and prints the contention against the **line and the month** — never against a person. Where two cycles declare *different* capacity figures for the same line-month, the conservative (smaller) figure is used and the disagreement is a printed fact.

8. **Seven human acts, each a refusal door.**
   - `ibpDeclareCycle` (rank 3+): title ≥ 12, three-letter currency, horizon 1–36 months, a written basis ≥ 24, an owner on the roster, and both lines must resolve on the reporting graph. A live duplicate title is refused because two live cycles for one plan would double-count its capacity.
   - `ibpWithdrawCycle` (rank 3+): final and dated, restricted to a seat that holds the cycle; a withdrawn cycle accepts no new figures and never reopens.
   - `ibpRecordDemand` (rank 2+, must hold a line): three whole-unit figures, one row per cycle-month.
   - `ibpRecordCapacity` (rank 2+, must hold a line): declared provenance, one row per cycle-month, a demonstrated claim needing a ≥28-day window.
   - `ibpFrameOption` (rank 3+): a declared lever, a positive whole-unit effect on exactly one side, an exact whole-cent cost, one row per (lever, month).
   - `ibpApprovePlan` (rank 4+): the seat must hold the computed authority above both lines, must not have framed any option on the cycle, approves once, and must state the residual being accepted plus who is served first and what service consequence is accepted. The acknowledged residual is compared with the computed one and a difference is **printed as a disagreement**, never reconciled.
   - `ibpGradeDemand` (rank 3+): one grade per cycle-month, against a consensus that already exists, so the consensus is never rewritten after the result is known.

9. **`RULE-IBP-01` files asks and never edits a plan.** Five conditions from one reader: demand owed (→ process owner), supply owed (→ the **supply line's own manager**, whose duty the feasibility test is), reconciliation owed (→ process owner), executive owed (→ the computed seat above both lines, or the workspace apex), a residual disagreement (→ the approver), and a passed review date (→ owner). Asks are `act-inform` delegations with typed `issues-obligation` provenance, idempotent per (signature, addressee), self-closing when the condition clears or moves, bounded at 4 per commit with the remainder counted, and pause-governed on every path including the explicit scan. **The ask text is deliberately opaque** — no product family, no customer, no volume, no currency — because a delegation is readable above the addressee.

10. **CSV #172 is identity-free by construction.** Built from the same reader the panel renders, with the seat cleared, so an exported figure is provably the figure that was printed. Rows are: one summary, one per cycle state, one per verdict, one per step and one per currency. No cycle title, id, product family, owner, manager, supply line name, basis, note or reason crosses the boundary. An uncomputable figure is BLANK with its reason, never a zero.

## Consequences

- The five-step cycle now has a dated, named, append-only record from the first month of the horizon to the executive signature. A cycle cannot be "run" without the demand plan, the capacity evidence, the counted gap, the priced options and the owned residual existing somewhere on the record.
- **A gap can never be printed against a figure nobody observed.** This is the sharpest reliability win: the most plausible way to approve a plan that cannot be delivered is to compare demand against nameplate capacity, and that is now structurally impossible — the register withholds the gap instead.
- The demand owner and the supply owner cannot approve each other's plan, and the seat that framed the trade-off cannot approve it. Both refusals are enforced in the action, not merely documented.
- Two plans that each fit against a shared line can no longer both be approved silently; the contention is a printed figure against the line.
- Every verdict maps to a published failure mode, so the panel teaches the process while it reports on it.
- Nothing derived is stored: a hand-edited file or a partial reload cannot carry a residual, a gap or a verdict that its own rows do not imply.

## Deliberately absent

- **No forecasting algorithm.** The register records the consensus human beings agreed and grades it. Producing the statistical baseline is the demand-planning tool's job, and pretending otherwise here would be a model with no history behind it.
- **No capacity inferred** from headcount, a rota, a shift pattern or a vendor catalogue.
- **No currency conversion**, no FX policy and no pooling.
- **No automatic approval**, no automatic plan change and no write to any ERP, planning or scheduling system.
- **No per-person performance signal** from a plan outcome, a forecast error or a residual. Every finding is about a plan, a line, a month or a pair of lines.

## Remainder

None claimed. The slice is complete: schema v184 with an additive migration and seven fail-closed normalizers, six domain modules, seven seat-checked acts with every refusal door, six rights mapped through the access gateway with `SAFE_READS` entries, the `RULE-IBP-01` spine rule with pause governance and a propagation contract, CSV #172, the `#/ibp` route with a four-tab panel and six dialogs, the nav entry with a badge counter and document title, and a production method figure. Real-browser and assistive-technology walkthroughs remain `[UNVERIFIED]` for this slice, as for every slice in this repository — the panel is verified through jsdom text assertions against the reader, not through a browser.

## Benchmark

**`[BENCHMARK-UNVERIFIED]`** — no S&OP platform was run side by side. The bar was taken from published vendor documentation, 2026 buyer's guides and the practitioner literature (Oliver Wight; APICS/ASCM CPIM rough-cut capacity planning; Makridakis, Wheelwright & Hyndman on forecast bias versus error):

- **Category leaders** (Kinaxis Maestro, o9 Digital Brain, SAP IBP, Blue Yonder Luminate, Anaplan, OMP, RELEX, ToolsGroup, John Galt Atlas) all sell the same functional core: a consensus demand plan, constrained supply planning, scenario simulation, an executive dashboard with gap-to-target, and a decision log.
- **The 2026 buyer's guides** converge on the same differentiators: one shared demand number, an unconstrained plan before the supply test, demonstrated rather than theoretical capacity, costed options with a service consequence, and a decision record rather than minutes.

On that bar this register **matches** the governance and reconciliation layer on five checkable dimensions:

1. **The five-step cycle with the canonical outputs** — portfolio, demand, supply, reconciliation, executive, each with its accountable owner named.
2. **One consensus demand number**, with the baseline and the target stored and printed apart so substitution is detectable.
3. **Demonstrated-versus-theoretical capacity** — the APICS/CPIM distinction, used as a hard evidentiary gate rather than a label.
4. **The gap as the primary output**, quantified per month, with the residual as a separate figure and an explicit "approved with residual" verdict.
5. **A decision record, not minutes** — the executive act is a dated, named approval with the accepted residual, the service consequence and the priority order.

And it **exceeds** any of them on three points none of the published descriptions claim:

1. **Structural refusal to compute a gap against theoretical capacity.** The category routinely compares against a capacity plan; this register withholds the arithmetic and prints `theoretical-capacity` instead.
2. **A residual acknowledged by the approver that is compared with the computed residual, with a disagreement printed rather than reconciled.** The category logs the decision; it does not audit the decider's own arithmetic against the record.
3. **Cross-cycle contention summed per line-month, with the conservative figure used and the disagreement printed.** The category plans one aggregate demand against one capacity; it does not detect two independently approved plans consuming one line.

It **does not match**, and does not claim to: multi-echelon / SKU-level modelling, statistical or ML forecasting with seasonality and promotion lift, network optimisation, inventory policy optimisation, what-if scenario simulation at scale, ERP/CRM integration, or multi-currency financial consolidation. Those belong to the planning suite; this register is the **governance record of the cycle that suite informs**, and the module refuses rather than imitating them. Not confident the comparison is complete: `[BENCHMARK-UNVERIFIED]`.

## Verification

`tests/app/integrated-business-plan.test.mjs` — **28/28 passing**. One focused pass covering: the additive 183→184 migration and its seven empty ledgers (with an adjacent-collection survival and idempotence check); the integer kernel (a fractional unit, a comma, a sign and an exponent refused; a third decimal place refused; exact cent display with no floating point); the reconciliation (a 1150-vs-900 gap of +250, two options leaving a residual of 10, the gap unchanged by the options, `balances` and `auditClean` both true); the five documented failure modes each producing its own verdict; the two integrity claims reported as separate booleans; the matrix (the executive step landing on the computed seat above both lines, a director refused, a framer refused, shared capacity summed to 300 units of contention, and a rank-2 apex never promoted); the executive decision (once, with a disagreeing residual preserved and printed); the grade (six months at −100 giving a bias of −600 and a MAPE of 1000 bp, and a grade refused for an unplanned month and refused twice); the rule (registered, contract-described, matrix-census switch, idempotent per signature, self-closing, and pause-governed on the explicit scan); CSV #172 (no title, id, owner, line or basis leaked; the exported demand and capacity figures equal the reader's; every step and verdict present; an uncomputable gap blank rather than zero); and the panel (the reader's 1,150 / 900 / +250 / 48,000.25 printed, both integrity claims printed apart, and the reconcile tab carrying the same figures).

Adjacent checks: `npm run lint` clean; `npm run check:boundary` clean (1,015 app ES modules, 283 test suites, 23 documentation checks, 0 leaks); `npm run check:a11y` clean (132 declared routes); `npm run check:links` clean (1,300 links across 350 files).

Five real defects were found and fixed by the focused pass (§1–5 below), plus two more by the end-to-end pass (§6–7), each a semantic error rather than a test adjustment:

1. **`capacityUnits` was referenced inside its own `const` initializer**, so every reader threw a `ReferenceError` on any cycle with a capacity row. The two facts were then separated properly: `capacityUnits` is the figure that was declared and `capacityIsEvidence` says whether it may be compared as an observation.
2. **An absent month was being counted as a refused row**, so every cycle with an unplanned month reported itself as unsound. Conflating "nobody has planned this month yet" with "a row exists and cannot be read" would have trained the reader to ignore the soundness claim — the precise failure the bulletproof-reliability mandate exists to prevent.
3. **The ask signature was serialised as an object**, so `parseIbpAskSummary` could never find the ask again and the rule re-filed the same ask on every commit. The signature string is now derived once and both the coverage key and the typed link are built from it.

A fourth correction is worth recording as a design decision rather than a defect: the initial verdict precedence let a pre-approval state (`reconciliation-open`) outrank an actual executive decision, so a plan approved with a fully accepted residual was re-labelled as a reconciliation that never happened. A decision now outranks the pre-approval gap states — "serve less, deliberately" is a legitimate decision and must not be dressed as a process failure.

Two further defects were found by a **browser-equivalent end-to-end pass** (real `jsdom`, the real store, the real storage blob), which is the check that finally compared what the panel printed against what survived a reload. Both were invisible to the unit suite because every unit test drove a single in-memory object:

6. **Every write bypassed persistence, the audit trail and the post-commit rule.** The seven actions assigned to `store.state` directly instead of calling `store.update`. The result was a split brain: the plan appeared on screen, the reader computed from it, and the write was never saved, never logged in the audit trail, and never seen by `RULE-IBP-01` — a plan approved on screen and gone after reload. This is precisely the displayed-versus-stored deviation the reliability mandate forbids, and it was found only because the end-to-end pass reloaded the state from the storage blob and recomputed the figures from scratch. All seven writes now run inside a single `store.update` transaction with a typed event, so the mutation, the audit entry, the rule and the persist happen atomically. The residual and the option cents, which disagreed with the screen by 200 units and 4,800,025 cents before the fix, now match exactly.

7. **The supply ask was routed to the supply manager's own boss.** Resolving the ask through `linesByPerson` returned the line holder's manager, so the supply review was escalated one altitude by the register itself. A cycle names `supplyLineId` to say *whose line it is*, not who reports to them; the ask now goes to that holder directly, and falls back to the nearest manager above only when the named holder carries no leadership altitude and therefore cannot answer.

A further correction to the test suite followed from defect 6: because the actions now write through `store.update`, the rule genuinely fires during the commits, so the two rule tests that hand-invoked it against a fresh draft were asserting on a state where the ask had already been filed. They now assert the live record (one supply ask, addressed to the supply line's manager), that a repeat pass files nothing, and that a cleared ask is re-filed exactly once — a stronger test of the same property, not a weaker one.

And one rights correction driven by a real duty: `read-integrated-business-plan` was initially rank 3+, which meant a rank-2 supply manager could be asked to demonstrate capacity against a demand plan they were not allowed to read. The read right now opens at rank 2, with disclosure preserved by the reader's per-line narrowing.
