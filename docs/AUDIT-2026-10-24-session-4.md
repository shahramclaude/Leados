# Current-state audit — 2026-10-24, session 4

## Scope and method (before implementation)

- Checkout: `shahramclaude/Leados`, branch `arena/cc9b357a-leados`, initially clean.
  This is the actual configured remote, not the different owner URL in the standing brief.
- Every tracked source file was read by an inventory/scanner (path, bytes, lines, hash,
  imports and stub markers): **3,650 tracked files; 3,495 source files; 316,352 lines**.
  Generated inventory is ignored scratch, not a new 3,495-row repository artifact.
- Human-level review focused on the active entry/import graph, store/schema/actions,
  domain rules, view/form composition and regression tests. **This is not a claim of
  line-by-line personal review of all 316,352 lines.** The archived source's detailed
  correctness, security, builds and workflows remain **[UNVERIFIED]** this session.
- `npm ci --no-audit --no-fund`: 435 packages, successful, no manifest/lock changes.
  A first test attempt lacked jsdom in the fresh environment; after the declared install,
  baseline `npm test`: **113 pass, 0 fail**. No source change was needed to pass.

## What works (source review plus baseline tests)

`index.html` imports `app/main.js`: hash routing, an explicit action API, pure domain
modules, DOM construction with text children, injected-clock tests, and a localStorage
store under `leados.lifecycle.v1`. Schema v3 migrates v1/v2; normalisation warns on repairs;
JSON parsing failures are quarantined best-effort. Writes clone before mutation and
localStorage replacement, and a failure keeps the unsaved in-memory state with an error.
Audit history is append-oriented, capped at 600—not a tamper-proof unlimited event store.

Existing tested workflows include roster/archive, held/moved/skipped 1:1s and generated
agendas, SBI feedback and latency, tri-state goal authorship and check-ins, delegated
outcomes and authority, GROW development, evidence-gated readiness, pulse, DACI decisions,
recognition, evidence-linked review packets/calibration/frozen completion, and data export,
import and demo cleanup. Runtime has no external imports or application network requests.

## Verified defects and shallow areas

1. `views/delegations.js` and `views/goals.js` pass tab `id`s while `ui/components.js`
   reads `key`. Clicks navigate with `undefined`, so filters fail despite passing tests.
2. `store.hasRealData()` lists collections manually and omits `delegations`. User-created
   delegations attached to demo people can be replaced without the intended refusal.
3. `domain/pulse.js::trend()` does not apply aggregate unanimous-answer suppression.
   Aggregates count all responses before releasing each dimension, including sparse imported
   records; the documented per-slice privacy floor is therefore incomplete. Comments count
   score responses rather than nonempty comments. Existing tests do not cover these cases.
4. Settings scope copy claims Tuckman and nine-box practice even though research deliberately
   rejects them; correct the live copy rather than repeating it as a feature.
5. No structured conflict lifecycle exists. Notes/pulse are not an agreement, action-owner
   ledger, verified follow-up or formal-support handoff.

## Corrections to old documentation, not assumptions

`src/db/` **exists** (18 source files, plus its schema-version JSON). `src/db/index.ts`
constructs a pg pool/Drizzle client and requires `DATABASE_URL`; `src/app/page.tsx` is still
an Arena PostgreSQL starter query/page. The prior audit/ADR statements that the DB tree
is absent are not true of this checkout. There are 262 Next pages and 903 files importing
`@/db` or its subpaths; those counts do not establish correctness. No current TypeScript
error count or Next build claim is made. Legacy code is preserved, not rewritten.

## Gap analysis and selected increment

The existing roadmap names conflict resolution first. Build it incrementally in the same
ES-module/local-store architecture, with pure lifecycle/readiness rules, validated writes,
a migrated collection, real dialogs/list/detail views, generic reminders, export/import,
and explicit privacy limits. An agreement must not automatically count as resolved, and
serious or uncertain issues must not be channelled into forced informal reconciliation.
Repair the small verified safety defects above alongside it. Broader analytics, CSV,
encryption, accounts and integrations remain distinct work, not implied capabilities.

## Additional integrity findings during the increment

- Future/invalid declared schema versions could pass through normalization and lose unknown
  collections on the next save. Imports now reject them; incompatible local data is
  write-protected and exported exactly as originally stored. API/direct/demo/cleanup writes
  cannot replace it. Only explicit compatible import/reset can, after a successful save.
- The static server's old denylist did not cover `.env` or scratch JSON exports. It now serves
  only the canonical shell/assets, refuses symlink aliases/traversal and accepts GET/HEAD only.
  Historical console/docs files are intentionally no longer served by this entry point.
