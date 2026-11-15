# ADR-0221: The Duty-Without-Means Register — Accountability–Means Parity & Simons' Entrepreneurial Gap Ledger

- **Status:** Accepted
- **Date:** 2026-11-15
- **Scope:** Schema `v174 → v175`, CSV `#163` (`duty-without-means`), Post-Commit Rule `RULE-DWM-01` (spine rule `137/137`), Route `#/means`
- **Primary Altitude & Structure:** Frontline / mid-manager (ranks 1–2 carry duties, declare what means an assigned outcome duty requires, and surface structural gaps first-person; ranks 2–5 assign duties and supply/decline means on lines they control; ranks 3–5 govern joint-apex escalations) × **matrix and single-chain**

## Context

Across operations, engineering, clinical, and field-service organisations, the single most corrosive failure of day-to-day leadership is **accountability without means**: holding a frontline supervisor or mid-manager answerable for an outcome whose required decision authority, funding envelope, or protected capacity share sits with another manager.

In a single-chain hierarchy, a manager assigns an outcome target while keeping the spend limit, vendor-direction right, or staffing relief one or two rungs higher. In a matrix organisation, the defect doubles: **Line A** (for example, a programme or product lead) holds a shared contributor or frontline supervisor accountable for a delivery outcome while **Line B** (for example, the home functional manager) controls the contributor's protected hours (`shareH`), maintenance budget, or process-halt authority. Neither Line A nor the carrier can compel Line B to release those means, yet when the target slips, the carrier bears the blame for an inter-line deadlock they lacked authority to resolve.

Existing org-design and RACI/RAPID platforms (Orgvue, Functionly, Holaspirit, ServiceNow IRM) treat "Accountable" as a static text tag on a role chart; none join a dated outcome duty against typed, unit-pure means pillars across a live multi-line matrix DAG, prove that the seat promising a means actually controls that line, refuse cross-requirement netting and FX pooling, and escalate unresolved locks strictly above both competing lines (`[BENCHMARK-UNVERIFIED]` against commercial runtimes unavailable in this offline environment).

## Theoretical Grounding

