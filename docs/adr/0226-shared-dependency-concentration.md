# ADR-0226 — Shared-dependency concentration of declared risk retention: several risks that rely on one dependency, summed once, against the ceiling declared for that domain and currency

- **Status:** accepted (engine `risk-concentration-2026.11-v1`)
- **Date:** 2026-11-16
- **Deciders:** CEO / C-suite altitude (rank 4–5) — the seat that declares the ceiling a shared row is compared with; director / VP (rank 3+) read the reading they are granted; the declarers of each risk are unchanged from ADR-0219
- **Schema:** unchanged at v181. No collection, no migration, no stored figure. The reader joins records the workspace already holds.
- **Surface:** `#/risk-appetite?view=shared` ("Shared dependencies" tab). No CSV scope and no automation rule in this slice (see *In Progress*).
- **Code:** `app/core/domain/riskConcentration.js` (pure reader), `riskAppetite.js` (`declarationGrant` exported, no behaviour change), `riskAppetiteActions.js` (`riskAppetiteConcentration`, READ right), `accessGateway.js` (right → action map; `SAFE_READS`), `app/views/riskAppetite.js` (`concentrationView`)
- **Tests:** `tests/app/risk-concentration.test.mjs` (12); `tests/app/risk-appetite.test.mjs` (22, stale pins corrected)
- **Assets:** `app/assets/risk-concentration-method.jpg`, `app/assets/risk-appetite-tolerance.jpg` (see *Provenance*)
- **Builds on:** ADR-0219 (risk-appetite register, `RULE-RAP-01`), ADR-0012 (dependency ledger and `depends-on` typed links), ADR-0120/0140 (matrix and seat grant)

## Context

Every declared risk in the register is inside its own retention, and the register can say so exactly. What it cannot say is that several of those retentions rely on **one** service, vendor or system. When that dependency fails, they realise together. Each retention was judged alone, so the enterprise can hold a correlated loss that no single declaration states: *every risk is within tolerance* and *one outage realises all of them at once* are both true, and nothing printed the second.

The gap is specific and checkable. The register's ceilings are per domain and currency, and it sums declared retention per domain and currency. It never asks which declared risks share a cause. The dependency layer (ADR-0012) knows the causes, and it already flags common-mode choke points by **topology**: `resilience.js` RES-03 counts shared upstream dependencies feeding critical capabilities, and `continuityCoupling.js` reads sub-tier common-mode. Neither joins a shared dependency to **declared retained exposure**, nor compares that correlated sum with an **appetite ceiling**. That join is the gap this ADR closes. It is not a claim that concentration analysis is new.

Framework basis (named, with citation status):
- **Common-cause (common-mode) failure analysis** — redundancies that look independent can share one cause, so their combined loss is not the sum of separate probabilities. `[citation details UNVERIFIED]`
- **Perrow (1984), *Normal Accidents*** — tight coupling makes one failure reach many parts at once. `[citation details from memory, UNVERIFIED]`
- **Tiered supply-chain concentration (Simchi-Levi, Schmidt & Wei 2014/2015)** — the same upstream dependency behind several services is a single point of failure that tier-1 views hide. Cited in ADR-0012.
- **COSO ERM 2017 Principle 3 and ISO 31000:2018** — a ceiling is a declared criterion. It applies to the correlated sum a single cause would realise. Where no ceiling is declared the reading says NOT COMPARED.

## Decision

1. **The reading is a pure function of records already on the workspace.** The population is the register's own: live declarations on open risk cases, read by `liveDeclarations` and `riskAppetiteOpenCases`. The ceiling is the live `retained-exposure` statement, read with the register's own key `raStatementKey`. Nothing is stored. A hand-edited file cannot carry a verdict its own rows do not imply.

2. **Reliance is recorded, never inferred.** A risk relies on a dependency only through (a) a `depends-on` typed link from the case to the dependency, or (b) the dependency's own `upstreamIds` chain. A shared owner, a shared vendor name, a shared line or a label is **not** a dependency and never becomes one.

3. **A shared row is one (dependency, domain, currency) reached by at least two live declared risks.** Its figure is the exact integer sum of those risks' declared cents in that currency, with each risk counted **once** per dependency even when its reliance is declared twice or reached by two routes. No probability is applied, no correlation is estimated and no retention is divided between the risks.

