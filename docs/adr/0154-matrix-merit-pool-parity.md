# ADR-0154 — Matrix Merit Pool Stewardship & Cohort Parity Reading

**Status:** Accepted (Session 212, Schema v128 unchanged)
**Date:** 2026-11-09
**Altitude:** CEO / C-suite PRIMARY × matrix (director / VP read the same lens; every altitude above the pay band gate shares it)
**Surface:** `#/merit?panel=matrix` · CSV scope #116
**Rule:** none, by design — see "Consequences"

## The duty

It is the first week of November and the merit pool is being finalised. Sam sits
on two lines: Dana's functional team — her home line, which sets pay — and
Priya's migration programme, whose declaration also carries the `pay` right,
because in that programme a pay decision without the delivery manager in the room
was always wrong. Nobody has ever put the two declarations beside a pay decision.

The cycle reads *inside budget, no finding*. Sam receives 2.5% while the rest of
Dana's team receives 4%. There is no surface in the product that says either of
the two things that matter:

1. **the authority that set that number was not attributable** — two managers
   held the pay right and neither record says who owned the decision; and
2. **the people carrying a second line were paid differently from the people who
   were not**, in a cycle nobody compared.

That second reading is the "matrix tax". It is not misconduct and it is not a
person's performance — it is an accounting artefact of a structure that reports
headcount by home line and money by whichever line happens to hold the `pay`
right. Holmström & Milgrom (1991) give the mechanism: when two principals each
observe part of a person's output, effort follows the task whose principal can
reward it, and the task nobody rewards is starved without anybody deciding to
starve it. Baker, Gibbons & Murphy (1994) give the reason it survives review: pay
attached to a supervisor who sees only part of the job prices only the part they
see.

## The decision

Add **one bounded read model** over records the workspace already stores — the
merit cycle, the roster, the dated `reportingLines`, and completed reviews for
the composition columns. Nothing is written. Nothing is frozen. No schema
version moves.

### Two claims, kept apart

The module answers two questions and refuses to collapse them into one word
(NORTH_STAR, Bulletproof Reliability: two distinct claims must never be merged
into one reassuring term):

| Reading | Question | Ladder (declared precedence) |
| --- | --- | --- |
| **Authority** | On the effective date, how many declared lines held the `pay` right for each person being paid? | `unknown` → `unowned` → `contested` → `clear` |
| **Parity** | Did the second-line cohort receive a different median increase than the home-line cohort? | `no-cycle` → `single-line` → `incomplete` → `divergent` → `parity` |

`unknown` outranks `unowned` and `unowned` outranks `contested`: an unreadable
structure is worse than an unowned right, and an unowned right (the money moved
with nobody accountable) is worse than a contested one (two people believe they
own the decision). `incomplete` deliberately outranks every substantive parity
verdict.

### What is read, and on which day

The cohort split and the pay authority are read **on the cycle's own effective
date** through `periodLinesFor` (the shared matrix engine, ADR-0140/0141/0147),
never from today's org chart. A project line that ended in October does not make
a November pay decision matrix; a line that starts in December does not either;
and a line that *was* live on the day does, even if it is gone now.

Ratings are read as of the effective date but never from the future — the same
rule `compensationRows` applies — and the date used is printed.

### Exact arithmetic

Every figure is integer arithmetic:

- pay in **integer cents** (`Math.round(value * 100)`), never a float;
- increase in **basis points** of the person's own pay, truncated, with the
  remainder **flagged** (`truncatedRowN`) so a figure never implies its
  arithmetic closed;
- **lower median** of whole basis points for an even cohort — a convention,
  printed, never an interpolated recruit;
- a zero increase is read from the **cents**, never from a basis-point figure
  that truncation flattened to 0;
- the pool share of the second-line cohort in basis points of the pool, exact,
  and BLANK when the pool moved no money.

### The refusals are the product

- **A cell floor of three priced people per cohort.** Below it the median, the
  gap and the pool share are BLANK with the reason printed — never a zero, never
  a two-person anecdote dressed as a rate.
- **A partial table blocks the comparison.** One unpriced row, one row naming a
  person no longer on the roster, or a bounded read that hit its cap withholds
  the gap entirely. A median computed over a quietly narrowed sample may not be
  the median the pool produced.
- **A pool that moved no money cannot read `parity`.** A zero gap from an unspent
  pool is an artefact, not evidence.
- **The gap is unadjusted.** Direction is printed (`matrix-below` /
  `matrix-above`), a declared ±50 bp band decides `parity` vs `divergent`, and
  the page says in words that the band is a convention, that fairness was not
  proven, and that no cause is claimed. A level-matched reading is also printed,
  but only where both cells clear the floor, and it is still descriptive.
- **No authority is settled.** There is no control on the panel and no command in
  the API that chooses one of several `pay` holders, and none that reassigns it.
- **No identity in the export.** No person, name, manager id, cycle label,
  salary or individual increase in any cell.

### Reconciliation

Two different claims are printed separately:

- `reconciles` — the printed counts add up (`matrix rows + home rows = rows
  read`, `priced + excluded = rows`);
- `figuresComplete` — every figure that WAS printed is computed from the record
  and nothing the comparison needed is missing.

A single-line pool prints no gap and is **complete about that**; an `incomplete`
pool is never complete.

## Consequences

- **Nothing is stored, so display == stored by construction.** Every figure is
  re-derived from the stored cycle, roster and dated lines on every read. Two
  reads of an unchanged workspace are identical, and a read mutates nothing and
  bumps no revision (pinned by test).
- **No rule, by design.** A rule that re-set a pay figure, reassigned a `pay`
  right or "corrected" a cohort would act on a person's money without a human
  reading the two declarations. The reading makes the ambiguity visible where the
  decision is made — before finalisation — and stops there. The ask already
  exists: ADR-0147 asks every in-force line for review input, and ADR-0151
  compares what came back.
- **Single-chain workspaces are inert.** No second-line cohort, no gap, no
  finding; the tab states that a fairness claim has not been made.
- **Limits that are printed, not buried.** The reading is unadjusted for level,
  rating, tenure, performance and market movement; the composition columns are
  shown so a reader can see the confound the module does not model. A home-line
  change is not stored by the matrix engine, so the home line is read as in force
  on the effective date (stated on the page) — the honest next step is an as-of
  home-line read from ADR-0149's history and a cohort split frozen at
  finalisation. Recorded as a Planned gap in ROADMAP.
- **Altitude.** CEO / C-suite primary: this is a pool-level decision and the
  panel names people only because the merit terminal already does at executive
  rank. The export — the artefact that leaves the room — carries no identity at
  all.