- Settings' copy-export fallback had a Close button that only toasted; it now closes.
  Unsaved changes no longer carry an unconditional “Last saved” label there.
- Pulse settings/normalization allowed a floor below the release policy's minimum. UI/API/load
  now agree on 3–25 (default 5); invalid settings fail without writes, and repaired imports warn.
- Real-browser axe testing exposed low-contrast sidebar section headings. Contrast was fixed,
  not exempted from the check. Header eyebrow/title grouping, disabled-action affordance and
  dynamic-row/post-save focus were also corrected incrementally.

## Implemented outcome

Schema v4 adds a real manager's conflict working record: neutral situation, external or
roster-independent participants, perspectives/interests, unknown/willing/declined participation,
explicit route/process/sharing limits, agreement versions, owned dated commitments and results,
checks and closure/support-handoff/reopening history. Serious/uncertain/declined participation
cannot be forced into informal agreement. Handoff explicitly sends nothing and is not resolution.

Resolution needs the current situation/process/participants, delivered results, and an explicit
all-party check that covered those results. Same-day check-before-result, stale context and
pre-reopening confirmation cannot close the record. Material situation changes are captured in
new versions rather than silently reusing an old agreement. Import rechecks closure and dates,
reports malformed/duplicate/oversize repairs, and conservatively recovers damaged reopen floors.
Oversize writes are refused before state/events change.

Conflict content is excluded from health, readiness, generated agendas, person timelines and
review evidence. General events/Today/Signals use counts/status only. Private content remains
in the record and full explicit JSON backups; there is no encryption or access-control promise.

## Verification after implementation

| Check | Actual result |
|---|---|
| Final `npm test` | **161 pass / 0 fail / 0 skipped**, 21.92s; baseline was 113 |
| Added regression suites | 29 conflict + 10 pulse-safety + 5 storage-safety + 4 HTTP-server tests |
| Canonical syntax | All **43 JS modules**, static server and browser smoke pass `node --check` |
| Whitespace | `git diff --check` clean |
| Live HTTP/module graph | Shell + CSS + all 43 relative JS modules; preview-style Host/Origin accepted |
| Static-server negative checks | Existing scratch backup and symlink alias blocked; credentials, Git, tests, tools, legacy source and write methods denied; actual live preview checked too |
| Chromium 153.0.8010.0 | Create → agreement → result → check → resolve → reload → reopen → support handoff → download/upload JSON roundtrip; filters, navigation and private-content exclusions pass |
| Mobile | All **15 main routes**, no horizontal overflow at **390×844**; conflict desktop/mobile screenshots inspected |
| Axe 4.11 WCAG A/AA | **0 violations in six selected desktop/mobile states** after contrast fix; not a complete accessibility certification |
| Browser errors / external application requests | **0 / 0** observed in the smoke run |
| Fresh `npm audit --omit=dev` | **1 critical, 2 high** legacy Next/PostCSS/Sharp dependency findings; not upgraded, not imported by the canonical graph |

Browser tooling (`playwright-core@1.64.1`, `@sparticuz/chromium@153.0.0`, `axe-core@4.11.0`)
is optional test-only scratch under ignored `tmp/browser`; no package manifest/lock or runtime
dependency changes. `scripts/app-browser-smoke.mjs` records reproducible instructions. Screenshots,
reports and synthetic download evidence stay in ignored `tmp/browser-evidence`, not Git.

Deterministic optional demo at `2026-10-24T10:00:00Z`: health **54.5/D**, historical **52.8**
(delta **+1.7**), **32 findings / 10 urgent / 2 wins**, pulse **2.55/5** from **5 complete
responses**, **0 released comments**, **0 fabricated conflict cases**. Existing health/finding
values are unchanged; hiding thin comments and sparse/unanimous windows is intentional.

## Remaining verification boundaries

- Detailed personal review/runtime/security of the entire legacy tree, fresh Next/TypeScript
  builds, Safari/Firefox, real screen readers, print visual output and large-workspace
  performance are **[UNVERIFIED]**. The source inventory is not a substitute for that work.
- No real-manager/employee longitudinal trial, independent attestation, legal assurance,
  mediation competence or validated fairness/psychometric outcome is claimed.
- Local storage/backups remain unencrypted, raw exports are sensitive, the event log is capped
  and not tamper-proof, corrupt-blob quarantine is best effort. No background reminders or
  automatic contact of support people exists.

Initial inventory counts above describe the starting checkout, not the final tree. Next work:
honest all-dimension trends, unknown-preserving safe CSV, and optional encryption/migration.