1. **Simons (1995, *Levers of Control*; 2005, "Designing High-Performance Jobs", *Harvard Business Review*)** — *Span of Accountability vs Span of Control (the Entrepreneurial Gap)*: when accountability exceeds directly controlled resources without committed cross-unit support or an explicit executive entrepreneurial-gap sign-off above both spans, stretch degenerates into structural impossibility.
2. **Fayol (1916, *Administration Industrielle et Générale*, Principle #2)** — parity of authority and responsibility.
3. **Jaques (1989, *Requisite Organization*)** — requisite resource-access, veto, and escalation authority must match task-horizon accountability; unresolved trade-offs belong one stratum higher.
4. **Holmström & Milgrom (1991, *Journal of Law, Economics, & Organization*)** — multi-principal agency distortion when Principal A demands an outcome whose effort or budget Principal B controls.
5. **Kahn et al. (1964, *Organizational Stress*)** — resource-inadequacy and inter-sender role conflict in multi-line structures.

## Decision

1. **Four additive, empty-at-upgrade collections (`Schema v175`)**:
   - `dutyMeansDuties`: dated accountable duties naming `carrierId`, `demandingLineHolderId` (proved on the live matrix to hold `carrierId`, never equal to `carrierId`), window, written `outcomeBasis`, source reference, and atomic append-only retirement fields.
   - `dutyMeansRequirements`: typed required means pillars (`authority`, `budget`, `time`) naming `controllingHolderId` (never `carrierId`). Each pillar owns its exact unit fields: `authority` carries `authorityScope` (with money only on `spend-commit`), `budget` carries `currency` + integer `requiredCents`, and `time` carries integer `requiredHours`.
   - `dutyMeansActs`: append-only responses (`supplied`, `declined`, `revoked`, `accepted-gap`) where the newest act on or before `asOf` governs.
   - `dutyMeansMarkers`: identity-free observations written when a rule condition has no reachable addressee on the live graph.
   - Conventions `dutyMeansResponseDays` (1–60, default 7) and `dutyMeansAutoPropagate` (default `true`) persisted through `DEFAULT_SETTINGS` and `normalizeSettings`.

2. **First-person frontline registration & asymmetric retirement**:
   - Frontline supervisors and mid-managers (`DWM_RIGHTS.DECLARE`, rank 1–5) can register an outcome duty they carry under a live manager (`actorId === carrierId`), ensuring unfunded mandates cannot be kept off the books by managerial omission.
   - Conversely, `carrierId` can **never** unilaterally retire an owed duty (`dutyMeans:carrier-cannot-retire`); only `demandingLineHolderId` or a seat strictly above them can retire or rescope it.

3. **Impartiality & line-control proof (`Line A cannot promise Line B's means`)**:
   - Recording `supplied`, `declined`, or `revoked` (`DWM_RIGHTS.SUPPLY`, rank 2–5) requires `isHolderOrAbove(matrix, actorId, req.controllingHolderId)` and refuses `actorId === carrierId`. When a demanding line attempts to mark another line's hours, authority, or budget as supplied, the door refuses (`dutyMeans:demanding-line-cannot-supply-other-line`).
   - Declared matrix percentages (`shareH`) are printed beside cross-line requirements as factual context only and are **never** multiplied into fabricated supplied hours.

4. **Exact unit-pure conservation & drift detection**:
   - Money is parsed once via `BigInt` (`parseDwmMoneyToCents`) and read from storage as safe integers only (`readStoredDwmCents`).
   - Per requirement, `covered` is capped at `required` (`covered + acceptedGap + unbackedShortfall === required`), preventing an over-supplied item from masking a shortfall on another item. Currencies are never converted or pooled; hours are never priced into money.
   - Supplier and governor standing are re-evaluated on every read against `buildMatrix`; departures or reorgs move stale approvals to `drifted`.

5. **Simons' bounded entrepreneurial gap & strict joint-apex escalation (`RULE-DWM-01`)**:
   - Recording `accepted-gap` (`DWM_RIGHTS.GOVERN`, rank 3–5) requires `isStrictlyAboveAll(matrix, actorId, [demandingLineHolderId, controllingHolderId])` — so a manager or director who declined a budget cannot sign off their own refusal; only a seat strictly above both lines can retain the gap, and accepted-gap amounts stay separate from `covered`.
   - `RULE-DWM-01` (spine rule `137/137`, pause-governed by `dutyMeansAutoPropagate` and registered on `PAUSE_PERMIT_MATRIX_REACH_SWITCHES`) issues bounded, opaque `act-inform` delegations (`duty-unscoped` → demanding line; `means-unanswered` → controlling line; `means-gap-escalation` → `matrixJointApex` over all involved holders' managers) and writes identity-free `dutyMeansMarkers` when no joint apex exists.

6. **Altitude redaction, two separate claims & CSV `#163`**:
   - Above the director altitude (ranks 4–5), `buildDutyMeans` preserves line holders, duty labels, verdicts, and exact numeric conservation totals while redacting individual carrier identity (`carrierIdentityWithheldN`), keeping `countsReconcile` (`true`) separate from `figuresComplete` (`false` with explicit reason).
   - CSV `#163` (`duty-without-means`) exports one workspace control row plus one row per currency, identity-free by construction.
   - Method diagram `app/assets/duty-without-means-method.jpg` (55,890 bytes, SHA-256 `ccc32fa014102ce0e0029caaf46826dd64ce819a3a401a2ccad6c0e0b2d6da67`) generated via built-in AI image generation (`higgsfield` connector unsupported in this environment).

## Consequences

- **Positive:** Frontline supervisors and mid-managers gain a first-person, non-punitive ledger to put unresourced duties on the record; peer-line deadlocks route automatically to the lowest common leader who actually holds authority over both lines.
- **Boundaries / Out of Scope:** Does not auto-block calendar invites or ERP purchase orders, does not infer hours from `shareH`, and does not perform live FX conversion across currencies.
