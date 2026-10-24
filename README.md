# LeadOS — a leadership workspace that keeps its own receipts

LeadOS helps a first-time manager turn real conversations, feedback, goals and commitments
into evidence-linked next steps. Its team-health indicator is an explainable heuristic over
those records, not an objective leadership grade or a substitute for listening to people.

The **canonical application is `index.html` + `app/**`**. It runs in your browser with no
account, application backend, database or runtime package dependency. The static server
only serves files; app records stay in this browser's `localStorage` unless you explicitly
export them. **Local notes and JSON exports are unencrypted.**

```sh
node scripts/serve.mjs --host 0.0.0.0 --port 5173
# or: npm run app
# Open http://localhost:5173
```

Node 18+ can serve the application; there is no build or dependency install required to run
it. For the test tooling, use Node 22+ (verified with Node 22.22.3):

```sh
npm ci --no-audit --no-fund
npm test                     # 173 domain, persistence, CSV, trend and jsdom/axe tests
```

## Honest state of this repository

This checkout also contains older React/Next.js applications, consoles, database code and
large historical documents. Their presence is not evidence that those products run. They
are preserved, **not rebuilt or deleted**, and are not imported by the canonical app.

| Path | Current status |
|---|---|
| `index.html`, `app/**` | **Canonical product:** 45 native JavaScript modules, CSS and shell; tested below. |
| `scripts/serve.mjs` | Dependency-free static server. |
| `tests/app/**` | Canonical automated suite, run by `npm test`. |
| `scripts/app-browser-smoke.mjs` | Optional, reproducible Chromium lifecycle/mobile/accessibility smoke (not executed in Session 5 container — **[UNVERIFIED]** in real Chromium binary this session). |
| `public/index.html` | Older synthetic-data console, not the product; detailed runtime status this session **[UNVERIFIED]**. |
| `src/**`, root React files, `drizzle/`, `openapi.yaml` | Legacy/non-canonical; current builds, security and workflows **[UNVERIFIED]**. |
| `deprecated/vite-index.html` | Preserved old Vite entry. |

**Correction to earlier documentation:** `src/db/` exists. It contains a PostgreSQL/Drizzle
client, schema and repositories; `src/app/page.tsx` is a PostgreSQL starter page. Claims that
the data layer is absent were wrong. The starting checkout contained 3,650 tracked files,
3,495 source files and 316,352 source lines. All source was scanned for inventory/imports;
that is **not** personal line-by-line verification of the whole legacy tree. Historical
TypeScript error counts were not rerun. See the
[current audit](docs/AUDIT-2026-10-24-session-5.md) and the corrected
[architecture decision](docs/adr/0006-canonical-zero-build-app.md).

## What it actually does

### Conversations and feedback

- Log a 1:1 as held, moved or skipped; compute cadence, cancellation streaks and adherence
  from real dates. Generate editable agenda suggestions with a reason for each item.
- Capture owned, dated meeting actions; overdue commitments surface on Today.
- Record Situation → Behaviour → Impact feedback with a live, non-blocking specificity coach.
  Track praise/constructive balance and follow-up dates without imposing a target ratio.
- Store observation and conversation dates separately. Unknown observation dates stay
  unmeasured, not zero-day feedback; date corrections preserve the original note.

### Goals, delegation, development and succession

- Goals have key results, computed progress, confidence and dated check-ins. A goal with no
  measurable results is unmeasured, not 0%. Authorship is co-authored, explicitly leader-set
  or unknown; unknown does not trigger the leader-set warning.
- Delegate an outcome with one accountable owner, expected result, resources/support, dates
  and explicit decision authority: recommend, agree first, act-and-inform or own.
- Check in, record blocks, complete with the delivered result, or explicitly accept the work
  back with a reason and next step. Closed delegations retain their history.
- GROW plans separate Goal, Reality, Options and Will. A plan without a dated commitment is
  reported as incomplete, not treated as progress. Show competency coverage across the team.
- Succession readiness challenges unsupported claims using recorded development, feedback
  and conversation evidence; it does not infer potential from personality.

### Performance reviews

- Assemble an evidence packet for a person and inclusive period: dated 1:1s, feedback,
  goal check-ins, development, recognition and delegation outcomes with source links.
- Keep four self-reflection prompts separate from three manager-assessment prompts and an
  optional behaviour-anchored rating. Reflection is manager-entered, not independently
  submitted by an employee account.
- Seven calibration checks challenge thin, recent-only, one-sided or unsupported assessments.
  These are transparent prompts, not proof of fairness or an automated performance score.
- Completion recaptures and freezes evidence; reopening and refreshing are separate audited
  actions. Current goal/development/delegation values are labelled **at capture**, not falsely
  reconstructed at period end. Browser print/save-PDF is wired; visual print output remains
  **[UNVERIFIED]** in this session.

### Conflict resolution — a working record, not an HR case system

- Start with a neutral situation, coordinator and follow-up date; hear 2–8 participants'
  perspectives and underlying interests, including people outside your roster.
