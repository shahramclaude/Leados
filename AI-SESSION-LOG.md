# AI-SESSION-LOG.md

Append-only log of AI-assisted engineering sessions on LEADOS
(https://github.com/shahramclaude/Leados).

---

## Session: Part 38 — Continuous Assurance (nightly checks, drift, remediation, blind spots)

**Date:** 2026-10-22
**Scope:** Part 38 of 41. Declared dependencies: Parts 04, 09, 11, 13, 30, 33.
**Agent role:** Continuous-assurance engineer.

### Pre-work: standing-order compliance check

Per the mandatory standing order, the following files were to be read before
any write: `src/lib/selfDiagnostics.ts`, `selfTest.ts`, `selfImprove.ts`,
`calibration.ts`, `drift.ts`, `evaluation.ts`, Part 30's learning loop,
Part 33's AI control room, Part 09's fairness suite.

**Finding:** none of these files, nor any artifact from Parts 01–37, existed
in this repository checkout. The project was the bare
`nextjs-postgresql-template` scaffold (`src/db/schema.ts` exported nothing,
only `src/app/api/health/route.ts` and a starter home page existed). This was
verified with `list_files`, `grep_files` for every named symbol, and reading
`package.json`/`schema.ts`/`db/index.ts` directly — all confirmed empty of
prior-part code.

**Decision:** rather than fabricate a plausible-looking history for Parts
04/09/10/12/14/15/19/30/33/34 that doesn't exist in this checkout, this
session builds Part 38's continuous-assurance system as the first real
implementation of the exact files the standing order names
(`selfDiagnostics.ts`, `selfTest.ts`, `selfImprove.ts`, `calibration.ts`,
`drift.ts`, `evaluation.ts`), and adds clearly-labeled **compatibility
shims** for the upstream systems those files depend on. Every shim file
header states which Part it stands in for and what it does NOT do. This is
also recorded as a standing system blind spot
(`upstream-part-absent` in `src/lib/assurance/blindSpots.ts`).

### What was built

1. **Schema** (`src/db/schema.ts`): assurance checks registry, scheduler job
   ledger, metric observations + baselines, assurance runs, drift series,
   feature flags, remediation actions, findings, notifications, hash-chained
   audit log, versioned nightly reports, monthly board-pack rollups, and a
   blind-spot entries table.
2. **Drift detectors** (`src/lib/drift.ts`): EWMA + CUSUM control-chart
   implementations with documented sensitivity (lambda/L for EWMA, k/h for
   CUSUM), following standard SPC (Montgomery 2009) defaults.
3. **Audit chain** (`src/lib/audit.ts`): SHA-256 hash-chained log with
   `verifyAuditChain()`. Found and fixed a real bug during this session:
   Postgres `jsonb` does not preserve key order on round-trip, which broke
   hash verification for any entry with object payloads. Fixed with a
   canonical (recursively key-sorted) JSON serialization used identically at
   write- and verify-time.
4. **Scheduler shim** (`src/lib/scheduler.ts`, Part 10 compatibility):
   idempotent `(jobKey, cycleKey)` claims + budget cap.
5. **Feature flags shim** (`src/lib/featureFlags.ts`, Part 15 compatibility):
   degrade/restore with audit trail.
6. **Notifications shim** (`src/lib/notifications.ts`, Part 14
   compatibility): findings + notifications, durably recorded (no real
   external delivery — documented).
7. **Domain metric shims**: `calibration.ts` (Part 04), `fairness.ts`
   (Part 09), `retrieval.ts` (Part 12), `aiQuality.ts` (Part 33),
   `dataQuality.ts` (Part 34), `learningLoop.ts` (Part 30), `security.ts`
   (Part 19), `configDrift.ts` (declared-vs-actual diff). Each provides the
   real math (Brier score, ECE, demographic parity difference, equal
   opportunity difference) plus a seeded, reproducible history generator,
   with an explicit "inject drift from day/week N" parameter used by the
   harness.
8. **Assurance core** (`src/lib/assurance/`): `registry.ts` (8 checks across
   all 7 domains, each with authored, required `blindSpots`),
   `blindSpots.ts` (system-level blind spots, maintained as data),
   `coverage.ts` (registry-completeness table mapping every declared
   Part 04/09/12/30/33/34/19 metric to a check or an explicit blind spot),
   `evaluation.ts` (ratio/absolute threshold evaluation + drift),
   `runner.ts` (idempotent per-cycle check execution + remediation
   dispatch), `remediation.ts` (safe_auto_fix / degrade / escalate tiers,
   each audited and reversible, with a hard anti-thrash cap of 3 auto-fixes
   per 24h per check before forced escalation), `report.ts` (versioned
   nightly report generator with a zero-filler lint that requires every
   section to either have concrete items or an explicit "no events"
   statement, and a mandatory non-empty blind-spot appendix), `sync.ts`
   (registry → DB sync + demo history bootstrap).
9. **Self-* files** (standing-order-named): `selfDiagnostics.ts` (system
   health aggregator), `selfTest.ts` (ad-hoc dry evaluation of the whole
   registry), `selfImprove.ts` (the concrete safe-auto-fix actions —
   documented as no-ops where no real cache/projection layer exists yet).
10. **UI** (`src/app/assurance/*`): Assurance Console (registry, health,
    breach trend sparkline, remediation log with revert), Drift Trends
    (SVG charts with baseline + EWMA control band per metric), Blind Spots
    (system-level + per-check, rendered from the same data source used by
    the report appendix), Feature Safety (degraded flags with reason +
    restore button).
11. **API routes**: `/api/assurance/{checks,runs,drift,remediation,report,
    blindspots,features,run-cycle}`, `/api/audit/verify`.
12. **CLI scripts**: `scripts/driftInjectionHarness.ts`,
    `scripts/auditVerify.ts`, `scripts/runAssuranceCycle.ts`,
    `scripts/verify.ts` (composite gate runner), wired to `npm run
    drift:inject`, `audit:verify`, `assurance:run`, `verify`.

### Bugs found and fixed during this session (via real execution, not inspection)

- **Audit hash verification false-negative** — jsonb key reordering on
  round-trip broke hash recomputation. Fixed with canonical serialization.
  Caught by running `npm run verify` Gate 2, not by code review.
- **Calibration check permanently breaching with zero injected drift** — the
  hand-picked baseline constant (0.08) didn't match the actual statistical
  behavior of the synthetic prediction generator (~0.17 for the original
  uniform-random-confidence model). Fixed by computing the baseline from a
  dedicated clean reference batch generated by the same model, rather than a
  guessed constant — this is also closer to what a real Part 04 baseline
  process would do.
- **`ai-cost-quality-trend` always breaching on the latency metric** — a
  single shared absolute threshold (`warn: 5.5, breach: 6.5`) was being
  applied to three metrics of wildly different scales (a $ amount, a 0..1
  score, and a millisecond latency). Redesigned the `Threshold` model to
  support `mode: "ratio" | "absolute"` (relative-to-baseline vs. literal) and
  per-metric direction overrides (`Check.metricDirections`), so one
  threshold object can sensibly span heterogeneous metrics.
- **`config-schema-drift` always erroring** — the check declared
  `config.diff_count` as a metric key but nothing ever computed or recorded
  it. Added `recordConfigDiffObservation()`, invoked on every bootstrap/cycle
  so the check always has a fresh, real number (not a simulated one).
- **ECE noise swamping the ratio threshold** — day-level samples (200) were
  far noisier than the 2000-sample reference baseline, causing false warns.
  Increased daily sample size to match the reference batch size.

All five fixes were discovered by actually running `npm run verify` and
`npm run assurance:run` against the real local Postgres instance and reading
the output, not by static reasoning — consistent with this part's own
"honesty rules" mandate.

### Honesty / blind-spot disclosure for this session

- This system monitors synthetic/seeded data standing in for Parts
  04/09/12/30/33/34/19 until those parts are implemented for real. The
  `metric_observations` table and metric-key naming scheme are designed so
  real pipelines can write into the same table with zero changes to the
  assurance layer — but today, nothing here has seen real production data.
- Security scanning (`src/lib/security.ts`) is partly simulated (dependency
  CVE scan, secret scan) — clearly labeled `simulated: true` in its output
  and in the Blind Spots view.
- Notification delivery (`src/lib/notifications.ts`) is recorded durably but
  not actually sent anywhere (no email/Slack integration in this build).

### Verification performed this session

- `npm run verify` — 5 gates, all passing (drift-injection latency table,
  auto-remediation transcript, nightly-report lint, feature-degrade +
  restore, registry-completeness coverage table).
- `npm run drift:inject`, `npm run audit:verify`, `npm run assurance:run` —
  run standalone, transcripts captured.
- `npx next typegen`, `npm exec tsc -- --noEmit`, `npm run build` — all
  clean.
- `build_and_start` — passed, `/api/health` green, live smoke-tested
  `/api/assurance/*`, `/api/audit/verify`, and all four `/assurance/*` pages
  (HTTP 200), and confirmed the nightly cycle API is idempotent (second
  POST for the same day returns `claimed: false, reason: "already_completed"`
  with no duplicate rows).

### What was deliberately NOT done (see Phase 5 of the delivery)

- No real external paging/Slack/email integration for notifications.
- No cross-metric joint-anomaly detector (each check is still independent).
- No dynamic blast-radius discovery for remediation — the check→flag mapping
  is manually authored.
- No live Part 19 SAST/dependency/secret scanning — simulated and labeled.
- No UI auth/RBAC on the Assurance Console or the revert/restore actions
  (anyone who can reach the app can trigger them) — acceptable for this
  sandbox but called out as a gap for production hardening in a later part.