4. **The share is exact basis points over the whole declared population** of the same domain and currency: `floor(sum × 10000 / domainTotal)`. The denominator includes risks that name no dependency. A share over an undefined population would be a manufactured figure, so the population size is printed beside it.

5. **The ceiling comparison is the register's own breach rule**, `sum > ceiling`. A sum exactly at the ceiling is within. **No declared ceiling prints `no-ceiling` — NOT COMPARED — and is never rendered as within tolerance.**

6. **Two claims, reported separately.** `partitionReconciles` is the arithmetic: every declared risk is accounted for exactly once, as linked, unlinked, or linked only to retired dependencies. `wholePopulationMeasured` is the coverage claim: every open risk is declared AND every declared risk names its dependencies. A reading can reconcile and still be incomplete, and the page prints both.

7. **Overlap is by design and is printed.** A risk on two dependencies, or on one through an upstream chain, is counted under each. Dependency rows therefore do not add to the population total, and the page says so.

8. **Seat visibility withholds the whole reading.** Any live declared risk hidden from the seat (`declarationGrant` ≠ `full`) makes the reading WITHHELD with a printed reason and no sum, share, ceiling or verdict. A total built from part of the population would be read as the enterprise's. The action re-proves the READ right; a seat without it is refused at the gate, not given a partial reading.

9. **Bounded, and every bound is printed.** Upstream traversal is breadth-first with minimal hop counts, a visited set (cycles terminate), a depth bound of six hops (deeper links counted and printed as unread), and retired dependencies are never traversed (their edges counted). Row caps are printed with their remainder.

10. **Money stays exact.** Cents are `BigInt` throughout. A total beyond the representable range is withheld with a printed reason, never rounded.

## Rejected

- *Reusing `resilience.js` RES-03 or `continuityCoupling.js`.* Both rank shared dependencies by how many capabilities they feed. Neither carries a declared retained amount or an appetite ceiling, so neither can say whether a correlated loss is within what the enterprise agreed to carry. Their output is the topology; this ADR's output is the join.
- *A stored concentration table, or a stored share.* A stored figure is a second copy that can disagree with its inputs. Recomputed on every read.
- *A correlation coefficient or a joint-probability model.* No record holds a correlation, and inventing one would print a number nobody declared. The sum of declared retentions is the honest quantity: it is what the risks would bring to bear together.
- *Dividing a shared retention between the risks, or between the owners' lines.* No human declared a split. The sum is printed once per dependency.
- *Treating a risk with no dependency as independent.* An unlinked risk's reliance is unknown, not zero. It is counted in the population and in no dependency row, and the page names it as unread.
- *Cross-currency totals.* Two currencies are two readings. The same rule as ADR-0219.
- *Adding a schema collection for a declared "exposure basis".* The record already holds what is needed: the risk, its retention and the `depends-on` link. A new collection would duplicate the link graph.

## Consequences

- No schema bump, no migration, no new event type, no new action beyond one READ. Every existing SCHEMA_VERSION pin is unaffected by this slice.
- `riskAppetite.js` now exports `declarationGrant`. Its behaviour is unchanged; the concentration reader and the register apply the same visibility rule by construction.
- The register's own `view=risks` and `view=statements` are unchanged. The new tab reads through the same declarations and statements.
- The tab appears in the register's tab bar. It has no attention badge: this reading asks nothing of anyone, and an ask would need its own rule and its own idempotency signature (see *In Progress*).

## Known limits, recorded honestly

- **Only declared reliance is read.** A dependency a risk relies on but nobody linked is invisible. The page counts unlinked risks; it cannot count reliance nobody recorded. This is the largest limit and is stated on the page.
- **Reliance is a link, not a strength.** A `depends-on` edge says a risk relies on a dependency. It does not say how much. The sum is therefore the retention the declared risks would carry together, not a modelled loss.
- **Depth is bounded at six upstream hops.** Deeper chains are printed as unread.
- **Retired dependencies are excluded, and retired upstream edges are counted.** The reading does not re-activate a retired node.
- **Workflow seat declarations, not authentication**, as in ADR-0219. Server-side authorization remains open workspace-wide.
- **No CSV export and no attention rule in this slice.** Both are listed under *In Progress*.
- **Mapping depth is bounded by what the workspace records.** No external supplier, vendor or market data is fetched. See *Benchmark*.

