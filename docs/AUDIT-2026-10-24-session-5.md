# Current-state audit — 2026-10-24, session 5

## Scope and method (before implementation)

- Checkout: `shahramclaude/Leados`, branch `arena/85bdc253-leados` (base commit `7096340`).
- Read every file in the canonical application graph (`index.html`, all 43 pre-session JS
  modules + `app/styles.css`, `scripts/serve.mjs`, `scripts/app-browser-smoke.mjs`, and all
  9 test suites in `tests/app/*.test.mjs`) plus root governance docs (`README.md`,
  `ROADMAP.md`, `RESEARCH.md`, `AI-SESSION-LOG.md`, `docs/adr/0006-canonical-zero-build-app.md`,
  `docs/AUDIT-2026-10-24-session-4.md`).
- Preserved legacy/non-canonical trees (`src/**`: 3,114 files; root `.ts`/`.tsx`: 78 files;
  `drizzle/`: 5 files; `public/index.html`; `deprecated/vite-index.html`) were inventoried
  only. Their builds, runtime behaviour and security remain **[UNVERIFIED]** this session.
- Installed pinned dependencies via `npm ci --no-audit --no-fund --ignore-scripts` (435
  packages including `jsdom` and `axe-core`). Baseline `npm test` ran cleanly: **161 pass,
  0 fail**.
- Container environment check: no Chromium/Firefox binary or `playwright-core` package is
  installed in this sandbox, and outbound network access is restricted to GitHub/npm/PyPI
  hosts. Real-browser execution (`scripts/app-browser-smoke.mjs`), visual print/PDF rendering
  and physical mobile viewport inspection are therefore **[UNVERIFIED]** in a real browser
  binary this session; UI, accessibility and HTTP serving were verified via `node:test`,
  `jsdom`, `axe-core` and live HTTP checks against `scripts/serve.mjs`.

## What works (source review plus baseline tests)

- Canonical zero-build ES-module app (`index.html` + `app/**`) with `localStorage` persistence
  (`leados.lifecycle.v1`), schema v1→v2→v3→v4 migrations, corrupt-JSON quarantine, future
  schema write-protection (`writeBlockReason` + untouched `protectedRaw` export), and a
  600-entry append-oriented event log.
- Complete workflows for roster management, 1:1 cadence/agendas/actions, SBI feedback with
  live coaching and observation-to-conversation latency, tri-state goal co-authorship and
  key-result check-ins, outcome delegations with decision authority, GROW plans, succession
  readiness, anonymous pulse with k-anonymity/unanimity/comment floors, DACI decisions,
  recognition, evidence-frozen performance reviews with 7 calibration checks, and voluntary
  conflict working records isolated from talent/health scoring.
- Hardened static server (`scripts/serve.mjs`) serving only `index.html` and `.js`/`.css`/`.svg`
  assets under `app/**` via `GET`/`HEAD`.

## Verified defects, shallow areas and missing capabilities

1. **Survivorship bias in historical reconstruction (`app/core/domain/health.js::truncateState`):**
   `truncateState` retained `status: 'archived'` on people archived *after* `asOf`, causing
   `cadenceDimension`, `feedbackDimension`, `clarityDimension` and `growthDimension` to drop
   later-exited reports from historical denominators and retroactively inflate past scores.
2. **Overwritten goal confidence & un-snapshotted mutable history (`schema.js`, `actions.js`, `health.js`):**
    Goals with zero check-ins before `asOf` had `confidence` forced to `'on-track'` even if
   created `'at-risk'` or `'off-track'`. Goal check-ins did not store numeric key-result
   snapshots (`keyResults`, `progressPct`), and 1:1 actions, feedback follow-ups, goals and
   GROW commitments lacked completion/closure dates (`completedOn`, `followUpCompletedOn`,
   `closedOn`, `stagesUpdatedOn`).
3. **Composition shift / Simpson's paradox in 30-day composite delta (`teamHealth`):**
   `overall - past.overall` compared weighted averages across different sets of measured
   dimensions when a new dimension (such as pulse `wellbeing`) unlocked in the recent window,
   producing an apparent leadership drop/jump even when every shared habit stayed flat.
4. **Pulse partial/unanimous wording inaccuracies (`health.js`, `charts.js`, `views/health.js`, `pulse.js`):**
   `wellbeingDimension` reported threshold wording even when blocked for `'unanimous'` or
   partial answers; `pulseChart` and `This fortnight` cited raw `n` rather than
   `usableResponses` when partial imported responses were present; `pulse.js::comments` did
   not clamp `pulseMinResponses` with `Math.max(3, ...)` on direct domain calls.
5. **Minor person-timeline omission & Settings wall-clock leak:**
   `personTimeline()` (`app/core/domain/people.js`) omitted dated `delegations` events;
   `checkExportFirst()` (`app/views/settings.js`) called `new Date()` instead of `ctx.now`.
6. **Top two roadmap gaps unbuilt:**
   - Multi-period historical trends existed only for weekly pulse, not for the 5 team-health
     dimensions, composite health, feedback latency or delegation follow-through.
   - Data portability supported full JSON only; there was no scoped, unknown-preserving,
     formula-injection-safe CSV export for spreadsheets, calibration prep or HR handoff.

## Implemented increment

- **Schema v5 (`4 → 5`):** additive dated snapshots across 1:1 actions (`completedOn`),
  feedback follow-ups (`followUpCompletedOn`), goals (`initialConfidence`, `completedOn`,
  `krUpdatedOn`, `keyResults[].initialCurrent`, `checkins[].{progressPct, keyResults}`), and
  GROW plans (`closedOn`, `stagesUpdatedOn`, `will[].completedOn`). Pre-v5 migrations keep
  unknown historical dates/snapshots strictly `null`.
- **Honest historical reconstruction & multi-period trends (`health.js`, `trends.js`, `charts.js`, `views/health.js`):**
  `reconstructStateAt()` restores active status when `archivedAt > asOf`, reconstructs dated
  snapshots, and marks each dimension `exact` or `approximate` with explicit reasons.
  `buildTeamTrends()` computes 8-week, 12-week and 6-month series across all 5 dimensions,
  matched-dimension composite deltas, feedback latency and delegation follow-through, with
  `pre-history` and `no-evidence` null guards and accessible SVG + HTML data tables.
- **Purpose-limited, CWE-1236-hardened CSV export (`app/core/csv.js`, `store.js`, `views/settings.js`):**
  13 scoped CSV exports with RFC 4180 CRLF serialization/parsing, leading-apostrophe formula
  neutralization (including leading whitespace and full-width `＝`/`＋`/`－`/`＠` while keeping
  negative numbers numeric), unknown preservation (`""`), anonymity-enforced `pulseSummary`,
  confidential confirmation for `conflicts`, copyable modal preview/fallback, QuotaExceeded
  read-only resilience, and future-schema refusal (`writeBlockReason`).
