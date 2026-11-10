# ADR-0166 — The Cross-Line Review-Evidence Join

- **Status:** Accepted
- **Date:** 2026-11-10 (Session 229)
- **Schema:** v133 (one idempotency marker ledger; no record of the join itself)
- **Surface:** `#/merit?panel=matrix` (third claim), CSV scope #116 (columns appended)
- **Rule:** `RULE-MEV-01`
- **Altitude:** director / VP primary; CEO / C-suite read the same board; frontline / mid-manager see their own decisions through the same seat-scoped read
- **Structure:** matrix (inert by construction in a single-chain workspace)

## The duty

The merit cycle closed and Sam was paid 2.5%. The packet reads complete, the pay
authority is `clear` (ADR-0154), and the structure that money was decided under
is fully reproducible (ADR-0155). The question an auditor asks next is a third
one: **was the evidence this number rests on gathered from both lines Sam worked
on?**

Sam spent the year at 40% on Priya's programme. The workspace already stores,
per review, every line that was *asked* for input and every line that *answered*
in its own words (ADR-0147). Nothing in the merit reading ever read those
records. So a pay decision can print `authority: clear` over an assessment that
was written from the home line alone, with the second line never asked — or
asked, and silent, and nobody noticing. The number is not wrong; the evidence
base is one line wide, and no surface said so.

## Decision

Join the two records the workspace already holds and never reconciled:

1. **Which review the money reads.** `comp.js` `ratingIndex(state, asOf)` picks
   the latest completed review at or before the rating date and nothing else.
   The join calls the *same* function, so it can never compare a decision to a
   review the decision was not made from. The review id is printed on every row.
2. **How that review was run.** `reviewStewardship.js`
   `buildReviewStewardship` resolves every line in force in the review period,
   its `performance` right holders and the per-line state. The join *reads*
   those states; it recomputes no right and re-derives no window.

The join produces, per **pay decision** (never per person — ADR-0154's duplicate
rule applies), one of eight closed evidence states with declared precedence:

| State | Meaning |
|---|---|
| `unknown` | the rating cannot be traced to a readable completed review, the person is off the roster, the home line is not in the record, or the row is duplicated. Always blocks every rate. |
| `contested-assessor` | two or more lines held the `performance` right for the period |
| `unowned-assessor` | no line held it |
| `line-unasked` | a second line in force was never asked — **the finding this module exists to print** |
| `line-silent` | asked and did not answer inside its window |
| `home-line-only` | every line was asked; only the home line contributed. A printed limit, not a failure |
| `single-line` | one line in force; the matrix does not apply |
| `corroborated` | every line in force answered or declined with a reason. A claim about the **process**, never about the number |

## What it refuses

- **No substituted review.** An untraceable rating reads `unknown` and the
  decision is excluded from every rate — never imputed from a neighbouring review.
- **No invented share.** ADR-0147 already documents that feedback, 1:1 notes and
  delegations carry a *subject* and no *authoring line*, so no per-line share is
  printed. The panel repeats that reasoning instead of papering over it.
- **No decline read as a gap.** A decline with a stated reason is a dated human
  act and counts toward corroboration.
- **No zero for a withheld figure.** Below a declared floor of three second-line
  decisions, or over a partial pool, the rate is BLANK with its reason on the row,
  the brief and the CSV.
- **No `figuresComplete` over a refused pool.** When computed inside the pay-parity
  report, the join is handed that report's own money verdict; it can print its
  counts but it cannot certify completeness over a pool the money reader has
  already refused.
- **No person or manager scoring.** Every finding is on a pay decision and a
  line's state. The export carries no name, no rating, no review id, no salary.

## The rule — `RULE-MEV-01`

A screen that prints a gap is a dashboard. `meritEvidenceRule` fires on cycle
finalisation, on a completed review and on explicit scan — never on a read — and
issues **at most one owned, dated delegation per open decision**, addressed to the
manager who held the person's **home line on the effective date** (the seat that
owns the pay decision and can reach the other line). Two different asks, because
two different things can still be done:

- **before finalisation** — "obtain the missing line input", which can still
  change the decision;
- **after finalisation** — "record the correction path", because the decision is
  frozen (ADR-0155) and the gap is now remedial history.

A contested, unowned or unreadable assessor issues **nothing** and is counted: an
ask addressed to nobody can never close, and the declaration question belongs to
the matrix panels. The rule writes typed provenance only (`issues-obligation`,
`rolls-up-to`), is idempotent through a per-cycle-per-decision marker, is bounded
by a per-transaction cap whose remainder is counted and retried by the scan, and
is inert in a single-chain workspace.

## Schema

**v133, additive.** One collection: `meritEvidenceMarkers` — RULE-MEV-01's
idempotency ledger, and nothing else. The join stores no row, no state, no rate
and no verdict: every figure is re-derived on read from the cycle, the reviews the
workspace already stores and the dated reporting lines. Migration `132 → 133`
appends an empty array and changes no record.

## Export

CSV scope **#116** is extended, not duplicated: `MERIT_PARITY_EXPORT_COLUMNS` is
the ADR-0154/0155 header with sixteen evidence columns **appended** (never
inserted), which keeps a consumer reading by header working and is pinned by test.

## Framework basis

Bounded rationality in evidence gathering (Simon 1955; Cyert & March 1963) — the
second line's observation is absent rather than weighted lower, which is why
absence must be printed. Procedural justice (Leventhal 1980; Tyler & Lind 1992) —
consistency and correctability of process carry weight independent of outcome.
Multi-task agency (Holmström & Milgrom 1991) as in ADR-0154. Evidence sufficiency
for internal audit (IIA) and internal-control documentation (COSO 2013). Statistical
disclosure control (house convention, ADR-0139/ADR-0126).
