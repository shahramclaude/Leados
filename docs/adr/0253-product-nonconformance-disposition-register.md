# ADR-0253 — Product Nonconformance & Disposition Register: one identified lot or serial, a recorded containment, a joint disposition, an independent senior re-verification and a separate release

**Date:** 2026-11-18 · **Status:** Accepted for the canonical source app · **Surface:** Product nonconformance (`#/nonconformance`) · **Storage:** v205 → v206, six ledgers, CSV scope #192, `RULE-QNC-01`.

## Context

Every operations register in this workspace so far describes a **duty**: a permit authorises work, an authority grants a power, a claim asserts an amount. None of them answers the first quality question on a shop floor — *what did we make that failed, where is it now, who decided what to do with it, and who proved the rework was good?*

The nearest existing thing is the Standard Work abnormal check ([ADR-0190](0190-leader-standard-work-tiered-daily-management.md)) and its instrument look-back ([ADR-0252](0252-instrument-use-lookback.md)). The look-back deliberately stops at "which decisions should be reviewed"; it does not disposition a lot, and that refusal is correct. Nothing in the app held a product case, and a lot with a recorded failure and no containment act is the failure mode a quality register exists to prevent.

This ADR adds one narrow register for **one internally identified manufactured output at a time** — a lot or a single serial — and nothing else. It is not a CAPA system, a supplier portal, a customer-notification workflow or a recall/field-action trace.

## Decision

### Declarations and dated acts, and no stored state

Six ledgers, all empty on upgrade:

| Ledger | What it holds |
| --- | --- |
| `qncCases` | case reference, product, site, **one** identifier kind (`lot` \| `serial`) with its value, source kind, requirement reference, the requirement, the finding, source-evidence reference, identified day, 1–4 accountable hands, declarer, capture instant |
| `qncContainments` | scope (`entire` \| `partial`), control method, written hold reference, evidence reference, note, attesting hand, instant |
| `qncDecisions` | decision round, the matrix route snapshot, disposition, written reason, written concession reference (use-as-is only), signing apex, instant |
| `qncDispositionActs` | sequence, kind, evidence reference, note, performing hand, instant |
| `qncVerifications` | the rework completion it judges, outcome (`pass` \| `fail`), evidence, note, verifier, instant |
| `qncMarkers` | `RULE-QNC-01`'s identity-free observations |

No state, hold flag, approval verdict, verification result or release status is stored. Every one is derived on read from those acts plus the **live** reporting graph.

**Identifier kind is a declared field, not two optional columns.** The candidate design carried a bare `lotRef`, which left the reader unable to tell whether the value described a lot or a unit, and would have let a record carry both or neither. One case names one kind and one value, or it is refused at the door and dropped by the loader.

### Containment is an attestation, and the newest attestation governs

A containment row records what a named hand **says** was done, against a **written hold reference** and an evidence reference. It is not an ERP, MES, WMS or shipping block, and nothing in this register can prevent a pick. The screen says so permanently.

The derived `fullContainment` is the **latest** attestation's scope. An earlier `entire` act does **not** survive a later `partial` one: the case returns to `containment-partial`, and the screen prints how many earlier attestations had claimed the whole output. Summing history into a stronger claim than the last hand made was the defect this rule exists to prevent.

### The joint apex decides, in rounds, by signature — never by majority

The required route is the sorted minimal common apex (`matrixJointApex`) above the active reporting lines of **every** accountable hand. Every apex must sign the same disposition with the same concession reference in the same round. Consequences, all derived:

- a partly signed round is `awaiting-joint-approval` and authorises nothing;
- two dispositions in one round are `decision-disagreement` — never a majority, never first-write-wins;
- a signature round made under a route the live matrix no longer produces is `authority-changed`, and history is retained;
- an unresolvable route (a hand off the graph, a disconnected graph, a synthetic-root-only apex, more apexes than the declared ceiling) is `authority-unresolved` and **nobody is substituted**.

`allowedActKinds` is derived from the current complete round: rework needs a completion; return needs `returned`; scrap needs `scrapped`; use-as-is needs a written concession and `released-under-concession`; a release after rework needs a passing verification **first**. The action refuses any act outside that list, so order cannot be replayed out of sequence by a caller.

### Independence is strict seniority, enforced on the write path