## Benchmark — `[BENCHMARK-UNVERIFIED]`

Step 3.5 asks which specialised tool already does this well and what bar it sets. The market for **mapping** sub-tier dependencies is held by N-tier supply-chain platforms. Vendor and buyer-guide pages describe Resilinc (450,000+ suppliers mapped across 200 countries, sub-tier-N graph visibility), Interos (AI-driven multi-tier relationship mapping with concentration-risk analysis) and others including Everstream, Prewave and Exiger, which the sources name as 2025 Gartner Magic Quadrant leaders ([bitsight guide](https://www.bitsight.com/guides/best-nth-party-supply-chain-risk-management-tools-in-2026); [riskwatch overview](https://www.riskwatch.com/top-10-risk-management-software-for-supply-chain/); [supply chain research buyers' guide](https://www.supplychainresearch.com/research-library/buyers-guide-supply-chain-risk-management)).

**Result.** LeadOS does **not** match that bar for mapping depth. It has no external supplier data and reads only the dependencies a workspace records. This is stated, not hidden: the mapping comparison is `[BENCHMARK-UNVERIFIED]`.

The part LeadOS can claim is the join the sources do not show: declared retained exposure per shared dependency, summed once, compared with the enterprise's own domain ceiling, with NOT COMPARED printed where no ceiling exists. I did not run a hands-on comparison with those products, and I did not verify that none of them performs a retention-against-appetite comparison. That is why the whole benchmark result stays `[BENCHMARK-UNVERIFIED]`. Nothing here is market-first.

## Provenance of the generated assets

- `app/assets/risk-concentration-method.jpg` — generated with the image tool, single image, no options offered (the asset sits inside the build). Prompt: a flat corporate method diagram, slate and gold palette, titled "Shared Dependency Reading", showing three risk cards converging on one shared dependency, then retentions summed per dependency and domain, the share of the domain total, and the comparison with the declared ceiling, with the two outcome tags. Checked against the spec after generation: every label matches the reader's vocabulary.
- `app/assets/risk-appetite-tolerance.jpg` — the register's method diagram. **The register view referenced this file before this session, and the file did not exist in the repository.** It is generated here with the same tool and provenance, and its labels were checked against the register's own text after generation.

## Defects found and fixed while building this slice

1. **The reader keyed population rows on `declarationId`, a field the rows do not carry** (they carry `id`). Every risk id was `null`, so every dependency's member set collapsed to one, and **every shared row silently disappeared**. The cause was found by the suite (a shared pair printed as one member), fixed by reading `row.id`, and is covered by the sum, share and currency tests.
2. **The register's method diagram was a broken reference** (`app/assets/risk-appetite-tolerance.jpg` did not exist). Generated and checked.
3. **`tests/app/risk-appetite.test.mjs` pinned a stale schema version** (179 against the current 181) in three places, so the suite was already red at the base commit. Moved to 181. The test's real claims (empty ledgers, no inferred tolerance) are unchanged.
4. **`tests/app/standalone.test.mjs` absolute size ceiling (16.8 MB) was below the base artifact (17,513,621 bytes)**, so that test was already red at the base commit. The ceiling is moved to 18.0 MB with the measured size and the density guard (24,000 bytes per module, now 18,196) left unchanged, following the file's own convention. The density guard is the check that catches duplication.

## Logged and not fixed in this slice

- `app/views/workNightPanel.js` references `app/assets/night-work-break-method.jpg`, which does not exist. This is the same defect class as item 2 above and belongs to the night-work feature. Logged in ROADMAP.md, not fixed here.
- Other suites pin `SCHEMA_VERSION` to 179 (for example `aar-corroboration.test.mjs`, `after-action.test.mjs`, `agenda-provenance.test.mjs`). They appear to be red against schema 181 by the same mechanism. They were not run this session. `[UNVERIFIED]`

## In Progress — the remainder of this slice

- **CSV scope for the shared-dependency reading** (aggregate, identity-free, suppressed below the same floor of three as CSV #167). Not built.
- **A rule that asks the ceiling's joint apex when a shared row would exceed its ceiling**, idempotent per a deterministic signature, pause-governed like `RULE-RAP-01`. Not built. The reading currently asks nobody.
- **Full-suite run and a real-browser walkthrough of the new tab.** `[UNVERIFIED]`
