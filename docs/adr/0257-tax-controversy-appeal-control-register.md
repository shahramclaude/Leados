# ADR-0257 — Tax Controversy & Appeal-Control Register (Schema v209)

- **Status:** Accepted, shipped Session 330 (2026-11-18).
- **Altitude:** director / VP tax primary; CEO / C-suite finance oversight.
- **Structure:** matrix (a notice names responsible hands across tax, finance, legal and the operating business; the joint apex above every one of them is asked).
- **Route:** `#/tax`. **Engine:** `tax-controversy-2026.11-v1`. **Rule:** `RULE-TAX-01`. **CSV scope:** #194 `tax-controversy`.
- **Supersedes:** the Session 329 discovery item of the same name (unbuilt).

## The problem

The workspace could store a claim, its accrual and its limitation clock; it could store an insurance
policy, a coverage and a recovery; and ADR-0250 gave it a provision register that carries an uncertain
obligation at a declared best estimate. What it could not store was the **dispute that produces the
estimate**: an authority issues a notice, the organisation has a window in that jurisdiction to object,
somebody has to file inside it with the evidence behind the position, and the outcome moves a sum from
"disputed" to "finally payable".

That is not accounting measurement. It is an operational duty with a deadline, a written basis, a filed
act with a receipt, an evidence packet and a resolution — and it is the duty most often lost, because the
thing that runs out is not the money but the **window**.

## What this register is

Six ledgers, all **EMPTY at upgrade**:

| Ledger | What a row declares |
| --- | --- |
| `taxNotices` | The authority reference, the disputed position, the jurisdiction **as declared**, the tax type, the notice day, the disputed amount in exact minor units, the currency, the written basis and one to four responsible hands. |
| `taxDeadlines` | One per notice: the jurisdiction-declared objection day **and the written basis that sets the window**. |
| `taxFilings` | One act per row: the filing kind, the filed day, the authority receipt reference and the written basis. |
| `taxEvidence` | One item of the packet: what it is, the document reference it is drawn from, the supplied day and what it proves about the position. |
| `taxResolutions` | One per notice: the closed-vocabulary outcome, the resolved day, the amount finally payable, the currency and the written basis. |
| `taxMarkers` | `RULE-TAX-01`'s identity-free observations where nobody can be asked. |

**Nothing derived is stored.** State, timeliness, days remaining, days overdue, the swing, the attention
count and the reconciliation are recomputed on every read by `buildTaxControversy`. A hand-edited file
cannot carry a controversy recorded as timely whose filing landed after the window.

## The five refusals that are the product

1. **No deadline is ever computed from a notice day.** The register holds no jurisdiction calendar. A
   notice with no declared deadline prints `deadline-undeclared` — never "has no deadline", and never a
   window guessed from the notice date. The deadline is a **declared day with a cited basis**, and a
   deadline row whose basis is absent is dropped at the load boundary.
2. **Timeliness is derived from the two declared days, and a late filing is never re-dated.** The first
   filing by day is the one judged. If either day cannot be read, the verdict is printed as **unprovable**
   rather than assumed in either direction.
3. **A filing needs a receipt.** An unreceipted filing is an intention, not a filing, and the loader and
   the door both refuse it.
4. **A filed objection needs a packet.** A notice filed with no evidence item is flagged `evidence-empty`.
   The register never infers evidence from a filing.
5. **The swing is derived, printed apart, and per currency.** `swing = disputed − resolved`, exact in whole
   minor units, negative when the outcome costs more than was assessed. A currency with no resolution
   prints the swing **blank with its reason**, never as a zero.

## The six states

`deadline-undeclared`, `overdue-unfiled`, `filed-late`, `awaiting-filing`, `filed-on-time`, `resolved`.
Two further facts are **flags, not states**: `evidence-empty` and `aging-unresolved` (filed but open past
the declared `taxResolutionHorizonDays`). Folding them into the state would hide which of two remedies the
controversy actually needs.

## Matrix correctness

Every notice resolves **all** active lines that hold **any** responsible hand — including a declared
secondary line, so a hand held by two managers appears on both and is counted **once** in the headcount.
The ask goes to the **lowest joint apex above all of them**, never to one line on another line's behalf.
A hand off the reporting graph is **kept and printed as an orphan** — deleting it would erase a live
controversy — and the register then reports itself **not certified** rather than substituting a name.

