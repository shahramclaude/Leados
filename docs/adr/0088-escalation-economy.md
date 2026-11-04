# ADR-0088 — The Escalation Economy: pricing the organisation's hidden market in passed-up problems

- **Status:** Accepted (Session 128, 2026-11-04)
- **Schema:** v94 (additive `93 → 94`)
- **Surface:** `#/escalation` (5 panels), CSV scope **#83** (`escalation-economy`)
- **Rules:** `RULE-ESC-01..05` on the shared post-commit spine (68 rules / 68 contracts)
- **New collections:** `escalationRecords`, `escalationCommitments`, `escalationMarkers`
- **New graph:** nodes `escalationrecord`, `escalationcommitment`; relations `originates-from`, `reconciles-authority` (vertical fan-out reuses `rolls-up-to`; the hop to the receiver reuses `escalates-to`)

---

## 1. The gap

The 2026 market sells "escalation management" and means **ticket routing**. ServiceNow, Jira Service Management, PagerDuty, Zendesk, HaloITSM and the AI-support entrants (Fini, Forethought, Traversal, Ada) all answer the same question: *who gets paged next, and how fast?* Their analytics cluster escalation reasons, predict which conversation will escalate, and report time-to-acknowledge. Not one of them asks the question that decides whether an organisation can think:

> **Is this problem being decided at the level that holds the information — and what did passing it upward actually buy?**

LeadOS was closer than the market and still short of it:

- `load.js` (Schema v34) measures **cognitive load on a person** — Sweller, Little's law, Kingman, Goldratt's bottleneck. It does not model the *choice* to hand work upward.
- `signalPath.js` (Schema v59) measures the **transmission of bad news up declared channels** — Shannon mutual information, signal detection theory, the mum effect. It does not model the escalation *decision*, its price, or its yield.
- `mandates.js` (ADR-0078) and `authorityCalibration.js` (ADR-0079) record **who may decide** and whether that authority is calibrated. Neither measures whether the authority is *actually being used*, which is a different failure.

Between them sat an unmeasured market. Every organisation runs one: problems, risks and decisions are continuously either **absorbed** (decided and owned where they arose) or **escalated** (handed to a seat that is more expensive, further from the facts, and slower). That market has a price, a yield, an incentive structure and a queue — and before this ADR, none of the four was measured anywhere.

## 2. Decision

Model the escalation decision as an **economic transaction**, not a workflow event, and make the organisational hierarchy the market's structure.

**One ledger, two dispositions.** `escalationRecords` holds one row per decision moment, and each row is either `absorbed` or `escalated`. There is no third state, because the rate that matters — *how often do we pass things up?* — needs the denominator that a workflow log never keeps. A row that contradicts itself (an escalation with no receiver, an absorption that names one) is **dropped, never repaired**: repairing it would fabricate the rate.

**Named theory, each actually computed** (doctrine §0.2):

| Field | Framework | What is computed |
|---|---|---|
| Authority | **Aghion & Tirole (1997), "Formal and Real Authority in Organizations", JPE 105(1)** | A span declares a bounded **intervention rate**; the observed rate is compared against it; a sustained excess is reported as **de facto centralised** — formal authority delegated on paper, real authority still taken above |
| Incentive | **Holmström & Milgrom (1991), multitask principal–agent** | The reason vocabulary carries `cover` ("I want cover for a decision I could make") and `capacity` as first-class, countable answers, because an unmeasured task starves |
| Placement | **Jensen & Meckling (1995); the principle of subsidiarity** | **Subsidiarity index**: the share of a decision class resolved at the rung where it arose (including what was escalated and then returned downward) |
| Latency | **Erlang M/M/1; Kingman (1961)** | `Wq = λ/(μ(μ−λ))` exactly, with Kingman's `(ρ/(1−ρ))·cᵥ²/μ` as the variability bound |
| Context | **Shannon (1948), cascade of binary symmetric channels** | `ε_k = (1 − (1 − 2ε)^k)/2`; surviving mutual information `1 − H₂(ε_k)` bits of the one bit the source carried |
| Ownership | **Oncken & Wass (1974), "Who's Got the Monkey?"** | The monkey ledger: items sitting above where they arose, by sender, with a return window and a generated script |
| Statistics | **Wilson (1927); Brier (1950)** | Intervals on every rate; the intervention-rate commitment is frozen with a personal probability and graded once, out of sample |

**The unit of account is a DECISION CLASS and a SPAN. Never a person.** No one is rated, ranked or scored anywhere in this module. Every talking point the rules write is about the process; every governed decision names a span's authority and capacity. This is enforced in code, not in documentation: the reason vocabulary has no person-shaped entry, the report has no per-person row, and the CSV has no person column.

**Refusals are structural, not cosmetic.** At ρ ≥ 1 the queue is unstable and **no waiting time is printed** — the panel returns a refusal with its reason, matching the house rule that a figure below its floor is blank, never zero. Grading a commitment below the 5-item floor is refused. A rate below the small-cell floor is withheld.