A passing re-verification releases an output, so "somebody else" is not enough. `qncVerificationSeniority` requires a **different** hand that is **strictly senior** to the hand that completed the rework on the live graph. The same function runs inside `qncVerifyRework` (refusing the write) and inside the reader (so an imported self- or peer-verification is **kept, printed and counted**, but never satisfies the state). This mirrors `assuranceVerifierReach`, which the assurance register applies on both paths.

### Rights, disclosure and the route boundary

| Right | Rank | Why |
| --- | --- | --- |
| `read-product-nonconformance` | 1–5 | the finding is read where it is made; above rank 3 the reader prints counts only |
| `open-product-nonconformance` | 1–5 | a register that needs a manager present to write a nonconformity is filled in on Fridays |
| `contain-product-output` | 1–5 | the hand that finds the lot is the hand that holds it |
| `decide-product-disposition` | 1–5 | the *action* re-proves apex membership; rank alone never makes a decider |
| `perform-product-disposition` | 1–5 | rework, return, scrap and release are performed by whoever carries the case |
| `verify-product-rework` | 2–5 | a verifier must be a leadership seat, **and** strictly senior (above) |
| `govern-product-nonconformance` | 4–5 | scan and conventions |

The route is open (floor 1) because the reader itself scopes by span and line and withholds detail above rank 3. A disclosure manifest is declared, so the console can audit the module rather than withholding it as an unknown route.

**Boundary defect found while wiring:** `provisions` had `read-provisions` and `manage-provisions` declared at rank 3–5 but was absent from `PORTFOLIO_ROUTES`, so `routeRankWindow('provisions')` returned floor 1 and the nav offered a screen whose collections (portfolio class, minRank 3) and disclosure manifest both withhold. The data was never exposed — the collection policy refuses it — but the boundary was inconsistent. `provisions` is now in the portfolio list, and `routeRankWindow('provisions')` returns the floor its rights declare.

### Exports

CSV scope **#192** is identity-free: one summary row and one row per derived state, counts only. No case, product, site, lot, serial, requirement, finding, person, manager, concession, evidence reference or act day crosses the boundary, and a non-zero count below the fixed privacy floor of three is **blank with a reason**, never a small number.

### The rule

`RULE-QNC-01` files at most one ask per (condition, case, addressee), from five conditions derived by the same reader: `containment-owed`, `decision-owed`, `authority-unresolved`, `verification-owed`, `act-owed`. Asks are `act-inform` delegations to the **joint apex above every accountable line**, carry typed `issues-obligation` provenance with an **opaque** `qnc1:…` signature (no product, lot, requirement or person in the text), close themselves when the condition clears, are capped at four per commit and are pause-governed on every path (`qncAutoPropagate`, a cross-line switch registered in the pause-permit reach census).

## Consequences

- The register describes a case, never a person: no score, rating, ranking or cause is written anywhere, and no line is named as blame.
- A failed re-verification is a retained fact and leaves the lot held; it opens the next decision round rather than being erased.
- Return and scrap are terminal **non-release** outcomes; "closed" never means "released" unless a release act is on the record.
- A recorded containment cannot be upgraded into a claim that the floor was cleared, and the method text says so.

## Limits and what is deliberately absent

No ERP/MES/WMS/shipping integration; no automatic release; no default disposition, quantity, risk class or urgency window; no customer or regulator notification, delivered-lot trace, field correction, recall or RMA; no CAPA or root-cause analysis; no supplier portal, document store, image evidence or certificate of conformity; no service-output cases, multi-lot campaigns, split-lot quantity reconciliation or genealogy graph.

**No conformity claim.** ISO 9001:2015 is withdrawn and the 2026 edition is current, but this implementation was not assessed against the 2026 text. The method text states that plainly. The workflow records identification, control, authorised disposition and verification as separate dated human acts; it does not certify conformity and it is not a controlled procedure.

Benchmark position: the vendor category (MasterControl, Octave Reliance and comparable configurable nonconformance modules) describes intake, investigation, disposition and routing. Those are vendor-published category descriptions, not independent trials, so parity is **[BENCHMARK-UNVERIFIED]**.

## Verification

`tests/app/product-nonconformance.test.mjs` covers the loader (identifier kind/value, both-absent and unknown-kind drops), the newest-attestation containment rule, unanimous joint signature and disagreement, strict-seniority verification on both paths, act ordering, terminal return/scrap, use-as-is without and with a written concession, the projection boundary above rank 3, CSV floor blanking and the rule's idempotence, closure and opaque signatures.
