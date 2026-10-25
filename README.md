# LeadOS — a leadership workspace that keeps its own receipts

LeadOS helps a first-time manager turn real conversations, feedback, goals and commitments
into evidence-linked next steps. Its team-health indicator is an explainable heuristic over
those records, not an objective leadership grade or a substitute for listening to people.

The **canonical application is `index.html` + `app/**`**. It runs in your browser with no
account, application backend, database or runtime package dependency. The static server
only serves files; app records stay in this browser's `localStorage` unless you explicitly
export them. **Optional passphrase encryption** can seal that stored copy (Settings → Protect
this browser copy). Exports are separate files and stay unencrypted unless you choose
*Create encrypted backup*; a lost passphrase cannot be recovered by anyone.

```sh
node scripts/serve.mjs --host 0.0.0.0 --port 5173
# or: npm run app
# Open http://localhost:5173
```

Node 18+ can serve the application; there is no build or dependency install required to run
it. For the test tooling, use Node 22+ (verified with Node 22.22.3):

```sh
npm ci --no-audit --no-fund
npm test                     # 242 domain, persistence, follow-through, ownership, onboarding, CSV, trend, encryption and jsdom/axe tests
```

## Honest state of this repository

This checkout also contains older React/Next.js applications, consoles, database code and
large historical documents. Their presence is not evidence that those products run. They
are preserved, **not rebuilt or deleted**, and are not imported by the canonical app.

| Path | Current status |
|---|---|
| `index.html`, `app/**` | **Canonical product:** 54 native JavaScript modules, CSS and shell; tested below. |
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
[current audit](docs/AUDIT-2026-10-24-session-6.md) and the corrected
[architecture decision](docs/adr/0006-canonical-zero-build-app.md).

## What it actually does

### Conversations and feedback

- Log a 1:1 as held, moved or skipped; compute cadence, cancellation streaks and adherence
  from real dates. Generate editable agenda suggestions with a reason for each item.
- Build a **printable, shareable one-meeting prep sheet** (`#/prep/<personId>`): the topics the
  person has asked to raise, the generated agenda with reasons, every open commitment grouped
  by source (past-1:1 actions, 30-60-90 onboarding checkpoints, feedback follow-ups, development
  actions, delegation checkpoints), what happened since you last spoke, outcomes at risk, and a
  notes area. Confidential conflict records and anonymous pulse answers are excluded by
  construction and named on the sheet.
- Run structured **30-60-90 onboarding scaffolding** (`#/onboarding`) for new joiners: written role
  clarity, peer buddy assignment, stakeholder introduction tracking (`met`/`metOn`), a scoped
  early win, editable checkpoints across Day 30 / Day 60 / Day 90 horizons, and dated two-way
  phase check-in conversations. Missing scaffolding is flagged on the manager (`ONB-02`…`ONB-05`),
  never as a personality or performance grade on the joiner, and onboarding check-ins are kept out
  of performance review packets so new hires can raise confusion safely.
- **Record who owes each promise, and see your own debts** (`Schema v8`): every 1:1 action
  carries an owner — *they* do it, *you* do it, or *both* of you — or is explicitly left
  unrecorded, which the board counts rather than guessing. Promises you own appear in a private
  **"What you owe"** card on Today, in an "I owe" stat and an inline owner column on the 1:1
  board, and in `CONV-07` once one is overdue. A promise that is carried forward keeps its owner;
  reassigning one is a separate, logged action, and closed promises cannot be rewritten.
- **Reconcile last time's promises when you log the next 1:1** (`Schema v7`): every open
  commitment appears with how long it has been alive and how often it has moved, and the leader
  records an explicit outcome — done in this conversation, still open, carried forward with a new
  date, or dropped with a reason. Nothing is carried automatically, the original keeps a link to
  its successor, and a broken or cyclic chain is repaired by reopening the promise rather than
  losing it. Carried promises show on the 1:1 board, the person page, the prep sheet, the CSV
  export and signal `CONV-06` once the same promise has survived two conversations.
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
- **46 deterministic signal rules**, including `ONB-01`…`ONB-05` and `CFL-01`…`CFL-04`, produce
  evidence, urgency and one next action. Similar person findings roll up rather than flooding the
  page. Conflict reminders never include case titles, names or notes and work without a roster.
- Optional demo data is clearly labelled. The demo refuses to replace real records without
  confirmation, including workspaces containing only delegations or conflict records.

### Optional passphrase encryption of the browser copy