## `RULE-TAX-01`

Five conditions, each filed at most once per (deterministic `tax1:<kind>:<noticeId>` signature,
addressee), capped at **4 new asks per commit** with the remainder counted:

- `deadline-undeclared` — a notice with no declared window.
- `overdue-unfiled` — the declared window closed with nothing filed.
- `filed-late` — the first filing landed after the declared day.
- `evidence-empty` — a filed objection with no packet behind it.
- `aging-unresolved` — filed and still open past the declared horizon.

Asks are `act-inform` delegations with typed `issues-obligation` provenance, **deliberately opaque**: a
controversy schedule names the authority and the position, so no title carries a notice reference,
jurisdiction, tax type, amount, currency, evidence reference or person. The opaque signature lives only in
the typed link. Asks close themselves when the condition clears or the addressee moves; an answered ask is
never re-filed; and the rule is **pause-governed on every path** including the explicit scan
(`taxAutoPropagate`).

## Conventions (three, all declared)

| Key | Bounds / default | Why |
| --- | --- | --- |
| `taxAutoPropagate` | boolean, default ON | A pause that leaves an undeclared deadline and an overdue filing unanswered is never the silent default. |
| `taxPrivacyFloor` | 2–20, default 3 | A per-state count below the floor is exported **blank with its reason**, never as a small number. |
| `taxResolutionHorizonDays` | 30–3650, default 365 | How long a filed controversy may sit open before a status review is asked. A convention, not a legal limit. |

There is deliberately **no** objection window, appeal window or jurisdiction table in settings: those are
facts about a particular notice in a particular jurisdiction, declared by a named hand with its basis.

## CSV scope #194

Aggregate and identity-free: one summary row, one row per printed state, one row per currency carrying the
money bridge (disputed / resolved / swing in minor units). No notice reference, jurisdiction, position,
written basis, evidence reference, person, manager or day crosses the boundary. Money never crosses as a
mixed-currency total. A per-state count below the privacy floor is blank with its reason.

## Benchmark

**Partially verified, plainly stated.** Compared from fetched vendor material against **Thomson Reuters
ONESOURCE**, **Vertex**, **Wolters Kluwer CCH Axcess**, **Sovos** and **Avalara**, and against **IAS 12 /
IFRIC 23** for the measurement discipline the register must not duplicate:

- **Matched:** a per-notice dispute record, a dated deadline per controversy, a filed-act record with a
  reference, an evidence trail, an outcome and an exportable schedule.
- **Exceeded:** no window is ever computed by the tool (the vendors' calendars own the window; this
  register refuses to hold one it cannot cite), timeliness derived from two declared days rather than
  asserted, matrix roll-ups over hands held by several lines, joint-apex routing of the ask, derived-on-read
  state with zero derived storage, fail-closed loaders that never repair, and an identity-free floored
  export.
- **Weaker, stated plainly:** no jurisdiction content corpus, no return preparation, no ERP/ledger
  integration, no automatic correspondence ingestion. Those are the vendors' core and are **[not built
  here]** rather than pretended at.

## Deliberately absent

Tax advice. A jurisdiction calendar. Interest and penalty computation. Return preparation or filing to an
authority. Document storage. Per-person scoring. A "likely outcome" prediction — the resolution is whatever
the authority reached, recorded with its basis.

## Asset

`app/assets/tax-controversy-method.jpg` — the Method panel's figure (notice → declared deadline with its
basis → filing with receipt and derived timeliness → evidence packet → resolution with the swing printed
apart). Generated with the image tool; **Higgsfield is not connected in this session**, recorded here
rather than presented as a Higgsfield artifact.

## Verification

`tests/app/tax-controversy.test.mjs` — 36 claims green: additive schema, fail-closed loaders (including the
basis-less deadline), the kernel's six states and two flags, derived timeliness and the unprovable verdict,
exact swing, currency separation, disclosure above rank 3, the two-line hand resolving both managers and
the joint apex, the orphan, the line roll-up, the rule's opacity/idempotence/cap/pause/identity-free
observation, the door's refusals and seat narrowing, CSV #194 identity-freedom and flooring, signals, and
the panel's display-equals-computed contract on a fixture and on the demo (8 notices deriving 6 states).
