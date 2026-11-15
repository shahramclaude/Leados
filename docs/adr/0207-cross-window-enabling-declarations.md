# ADR-0207 — Cross-Window Prerequisites: What the Calendar Proves, and What It Refuses to Claim

**Status:** Proposed (not accepted — see "Delivery status"). **Session:** 276.
**Schema:** v160 → v161 (one additive, EMPTY-at-upgrade collection: `stationWindowEnables`).
**Altitude / structure:** frontline / mid-manager PRIMARY; the same reader is structure-neutral, so it holds in a single chain and in a matrix. **Rule:** `RULE-SSC-01` extended with `feed-contradiction` and `feed-blocked`. **Surface:** `#/standard-work?panel=stations`. **Export:** CSV #148 extended (aggregate-only).

## Context

ADR-0204 let a window's holder declare that station A must come up before station B — but only when both stations live in **one** window. Real work crosses shifts: the feeder runs in Monday's window and the consumer in Tuesday's. Session 272 named that gap explicitly, and it is the rotation the coverage map has been pointing at since.

The register already refuses to assume a clock below the day. That limit is not incidental here: it is the whole decision procedure. Between two declared windows, the calendar can prove an order, fail to prove one, or forbid one — and those are three different facts that a leader must not be given as one word.

## Decision

**One append-only ledger, `stationWindowEnables`.** A row names a feeder station in one window, a dependent station in another, a written reason (≥10 chars), a declaring seat (`byId`) and the basis on which it may declare (`joint-apex` or `operator`). Retirement is its own dated act with a written reason; the original is never edited. A row that cannot be read exactly is retained and refused, never repaired. Both stations must sit in **different** windows — the in-window order keeps exactly one home.

**Authority is two-window authority.** An order between two managers' windows is not one holder's to make: the declaring seat must be the **lowest joint apex** of the two window holders on the reporting DAG, or the operator view (printed as scribery, not as a leadership decision). A manager can never order a peer's window; the door says so in words.

**The calendar decides on read, in four words** (`stationWindowRelation`, never stored):

| relation | condition | meaning |
|---|---|---|
| `strict` | feeder window **closes** before consumer window **opens** | the order holds for every possible running order — the only relation that is an ORDER |
| `same-day` | the windows meet on exactly one day | satisfiable, not proven; no clock below the day |
| `overlap` | the windows share more than a boundary day | satisfiable, not proven |
| `contradiction` | consumer window is over before the feeder opens | can never be met, whatever anyone is assigned |

**A prerequisite that cannot be manned is not printed as feasible.** A consumer window whose proven feeder station has nobody qualified and available (or whose feeder window cannot itself run) reads verdict **`blocked`**, and the dependent station reads **`blocked-by-enabler`** — while still printing its own real qualified/available counts, so no figure contradicts another. The override applies only to `feasible` and `inert`: a proven shortage, an unsatisfiable cycle or an unproven register is a stronger statement about the window's own record and is never overwritten. Impossibility propagates through chains (A → B → C) to a fixpoint, because the alternative is a downstream window reading feasible on an upstream failure.

**Two claims, reported separately.** `figuresComplete` (are the printed figures the computed figures, and are the printed totals the sum of the printed rows) and `ordersComplete` (is every declared prerequisite decided by the calendar) are different facts. Ambiguity degrades `ordersComplete` only; an unreadable prerequisite degrades both. Every class is counted beside the number, and per-window counts are reconciled on every read (`countsReconcile`).

**Disclosure.** Only the two windows' holders and the operator read who must come up first, the declared reason and the feeder's state. An ancestor reads counts. A feeder window **outside the actor's reach** yields relation facts (a fact about two dated declarations) and status `withheld` — the feeder's staffing is another span's record and is counted, never guessed.

**Automation.** `feed-contradiction`: one dated ask to the joint apex of the two windows to retire the declaration or re-declare the wrong window/station; self-closing, idempotent, pause-governed, never for a past window. `feed-blocked`: one dated ask to the joint apex — **unless** that apex is the feeder's own holder, who is already carrying the `proven-shortage` ask for the same cause, in which case an identity-free observation is recorded instead of a second ask.

## Consequences

- Nothing derived is stored: relation, feed status, blocked verdict, propagated impossibility and every count are recomputed on each read.
- An upgraded workspace opens with an EMPTY ledger and reads exactly as it did before this ADR.
- A declaration may be recorded that the calendar contradicts; that is deliberate. The register's job is to hold the human act and prove its consequences, then ask its declarer to repair it — not to refuse a record and leave the contradiction undocumented.
- Limits, printed rather than hidden: sequential-window levelling (the heijunka question) is still unanswered, and no clock below the day is claimed.

## Delivery status — **In Progress, not verified**

Shipped on this branch: storage contract and validator, calendar classifier, ledger normalisation and bounds, the derived dependency pass with propagation to fixpoint, the `blocked` verdict and `blocked-by-enabler` station state, action-level joint-apex authority, two rule conditions, CSV #148 and brief extension, and schema v161 with its additive migration.

**Not yet done, and therefore not claimed:** the panel section and its declaration dialog, the generated method illustration and `Visual-Integrity` asset, the dedicated test suite, the ROADMAP/FEATURES/README and `docs/adr/INDEX.md` updates, and the full-suite / real-browser AT walkthrough. Benchmark against APS/MES inter-shift sequencing (SAP PP/DS, Siemens Opcenter, AVEVA MES, Timefold) is **`[BENCHMARK-UNVERIFIED]`** — no hands-on access from this sandbox.

What was actually run: `tests/app/station-coverage.test.mjs` **27/27 PASS**, `csv` **5/5 PASS**, `goal-attainment` **14/14 PASS**, canonical boundary PASS (**861 modules / 259 suites / 23 doc checks**), ESLint clean on every changed file, and a store-level smoke of the four calendar classes (strict+manned ⇒ `fed`; strict+unmanned feeder ⇒ `blocked` + `blocked-by-enabler`; same-day ⇒ `ambiguous` with `ordersComplete: false`; contradiction ⇒ `contradicted`, counted).
