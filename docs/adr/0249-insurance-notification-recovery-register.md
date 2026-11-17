# ADR-0249 — Insurance Notification & Recovery Register: which policy answers for each claim, when the insurer must be told, whether it was told in time, and what the organisation actually carries

- **Status:** Accepted and shipped (Session 327, 2026-11-17)
- **Schema:** v202 → v203 (five additive, EMPTY-at-upgrade collections: `insPolicies`, `insCoverages`, `insNotifications`, `insRecoveries`, `insMarkers`; three bounded conventions; `insAutoPropagate` pause switch)
- **Route:** `#/insurance` (14 aliases: `#/insurance-policy`, `#/insurance-policies`, `#/insurer`, `#/insurers`, `#/insurance-coverage`, `#/insurance-recovery`, `#/insurance-notification`, `#/notification-window`, `#/claims-made`, `#/occurrence-policy`, `#/notice-of-circumstances`, `#/indemnity`, `#/deductible`, `#/underwriter`, `#/contingent-liability`, `#/insurance-register`, `#/broker-notice`)
- **Rule:** `RULE-INS-01` (spine rule **162/162**, pause switch `insAutoPropagate`)
- **CSV:** Scope #190 (`insurance-recovery`), aggregate and identity-free
- **Primary altitude × structure:** **Director / VP and CEO / C-suite × matrix** (with rank-1 reading and frontline notification execution)

## Context & the gap this closes

ADR-0248 gave the workspace a claim, limitation and settlement-authority register (`#/claims`), and explicitly logged the next gap in its §What this session does not build:

> **Contingent liability, insurance recovery & notification** — which insurance policy responds to a matter, the notification window under the policy, and the recovery against the reserve; IAS 37 / ASC 450 contingent-liability classification.

In real leadership and general-counsel practice, a third-party claim does not sit on the balance sheet in isolation. Almost every material employer's liability, public/product liability, professional indemnity, directors & officers (D&O), employment practices (EPL), cyber or property matter is answered — in whole or in part — by an insurance policy. That policy imposes a **condition-precedent notification window** ("as soon as practicable and in any event within N days"). Missing that window is how a solvable, insured claim becomes an uninsured hit to the P&L:

1. **The incident happens on one line, the policy sits with another, and the notification window runs from the trigger day.** An occurrence policy runs from the occurrence day; a claims-made policy runs from the day the claim was first made (or circumstances were notified). Neither waits until a finance director or general counsel recognises the matter as insured.
2. **A linked policy is assumed to respond without testing the trigger day against the policy period.** Linking a 2026 policy to a 2025 occurrence — or an expired claims-made policy to a new tribunal claim — produces false comfort unless the reader tests the trigger day against `[periodStartDay, periodEndDay]` and prints `no-cover` when it falls outside.
3. **A default notification window is a fabricated deadline.** Every policy and endorsement sets its own window in whole days. A register that defaults to 30 or 90 days invents cover terms the insurer never agreed.
4. **Gross exposure, insurance recovery and net cost are conflated.** Under IAS 37 (paras 53–58) and ASC 450, the gross provision is a liability of the enterprise, the insurance recovery is a separate reimbursement asset recognised only as recovery moves, and the **net cost** (`gross − recovered`, floored at zero) is the figure finance actually carries.

## Benchmark (Step 3.5)

Compared against **Xakia** (Dispute Management & insurance coverage tracking), **ClaimVantage / Origami Risk / Ventiv** enterprise risk & insurance claims management, and specialty insurance notice practice (CRC Group excess-notice guidance, Hunton Andrews Kurth claims-made notice analysis, Vouch / Apex occurrence vs claims-made trigger analysis) — **[vendor documentation fetched 2026-11-17; hands-on parity UNVERIFIED]**:

