# LeadOS current-state audit — 2026-10-25, session 17

## Scope and honesty boundary

Checkout: `shahramclaude/Leados`, branch `arena/47873b08-leados`, starting commit
`de620bee2a0bc9670f046a03d85fb1ac0d408a49`. The standing brief names a different owner URL;
this session changes and pushes only the supplied checkout's branch. No repository or
entry point was replaced.

A fresh programmatic inventory read every tracked text file: **3,688 tracked/text files**,
**3,527 source files**, **333,249 source lines** (working contents when measured; extensions
JS/JSX/TS/TSX/MJS/CJS/CSS/HTML/Python/shell/SQL). `src/` contains 3,099 of those source files.
This is a mechanical inventory/import/export scan, **not personal line-by-line verification**
of every legacy source file. That part of the standing full-read requirement remains
**[UNVERIFIED]**; no claim of a complete manual repository audit is made.

Source personally inspected for the chosen flow: canonical HTML/bootstrap/routing,
package/serve/config files, schema/settings/onboarding normalization, store update/write
and capped event paths, onboarding creation/update/review/completion actions, all onboarding
domain functions, Today and onboarding views, shared components, dialog/form helpers,
phase dialog, relevant CSS, existing and new onboarding/decision-growth-prep tests and both
browser scripts. Additional directly checked legacy files: `src/app/page.tsx`,
`src/db/index.ts`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` and the historical
architecture document. README, roadmap, research and session-log context were reviewed.
Other legacy workflows/builds remain **[UNVERIFIED]**, not inferred from file names.

The canonical graph had 54 JS modules at entry and now has 55, with no missing relative
imports. Its runtime imports stay entirely inside `app/`. Development/browser test tools
are not product imports and are installed under ignored `tmp/`.

## Current-state assessment before edits

### Works, supported by source and fresh tests

- `index.html` loads native modules from `app/main.js`; `scripts/serve.mjs` serves only the
  canonical shell/assets, binds to `0.0.0.0`, accepts preview Host/Origin and rejects writes,
  private files, symlinks and traversal. Actual-HTTP tests verify those boundaries.
- Schema v12 normalized/migrated browser records; single localStorage blob, copied mutation
  draft and visible persistence errors; unsupported schemas protected rather than overwritten.
  Optional AES-GCM passphrase storage and encrypted backups are already implemented/tested.
- Domain calculations accept an injected clock; data access, mutations, queries and views
  are separated without a build framework. The append-oriented event ledger has a **600-event
  cap**: it is useful recent history, not an immutable/compliance-grade infinite audit trail.
- Existing 1:1s, follow-through/owners, SBI feedback, goals, delegation, GROW, readiness,
  30-60-90 onboarding/transitions/re-boarding, decision reviews, performance packets, pulse,
  conflict workflow, safe exports and prep flows pass the **293-test baseline**.
- Phase check-ins already have explicit held dates, summaries/support notes, date validation
  and audit events; holding a check-in does not complete checkpoints. The plan-completion
  action separately requires Day 90. A schema migration is unnecessary for a queue.

### Broken or misleading items found

- No direct phase-conversation execution from Today; `ONB-04` sends a manager to a different
  workspace where they must find the person/plan. This was the roadmap's first priority.
- A full onboarding plan's non-shrinking action toolbar forces **864px** document width at
  a 390px viewport. Fixed with scoped wrapping/max-width rules.
- Two Settings backup/export labels force **406px** document width at 390px. Fixed with
  bounded, wrapping `.data-actions > .btn` labels.
- The older optional browser smoke script uses two stale checkbox labels (`Explicit agreement`,
  `Confirmation`) rather than the actual associated checkbox text. The script timed out;
  selectors were corrected without changing conflict product semantics, then the full smoke passed.
- Historical `ARCHITECTURE.md` claims import-boundary lint enforcement that the actual Next-only
  ESLint configuration does not install. Added an explicit non-canonical/stale-claim notice.

### Shallow or missing, deliberately not called complete

- Manager-entered local records are not employee-submitted attestations or multi-rater 360 data.
- Queues update on render; there is no scheduler, background notification, email or calendar sync.
- Phase `blockers` are free text, not owned/dated support commitments. Explicit 1:1 handoff is
  added to the roadmap; no silent copying into performance evidence.
- Delegated work still lacks a dedicated executable Today queue; review-focus → GROW/Goal
  handoff still requires manual re-entry. These are the next two priorities.
- Legacy React/Next/PostgreSQL workflows are not deployed or cleared by canonical tests.
  Fresh `npm audit --omit=dev` reports **1 critical / 2 high** findings (3 total); no dependency
  upgrade is silently introduced. Legacy deployment remains blocked on its own remediation.

## Research and incremental decision

Read fresh public Sourcegraph manager/onboarding-review documentation (including a documented
Lattice workflow) and Frappe HR onboarding controller/doctype source through GitHub's API.
Pinned links and exact adaptation/rejection decisions are in `RESEARCH.md` §27.
Bauer/socialization, Watkins/transitions and psychological-safety guardrails from the living
inventory point to prompting actual two-way conversations, not grading ramp performance or
marking all tasks done. Sourcegraph is a documented customer workflow benchmark, not a fresh
vendor-feature certification; Frappe is a source-level benchmark, not an executed installation.

Choose the first roadmap item: expose existing phase conversations as due work, reuse validated
capture and history, and follow exact source records. No rewrite, schema bump, database,
account, runtime dependency, network request or additional personal-data field is justified.

## Implementation

- `dueOnboardingReviews(state, now)` derives one row per **unheld** Day 30/60/90 conversation
  from the existing plan diagnostics; active plans/people only, started plans only, oldest due
  first with deterministic ties. Includes today and the next **seven UTC calendar days**.
  Seven days is a fixed UI convention, not a research-proven cutoff. No conflicts, raw pulse
  answers or performance reviews are read by the query.
- Shared `app/ui/onboarding-checkins.js` executes the same queue on Today (four-row preview,
  explicit total/overflow link) and `#/onboarding?status=checkins` (complete queue). Counts are
  conversations, not people. All three plan kinds remain identifiable.