- Turn it on in **Settings → Protect this browser copy**. The stored blob becomes a versioned
  envelope: PBKDF2-HMAC-SHA-256 (600,000 rounds, random 16-byte salt) derives an AES-256-GCM
  key from your passphrase; every write gets a fresh 96-bit IV. The passphrase is never stored,
  and the key never leaves the tab.
- **Plaintext → encrypted is verified before it overwrites anything:** derive, encrypt,
  decrypt, compare, then write. If any step fails the workspace stays plain text and says so.
- A reload shows a **lock screen** and nothing else: no navigation, no records, no half-loaded
  state. A failed attempt reports the failure and leaves the stored ciphertext byte-identical.
- While locked, **every write path is refused** — including imports, demo loading, reset and CSV
  export — so nothing can replace the only copy of the ciphertext. `Export JSON` in that state
  hands back the untouched encrypted file rather than an empty workspace.
- **Change passphrase** re-keys with a new salt (the old passphrase stops working), **Lock now**
  discards the key after flushing pending writes, and **Turn off encryption** writes plain text
  again only after the write succeeds.
- **Idle auto-lock:** an unlocked, encrypted workspace locks itself after a configurable window of
  inactivity (default 30 minutes, 0 = off, set in Settings). It warns first with a non-destructive
  "keep working or lock now?" prompt and locks automatically after one minute, so an unattended
  unlocked tab cannot leave your notes readable. The lock is recorded in the event log.
- **Encrypted backups:** `Export encrypted JSON` produces a portable envelope for the same
  passphrase (or a new one if the workspace is not encrypted). `Import JSON` accepts both
  plain-text and encrypted files; an encrypted import into a plain workspace is explicitly
  disclosed as a downgrade, and restoring an encrypted backup into a lock screen keeps the
  workspace encrypted.
- **Limits stated in the UI, not only here:** no recovery key, no reset link, no account; a lost
  passphrase means the encrypted copy cannot be opened. Encryption protects a copied profile or
  backup file, not a browser someone can already use while the workspace is unlocked. CSV and
  plain-text JSON exports remain unencrypted. Web Crypto requires a secure context — over plain
  HTTP on a LAN address the lock screen says so before you type a passphrase.
- Envelope headers (KDF name, rounds, salt, purpose) are bound into the GCM additional
  authenticated data, so tampering with them fails authentication instead of silently weakening
  the file; a foreign envelope asking for more than 2,000,000 rounds is refused rather than
  burning the CPU.

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
- Export **14 purpose-limited CSV tables** from Settings (`people`, `onboarding`, `oneOnOnes`,
  `actions`, `feedback`, `goals`, `delegations`, `growthPlans`, `recognition`, `decisions`,
  `reviews`, `pulseSummary`, `healthTrends`, plus confirmation-gated confidential `conflicts`)
  with a copyable preview modal when downloads are restricted.
- Text cells starting with `=`, `+`, `-`, `@`, control whitespace or full-width formula
  prefixes (`＝`, `＋`, `－`, `＠`) are prefixed with `'` (OWASP CWE-1236) while negative
  numbers stay numeric and unknown values stay blank (`""`). `pulseSummary` exports only
  anonymity-checked weekly aggregates and independently thresholded comments.

## Data integrity and architecture

- **Schema v8**, with additive v1→v2→v3→v4→v5→v6→v7→v8 migrations; pre-v5 records retain `null` for
  unknown historical completion dates and check-in snapshots rather than fabricating history,
  v5→v6 adds `state.onboarding` without fabricating plans, v6→v7 adds the follow-through
  fields (`completedInMeetingId`, `carriedFrom`/`carriedTo*`, `dropped*`) with every existing
  action left open rather than silently completed or carried, and v7→v8 adds `owner` as `null`
  for every existing action because v7 never asked. An unrecognised owner value is cleared and
  reported, never coerced into a plausible one; GROW "will" actions carry no owner field at all.
