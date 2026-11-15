# ADR-0219: The Risk-Appetite Register — what the enterprise has declared it will retain, measured against what its people are actually carrying

- **Status:** accepted (engine `risk-appetite-2026.11-v1`)
- **Date:** 2026-11-15
- **Deciders:** CEO / C-suite altitude (rank 4–5) — the seat that declares a ceiling; rank 3 may carry a risk but not declare one
- **Schema:** v172 → v173 (three EMPTY-at-upgrade collections: `riskAppetiteStatements`, `riskDeclarations`, `riskAppetiteMarkers`)
- **Surface:** `#/risk-appetite` (Statements / Carried risks / Method), CSV scope #161 (`risk-appetite`, aggregate only)
- **Code:** `app/core/domain/riskAppetiteRegistry.js`, `riskAppetiteSchema.js`, `riskAppetiteMath.js`, `riskAppetite.js` (reader), `riskAppetiteRules.js` (`RULE-RAP-01`), `riskAppetiteActions.js` (writes), `app/views/riskAppetite.js`
- **Tests:** `tests/app/risk-appetite.test.mjs` (22)
- **Spine:** `RULE-RAP-01` is rule **135/135**

## Context

Every money register in the workspace could say whether money **may** be spent, and none could say what the organisation had **declared it was willing to lose**. `#/capital` allocates effort; `#/finance` appraises a return, ceilings spend, rations a ceiling, divides a variance and measures promised synergy. The executive's own decision form is *investment and risk appetite*, and there was no register of the second half.

The failure this exists to prevent is mundane. A tolerance lives in a slide, the risks live in a case ledger owned by people three levels down, and nobody ever puts the two in one place — so a breach is discovered by an event rather than by a reading, and the gap between "we said 2%" and "we are carrying 4%" has no date, no owner and no record.

Framework basis (named, not decorative):
- **COSO ERM 2017, Principle 3** — risk appetite is defined in terms of, and aligned with, strategy; tolerance is the acceptable variation in performance. This register stores the appetite as a *declared, dated, supersedable statement* and never infers one.
- **ISO 31000:2018** risk criteria — criteria must be established before risks are assessed, and must be reviewed. Hence a statement's review date is a first-class field and a passed review date is a *condition*, not a warning.
- Declared exposure/retention limits as used in insurance and treasury practice: a limit is a ceiling on what is retained, per domain and per currency (`[citation details UNVERIFIED]`).

## Decision

1. **A statement is dated and superseded, not edited.** One live statement per (domain, measure, currency, unit); the **latest dated statement governs**, and retiring the latest leaves **NO ceiling** rather than reviving an older one. A closed ceiling is a decision; a resurrected one is an accident.
2. **Money and counts never share a field.** A money statement stores integer minor units (`retainedCents`) parsed once with BigInt from the input string; a count statement stores `retainedCount`. A currency on a count is refused, a third decimal place is refused rather than rounded, and a stored cents integer is never re-parsed — the figure is identical on every reload.
3. **A carried risk is declared by somebody else.** The owner of a case may not declare the exposure on their own risk: the person carrying the risk is exactly the person who benefits from under-declaring it. Rank 3–5 may carry; rank 4–5 may declare a ceiling.
4. **Measurement is exact and never pooled across currencies.** The measured figure is the sum over the *live* declarations of that (domain, currency) — no allocation, no averaging, no conversion. Money in another currency is excluded **with its own printed total** and counted as excluded.
5. **Two facts are reported separately.** `countsReconcile` (the per-domain counts add up to the live declarations) and `figuresComplete` (no open risk without a declaration, no missing case, no domain without an appetite, no statement-less currency) are different claims. A verdict of `within-tolerance` never implies the population was fully measured; the panel prints the population beside the figure.
6. **Escalation goes to the joint seat above the carrying lines, never to the carrier.** The apex is `matrixJointApex` over the owners' **managers**, so an owner can never be asked to clear a ceiling they are carrying. A diamond tie names **every** joint apex; a graph that cannot resolve the apex asks **nobody**, prints why, and records an identity-free marker.
7. **One opaque ask per breach, idempotent, self-closing.** `RULE-RAP-01` files one `act-inform` delegation per (signature, addressee) whose text carries no domain, amount, currency or case id — a delegation is readable above the addressee. A human's own close is respected and never re-filed; the rule closes its own ask when the ceiling is raised, and says so in the completion note.
8. **The pause governs every path.** `riskAppetiteAutoPropagate` silences the rule on the commit path *and* on the explicit scan; the switch is declared in the persistence vocabulary so it can actually be moved, and defaults ON.
9. **Disclosure.** The register is portfolio material (`classKey: portfolio`, detail ceiling 4). A manager below the ceiling receives a counted refusal, not a summary. CSV #161 is aggregate-only, built seat-free, and carries no person, case, id or date.

