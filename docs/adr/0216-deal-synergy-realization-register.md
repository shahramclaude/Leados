# ADR-0216: The Deal Thesis & Synergy Realization Register — what each acquisition promised, to whom, by when, and what was ever checked

- **Status:** accepted
- **Date:** 2026-11-15
- **Deciders:** CEO / C-suite as the reader and the declarer of the deal thesis, with the matrix deciding who may verify a promise made by a line they hold
- **Schema:** v169 → v170 (five additive, EMPTY-at-upgrade collections; three conventions)
- **Surface:** `#/finance?panel=synergy` (Thesis / Contested / Method), CSV scope #158 (`deal-synergy-realization`)
- **Code:** `app/core/domain/synergyRegistry.js`, `synergySchema.js`, `synergyMath.js`, `dealSynergy.js`, `synergyRules.js`, `synergyActions.js`, `app/views/dealSynergyPanel.js`

## Context

The workspace could already answer four finance questions: what the owners' claim on the company did between two dated readings (ADR-0214, the enterprise value bridge — which **excludes** anything that arrived with an acquisition), whether an organic investment case is worth its hurdle (ADR-0208), which set of cases actually fits a declared capital ceiling (ADR-0211), and why cost differs from a declared budget (ADR-0213).

It could not answer the question every acquirer is asked by its board one quarter after close:

> **What did we say each deal would produce, who promised it, by when, at what one-off cost — and has anybody verified any of it?**

Nor the question that follows silently behind it: **is a saving being claimed twice?**

This is the altitude that was missing. Sessions 283–288 covered frontline, mid-manager, director and VP duties; the last CEO-altitude slice was Session 273. The matrix half matters because a synergy is the ordinary case where a saving is claimed by a functional line and an integration line at the same time — and until now the workspace had no vocabulary for that at all.

## Decision

### 1. The register holds a promise, its verification, its cost, and the double count — nothing else

Five ledgers: `dealTheses` (the deal, its signed day, its currency, its integration lead and the thesis in one paragraph), `synergyClaims` (one lever, one direction, one accountable owner, one named saving, one dated ladder), `synergyReadings` (dated run-rate or P&L readings, `claimed` or `verified`), `synergyCosts` (one-off cost to achieve), `synergyMarkers` (identity-free observations: owner departed, verifier drifted).

It **does not** hold the premium, a valuation, a discount rate, an exchange rate or a verdict on whether the deal was worth doing. That boundary is printed in `SYNERGY_METHOD` and on the Method tab, and the unbuilt remainder (premium against realised value) stays **In Progress** in the roadmap rather than being implied by a total.

### 2. Five refusals, each printed as its own sentence

1. **A phase is due ≠ the promise was missed.** With no verified reading, the state is `unverified`, which outranks `behind`. A missing verification is a refusal of the record, not a verdict on a manager.
2. **The exit run-rate is X ≠ the P&L gained X.** Run-rate and P&L readings live in separate totals and are never added, never annualised, never converted into each other. A P&L reading names its period; one period per promise, and a restatement withdraws the first rather than stacking on top.
3. **Two owners claimed it ≠ it happened twice.** Two live promises on one deal naming the same saving (normalised: case, punctuation, spacing) are **contested**. The money is counted **NOWHERE** in the headline — not doubled, not split — printed beside both names, and the settlement is left to the humans who made it.
4. **One currency is not a total across currencies.** There is no grand total object at all: `grandTotal` returns `{ value: null, reason: 'no deal thesis has been declared in this workspace' }` or a per-currency refusal. Nothing invents an exchange rate.
5. **A verifier was above the owner ≠ a verifier is above the owner.** Reach is recomputed on every read against the live matrix. A declared line that ends turns a verification into `verifiedDrifted`: the value stays on the row, leaves the verified totals, and the promise reads `unverified` again.

### 3. The printed identity is re-added from printed integers

`headline + contested + disSynergy === sumOfRows` at deal, currency and CSV level, re-added from the integers the screen prints (`countsReconcile`). A figure that cannot be read exactly is withheld with a reason and counted in `figuresComplete`, never repaired.

### 4. Direction is declared, not signed

`effectKey` is `synergy` or `dis-synergy`. A dis-synergy is subtracted from the headline, printed in its own total, and graded backwards: a synergy is `behind` when less arrived than promised, a dis-synergy when **more** left than was declared. The sign is never inferred from a minus.

