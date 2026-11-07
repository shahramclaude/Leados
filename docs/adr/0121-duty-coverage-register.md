# ADR-0121 — Who answers for a duty when the holder is absent

- **Status:** accepted
- **Date:** 2026-11-07
- **Session:** 163 · Schema v114 (additive)
- **Deciders:** LeadOS maintainer; **frontline (rank 1) workflow primary**, with mid-manager, director, VP and CEO reading the same register at their own altitude
- **Surface:** `#/duty-cover` (aliases `#/duty-coverage`, `#/duty-cover-register`, `#/cover-register`, `#/stand-in`)

## Context

ADR-0075 declared, for every altitude, the duties that altitude performs: `frontline.coach`, `frontline.cover`, `manager.coordination`, `director.risk`, `chief.board` and so on. ADR-0076 enforced what a seat may read. ADR-0106 made the nave duties-first. None of them carried the register: when the seat holder is absent, **who is answerable for each duty, can that person reach it at all, and has their access ever been exercised?**

The real duty this serves is the most ordinary one in the product. A frontline lead calls in sick on a Tuesday. The workspace could state that a coaching cadence exists and could not say who picks it up, whether that person's altitude can answer it, whether they have ever touched the span, or what stops while nobody does. Every altitude asks the same question in its own unit of time: the lead for a shift, the manager for a week, the director for a fortnight, the VP for a quarter, the chief for the year.

The frameworks are named, not paraphrased: Kahn (1990) — a responsibility nobody was told about is not a responsibility; Weick & Sutcliffe (2007) — pooled coverage beats a single point everyone assumes is watching; Jaques (1956) time-span of discretion — a stand-in answers only if their altitude carries the duty's horizon; subsidiarity (Aghion & Tirole 1997, the ADR-0075 ladder) — cover rises to the lowest leadership ancestor whose span contains the duty, never sideways to a peer. Wilson (1927) bounds the register's rate.

## Decision

**A duty is a declared row; a cover is a dated human declaration; everything else is derived on read.**

1. **Declared, never fitted.** Duty lines come from `chainRegistry.ALTITUDES[].duties`. This module adds no duty, no rule and no automation decision. There is deliberately **no** command that assigns a stand-in automatically: a machine-assigned responsibility is an invented one, and inventing it is the exact failure this register exists to prevent.
2. **The eligible pool is the reporting tree, with printed reasons.** For a duty line held by a seat, candidates are: the seat itself, a leadership node inside its span at or above its rank, and every reporting-tree **ancestor**. A node **below** the seat's rank is offered and then refused with the Jaques reason printed; an IC never appears (no altitude); a **peer is never offered at all**, because a peer span is reached only through the common leader.
3. **"Exercised" is derived from dated records, never ticked.** `exerciseIndex` credits a candidate only with a dated record inside the *duty's* span: their own record when they sit inside the span, or a record they co-appear on with someone in the span (an ancestor's reach), or a 1:1 they held with a report in it. A declaration nobody exercises reads `thin`, never `covered`. A tick-box would be a second, decaying record of the same fact.
4. **One declaration, one atomic transaction.** `dutyCoverageDesignate` writes, in a single `store.update`: the `dutyCovers` row; one `prepares-for` typed edge from the cover to the person (the relation ADR-0113 already registers — no second vocabulary); one governed DACI decision that names the consequence if the cover fails; and one `rolls-up-to` edge per leadership ancestor above the covered seat. `dutyCoverageRevoke` is append-only with a required reason.
5. **The register rates the REGISTER.** `readinessPct` is the share of duty lines holding an eligible, *exercised* cover, with a Wilson 95% interval, and it is **refused** (`null`) when a seat declares no duty line — no denominator, no rate. No number in this module is a score of a person.
6. **The altitude roll-up is the same row, read at a rank.** A rank-1/2 seat and the operator view see cover names; rank 3 and above read counts, bands, seat labels and every refusal, with the cover's name withheld. The **band** is the same fact at every altitude.
7. **The upward brief and CSV scope #104 are identity-free by construction**: duty keys, bands, counts and the concentration share — no person, no seat id, no note, no decision id. A refused figure is BLANK, never zero.
8. **No new rule id.** Provisioning cover is a human, dated, atomic act on one duty line — the ADR-0113 pattern — not an event cascade worth a 91st post-commit rule. The dangerous pattern (one hand carrying a duty above a declared share) is a *printed derived reading*, not a governed decision engine.

## Schema v114

Additive only: `dutyCovers` (the declarations) and `dutyCoverageMarkers` (idempotency), plus two clamped, printed conventions — `dutyCoverageExerciseDays` (30, bounds 7–180) and `dutyCoverageConcentrationPct` (90, bounds 50–100). An upgraded workspace opens with an **empty** ledger: "no duty here has a declared cover yet", which is a different claim from "every duty is covered". Nothing is back-filled, because eligibility, exercise and concentration are all re-derived from records that already exist. A malformed cover row is dropped with a printed warning, never repaired. Covers per duty line are capped at 3 — a duty is not a committee.

## Consequences

- A gap is now a printable, attributable fact ("this duty line carries 3 open items and nobody is answerable"), not an absence of information.
- The product refuses to call an untested stand-in "covered", so a register with 0% readiness is the honest starting state of every workspace, not a scoring failure of the leader reading it.
- Seats remain **workflow declarations, not authentication**: a cover is a declaration about who *should* answer, not a credential that proves who did. `[UNVERIFIED]` for real-browser AT; the limit is stated in the product.
