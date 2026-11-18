# ADR-0250 — Provision & Reimbursement Register: what the organisation must carry for each obligation, what it may recognize as a reimbursement asset against it, and whether the figure finance carries agrees with the figure the record supports

- **Status:** Accepted and shipped (Session 328, 2026-11-17)
- **Schema:** v203 → v204 (five additive, EMPTY-at-upgrade collections: `prvAssessments`, `prvScenarios`, `prvReimbursements`, `prvCarryings`, `prvMarkers`; two bounded conventions; `provAutoPropagate` pause switch)
- **Route:** `#/provisions` (13 aliases: `#/provisions`, `#/provision-register`, `#/provisioning`, `#/provision-ledger`, `#/reimbursement-asset`, `#/reimbursement-assets`, `#/reimbursements`, `#/finance-carrying`, `#/balance-sheet`, `#/ias-37`, `#/best-estimate`, `#/provision-reconciliation`)
- **Rule:** `RULE-PROV-01` (spine rule **163/163**, pause switch `provAutoPropagate`)
- **CSV:** Scope #191 (`provision-reimbursement`), aggregate and identity-free
- **Primary altitude × structure:** **CEO / C-suite finance × matrix** (director / VP and above; the reader withholds responsible hands above rank 3)

## Context & the gap this closes

ADR-0249 closed the insurance notification & recovery gap and its "not built" list named **IAS 37 / contingent-liability provisioning** as the remaining piece. `#/claims` holds gross claim reserves and `#/insurance` holds policy limits, retentions and verified recoveries, but nothing bridged them into a formal provision schedule. A fourteen-term word-boundary census across `app/core/domain`, `app/views`, `app/actions.js`, `app/main.js`, `app/core/schema.js` and `app/core/demo.js` returned **zero** hits for `IAS 37`, `contingent liability`, `best estimate`, `reimbursement asset`, `onerous contract`, `constructive obligation`, `virtually certain` and `provision schedule`; the only `provision` hit in the whole app was a route alias (`'provision': 'claims'`) pointing at the claim register.

In real finance and general-counsel practice a provision is not a reserve with a different name. It is three facts that must never be conflated:

1. **The provision** — a present obligation from a past event, an outflow that is **probable**, and an amount that can be **reliably estimated**. Recognized at the **best estimate**.
2. **The reimbursement asset** — recognized **only when it is virtually certain** that reimbursement will be obtained, and **never more than the provision**. A recovery larger than the obligation is not an asset beyond the obligation.
3. **The net exposure** — the provision less the asset, printed apart from both.

And a fourth, which is where the record usually fails: **the reconciliation** — the computed provision against the figure the finance seat declares it is carrying, with the exact gap printed. A register that silently adopts either number is how a mis-stated balance sheet survives to the audit.

## Benchmark (Step 3.5)

Compared against **IAS 37 / ASC 450** as published, and against enterprise provisioning practice (**Trullas / Diligent**, **Workiva**, **MetricStream**, **SAP Financial Consolidation** provision schedules) — **[standards and vendor documentation; hands-on parity UNVERIFIED — no vendor environment was run]**:

- **Matched:** the probable / possible / remote classification; the most-likely vs probability-weighted expected-value best estimate; the reimbursement asset recognized only when virtually certain and capped at the provision; the contingent liability disclosed but not provided; the reconciliation of the computed provision against the declared carrying.
- **Exceeded:**
  1. **No inferred classification and no default probability threshold.** Probable / possible / remote is a **declared accounting judgment** on each assessment, with a written basis. A register that infers a classification from an amount turns a judgment into a computation nobody made.
  2. **An expected value is refused, never rounded.** The declared scenarios must sum to **exactly 10,000 basis points** and the weighted sum must be a **whole number of minor units**; otherwise the estimate is refused with its reason and the matter is disclosed, not provided.
  3. **A matter with no assessment is `unassessed`, never zero.** A zero reads as "we decided no provision is owed"; an absent assessment reads as "nobody has decided". The register refuses to collapse the two and files an ask.
  4. **Cash vs declared judgment are printed apart.** Cash the insurer has paid is derived from the insurance register and needs no declaration; a pending claim is not virtually certain unless a seat declares it so in writing. An asset resting on a declared judgment with no cash behind it is flagged plainly.
  5. **Matrix joint-apex routing (`RULE-PROV-01`).** Asks go to `matrixJointApex` above every active line holding any responsible hand, with deliberately **opaque** delegation text so a provision schedule — as sensitive as the claim export — is never named in a delegation.

## Decision

### 1. Five fail-closed ledgers, zero derived fields stored