### 5. Authority is matrix-native, and the owner's own number is open at every altitude

- `read-deal-synergy` — rank 4–5 (enterprise material; not handed below VP).
- `declare-deal-synergy` — rank 4–5 **and** the seat must hold the owner on the home line or a declared line. One line does not promise another line's saving.
- `record-synergy-reading` — rank 3–5, and a `verified` reading additionally requires a seat **above** the owner on some line; the owner as verifier is refused by name before any rank is quoted, because "a peer is refused as a peer, not as a rank" is the reason a human can act on.
- `report-own-synergy-reading` — rank 1–5. **Added during this session, because the first build was wrong.** `RULE-SYN-01` asks the owner of a promise every cycle; with only the 3–5 recording right, a frontline owner could not answer, and the ask would close by expiring rather than by being recorded. A `claimed` reading is the weakest act on the register — it is counted nowhere until somebody above verifies it — so it is open to the owner at any altitude and to everybody else only through the recording right. The gateway routes `synergyRecordReading` through the open right and the action narrows it, re-resolving the seat and exercising `RECORD` on every other path.
- `govern-deal-synergy` — rank 4–5 (materiality band, staleness window, scan).

A promise whose owner leaves the roster is **kept**: it prints `un-owned`, stays in the headline (the money was promised to the business, not to the person), and is asked of nobody. A person who has left may not be named as a **new** owner — refused at the action, because a promise made to somebody who has left is a promise to nobody.

### 6. `RULE-SYN-01`

One condition: a promise is due and carries no verified reading (including a verification that has drifted). One dated ask, to the owner only, one per `syn1:<16 hex>` signature, capped at four per commit. Where the owner is off the roster or the seat cannot be placed, one identity-free marker and **no task**. Self-closing, and pause-governed on every path via `synergyAutoPropagate`. Registered on the shared spine before the seat and the seal: rule 133/133.

## Consequences

- A board pack can state, per deal, what was promised, what is due today, what a named seat has verified against named evidence, what has only been claimed, what is contested, and what it cost — and every figure on the page re-adds to the rows beside it.
- The register refuses more than it prints, and the refusals are the product. `noCost` → `nonPositiveRunRate` → `paybackMonthsX10` is a chain of three honest refusals before a payback month is printed.
- **Not built, and stated:** premium versus realised value, discounting to present value, annualising a period, converting a currency, and any per-segment split. See the roadmap's In Progress entry.
- Withdrawal never erases: a withdrawn promise leaves every total and stays on the record, counted.
- CSV #158 carries 24 identity-free columns (positional codes, no person, deal, lever or saving name), prints `counts_reconcile` and `figures_complete`, and blanks a refused figure rather than writing zero.
- Generated method illustration: `app/assets/deal-synergy-realization.jpg`.

## Benchmark

**[BENCHMARK-UNVERIFIED]** against iLEVEL / DealCloud / Anaplan–Pigment synergy modules, from category knowledge rather than a live trial. The differentiators this register ships are the two the benchmark anchor names: **attribution that refuses itself** (contested money counted nowhere, drift recomputed on read) and **contested ownership named rather than split**.

## Verification

`tests/app/deal-synergy.test.mjs` — 22 tests, all green: migration (nothing inferred), every named refusal at its own door, the printed identity against an independent oracle including randomised promises, claimed-vs-verified, the phase ladder, verification reach and drift, run-rate vs P&L, currencies never pooled, payback refusals, the rule's idempotence and pause, authority by rank and line, cell-by-cell `data-cents` against the reader's integers, and the CSV boundary.

Three defects the suite caught before ship, recorded because each was a real one:

1. **The panel rendered a column of em dashes.** `ledgerTable` handed the shared table arrays, and the table reads row *objects* by column key — the shape was silently accepted and every cell printed `—`. The cell-by-cell `data-cents` assertion is what found it.
2. **A reading with an unparseable date defaulted to today**, letting a stale number wear the date it was typed. The fallback is gone: a reading with no real date is refused.
3. **A promise whose only verification had drifted still read `met`.** Drift is now computed before the state, so such a promise reads `unverified` — the fact that it once looked met is not a state a board can act on.
