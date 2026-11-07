# ADR-0115 — Cross-week Jurisdiction Drift (Session 156, Schema v112 unchanged, `#/jurisdiction?panel=drift`)

## Status

Implemented. No new collection, no migration, no new post-commit rule
registration and no CSV scope. `RULE-JUR-05` is a fifth PASS inside the
existing `jurisdictionRule` on the shared spine, so the 90-rule / 90-contract
parity is unchanged.

## The duty, by altitude

Sessions 148–152 shipped five consecutive director-and-above instruments;
153–155 shipped frontline/mid-manager primary surfaces. The VP/executive and
chief altitudes had been served only by roll-up since 152, and the
`[exec / chief]` cross-week drift item had been carried on the roadmap's
"Next targets" since Session 149. That is why this session is exec/chief
primary:

- **VP / Executive (rank 4) — forecasting quarterly coordination risk.** Is
  the share of this function's objectives that cross a reporting branch
  structurally rising, and is the minimal coalition needed to hold them
  getting bigger? A quarterly forecast needs a band, not a snapshot.
- **CEO / C-suite (rank 5) — reviewing cross-division strategic exposure.**
  Is the enterprise running on more cross-branch work no single seat can
  resolve, and is a boundary redraw earned? The answer must not be an average
  of percentages that hides a composition change.
- **Director (rank 3)** — unit-level drift inside their own subtree; counts and
  rates only, small cells already suppressed by `RULE-JUR-04`.
- **Frontline (rank 1) / mid-manager (rank 2)** — their own span's dated
  series, with their own altitude's question. Same engine, same panel, same
  right; scope is the only cut.

Every altitude uses the same surface, scoped by the seat's reporting-tree
subtree. There is no second hierarchy and no per-altitude dashboard.

## The gap

`RULE-JUR-04` (ADR-0109) freezes one identity-free span reading per
`(span, ISO week)` with cross-branch counts, priced/refused counts, a median
coalition size and a small-cell flag. Nothing ever compared two weeks. A VP
was handed one week's cross-branch count and asked to decide whether the shape of
the organisation was changing. Also absent: a denominator. A reading carried
only cross-branch cluster counts, so a "share" could not be computed at all —
and printing `crossBranch / clusters` would have been a constant 100%.

## What shipped

1. **A denominator, declaredly additive.** `buildJurisdictionBook` now exposes
   `allClusters` (every objective the harvest could place, not only gaps), and
   `jurSpanRollUp` returns `objectives` for the span's subtree. `RULE-JUR-04`
   stores it; `normalizeJurReadings` keeps it as a **nullable integer**. A
   reading frozen before this session has `objectives: null` and the drift
   reader **refuses that week's share** (`drift-no-denominator`) rather than
   back-filling, printing 100% or printing zero. No schema bump: old rows
   round-trip and the new field is fail-closed.

2. **A dated, identity-free weekly series** (`jurDriftWeeklySeries`). One
   aggregate row per frozen ISO week: pooled cross-branch share
   `ΣcrossBranch / Σobjectives`, the unweighted **mean of unit rates**, the
   **composition gap** between them (Yule 1903 / Simpson aggregation bias),
   the median of span-median coalition sizes, span/suppressed counts, the
   week-over-week deltas and every refusal. No span id, objective key, person,
   title or note is copied into a row, so an upward reading is identity-free
   **by construction**, not by a filter that could be forgotten.

3. **A distribution-free conformal band** (`conformalDriftBand`). Calibration
   residuals are the absolute week-over-week changes of all **strictly-prior**
   weeks; `k = ceil((n+1)·coverage)`; the achieved marginal finite-sample
   coverage `k/(n+1)` is printed beside the nominal one (Vovk et al. 2005;
   Angelopoulos & Bates 2021). Refused below the declared week floor (4),
   refused for an incomplete series (a gap is **never** interpolated), and
   refused when `k > n` instead of extending a bound to `+∞`. Exchangeability
   is **declared, not proven**; a band crossing is an anomaly, not a causal
   claim and not proof a redraw is owed.