## Rejected

- *Reusing `mitigationReview.js`, `solvency.js`, `survival.js`, `premises.js`, `investmentCase*` (ADR-0208) or `watchRegistry`.* Each measures a different object: a mitigation's effectiveness, a counterparty's solvency, a runway in weeks, a lease, a return on a promise, a watchlist. None holds a declared tolerance against a live exposure.
- *Storing a derived verdict or a percentage.* The verdict is recomputed from stored integers on every read; a stored verdict is a figure that can disagree with its own inputs.
- *Turning an undeclared risk into an ask.* An open risk nobody has declared is a **coverage gap against the register**, not a decision owed by an individual; it blocks certification and is counted, and it is not filed as a task against the case owner.
- *Letting a withdrawn declaration revive the previous one.* Withdrawal leaves the risk undeclared, because the older declaration was superseded by a record somebody has now retracted.

## Consequences

- Schema v173; migration 172 → 173 adds three empty collections and guesses nothing.
- Every `SCHEMA_VERSION` pin in `tests/app` moves to 173; migration-chain assertions gain `172 → 173`.
- `CSV_EXPORTS` moves 160 → 161; the spine moves 134 → 135.
- `#/risk-appetite` is a route in `main.js` with a nav item and an attention badge that reads the same figure the panel prints.

## Defects found and fixed while building this slice

1. **The escalation addressed the case owner** — the person carrying the risk — instead of the seat above their manager. The apex is now computed over the owners' managers.
2. **`undeclaredN` counted every open risk as undeclared**, because case *rows* were tested against a set of *ids*. `riskAppetiteMath.js` now accepts ids or rows, and `figuresComplete` is honest.
3. **The automation switch could not be switched.** `updateSettings` validates keys against the persistence vocabulary; `riskAppetiteAutoPropagate` was absent from `normalizeSettings`, so the only write that silences a breached-ceiling rule was refused as an unknown setting.
4. **A read registered as safe bypasses the gateway's rank check**, so the read right is re-proved inside the action. Without that, a rank-2 manager could read an enterprise ceiling the record class denies — the module would have vanished from the gate exactly where the gate matters.

## Known limits, recorded honestly

- **Workflow seat declarations, not authentication.** Rank windows are a declared local seat; server-side authorization remains open workspace-wide.
- **Matrix line history for declarations.** Which line carries a risk is read from the live matrix, not from an as-of line reader (the same blocked dependency recorded for ADR-0164 and ADR-0179).
- **Currency conversion is refused, not provided.** Two currencies are two readings; the register never produces a converted total.
- **The reach-permit census is short by two at base.** `PAUSE_PERMIT_MATRIX_REACH_SWITCHES` names 24 switches for 26 mapped rule modules (`synergyAutoPropagate`, `earnedValueAutoPropagate` are mapped but not carried in settings). Verified at HEAD (`git show HEAD:app/core/domain/pausePermitRegistry.js`): 23 switches vs 25 modules — the same two-short delta, pre-existing, not caused here and not worked around.
- **Full suite not run to completion** in this session; the risk-appetite suite, CSV, standalone and the boundary/link/lint gates were run. `[UNVERIFIED]` for the rest.