## 3. Cross-module and cross-altitude integration

**Vertical roll-up (exact partition).** A record counts **once**, at the seat where it arose, and is inherited by every leadership ancestor by addition. The altitude table is computed from the records themselves, never by summing seat rows, because seat rows intentionally overlap (a manager inherits their frontline children) and adding them would double count. Test: *"the roll-up is an exact partition"* asserts the sum of the altitude rows equals the workspace total.

**A childless specialist is not a span.** `owningSeatId` maps any person to the nearest leadership ancestor that carries them, mirroring `nearestLeadershipAncestor` in `seat.js`. Without it, an individual contributor's decision moment would fall out of the roll-up entirely; with it, the escalation ledger and the access boundary always agree on where a decision belongs.

**One transaction, modules × hierarchy.** `RULE-ESC-01` writes `escalates-to` (to the receiving seat), `originates-from` (to the recorded source case/decision/goal) and one `rolls-up-to` edge per ancestor of **both** the originating and the receiving span — so a single frontline hand-off reaches manager, director, VP and chief in the same atomic write, alongside every other module's propagation, and is covered by that transaction's seal.

**Rule ordering.** `escalationRule` runs **immediately before `decisionTempoRule`**, so the governed absorption-capacity and intervention-rate decisions it opens receive a cost-of-delay and an option-to-wait price in the same transaction. It runs before `seatRule` (whose boundary must be able to explain the edges) and before `sealRule` (which hashes the whole commit).

| Rule | Trigger | Writes |
|---|---|---|
| `RULE-ESC-01` | any `escalation.*` | `escalates-to`, `originates-from`, one `rolls-up-to` per ancestor |
| `RULE-ESC-02` | receiving span ρ ≥ red floor, arrivals ≥ floor | **one** DACI absorption-capacity decision + one owned task, per span per ISO week |
| `RULE-ESC-03` | yield < floor over ≥ cell floor settled escalations | **one** DACI intervention-rate decision + one blameless talking point, per receiving span per ISO week |
| `RULE-ESC-04` | graded commitment breached | one `reconciles-authority` edge + one authority reconciliation task |
| `RULE-ESC-05` | escalation open past the return window | one owned return-the-monkey task per record |

All five are **marker-idempotent** and **pausable** via `escalationAutoPropagate`; an explicit `escalation.scan` always runs.

**Receiver-only settlement.** Only the span that received an item may settle it, and the escalating level may never settle its own escalation. This is not ceremony: a self-reported escalation yield is worthless, so the API refuses rather than warns.

## 4. Consequences and limits

**Honest limits, enforced in the UI and the brief:**

- Cost rates are **declared conventions** (`escalationRateFrontline`…`escalationRateChief`, default 40/65/100/160/250 per hour in a declared currency), not audited payroll facts. The tax is a costing instrument, not a finance report.
- Commitment grading is an **association** between a declared ceiling and what was later observed. It is never called a causal effect.
- Subsidiarity is measured on recorded dispositions. A decision that never reached the ledger is invisible, and an organisation that logs nothing learns nothing.
- Small-cell withholding is **not** differential privacy.
- Declared seats remain workflow declarations, not authentication (carried from ADR-0076/0080).
- Empirical-Bayes and pooling conventions from ADR-0062 are **not** applied here: the escalation rate's denominator is a human log, not a sample to be smoothed, and shrinking it toward a workspace mean would hide the very span that needs attention.

**Deliberately rejected:**

- Inferring `outcomeDiffers` from a title, a note or a resolution code. It is a human judgement and the only input the yield rests on; guessing it would manufacture the headline number.
- Ranking, scoring or rating escalating individuals. The incentive problem is real, and the instrument for it is the reason vocabulary and the intervention-rate commitment — not a leaderboard.
- Auto-correcting a disposition or auto-returning an escalation. Returning authority is a human decision about authority.
- Printing any waiting time at ρ ≥ 1, however tempting the large number is.
- A single composite "escalation health score". It would hide the dimension-level finding (which class, which span, which reason) that makes the module actionable.

## 5. Verification

`tests/app/escalation-economy.test.mjs` — **23/23 pass**, including:

- M/M/1 against its closed form, and Kingman collapsing onto it at cᵥ = 1 (a real cross-check, not a restatement);
- refusal, not a large number, at ρ ≥ 1 and at μ = 0;
- the Shannon cascade against a hand expansion at one and two rungs, monotone in rungs;
- Wilson against its textbook value at 50/100;
- the roll-up as an exact partition, and a childless specialist attributing to the span that carries them;
- receiver-only settlement, sideways peer isolation, and origin scoping under a declared seat;
- freeze → grade once → refuse re-grade → refuse below the floor;
- marker idempotence on rescan, and full pause with an explicit scan still running;
- CSV #83 and the brief leaking no person id, name, title, proposed action or note;
- all five panels rendering with a single `h1`.