4. **Declared, clamped, printed conventions.** `jurDriftMinWeeks` (4, 3–12),
   `jurDriftCoveragePct` (66, 50–90) and `jurDriftMaxWeeks` (16, 4–52) join
   the existing `JUR_CONVENTION_DEFAULTS`, so they are automatically printed
   on the Method panel and re-declarable through the existing
   `jurSetConventions` full-access command. Nothing is fitted from the record.

5. **Hierarchy roll-up and automation, not a standalone dashboard.** The
   readings are produced by `RULE-JUR-04` on the shared post-commit spine with
   one `rolls-up-to` edge per ancestor. `RULE-JUR-05` runs only on the named
   `jur.drift` command (`jurDriftScan`), after the ordinary full scan has
   frozen this week's readings. A published band crossing opens **exactly one**
   governed, marker-idempotent decision per ISO week (`[JUR-DRIFT:week]`),
   with three named human options (investigate / accept variance / rehearse a
   redraw) and one typed `rolls-up-to` edge per executive ancestor seat **in
   the same atomic transaction**. The decision carries `[RULE-JUR-05:week]`,
   so the harvest excludes it as engine audit output — the Session-143
   second-order-decision regression cannot recur. It never moves a reporting
   line, never edits a reading and never accepts itself. An ordinary
   `jur.scan` is unchanged.

6. **The panel** (`#/jurisdiction?panel=drift`): altitude-specific question,
   verdict banner with the printed refusal, four stat cells, the weekly
   aggregate table, the conformal-band table with `n`, `k`, achieved coverage
   and conformal `p`, the full method/refusals card, `Scan & govern drift`,
   `Conventions`, aggregate-only CSV and an identity-free brief — both with a
   copyable fallback when the browser blocks a download.

7. **Access registry.** `jurDriftScan` joins the `record-jurisdiction` right
   (ranks 1–5); `jurDriftRead`, `jurDriftCsvRows` and `jurDriftBriefText` are
   registered `SAFE_READS`, so enforcement cannot make the VP/chief reading
   vanish while its writes stay gated.

## Named frameworks, implemented

- **Vovk et al. (2005) split conformal / Angelopoulos & Bates (2021)** — one-sided finite-sample band on strictly-prior changes, with the achieved coverage printed.
- **Yule (1903) / Simpson aggregation bias** — pooled rate beside mean of unit rates, gap printed in percentage points.
- **Riker (1962) size principle** — the coalition measure is the frozen minimal covering coalition size, already priced by ADR-0109.
- **Jaques time-span of discretion** — altitude applied by reporting-tree scope, printed question and look-back window.
- **Heckman (1979) sample-selection honesty / statistical disclosure control** — an unsampled week is a counted gap; a suppressed cell is a counted refusal; blank never zero.

## Honest limits

- A band crossing is an anomaly under **declared** exchangeability. Weeks are not independent: a persistent trend, a reorganisation or a change in scanning cadence breaks the assumption. The panel says so before its numbers.
- Units are the frozen span readings inside the seat's scope. Nested spans overlap through objectives they share; the pooled rate is count-weighted, never a sum of independent samples. Median coalition size is a median of span medians, labelled as such.
- Readings dated before this session have no denominator and refuse their share. History is never reconstructed or back-filled.
- CSV and brief are identity-free aggregates; suppression is not differential privacy. Local seats remain workflow declarations, not authentication.
- Real-browser assistive-technology walkthrough: **[UNVERIFIED]** (jsdom + axe-core ran on the rendered panel at three altitudes).

## Verification

See `AI-SESSION-LOG.md` Session 156. Focused pass: `tests/app/jurisdiction-drift.test.mjs`, the adjacent `jurisdiction` / `redraw-rehearsal` suites, lint, canonical boundary, doc links, standalone rebuild and standalone suite. Full 158+ suite not run.
