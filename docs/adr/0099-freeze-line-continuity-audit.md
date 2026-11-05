# ADR-0099: Freeze-Line Continuity Audit — governed comparability of measured carriage across a reorganisation boundary, with a timing-channel guard

- **Status:** Accepted
- **Date:** 2026-11-05
- **Schema:** v101 (additive `100 → 101`)
- **Route:** `#/freeze-line`
- **CSV scope:** `freeze-line` (#95)
- **Rules:** `RULE-FRZ-01..03` on the shared post-commit spine
- **Closes:** the ROADMAP gap "reorganisation comparability across a freeze line — residual `lastCarriageOn` timing channel on suppressed federation rows"

## Decision

Every committed (or reverted) structural design in `orgDesigns` is a **dated
freeze line** across the reporting tree. LeadOS now measures, from the same dated
artefacts the federation already counts (cadence readings, envoy ingests,
attested checkpoints — never a new data source), whether declared leadership
edges **carried work on both sides of each line**, and prints one governed
verdict per line: **held**, **degraded**, or **refused** (below the declared edge
floor). No surveyed product does this: Visier claims metrics "consistent as of
any date, through every reorg" [UNVERIFIED vendor claim]; Workday requires
pre-planned as-of snapshot dates to reconstruct history [UNVERIFIED]; and an
HRIS current-state overwrite silently rewrites historical headcount — the exact
failure this audit exists to detect.

## The measurement

For each freeze line (design `committedOn`/`revertedOn`):

1. **Before side** — the tree as it stood before the design (restored from
   `previousManagers`), window `[line − windowDays, line)`.
2. **After side** — the current tree, window `[line, line + windowDays]`.
3. Each side is reduced to the set of declared seat edges
   (`seat → parentSeat`) that show direct carriage inside the window
   (Wilson-bounded coverage, same rules as `measureFederation`).
4. Every before-side edge is classified **held** (connected on both sides),
   **lost** (connected before, absent or unconnected after), **gained** (the
   mirror), or **still-silent** (unconnected on both sides), aggregated by
   altitude with complementary small-cell suppression at the federation cell
   floor.
5. Verdict: **refused** when either side has fewer than `freezeLineMinEdges`
   edges; **degraded** when the connected share drops by more than
   `freezeLineDropPct` points; otherwise **held**.

A line is registered by freezing a reading (`freezeLineFreeze`) or by an explicit
scan (`freezeLineScan`); both are marker-idempotent, pausable
(`freezeLineAutoPropagate`), and write `freezes` / `re-projects` graph edges plus
one `rolls-up-to` edge per leadership ancestor in the same atomic transaction.

## The timing-channel guard (the actual ROADMAP gap)

Suppressed federation rows used to print `lastCarriageOn` — which discloses
*when* a suppressed span last carried work, and differencing two releases of the
table then leaks the suppressed count (UK AF/ONS SDC guidance; ePrints Soton
M09/03: residuals leak by differencing). Now:

- A suppressed row prints **no carriage date** in the view, in frozen
  snapshots, and in CSV — blank, never zero.
- **RULE-FRZ-03** scans legacy snapshots for suppressed rows that still carry a
  date and opens exactly one redaction decision per snapshot per ISO week.

## Governance and disclosure

- Permissions reuse the federation right: reads
  (`freezeLineReport`, `freezeLineBriefText`, `freezeLineCsvRows`,
  `freezeLineAttentionCount`, `freezeLineConventions`) are seat-scoped safe reads;
  `freezeLineFreeze` / `freezeLineScan` require `govern-federation`.
- CSV scope **#95** is aggregate-only and refusal-honest: one row per crossed
  line (structural, aggregate figures only — no reading id, span id, person or
  carriage date), one row per altitude × continuity-class cell, one timing-guard
  row; suppressed and refused figures are **blank, never zero**.
- The brief is identity-free and names the verdicts. The view is axe-clean
  across all five panels (desk / lines / continuity / comparability / timing).

## Schema

`v100 → v101` additive: collections `freezeReadings` / `freezeMarkers`, graph
node type `freezereading` with relations `freezes` / `re-projects`, five clamped
settings (`freezeLineWindowDays` 30, `freezeLineMinEdges` 3,
`freezeLineCellFloor` 3, `freezeLineDropPct` 15, `freezeLineAutoPropagate`
true), fail-closed normalizers. Nothing is inferred for an upgraded workspace.

## Evidence

`tests/app/freeze-line.test.mjs` (14/14): migration, fail-closed normalizers,
line detection, held/degraded/refused verdicts, rule idempotency, contract and
spine registration, paused-automation silence, suppressed-row timing withholding
in view/CSV/snapshot, RULE-FRZ-03 redaction, CSV #95 refusal-honesty,
identity-free brief, axe-clean view. Targeted suites, lint, `check:boundary`,
`check:links`, standalone build + verify all green (2026-11-05).
