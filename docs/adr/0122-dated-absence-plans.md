# ADR-0122 — Dated absence plans: which duty lines lose their cover, and when

- **Status:** accepted
- **Date:** 2026-11-07
- **Session:** 167 · Schema v115 (additive)
- **Deciders:** LeadOS maintainer; **frontline (rank 1) workflow primary**, with mid-manager, director, VP and CEO reading the same plan at their own altitude
- **Surface:** `#/duty-cover?panel=plan` (Absence plan panel), linked from the duty-cover desk panel

## Context

ADR-0121 built the duty coverage register: for every duty line, who is declared answerable when the holder is absent, whether that person's altitude can reach the duty, and whether their access has ever been exercised. The register answers *who* stands in. It does not answer *when*.

A frontline lead calls in sick on a Tuesday. The register says coach-on-duty is covered by the mid-manager on the tree. It does not say that the mid-manager is herself on a dated absence that week, or that the only other eligible cover has never exercised the span, or that the coaching cadence carries three open items with nobody behind it on those specific dates. The coverage register reads as sound; the actual Tuesday is exposed.

This is the same gap ADR-0121 named for the register itself, one level down: a declared cover is a fact about a person and a duty, not about a date. The absence plan makes the date explicit and derives what the register cannot — which duty lines lose their cover on which days, and whether the cover's own absence leaves the duty exposed a second time.

The frameworks are named, not paraphrased: Kahn (1990) — a responsibility nobody was told about is not a responsibility, and an absence nobody planned for is the same failure in the temporal direction; Weick & Sutcliffe (2007) — pre-commitment to a known loss is the difference between a graceful degradation and a surprise; Jaques (1956) time-span of discretion — a cover answers only if their altitude carries the duty's horizon, and the plan must state what happens when the cover's own horizon is also absent; subsidiarity (Aghion & Tirole 1997, the ADR-0075 ladder) — the plan rises to the lowest leadership ancestor whose span contains the duty, never sideways to a peer; Wilson (1927) bounds the plan's rate.

## Decision

**A dated absence is a declared window on a seat; the coverage it removes is derived on read, never stored.**

1. **Declared, never fitted.** An absence plan is a human, dated declaration: `dutyAbsenceDeclare` writes, in a single `store.update`, an `absencePlan` row (seat, ISO window, reason) plus a `declares-absence-of` typed edge from the plan to the seat. There is deliberately **no** command that assigns a stand-in automatically for an absence, and no command that derives an absence from absence of covers — the plan is the only source of the date, and it is declared by a human with a rank-gated right.
2. **The window is bounded and printed.** `parseAbsenceWindow` refuses whole windows longer than `dutyAbsenceMaxSpanDays` (90), requires `from ≤ to` on ISO day keys, and refuses a window with no `from` or `to`. A malformed window is refused with a printed reason, never repaired. The plan cap is 400 active plans per workspace; reason and note are clamped to 300 characters.
3. **One plan, one atomic transaction.** `dutyAbsenceDeclare` writes the plan row, the typed edge, one governed decision that names the consequence if the absence leaves a duty exposed, and `rolls-up-to` edges per leadership ancestor above the absent seat — the ADR-0113 / ADR-0121 pattern. `dutyAbsenceRevoke` is append-only with a required reason (≥6 characters) and is limited to the declaring seat or a full-access reader.
4. **Coverage is derived, never stored.** `absenceWindowPlan` re-derives, for every duty line under the absent seat, which declared covers are available on each day of the window: a cover is unavailable if they hold an active absence window overlapping the duty's window. The result is graded — `covered` (eligible, available, exercised), `thin` (eligible, available, not exercised), `cover-absent` (the cover is themselves absent), `ineligible` (rank or altitude refusal), `gap` (no cover at all). **No availability fact is written to the store**; it is recomputed on every read from the declared windows.
5. **The roll-up is the same window, read at every altitude.** `dutyAbsenceRollup` lists every active absence in the seat's span (excluding the seat itself; full-access readers see all), grades each through `absenceWindowPlan`, and sorts by window start. Reason text is withheld from rank-3-and-above readers unless their access is full or their rank is ≤2 — the ADR-0121 identity-free roll-up pattern. The summary counts exposed duty lines with open work and no available cover on the absence dates.
6. **The upward brief and CSV scope #104 stay identity-free by construction.** The brief line names the count of active absence plans in the span and the count of exposed duty lines — no person, no seat id, no reason. CSV absence rows carry rank, window bounds, and per-band counts — no names, no ids, no labels, no reasons.
7. **No new rule id.** Declaring an absence is a human, dated, atomic act on one seat — the ADR-0113 pattern — not an event cascade worth a 92nd post-commit rule. The dangerous pattern (a duty line losing its cover on a date nobody planned for) is a *printed derived reading*, not a governed decision engine.

## Schema v115

Additive only: the `absencePlans` collection (the declared windows), the `absenceplan` entity type, and the `declares-absence-of` relation. An upgraded workspace opens with an **empty** plan set: "no dated absence is declared in this span yet", which is a different claim from "every absence is covered". Nothing is back-filled, because availability is re-derived from the declared windows on every read. A malformed plan is dropped with a printed warning, never repaired. Active plans per seat are capped at 400; the window span is capped at 90 days.

## Consequences

- A dated absence is now a printable, attributable fact ("this duty line loses its cover on these dates because the declared cover is themselves absent"), not an absence of information.
- The product refuses to call an untested or absent cover "covered" on the absence dates, so a plan with 0% availability is the honest starting state of a workspace with no declared absences, not a scoring failure of the leader reading it.
- Seats remain **workflow declarations, not authentication**: an absence plan is a declaration about when a seat will not be present, not a credential that proves they were absent. `[UNVERIFIED]` for real-browser AT; the limit is stated in the product.
- The coverage register and the absence plan are two readings of the same declared facts: the register answers *who*, the plan answers *when*, and neither invents a fact the other does not have.