- **Matched:** policy register with declaration-page reference, insurer, class, basis (`occurrence` | `claims-made`), period, limit and deductible; coverage linking a matter to a policy; notification ledger with method (`broker`, `insurer-direct`, `notice-of-circumstances`, `bordereau`) and reference; recovery ledger tracking claimed, interim, recovered and denied amounts.
- **Exceeded:**
  1. **Derived deadline from the policy's own declared window + the matter's trigger day** — zero stored deadline, zero default window; an unreadable trigger day or window prints `notification-unprovable` with **no day count**.
  2. **Automatic cover test against the policy period** — occurrence policies test the claim register's accrual day; claims-made policies test the matter's opened day; a trigger day outside `[periodStartDay, periodEndDay]` prints `no-cover`.
  3. **Late notice kept as a breach fact, never upgraded into an allegation that cover was lost** — a notification recorded after the derived deadline prints `notification-late` with the exact days over, while stating plainly that the register holds no insurer feed and cannot say whether the insurer accepted the late notice.
  4. **Derived net cost (`grossMinor − recoveredMinor`)** — read live from the claim register's gross exposure less paid recoveries, printed apart from both, and withheld across mixed currencies rather than converted at an invented rate.
  5. **Matrix joint-apex routing (`RULE-INS-01`)** — asks go to `matrixJointApex` over every active line holding any responsible hand on the policy, with opaque delegation text so commercially sensitive insurer and policy details never leak upward.

## Decision

### 1. Five fail-closed ledgers, zero derived fields stored

- `insPolicies` — `id`, `policyRef` (declaration-page reference, ≥ 4 chars), `insurerRef`, `policyClass` (`employers-liability`, `public-liability`, `professional-indemnity`, `directors-officers`, `employment-practices`, `cyber`, `property-business-interruption`, `other`), `basis` (`occurrence` | `claims-made`), `periodStartDay`, `periodEndDay` (reversed period dropped), `notificationWindowDays` (integer `0..3650`, never defaulted), `limitMinor`, `deductibleMinor`, `currency` (3-letter ISO), `triggerRef` (required when `policyClass` is unsupported), `responsibleIds` (1–4 valid ids, read whole or dropped), `declaredById`, `declaredAt`.
- `insCoverages` — `id`, `matterId` (must exist on `lfgMatters`), `policyId` (must exist on `insPolicies`), one per `(matterId, policyId)` pair, optional `coveredMinor` + `currency`, `basisRef` (≥ 8 chars), `declaredById`.
- `insNotifications` — `id`, `coverageId` (at most one per coverage), `notifiedDay`, `method`, `referenceRef` (≥ 4 chars), `recordedById`. A notification after the derived deadline is **kept** and prints `notification-late` with `lateBy` whole days.
- `insRecoveries` — `id`, `coverageId`, `kind` (`claimed`, `recovered`, `denied`, `interim`), `atDay`, `amountMinor` + `currency` (required on money-moving/claimed kinds, forbidden on `denied`), `basisRef` (≥ 8 chars), `recordedById`. A denial is **kept** with its reason and moves the net cost back to gross.
- `insMarkers` — identity-free observation markers written by `RULE-INS-01` when no joint seat can be resolved.

### 2. Ten derived states (`deriveInsNotification` / `buildInsurance`)

In priority order: `no-cover`, `notification-unprovable`, `recovery-denied`, `partially-recovered`, `recovered`, `recovery-pending`, `notification-late` (either notified after the deadline or unnotified past the deadline), `notified-in-time`, `notification-urgent` (unnotified inside half the declared warning horizon), and `unnotified`.

### 3. `RULE-INS-01` on the post-commit spine

Fires on `notification-late`, `notification-urgent`, `notification-unprovable`, `no-cover` and `recovery-denied`. Routes each ask to `matrixJointApex` over every line holding any responsible hand on the policy; caps at 4 asks per commit with the remainder counted `deferred`; writes one identity-free `insMarkers` observation when no seat can be asked; self-closes when the condition clears; and is pause-governed on every path by `insAutoPropagate`.

### 4. CSV #190 (`insurance-recovery`)

31 columns: one `summary` row and one `state` row per published state key. Carries counts, day extremes and whole-register minor-unit totals only — no insurer, policy reference, matter reference, person, manager or individual day. Per-state counts below `insPrivacyFloor` export blank with `blank_reason`.

## What this session does not build (logged in `ROADMAP.md`)

1. **Multi-layer tower & excess attachment erosion** — primary vs first-excess vs second-excess attachment points, automatic erosion of underlying limits across matters, and drop-down cover when an aggregate limit is exhausted.
2. **Broker bordereau & insurer claims-portal ingestion** — automated reconciliation of broker loss runs and insurer reserve/payment feeds against `insNotifications` and `insRecoveries`.
3. **Subrogation & third-party contribution recovery ledger** — pursuing a culpable third party or co-defendant after the insurer or the enterprise has paid, and splitting recoveries between insured and uninsured loss.
4. **Actuarial IBNR & captive retention triangle** — incurred-but-not-reported (IBNR) development triangles and captive/self-insured retention (SIR) aggregate stop-loss tracking.