- Participation is unknown, willing or declined. Unknown is never consent. Informal
  agreement requires an explicitly appropriate route, everyone willing/heard, and recorded
  process and information-sharing limits.
- Record an explicitly confirmed agreement and 1–12 owned, observable, dated commitments.
  Keep agreement versions and the context captured with each one.
- Record real results, then an all-party follow-up that checks those results. An agreement
  is **not** resolution; an earlier same-day check cannot verify results recorded later.
- Close only when current-context commitments and verification support it. Reopening keeps
  history and requires a fresh check; materially changed context requires a new agreement.
- For serious/uncertain matters, record the qualified support contact and next check date.
  **A support handoff sends nothing and is not resolution.** The manager must contact the
  appropriate person; the app is not a mediator, investigation or emergency service.
- Private case content is excluded from generated 1:1 agendas, person timelines, readiness,
  health scoring and performance-review evidence. General reminders use counts/status only.
  This is exposure minimisation, **not access control**: full JSON backups include the notes.

### Team pulse

- Four dimensions: psychological safety, clarity, sustainable workload and growth.
- Default reporting floor is **5 complete responses**; supported settings are 3–25.
  Aggregate, dimension means and weekly trend use the **same complete four-answer cohort**.
  Partial responses cannot supply a misleading privacy floor or distort released means.
- Suppress the entire vector when any dimension, or each response's overall mean, is
  identical across the cohort. Otherwise overall/other means could reveal a suppressed
  dimension by subtraction. Future responses are excluded from current windows.
- Comments need their **own** minimum number of nonempty, varied comments. Score-response
  count alone does not release a lone comment. Suppressed comparisons stay null, not zero.
- Anonymous records store `personId: null`; imports strip an identity value. The local app
  cannot verify independent respondents or guarantee anonymity against a determined observer.
  Writing style and someone with access to the browser/export can still identify people.

### Decisions, recognition and next steps

- DACI decisions capture roles, reversibility, options and rationale, then record the outcome
  and review. Quiet decisions and overdue reviews are surfaced.
- Recognition records real contributions; drought prompts use logged dates.
- **42 deterministic signal rules**, including `CFL-01`…`CFL-04`, produce evidence, urgency and
  one next action. Similar person findings roll up rather than flooding the page. Conflict
  reminders never include case titles, names or notes and work without a roster.
- Optional demo data is clearly labelled. The demo refuses to replace real records without
  confirmation, including workspaces containing only delegations or conflict records.

### Longitudinal team-health & habit trends and scoped CSV export

- View **8-week, 12-week and 6-month** checkpoint trends across composite health, all five
  health dimensions, feedback observation-to-conversation latency and delegation follow-through
  on `#/health` (with direct dimension drill-down from `#/today`).
- Checkpoints before the workspace recorded management activity stay `pre-history` (`null`),
  never `0`. Historical reconstruction restores team members archived after a past checkpoint
  (preventing survivorship bias), uses Schema v5 dated check-in/completion snapshots where
  present, marks pre-snapshot mutable fields **`approximate`** (hollow chart markers + plain
  explanation), and compares composite deltas across **matched dimensions** so newly unlocked
  pulse data never produces a false composite drop.
- Every trend chart pairs non-color stroke/shape encoding with a collapsible HTML data table
  (`<th scope="col|row">`) carrying exact checkpoint values and privacy-suppression states.
- Export **13 purpose-limited CSV tables** from Settings (`people`, `oneOnOnes`, `actions`,
  `feedback`, `goals`, `delegations`, `growthPlans`, `recognition`, `decisions`, `reviews`,
  `pulseSummary`, `healthTrends`, plus confirmation-gated confidential `conflicts`) with a
  copyable preview modal when downloads are restricted.
- Text cells starting with `=`, `+`, `-`, `@`, control whitespace or full-width formula
  prefixes (`＝`, `＋`, `－`, `＠`) are prefixed with `'` (OWASP CWE-1236) while negative
  numbers stay numeric and unknown values stay blank (`""`). `pulseSummary` exports only
  anonymity-checked weekly aggregates and independently thresholded comments.

## Data integrity and architecture

- **Schema v5**, with additive v1→v2→v3→v4→v5 migrations; pre-v5 records retain `null` for
  unknown historical completion dates and check-in snapshots rather than fabricating history.
- Load/import normalisation reports repairs. Conflict dates, explicit confirmation, supported
  closure and reopening boundaries are rechecked; malformed/duplicate conflict history produces
  warnings. Oversize conflict writes are rejected before any state/event change, not silently cut.
- The static server allows only the canonical shell/assets, rejects write methods, and refuses
  symlink aliases. It does not publish scratch backups, `.env`, `.git`, test tools or legacy source.
  Historical console/docs files remain in the repository but are no longer served by this entry.
- Future/invalid declared schema versions are not silently downcast: imports are rejected;
  incompatible saved data is write-protected and exports unchanged for recovery. Only explicit
  compatible import/reset can replace it, and protection survives a failed replacement write.