- Existing modal/action persists only the chosen phase. Cancel does nothing; future and
  before-start dates and empty summaries are refused. Other missed phases, checkpoints and
  plan status remain unchanged. Person/plan context and re-boarding privacy guidance appear
  in the dialog, without collecting leave/medical reasons.
- `?plan=<id>` scopes to the exact source plan, including historical completed plans.
  Person/plan filters survive tab changes; missing/archived-person links show explicit recovery
  instead of quietly substituting a different plan.

## Verification performed

- **Baseline:** `npm test` — 293 pass / 0 fail / 0 skipped before source edits.
- **Final:** `npm test` — **305 pass / 0 fail / 0 skipped** across 23 test files.
  Twelve new regressions cover UTC boundaries/offsets, all kinds/anchors, exclusions, missing
  phases, sorting/purity/private-data exclusion, action validation/audit/reload, in-place UI,
  cancel, overflow/all-due views, scoped/completed/stale links, XSS/encoding and failed-write
  visibility with the previous saved blob preserved.
- `node --check` on all 55 canonical JS modules, canonical tests and smoke/serve scripts;
  scoped ESLint with `--max-warnings=0`; `git diff --check`.
- **Real Chromium 153.0.8010.0**, Playwright Core 1.64.1, axe-core 4.11.0, isolated profiles:
  - `node scripts/app-onboarding-smoke.mjs` passes Today → all-due → reject invalid date →
    record re-boarding phase → reload → exact plan → stale-link recovery. Tests 1440×1000 and
    390×844; keyboard Tab trap/Escape cancellation and five zero-violation WCAG A/AA scans,
    including color contrast. No document overflow at checked states, browser errors or external
    application requests. Desktop/mobile screenshots inspected for queue layout.
  - `node scripts/app-browser-smoke.mjs` passes conflict lifecycle, export/import, reopen/support
    handoff, focus trap, fifteen mobile routes, and six zero-violation WCAG A/AA scans. No
    browser errors, external application requests or checked-state overflow.
  - Reports/screenshots stay in ignored `tmp/onboarding-evidence/` and `tmp/browser-evidence/`;
    scratch browser binaries/tools are not committed. Test setup loads local axe tooling only.
- Demo at `2026-10-25T10:00:00Z`: health **55.1 (C)**; trend **+8.3** vs **46.8**, approximate;
  **37 findings / 25 rules / 12 urgent / 4 wins**, unchanged. New queue: Samuel's Day 30
  conversation due `2026-10-17`, **8d overdue**. No demo state was rewritten.

## Remaining [UNVERIFIED]

Full manual review of every legacy source line; legacy build/runtime/security remediation;
Safari/Firefox; actual screen-reader traversal and physical mobile devices; print/PDF visual
output; large-workspace responsiveness; real-browser multi-browser vault behaviour; and any
measured improvement in real-manager/employee outcomes. Passing axe at selected states is not
WCAG certification or a guarantee that every colour/state/workflow is accessible.