- Follow-through links are repaired on load and import, in plain language: a successor that is
  missing, belongs to another person, sits earlier in time or forms a cycle clears the carry and
  reopens the promise; a successor that names a predecessor with no forward link has the link
  rebuilt; duplicate action ids inside one meeting are dropped with a warning.
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
app/core/crypto.js         PBKDF2-SHA-256 + AES-256-GCM envelope (no I/O, injectable crypto)
app/ui/                    shared DOM/forms/dialogs/charts
app/views/                 route renderers, not persistence implementations
tests/app/                 node:test domain/store/jsdom tests
```

No runtime framework, package dependency, account, network service or model inference was
added. Research and product tradeoffs are in `RESEARCH.md` §§14–21.
The five health dimensions use weights 24/20/20/16/20 for cadence/feedback/clarity/growth/
wellbeing. Missing dimensions stay null and weights renormalise; grades are A/B/C/D/F.
Historical comparison uses Schema v5 dated snapshots where recorded and explicitly labels
checkpoints `approximate` when pre-v5 or in-place edited fields lack history.

## Verification — 2026-10-25, session 11

- `npm test`: **242 passed, 0 failed/skipped** across 17 suites (`tests/app/*.test.mjs`),
  including `tests/app/ownership.test.mjs` (11 tests: v7→v8 migration with a null owner and a
  reported repair, owner capture and rejection, carry inheritance, reassignment rules, the
  leader-obligation roll-up, `CONV-07` firing and clearing, CSV truthfulness, prep-sheet and
  snapshot behaviour, the inline board select with `axe-core`, and the Today card plus the 1:1
  dialog capture flow).
- All 54 canonical JS modules pass `node --check`; `npx eslint app scripts/serve.mjs scripts/app-browser-smoke.mjs tests/app` passes with 0 errors and 0 warnings.
- Live HTTP check against `scripts/serve.mjs` (`0.0.0.0:5173` with preview `Host`/`Origin`
  headers) verifies `index.html`, `app/main.js`, `app/views/oneonones.js`,
  `app/core/domain/oneonone.js` and `app/styles.css` serve `200 OK` with expected MIME types, and
  that `package.json`, `README.md`, `.git/config` and a backup file remain `404`.
- `axe-core` 4.11 via JSDOM reports **0 violations** on `#/today` (with the "What you owe" card),
  `#/oneonones` (inline owner selects), `#/prep/<id>`, `#/insights`, `#/people/<id>`, the 1:1 dialog
  with the reconciliation panel open, and the lock screen.
- Real-Chromium binary execution (`scripts/app-browser-smoke.mjs`), raster `color-contrast`
  pixel sampling, physical mobile overflow and browser print/PDF output were not executed in
  this container (no browser binary installed) and remain **[UNVERIFIED]** for this session.
  Encryption flows are exercised through the real modules and JSDOM with Node's `webcrypto`;
  genuine multi-browser unlock behaviour remains **[UNVERIFIED]**.

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
  authentication or background notifications. Never store notes you are not authorised to hold;
  export contains sensitive data. Clearing site data deletes the workspace.
- Pulse suppression is intentionally more conservative: some previously visible sparse,
  unanimous or thin-comment windows now remain hidden. A floor is not an anonymity guarantee.
- Cadence and seven-day latency/check-in conventions are configurable, not validated universal
  deadlines. No real-manager longitudinal validation or proof of improved outcomes is claimed.
- Encryption is optional and passphrase-only: no recovery key, no key escrow, and no protection while the workspace is unlocked and in active use. An unlocked, encrypted workspace now auto-locks after a configurable inactivity window (default 30 minutes, 0 = off, set in Settings), warning first so nothing in progress is discarded. CSV and plain-text JSON exports are always unencrypted, and full JSON backups still contain conflict
  notes. Enabling encryption replaces the browser's single stored blob, so a passphrase lost
  before the next unlock is unrecoverable by design.
- Follow-through is self-reported. A promise is only recorded as kept, carried or dropped when
  the leader logs the next 1:1; the app cannot observe delivery, and it deliberately sends no
  reminder (no backend, no notifications). A workspace with few logged 1:1s therefore shows few
  reconciliations — the gap is the missing conversation, not a hidden tracking failure.
- Ownership is whatever the leader recorded. "Not recorded" is a real state that the board counts
  and the export leaves blank; the app never infers an owner from who tends to do that kind of
  work, and "What you owe" is private to the browser (no employee view exists, so nobody else can
  see it or hold the leader to it).
- The 1:1 prep sheet is assembled from records, not a meeting transcript: it surfaces what was
  promised and still open, and cannot recover a conversation that was never logged. "Topics they
  want to raise" is recorded by the manager because the app has no employee login — the manager
  is the scribe, not an employee-submitted form. Print/PDF visual output remains **[UNVERIFIED]**
  in a real browser.
- Legacy build/runtime, real-Chromium smoke execution, Safari/Firefox, real assistive-technology
  use, print visual output and large-workspace performance remain **[UNVERIFIED]**.
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
