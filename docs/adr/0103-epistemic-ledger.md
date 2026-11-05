# ADR-0103 — The Epistemic Ledger: what the record already knew and nobody read

- **Status:** Accepted
- **Date:** 2026-11-05
- **Session:** 143
- **Schema:** v105 (additive `104 → 105`)
- **Route:** `#/epistemic`
- **CSV scope:** #99 `epistemic` — aggregate only
- **Engine:** `epistemic-ledger-2026.11-v1` (`app/core/domain/epistemic.js`)

## The question this module answers

Every other terminal in this workspace measures work that reached the record. This
one measures the opposite: **the signals the record is already carrying that no
one has opened.** Most of what an organisation does not know is not mysterious. It
is a risk case open for sixty-five days, a premise the record has already
breached, a delegation three weeks past due, a constructive-feedback follow-up
nobody closed, a goal at risk with a quarter left, a performance conversation
that stalled on one theme. Each of those is *written down, dated, and unread*.
The category calls that a blind spot and sells a survey about it. This workspace
can compute it.

A scope note first, because the temptation is to build a "risk register": a
register a human fills in is a second, competing record, and it decays exactly
where the first record was already ignored. **No unknown is invented here.** Every
harvested unknown is derived from a record another module owns, carries a pointer
back to it, and copies none of its content.

## The three readings

**1. The ledger (harvest + lifecycle).** Seven signal classes are read from dated
records and freeze **one** unknown per source record, with an id hashed from
`(class, sourceType, sourceId)` so a rescan cannot duplicate it and a human can
never mistake a harvest for a declaration. Each carries a **declared,
evidence-bound expiry** — not a deadline to be silently renegotiated.

*Live* signals (an open case, an overdue delegation, a breached premise, an
at-risk goal, a stalled concern) are **not** filtered by the harvest window: a
65-day-old open case is the finding, and dropping it for being old would make the
module report its own bookmark rather than the organisation's conditions. They
expire `epistemicExpiryDays` from today. *Historical* signals (a closed
false-alarm case, a completed goal, a resolved feedback loop) keep the window and
expire from the day they were evidenced.

**2. The overconfidence index (calibration).** A human declares a belief about
open work before its outcome is known; the workspace later reads the outcome from
the record and cross-tabulates belief × record. The statistic is **Cohen's κ**
(1960) on the 2×2, with the Byrt–Bishop–Carlin / McKenna–Myers **prevalence** and
**bias** indices and **PABAK** (Feinstein–Cicchetti 1990). Two refusals are
structural, not decorative: below the declared paired floor nothing is printed,
and where one cell carries the table nothing is printed either — a κ computed off
a single cell is a summary of the fixture, not of the organisation. The verdict is
**direction-first**: an optimism gap and an under-confidence gap are different
diseases with different owners, and an averaged index across two indices pointing
opposite ways is a lie the workspace refuses to print.

A belief about work whose outcome the record *already* knows is refused at write
time. That is a memory, and grading it as foresight is exactly the fraud this
module exists to prevent.

**3. The implied ledger (blind classes).** Below any span, some evidence classes
produce arriving edges (a case, a decision, a conflict, a recognition) and others
produce silence. The ratio of measurable activity that produced **no** arriving
edge is the implied ledger, bounded by the **rule of three** (Hanley–Lippman-Hand
1983) where nothing arrived at all. The unit is the *span*, the *class* and the
*cell* — **never a person**. `epistemicBlindDarkPct` declares how dark a class must
be before it is printed as blind.

## Rules on the shared spine

`RULE-EPI-01..05` run on the existing post-commit spine — no second engine.

- **RULE-EPI-01 HARVEST.** Freeze the unknown and make it a graph node with one
  `rests-on` edge to the source record and **one `rolls-up-to` edge per leadership
  ancestor**, in the SAME atomic transaction. The transaction that notices a missed
  signal is the transaction that makes the missing signal visible above the span
  that missed it.
- **RULE-EPI-02 ESCALATE.** An unopened danger/defect unknown past
  `epistemicEscalateDays` opens exactly ONE governed decision, ever, naming the
  age and the two honest routes. The age is measured from **`evidencesOn`**, not
  from the day we happened to look: a signal the organisation sat on for two months
  is escalated on sight.
- **RULE-EPI-03 EXPIRE.** A declared expiry that passes unanswered marks the
  unknown `expired` and prompts once per ISO week. Expiry is never resolution.
- **RULE-EPI-04 GAP.** Where pooled belief-vs-record disagreement over-predicts
  good outcomes, open ONE calibration review per span per ISO week.
- **RULE-EPI-05 GRADE.** Grade a frozen belief exactly once against the record's
  own outcome; the claim is frozen and the grade is a separate dated row.

## Seats and altitudes

`record-epistemic-unknown` (ranks 1–5) records and reads at your own span.
`govern-epistemic` (ranks 4–5 **and** `seat.fullAccess`) re-declares the
conventions — a manager may say what they do not know, but may not re-declare what
the whole workspace measures. The five altitude playbooks are genuinely different
jobs: the frontline lead opens their own week's unknowns; the manager sees the
blind classes and the pooled gap per span; the director re-declares floors and
opens calibration reviews; the executive receives counts and directions, never
individual beliefs; the chief sees the identity-free memorandum.

What travels up is **counts, directions, ages and refusals**. What never travels up
is an individual's declared belief or a person-level score — the aggregation is
the disclosure control.

## Consequences

- Schema v105 is additive: four collections, ten conventions, one migration that
  invents no unknown.
- `epistemic.` joins the derived-event prefixes, so re-deriving the ledger never
  counts as operational activity.
- Coverage is bounded by what this workspace recorded. **Work nobody logged is
  invisible to it**, and the product says so on the method panel rather than
  implying omniscience.
- The conventions are declared, never fitted. Seats remain a workflow declaration,
  not authentication. Real-browser AT is `[UNVERIFIED]` (the axe run is jsdom).
