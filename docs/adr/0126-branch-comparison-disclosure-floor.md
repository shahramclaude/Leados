# ADR-0126 — A disclosure floor for the direct-branch comparison

**Session 172 · 2026-11-07 · Schema v115 unchanged · `#/duty-cover?panel=desk`**
**Primary altitude: CEO / C-suite (rank 5)** — last primary in Session 168, the most-neglected rung in the Session-171 coverage map (frontline 171, mid-manager 170, director/VP 169). Director and VP read the same table; every altitude below them inherits the same registers. The real duty: a chief reviewing cross-division continuity has to hand that comparison to a board, an auditor or a peer executive. The table that answers it separates the enterprise by structure — *which* branch — while printing exact counts of the people inside it.

## 1. The gap

`branchCoverage` (ADR-0121, Session 163) prints, for every direct child branch, `coveredN / dutiesN` and a readiness percentage with no floor of any kind. The altitude duty table declares **five** duty lines per leadership seat, so a branch that is exactly one seat wide renders as `1 / 5` — a rate over one person's duty lines, on a surface whose partition key (the reporting tree, and therefore who sits in that branch) the reader already holds in the roster. Every previous session's "Unverified / flagged" section said this in one line: *small anonymous branches can be inferred.*

The workspace already knows how to answer this. `outcomePrior.suppressedCells` applies primary + complementary suppression to per-span loops; `jurisdiction`, `hindsight` and `freezeLine` all carry declared cell floors. The branch comparison was the one aggregate table that had never been wired to a floor.

## 2. What the floor does

Three declared, clamped, printed conventions (re-declarable only by the same rank-4+ full-access seat that declares the other two):

| convention | default | bounds | meaning |
|---|---|---|---|
| `dutyCoverageBranchFloorN` | 6 | 2–25 | a branch cell below this many duty lines is **withheld** |
| `dutyCoverageBranchRateFloorN` | 6 | 2–40 | a per-branch rate prints only at or above this many duty lines |
| `dutyCoverageBranchCap` | 24 | 4–64 | branches compared in one read; the remainder is **counted**, not dropped |

Cells, in order:

1. **Primary suppression.** A branch with 1–5 duty lines has its `coveredN`, `gapN` and `openGapN` set to `null` and prints `WITHHELD` with the reason. Its `dutiesN` survives: the count of declared duty lines is structural (it follows from the altitude table and the roster shape), not a finding about the people in it.
2. **Complementary suppression.** When withholding leaves **one or zero** released cells, one further released cell — deterministically the smallest, then by stable label — is withheld beside it. One released cell against a known parent total *is* the withheld cell by subtraction.
3. **Rate floor.** A cell at or above the disclosure floor but below the rate floor releases its counts and withholds its rate, saying so.
4. **Pooled rate refused.** The pooled rate is the sum the withheld cell is recovered from, so it is refused wholesale whenever anything is withheld, with the refusal printed. This is deliberately stricter than the mean: the pooled figure is the arithmetic attack, the mean over labelled branches is not.
5. **Mean quoted over released cells only**, with how many branches it covers and a printed note that it is not the whole table.
6. **Deferral counted.** Beyond the cap the remainder is counted and printed.

A withheld cell is **never zero** — a blank that reads as "no gaps here" is a worse lie than a small number. Every refusal is a sentence, and CSV rows carry `branch_withheld=yes` with BLANK counts and BLANK rate.

**What it is not.** Primary + complementary suppression stops *arithmetic recovery*. It does not stop a reader who already knows the roster from inferring which branch is which, and it is **not differential privacy**. The premise string says exactly that, on the screen and in the brief.

## 3. Wiring, not a bolt-on

- `app/core/domain/dutyCoverage.js` — `branchCoverage(built, seat, rows, conv)` now takes the normalised conventions and returns `floor`, `rateFloor`, `suppressedN`, `releasedN`, `deferredN`, `pooledRefused`, `meanBranchesN`, `meanRefused` and the premise. No new collection, rule id, event type or schema bump.
- `dutyCoverageBriefText` — the identity-free upward brief prints released vs withheld counts, the refused pooled rate or the mean over released cells, the cap deferral, and the disclosure premise. A chief can paste it into a board pack unchanged.
- `dutyCoverageCsvRows` — two new row kinds, `branch` (one aggregate row per cell, withheld counts BLANK) and `branch-summary`. CSV scope #104's column list grows; no existing row kind changes shape.
- `#/duty-cover?panel=desk` — the branch card gains a `Duties` column, `WITHHELD` in place of every count and rate in a suppressed cell, a `Why the cell is blank` column, a warning banner naming the floor and the refused pooled rate, the deferral note, and the premise. The Method panel lists withdrawal alongside the existing refusals and exposes all three floors in the re-declare dialog.
- `dutyCoverageSetConventions` accepts the three new keys under the existing rank-4+/full-access gate and names them in the audit summary.

## 4. Verification (one focused pass, 2026-11-07)

See `tests/app/duty-branch-disclosure.test.mjs`.

## 5. Limits

The floor protects figures, not identities: a reader holding the roster can still map "Branch 2" to a unit, and a released cell of six duty lines still describes two or three seats. Seats remain workflow declarations, not authentication. Nothing here is stored, so the reading changes the moment the roster or the declared floor changes — which is the point.
