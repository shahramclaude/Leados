# ADR-0214: The Enterprise Value Bridge — what moved the owners' claim, and whose leg it was

- **Status:** accepted
- **Date:** 2026-11-15
- **Deciders:** CEO / C-suite (owner of the equity story and of capital allocation), CFO (owner of the readings), corporate development (owner of the perimeter leg)
- **Schema:** v167 → v168 (two additive, EMPTY-at-upgrade ledgers; one convention)
- **Surface:** `#/finance?panel=value` (Bridges / Who owns which leg / Method), CSV scope #156 (`value-bridge-movements`)
- **Code:** `app/core/domain/valueBridgeMath.js`, `valueBridgeRegistry.js`, `valueBridgeSchema.js`, `valueBridge.js`, `valueBridgeActions.js`, `app/views/valueBridgePanel.js`

## Context

The workspace could appraise a single investment to the cent (`investmentCase.js`), ration one declared capital ceiling across cases (`capitalRationing.js`), and divide a cost budget into volume, price and usage (`flexBudget*`). It could not answer the question a board actually asks:

> The company's EBITDA is up 9%, the market now pays half a turn less, we bought a competitor in June and repaid 240 million of debt. Equity value is down 4%. **What did that, and whose was it?**

Every one of those four movements has a different owner and a different decision behind it. The single percentage is not a fact about any of them, and getting it wrong is expensive in both directions: a re-rating gets thanked as management performance, an acquisition's earnings get read as organic growth, and the operator who actually improved the business is invisible.

Targeted searches before this slice: `enterprise value`, `net debt`, `EV/EBITDA`, `valuation multiple`, `equity value`, `value bridge` — **zero hits** in `app/` and zero in the roadmap. The wider market's absence claim is **[UNVERIFIED]**.

## Decision

Record the owners' claim twice, at two declared dates, and divide the movement **exactly** into four legs with four different owners:

```
equity      = EBITDA × multiple − net debt
organic     = reported EBITDA − declared perimeter adjustment

operating   = (organic₁ − organic₀) × multiple₀
perimeter   = (adjustment₁ − adjustment₀) × multiple₀
re-rating   = reported EBITDA₁ × (multiple₁ − multiple₀)
net debt    = net debt₀ − net debt₁

identity:    equity₁ − equity₀ = operating + perimeter + re-rating + net debt
```

with five binding rules:

1. **A reading is declared, never scraped.** EBITDA, the multiple and net debt are typed with a written source by an executive seat (rank 4+). Nothing is inferred from a budget, a case, a feed or a news item.
2. **Like-for-like or refused.** Each reading states ORGANIC, REPORTED with a declared adjustment, or UNSEPARATED. An unseparated reading yields a printed total movement and a **refused attribution** with a reason. An absent adjustment is never read as zero, not even by a hand-edited file: the loader downgrades the claim and says so.
3. **Exact, and honest about rounding.** All arithmetic is rational over `BigInt`. Printed cents are apportioned by largest remainder so the column adds up, and every printed cell stays strictly less than a whole cent from its exact value — including at an exact half cent, where the opening anchor is placed on the side that does not double the error. `balances` (the printed cents re-add) and `rounding` (how many cells are exact, nearest-cent or moved) are two separate claims about two different facts.
4. **Ownership is declared, never computed** — and a contested leg is named, never divided. A seat claims a leg for a person it holds (tree or declared line) or for itself, with a promised whole-cent value and a basis. One claim gives promise-versus-realised from the **printed** leg. Two claims from two people give CONTESTED with both names, no per-person realised figure, and no attainment. A claim whose period no printed bridge matches is kept and scored against nothing.
5. **A day carries one live reading per currency.** Restating names the reading it supersedes; the old row is kept and marked. Two currencies are never pooled and never converted.

Enterprise record class: equity value is not handed below rank 4, because a director's "share" of enterprise value is not a fact the record contains.

## Alternatives considered

- **Fold the bridge into the investment-case register.** Rejected: a case appraises a proposal against a promise; the bridge reads the *actual* claim twice. They answer different questions and have different signatories.
- **Use the flexible-budget kernel for the EBITDA split.** Rejected as the wrong decomposition: the flex kernel divides a *cost* variance for one cost object. Here the interaction that matters is EBITDA × multiple, and the leg that must be isolated is the perimeter — which no cost standard contains.
- **Infer the perimeter adjustment from the transaction log.** Rejected outright: the matrix mandate forbids inventing a split nobody agreed to, and an inferred adjustment is indistinguishable from a fabricated one on the printed page.
- **Average the multiple across the two readings.** Rejected: a multiple is an opinion at a date. Averaging destroys the re-rating leg, which is precisely the leg no manager controls.
- **Split a contested leg 50/50 or pro rata.** Rejected: that is the invented allocation the doctrine names explicitly.

## Consequences

- A board can see, in printed cents that re-add, how much of a movement was operated, bought, re-rated and de-geared — and who was declared to answer for each part.
- The register now refuses more often than it prints: unseparated perimeters, contested legs, off-period claims. That is the cost of not inventing an attribution, and it is counted on the Finance badge rather than silently dropped.
- Unchanged: no spine rule was added (131 stays), so nothing propagates automatically from a bridge. Where a contested leg needs an owner, the seats above both lines still act through the existing matrix remedy surfaces.
- Debt/limit: the bridge is closed-form and has no solver, so it cannot fail to converge; its failure mode is refusal, not approximation.
- Revisit the trigger: if a real board review needs a **segment** bridge (one business unit's value), that is a new perimeter declaration problem — build it deliberately rather than by adding a nullable column here.

## Benchmark

Category leaders for portfolio value creation reporting are S&P Global Market Intelligence **iLevel**, **Intapp DealCloud** and **Anaplan/Pigment** value-creation models: they track a value-creation plan per lever, compare run-rate to promise, and roll up into board reporting. This slice matches the *exactness* and the *promise-versus-realised* instrument, and adds what those instruments generally do not: an attribution that refuses itself when the perimeter is not separated, and contested matrix ownership that is named rather than split. No tool was run hands-on this session: **[BENCHMARK-UNVERIFIED]**. The comparison is category knowledge, not a measured feature-by-feature audit.

## Asset

Higgsfield is not connected (`list_connector_tools` → `unsupported`) — reported as a blocker, not worked around silently. The built-in generator produced `app/assets/value-bridge-attribution.jpg` (50,935 bytes, 1408×768, SHA-256 `a3c2715e79d5e20f4f8f9ba70c1b673cb55a82156c8fabd2fc3d97cde34e83e1`), shown on the Method view with alt text and a "generated asset, not workspace data" caption.

## Verification

`tests/app/value-bridge.test.mjs` — **14 / 14**: an independent oracle (its own unreduced BigInt fractions) on a hand-worked case and on 240 randomised problems; every printed cell checked to be strictly less than a whole cent from exact; the printed column re-added; refusal states; altitude and future-date refusals; restatement; the two-person contested leg; promise versus delivery; panel `data-cents` equal to the reader's integers; CSV integers equal to the same; no identity in the export; reload identity; the v167 → v168 migration.

The whole suite was run to completion: **4,417 tests / 4,369 pass / 48 fail** in 81 minutes, and every one of the 48 failures was reproduced on the base commit `7fa1fab` in a detached worktree with identical failing titles — none belongs to this ADR. The base branch is red by 48 tests independently of this work. In-browser and assistive-technology walkthrough of the panel is **[UNVERIFIED]**.