- Corrupt JSON opens a fresh workspace with a warning; recovery quarantine is **best effort**,
  capped at 500,000 characters and can itself fail when storage is full. Keep external backups.
- Each storage write replaces one JSON blob. On ordinary write failure, changes remain **in
  memory only**, with a persistence error; conflict dialogs and Settings report this explicitly.
  Imports adopt nothing unless the replacement saves. Reloading loses unsaved in-memory changes.
- Meaningful mutations append events; the general log retains the latest **600** entries.
  Conflict agreement/check/transition history stays in its record. Neither is tamper-proof.

```text
index.html                 shell, landmarks, navigation and modal/toast roots
app/main.js                router, application context, shell and error boundary
app/actions.js             DOM-free validated write API
app/conflict-actions.js    conflict lifecycle validation and generic audit events
app/core/                  schema, injected storage/clock, pure domain modules
app/ui/                    shared DOM/forms/dialogs/charts
app/views/                 route renderers, not persistence implementations
tests/app/                 node:test domain/store/jsdom tests
```

No runtime framework, package dependency, account, network service or model inference was
added. Research and product tradeoffs are in `RESEARCH.md` §§14–16.
The five health dimensions use weights 24/20/20/16/20 for cadence/feedback/clarity/growth/
wellbeing. Missing dimensions stay null and weights renormalise; grades are A/B/C/D/F.
Historical comparison uses Schema v5 dated snapshots where recorded and explicitly labels
checkpoints `approximate` when pre-v5 or in-place edited fields lack history.

## Verification — 2026-10-24, session 5

- `npm test`: **173 passed, 0 failed/skipped** across 11 suites (`tests/app/*.test.mjs`).
- All 45 canonical JS modules (75 JS/MJS files including `scripts/**`) pass `node --check`.
- Live HTTP check against `scripts/serve.mjs` verifies `index.html` and the new `trends.js`
  and `csv.js` ES modules serve `200 OK` under preview `Host` headers.
- `axe-core` 4.11 via JSDOM reports **0 semantic/ARIA/label/table violations** on `#/health`
  (multi-series trends, horizon/dimension filters, approximate disclosures and data tables)
  and `#/settings` (scoped CSV selector, preview modal and confidential confirmation).
- Real-Chromium binary execution (`scripts/app-browser-smoke.mjs`), raster `color-contrast`
  pixel sampling, physical mobile overflow and browser print/PDF output were not executed in
  the Session 5 container (no browser binary installed) and are marked **[UNVERIFIED]** for
  this session (Session 4's Chromium 153 baseline is recorded in `AI-SESSION-LOG.md`).

Optional browser reproduction on Linux (tools are test-only, installed in ignored scratch):

```sh
# Keep the static server running in another terminal.
npm install --prefix tmp/browser --no-save --no-audit --no-fund \
  playwright-core@1.64.1 @sparticuz/chromium@153.0.0 axe-core@4.11.0
node scripts/app-browser-smoke.mjs
# Reports/screenshots/download evidence: tmp/browser-evidence/ (not committed)
```

## Known limitations and next

- **One leader, one browser profile.** No accounts, employee submission, multi-manager sharing,
  authentication, encryption or background notifications. Never store notes you are not
  authorised to hold; export contains sensitive data. Clearing site data deletes the workspace.
- Pulse suppression is intentionally more conservative: some previously visible sparse,
  unanimous or thin-comment windows now remain hidden. A floor is not an anonymity guarantee.
- Cadence and seven-day latency/check-in conventions are configurable, not validated universal
  deadlines. No real-manager longitudinal validation or proof of improved outcomes is claimed.
- Optional local encryption (WebCrypto passphrase-derived keys with safe plaintext→encrypted
  migration and lost-passphrase warnings) remains roadmap work; local storage and JSON/CSV
  exports are currently unencrypted.
- Legacy build/runtime, real-Chromium smoke execution in Session 5, Safari/Firefox, real
  assistive-technology use, print visual output and large-workspace performance remain
  **[UNVERIFIED]**.
- A fresh `npm audit --omit=dev` reports **1 critical and 2 high** findings in the legacy
  Next/PostCSS/Sharp dependency chain. The canonical module graph imports none of it. This
  increment did not upgrade or validate that legacy app; its dependencies must not be treated
  as safe for deployment merely because the static app works.

## Documentation

- [ROADMAP.md](ROADMAP.md) — verified inventory, ordered next work and rejected directions.
- [RESEARCH.md](RESEARCH.md) — frameworks, product benchmarks and design consequences.
- [Current audit](docs/AUDIT-2026-10-24-session-5.md) — Session 5 evidence and verification boundaries.
- [Session 4 audit](docs/AUDIT-2026-10-24-session-4.md) — conflict lifecycle and Chromium baseline.
- [Historical audit](docs/AUDIT-2026-10-24.md) — original record with explicit corrections.
- [AI-SESSION-LOG.md](AI-SESSION-LOG.md) — cumulative session history, including corrections.