- `prvAssessments` — `id`, `matterId` (must exist on `lfgMatters`), `classification` (`probable` | `possible` | `remote`), `estimateMethod` (`most-likely` | `expected-value`), `mostLikelyMinor` (required for a most-likely assessment; optional otherwise), `currency` (3-letter ISO), `basisRef` (≥ 24 chars), `responsibleIds` (1–4 valid ids, read whole or dropped), `assessedById`, `assessedAt`, `assessedDay`. **One per matter**; a second is dropped. A classification this register does not carry is dropped.
- `prvScenarios` — `id`, `matterId` (must name an assessment), `outcome` (≥ 3 chars), `probabilityBps` (integer `0..10000`), `amountMinor` (whole minor units), `currency`, `basisRef`, `declaredById`, `declaredAt`, `declaredDay`. The probabilities are **not** summed at the door: the reader sums them and refuses a set that is not exactly 100%.
- `prvReimbursements` — `id`, `matterId`, `virtuallyCertain` (boolean), `basisRef`, `declaredById`, `declaredAt`, `declaredDay`. **One per matter.** The **amount is never stored** — it is derived on read from the insurance register's cash and claimed amounts.
- `prvCarryings` — `id`, `currency`, `carriedMinor` (whole minor units), `carriedRef` (≥ 12 chars, the finance record reference), `declaredById`, `declaredAt`, `declaredDay`. **One per currency.** A carrying with no reference is dropped.
- `prvMarkers` — identity-free observation markers written by `RULE-PROV-01` when no joint seat can be resolved.

Every loader is fail-closed: an unreadable row is **dropped with a counted warning**, never repaired, re-classified, re-priced or re-pointed. An assessment whose responsible hands are off the roster is **kept** and printed as an orphan, because deleting it would erase a live provision.

### 2. Six derived states (`derivePrvProvision` / `buildProvisions`)

`unassessed` (a gross exposure with no assessment), `provided-asset-capped`, `provided-with-asset`, `provided`, `disclosed-only` (possible, or probable but not reliably estimable), `remote`. The provision verdict comes first; the asset modifies a provided state. A closed matter (any resolution on the claim register) carries no open obligation and is counted, never silently dropped.

### 3. `RULE-PROV-01` on the post-commit spine

Five conditions, each signed `prov1:<kind>:<subjectId>` and addressed to the **joint apex above every line holding any responsible hand**: `unassessed`, `disclosed-only`, `asset-capped`, `asset-without-cash` and `unreconciled` (a whole-register duty, addressed to the joint apex above every line holding any hand on the schedule). Idempotent per `(signature, addressee)`, self-closing when the condition clears, will not re-file an ask a human closed or returned, ≤ 4 new asks per commit with the remainder counted `deferred`, one identity-free marker per condition where no seat resolves, and pause-governed on every path including the explicit scan.

### 4. CSV #191 (`provision-reimbursement`)

26 columns: one `summary` row, one `state` row per published state key, and one `currency` row carrying the money bridge (provision, asset, net exposure, declared carrying, gap). No matter reference, party, person, manager, instrument or day crosses the boundary. A per-state count below `provPrivacyFloor` exports **blank** with its reason.

## Two defects caught while wiring

1. **A prefix collision, not a naming preference.** The portfolio-review register already owns `PRV_` and its rule id is already `RULE-PRV-01`. Exporting `PRV_RIGHTS` / `PRV_CSV_*` a second time is a module-scope `SyntaxError`, and a second rule writing `issues-obligation` links with `ruleId: 'RULE-PRV-01'` would make the two rules indistinguishable on the spine. The register's exported prefix is therefore **`PROV_`**, its rule id is **`RULE-PROV-01`**, and its pause switch is **`provAutoPropagate`**. The collection names (`prvAssessments`, …) are unchanged, because they are storage keys, not exported identifiers.
2. **A zero provision was supporting an asset.** `capAssetMinor` returned the expected reimbursement whenever the provision was a readable integer — including `0`. An unassessed matter with cash received printed an "excess" figure against an obligation the register had already said was unprovided. A zero or absent provision now supports **no** asset, with the reason printed.

## What this session does not build (logged in `ROADMAP.md`)

1. **Discounting, tax effect and risk adjustment.** The register carries an **undiscounted** best estimate. A discounted present value is a separate judgment it does not perform, and there is deliberately **no default discount rate** in settings.
2. **Onerous-contract and decommissioning schedules.** The register carries the obligation a matter asserts, not a contract's unavoidable cost or an asset's end-of-life dismantling liability.
3. **Uncertain tax positions and current/deferred tax.** No tax provision, no uncertain-tax-position measurement, no current/deferred split, no effective-tax-rate reconciliation.
4. **Multi-currency translation.** Amounts cross only as per-currency minor-unit totals; no exchange rate is held or invented.
