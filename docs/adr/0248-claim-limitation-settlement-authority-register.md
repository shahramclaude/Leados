# ADR-0248 — Claim, Limitation & Settlement-Authority Register: what is being asserted against us, the day the clock started and the rule that makes it the right day, whether that clock is provable at all, and whose authority reaches the number it may settle for

- **Status:** accepted and built — Schema v202, route `#/claims`, `RULE-LFG-01` on the shared spine (**161/161**), CSV scope #189, demo seed (10 matters, all nine states), insights signals (LFG-01..05), focused suite **36/36**.
- **Date:** 2026-11-17
- **Deciders:** Somebody wrote to the organisation in March. The letter sat in a director's inbox for six weeks because it did not look like a claim. By the time legal saw it the limitation period had nine days left, nobody had booked the expert the case turns on, and when the organisation wanted to settle, four people had to be found to agree a number nobody had ever written down as a ceiling. Every one of those facts was answerable from a spreadsheet maintained by hand, and **none of them was answerable from the workspace**, which could store a decision, a delegation, a conflict of interest, a risk appetite, a regulatory undertaking, an information request, a statutory authorisation and a workplace restriction — every one of them an INTERNAL instrument. Not one held a matter in which a third party asserts something against the organisation and a clock, set by somebody else, runs against it. This register answers four questions the record could not previously ask: **what is being asserted, when does the clock stop and on what rule, is that clock provable at all, and whose authority reaches the number it may settle for.**
- **Schema:** **v202** (v201 → v202). Seven additive collections, all **empty at upgrade**: `lfgMatters`, `lfgAccruals`, `lfgStays`, `lfgResolutions`, `lfgConcessions`, `lfgAuthorityGrants`, `lfgMarkers`. No claim, accrual, suspension, resolution, concession or authority is inferred from anything an upgraded workspace already holds. Three bounded conventions: `lfgAutoPropagate` (pause switch, defaulted ON), `lfgPrivacyFloor` 3 [2–20], `lfgWarningHorizonDays` 90 [1–365]. **There is deliberately no default limitation period, no jurisdiction table and no automatic accrual**: a period belongs to the cause of action and the jurisdiction, and is declared on each matter. The warning horizon is a *planning* convention and is never a limitation period; a comment in `lfgRegistry.js` says so where the default is declared.
- **Surface:** `#/claims` — four panels: Matters (every matter sorted by urgency of the clock then by provable exposure, with its accrual, deadline, day count, exposure, state and flags), Limitation clocks (the full arithmetic: accrual, the rule relied on, the period, the base deadline, the exact suspended days, the effective deadline, the whole days remaining or over, plus every suspension with its computed proof and what is missing), Settlement authority (claimed, reserved, paid, costs, the computed ceiling, the joint apex, the resolved sum and the exact gap), Method (the published basis, the nine-state vocabulary, the three conventions and what the register refuses to claim). Seven dialogs: open a matter, declare an accrual, record a suspension, record a resolution, record a concession, declare an authority, re-declare the conventions. CSV export button and a by-line roll-up where a person is counted once.
- **Code:** `lfgRegistry.js` (closed vocabularies: nine matter states, three stay states, ten claim types **each carrying its accrual rule**, four stay kinds **each carrying what proves it**, five resolution kinds **each carrying whether it takes an amount**, seven concession kinds **each carrying whether it moves money**, rights, refusals, bounds, 31 CSV columns and descriptor, method copy, and the rejected-as-covered hunt record), `lfgMath.js` (calendar-month arithmetic with the end-of-month clamp, inclusive stay spans with overlap merging, floored whole-day counts, integer minor-unit money), `lfgSchema.js` (seven fail-closed loaders + `normalizeLfgSettings`), `lfgClaims.js` (the ONE reader: `buildClaims`, `deriveLfgClock`, `deriveLfgSettlement`, `claimAttentionCount`, `claimSignals`, disclosure ladder, `balances` / `figuresComplete`), `lfgActions.js` (seven seat-checked commands + three reads, named-control refusals), `lfgReport.js` (identity-free CSV rows), `lfgRules.js` (`RULE-LFG-01`), `views/claims.js` (four panels, seven dialogs, CSV export). Wired through `schema.js` (migration 201 → 202), `seatRegistry.js` (seven entities + two rights), `accessGateway.js` (two rights, three safe reads), `actions.js`, `main.js` (nav, badge, route, seventeen aliases), `propagationContracts.js`/`postCommit.js` (spine **161/161**), `pausePermitRegistry.js` (`lfgAutoPropagate`), `csv.js` (#189), `insights.js` (LFG-01..05 + the `Claims & limitation` bucket), `demo.js` (`seedClaims`).
- **Tests:** [`claims.test.mjs`](../../tests/app/claims.test.mjs) — **36/36 pass**. Neighbouring pins moved and re-run green: `domain-sense-wiring` 7/7 (v201 → v202, spine 160 → 161), `permit-to-work` 48/48 (its migration list now asserts ADR-0248's step by position, CSV count #188 → #189), `statutory-authorisations` 26/26, `lone-working` 31/31, `employee-voice` 28/28, `mutual-aid` 20/20, `personal-dealing` 29/29, `csv` 5/5 (its stale #188 pin repaired to #189). `npm run lint` clean on every new file, `npm run check:boundary` clean (1,141 app ES modules / 304 suites / 23 doc checks), `npm run check:a11y` clean (148 routes).
- **Builds on:** ADR-0140/0141 (the ONE matrix engine — `matrixJointApex` decides whose authority applies and is never re-implemented), ADR-0239 (the money-exactness convention: integer minor units, separate currencies, no implicit rate), the `issues-obligation` typing and identity-free marker conventions of ADR-0228/0232/0240/0242/0243/0244/0245/0246/0247, and the standing rules that a figure is derived on read, that silence is never a passing value, and that a state which cannot be derived is not a state.

## Context

An organisation is sued, threatened, fined, or served with a demand. A claim arrives as a letter, a form, a regulator's notice or an employee's escalation, and from that moment a clock runs that the organisation did not set. The failure modes are consistent, and every one of them is a **record** failure rather than an intelligence failure:

1. **The clock is dated from the incident.** Limitation runs from *accrual* — the breach, the act, the date of termination, or the date of knowledge — and those are different days. A spreadsheet column filled in by whoever read the letter last month is not an accrual.
2. **The date is typed, not derived.** A limitation date is entered once and never recomputed, so a suspension agreed later never moves it and a deadline computed against a superseded period stays on the dashboard looking fine.
3. **A stay is believed rather than proved.** Somebody notes "we're in standstill" and the clock is treated as stopped, although nobody ever executed the agreement. The deadline that belief moved is then wrong in the direction of comfort.
4. **A settlement is approved without a ceiling.** A number is agreed at mediation against nothing in particular, and the question "who was authorised to pay this" is answered after the money has gone.
5. **What was conceded is not a record.** The reserve, the offer, the interim payment, the costs and the interest live in different places, so the total exposure is a reconstruction rather than a sum the record can prove.
6. **A passed deadline is reported as a lost claim.** "Time-barred" becomes "we have lost it" in a report, when the record can only prove the deadline passed — it holds no filing receipt and no court feed.

**The vendor bar, and what was rejected as already covered.** Word-boundary searches of `app/` before this build returned **zero files** for `limitation period`, `cause of action`, `employment tribunal`, `early conciliation`, `claimant`, `litigation`, `without prejudice`, `reserved rights`, `standstill`, `tolling`, `settlement authority`, `counsel`, `solicitor`, `damages`, `injunction` and `indemnity`. The surviving hits are of three kinds and none is this duty: `limitation` in prose about a *methodological* limitation, `dispute`/`mediation` inside the internal priority-arbitration register (a disagreement between two internal parties), and `settlement` as the name of the Outcome Attribution & Loop Settlement Terminal (ADR-0067), which settles a *forecast*. Six adjacent instruments were examined and rejected: statutory authorisation (ADR-0247 — a grant *by* a regulator, not an assertion *against* us), information request (ADR-0235 — a demand for documents, not a claim for money), regulatory undertaking (ADR-0234 — our promise outward), incident command (ADR-0240 — an event and its notification clocks), workplace adjustment and probation gates (ADR-0241/0233 — internal employee processes), and risk appetite (ADR-0219 — a declared tolerance, not a third party's demand). The positive claim and the rejected list are written into `lfgRegistry.js`'s header so the hunt is auditable. Wider absence **[UNVERIFIED]**.

Benchmarked against fetched vendor documentation on 2026-11-17 — **[vendor documentation, hands-on parity UNVERIFIED]**; no vendor environment was run:

| The bar | Where it is set | What this register does |
| --- | --- | --- |
| One matter record with parties, claim type, limitation date, sum claimed and amount at risk | **Xakia Dispute Log** (`limitation periods`, `claim amounts and the amount at risk`, `insurance coverage`, `proceedings tracked across multiple stages`); **Maatdesk**, **CloudLex** (a limitation date on the matter, surfaced as upcoming or overdue until satisfied) | **Matched, then derived.** The deadline is computed from the accrual, the declared period and every proved suspension, and recomputed on every read — never stored. |
| Early, escalating warning against statutory cutoffs | Law-firm docketing practice (banners at twelve, six and one months); **ExpiryEdge** (jurisdiction-specific limitation tracking with escalation protocols) | **Matched** with named bands (approaching / urgent / critical) over a *declared* horizon, and the band boundaries printed. |
| Delegated settlement authority with limits and multi-level approval | **Xakia** (`approval workflows based on amount and delegated authority limits`); enterprise legal management (Legal Tracker, TeamConnect) | **Exceeded.** The ceiling is not a field on the matter: it is the **joint apex over every responsible line**, resolved through the one matrix engine, and a settlement above it is *kept and the gap printed* rather than rejected after the money moved. |
| An audit trail of what was conceded, to whom, on what basis | Category norm | **Matched and separated.** Reserve, offer received, offer made, payment on account, costs and interest are six kinds with their own days and exact minor-unit sums, printed apart so a provision is never confused with money spent. |

**What no benchmarked product in this category expresses — and why that is the point rather than a feature.** A legal-matter product stores a limitation date somebody typed and an approval somebody gave. It cannot express the four facts a real organisation actually fails on:

- **the clock's ORIGIN is a declared fact about accrual and knowledge**, not the incident date, and a matter whose accrual cannot be read prints `clock-unprovable` with **no day count at all** rather than a plausible default;
- **a suspension is proved or it moves nothing**, with each kind's evidence named and an unproved allegation kept and printed rather than deleted;
- **authority is computed, not typed**, and an ambiguous apex is *named* rather than resolved by picking a "matter owner";
- **a passed deadline is not a resolved claim**, and the register says so on the page.

## Decision

Build the register as one reader over seven append-only ledgers, with every state, deadline, day count, ceiling and total **derived on read** and **never stored**.

### 1. Seven ledgers, nothing derived

`lfgMatters` (the document that started the clock, the party, the claim type, the forum, the currency, the sum claimed and one to four responsible hands), `lfgAccruals` (**one per matter**: the accrual day, the written rule relied on, the date of knowledge where the type requires it, and the declared period in whole months), `lfgStays` (kind, instrument, parties, span, and the `proved` flag **computed by the loader**), `lfgResolutions` (**one per matter**: kind, day, exact amount where the kind takes one, basis), `lfgConcessions` (seven kinds, each dated, based and exact), `lfgAuthorityGrants` (person, scope, currency, ceiling, basis), `lfgMarkers` (the rule's identity-free observations).

No state, deadline, day count, computed ceiling, paid total or `time-barred` flag is stored anywhere. A stored deadline is a deadline that can disagree with the accrual beside it.

### 2. The clock runs from the LATER of the damage and the date of knowledge

For a knowledge-based claim the cause of action accrues when the claimant first knew, or ought reasonably to have known, the facts that make the claim arguable — and that can never precede the damage that founds it. `deriveLfgClock` therefore takes the **later** of the two days the record carries. Using the damage date alone would place every knowledge-based deadline years early; using the knowledge date alone would let a matter that was knowable on day one print an artificially distant deadline. Both are the same class of error.

*(This was found by the demo, not by inspection: the first seed drove a personal-injury deadline from the injury date and produced a date 650 days out where the fixture intended a deadline inside the horizon. The kernel was wrong and the fixture was right.)*

A loader **drops** an accrual whose date of knowledge precedes its damage date, because whichever of the two days the register picked would be a deadline nobody could defend.

### 3. Periods are calendar months; days are UTC; money is integer minor units

A limitation period is stated in law as years or months, so converting it to days is wrong twice over: it invents a convention nobody declared and drifts every leap year. `addMonthsUtc` advances the accrual day by whole months on the UTC calendar **with the end-of-month clamp** (31 January + 1 month = 28 February, 29 in a leap year). A stay span is **inclusive of both ends** (1 February to 10 February suspends 10 days), and overlapping spans are **merged** before summing, because two concurrent stays suspend the clock once. Day counts are whole UTC days: at 23:59 the day before a deadline there are **zero** whole days left, not one.

Money is an integer number of minor units with a three-letter currency, and a fractional value is **refused** at the door and **dropped** at the loader — never rounded into a total. A mixed-currency register prints **no** money total and exports a blank with its reason, because a rate it does not hold would have to be invented.

### 4. Proof is computed, never declared

`claimRecordStay` **refuses** a caller-supplied `proved` flag outright (`claim:proved-declared`). The loader computes it from the evidence each kind requires: a standstill needs **both parties named as signatories**; a conciliation certificate, a court order and a statutory suspension each need their instrument reference. An unproved stay is **kept** with `proved: false` and the exact missing evidence printed, because deleting the allegation would erase the belief while leaving the deadline that belief moved — and it contributes **zero** days.

### 5. The authority ceiling is computed from the reporting graph

The seat whose authority is required is the **joint apex over every active line holding every responsible hand**, resolved through `matrixJointApex`. Its ceiling is the **largest grant it holds** — two grants do not add up, because a grant is authority given. Where the apex holds no grant the ceiling is `null` and the register prints "no grant at the apex" rather than assuming a default. Where the engine reports several apex ids the record is **genuinely ambiguous** and the row says so rather than picking one.

A settlement or judgment above the ceiling is **kept and flagged** `settled-beyond-authority` with the exact gap printed. It is never rejected after the fact: the money was actually paid, and the governance failure is the gap, not the record.

### 6. Nine states, nine different facts

`merged`, `resolved`, `settled-beyond-authority`, `clock-unprovable`, `time-barred`, `critical`, `urgent`, `approaching`, `in-time`. Each carries its own printed meaning; the headline never hides the flags underneath (an allegation, an ambiguous apex, an orphan hand). `settled-beyond-authority` outranks `resolved` because it is the same fact plus the governance gap, and the gap is the reason to read the row.

`time-barred` says, in the state's own words and again in a banner on the page, that the record **holds no court feed and cannot state whether proceedings were issued**. A record gap is never upgraded into an allegation.

### 7. `RULE-LFG-01` asks above every hand, and says nothing it does not have to

Five conditions — `time-barred`, `urgent`, `clock-unprovable`, `settled-beyond-authority`, `stay-alleged` — each signed opaquely `lfg1:<kind>:<matterId>` and addressed to the **joint apex above every line holding ANY responsible hand**, never to one reachable hand, and never converted into an action the register takes itself.

**The ask text is deliberately opaque.** A claim register is privileged material: a delegation readable above the addressee that named the party suing us, the sum at stake and the forum would be a disclosure with a deadline attached. No title or outcome names a party, claim type, forum, matter reference, amount or person; the assertion is in the ADR-0248 suite (`claims.test.mjs` pins six forbidden substrings).

Idempotent per (signature, addressee); self-closing when the condition clears; it will not re-file an ask a human closed or returned; ≤ 4 new asks per commit with the remainder **counted as deferred**; identity-free marker where no seat resolves; **pause-governed on every path including the explicit scan**, because a limitation period runs out on the calendar with nobody having written anything.

### 8. The export is counts, day extremes and totals — nothing else

CSV #189 (`claims-control`) is aggregate and identity-free by construction: one summary row, one row per printed matter state, one row per printed stay state. No party, claim type, forum, instrument reference, person, manager or **individual day** crosses the boundary; amounts cross only as whole-register minor-unit totals. A per-state count below `lfgPrivacyFloor` exports **blank with its reason**, never as a small number.

## Consequences

- A claim that arrives at the front line can be opened the day the document arrives, at rank 1, by the hand that received it — which is the only thing that stops the six-week inbox delay the register exists to prevent. What protects the record is not rank but the written document requirement, the refusal to invent an accrual, and the ask going to the joint apex.
- A deadline is **always** the record's own arithmetic, recomputed on every read, so no import, clock change or careless edit can leave a green state over an expiry it disagrees with.
- An organisation that settles above its computed authority finds out from the register that it did, with the number and the gap — rather than from a board question a year later.
- The register gives **no legal advice and makes no merits assessment**. It records the clock and the money. It cannot tell you whether a claim will succeed, whether a period is correctly stated in a given jurisdiction, or whether proceedings were issued.
- A real-browser and assistive-technology walkthrough of `#/claims` is **[UNVERIFIED]**.
- Product parity is **[BENCHMARK-UNVERIFIED]** in the strict sense: vendor documentation was fetched and the mechanics matched on paper, but no vendor environment was run.

## Gaps logged, not built

1. **Court-feed and filing integration** — the single largest hole in the category claim: without a docket feed the register cannot prove proceedings were issued, and says so. [director / VP × matrix]
2. **Merits and quantum modelling** — a defensibility assessment and a quantified expected value per matter. Deliberately absent today because a merits score over a claim is an opinion the workspace cannot support. [VP / CEO × matrix]
3. **Insurance recovery and notification deadlines** — Xakia tracks coverage; this register holds no policy, no notification window and no recovery. The claim's gross cost is not its net cost. [director / VP × matrix]
4. **Multi-party and counterclaim structure** — a matter with a counterclaim, a third-party contribution or several co-defendants in one forum. [director / VP × matrix]
5. **Limitation rules engine per jurisdiction** — deliberately rejected for now: a table of periods would put a deadline on the record the organisation never declared. The right shape is a *declared* rule pack with the instrument cited, and it needs its own ADR. [director / VP × single-chain and matrix]
6. **Contingent-liability roll-up into the finance register** — reserve totals are computed here and are not carried into the budget or provisioning surfaces. [CEO / VP finance × matrix]
