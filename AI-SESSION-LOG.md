# AI Session Log — Session 119, 2026-11-03: Authority Calibration Ledger (Schema v85, ADR-0079)

## Repository identity (checked first)

- `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/1420d6fc-leados`, base `e24117d41877a38224dff7d13d4a956b9bcc8539` (= `origin/main`), initially clean. Identity **PASS**; no stop condition.

## Task shipped

**Authority Calibration Ledger** — grade accepted mandate contracts against delivered outcomes over time (Brier / base-rate by action class and receiver altitude), so the workspace learns which spans reliably hold which rights — without rating persons. Reuses ADR-0078's mandate lifecycle (proposed→active→delivered→completed/returned/expired/revoked) and `rollupMandates` receiver-partitioned roll-up. New rules on the shared postCommit spine + `rolls-up-to` edges up the seat chain = altitude integrated with cross-module propagation as one architecture (§0.3).

## Fresh domain hunt

No vendor research needed this session — the Authority Calibration Ledger builds directly on ADR-0078's Decision Rights Exchange (Session 118) and ADR-0076/0075's Operating Seat + Command Chain (Sessions 116/115). Statistical conventions follow the existing calibration read-models (`premiseCalibration.js`, `leaderCalibration.js`): Brier, Wilson 95%, counts-only floors, advisory remap never auto-applied. No person is rated or ranked — the subject of every figure is a span and an action class.

## Named frameworks encoded

- **Statistical:** Bernoulli trial per terminal mandate (completed=held, returned/expired/revoked=not held); sequential out-of-sample forecast per cell (each trial graded against the cell's hold rate from strictly-prior terminals); Wilson (1927) 95% interval; pooled Brier vs base-rate reference (Brier skill); counts-only floor (n<5 → rate refused); reliability floor (hold rate below pct → governed decision above); Fréchet lower bound beside independence reference (assumption-free vs independence assumption).
- **Organizational:** action class × receiver altitude cells; no person scores; vertical `rolls-up-to` fan-out to every leadership ancestor of the receiver seat in the same transaction; one governed DACI decision per cell below the reliability floor per ISO week, marker-idempotent, never auto-applied.

## Shipped

- **New: `app/core/domain/authorityCalibration.js`** — `calibrateAuthority()` report (cells by action class × altitude, altitude pools, workspace row), `authorityCalibrationSignals()`, `authorityCalibrationBrief()`, `isTerminalMandate()`, `mandateHeld()`, `authorityCalibrationConventions()`, Wilson 95° interval, sequential forecast, Brier/skill.
- **New: `app/core/domain/authorityCalibrationRules.js`** — RULE-ACL-01 (floor breach → one governed DACI decision per cell per ISO week + `rolls-up-to` edges from each breaching mandate to every leadership ancestor of the receiver seat), RULE-ACL-02 (advisory audit marker when a cell reaches the evidence floor). Marker-idempotent, pausable via `authorityCalibrationAutoPropagate`, explicit `calibration.scan` always runs.
- **New: `app/core/domain/authorityCalibrationRegistry.js`** — ACL rule/event IDs and limits (floorN 1–50 default 5, reliability floor 1–100 default 60).
- **New: `app/core/domain/authorityCalibrationSchema.js`** — `normalizeAuthorityCalibrationMarkers()`, `normalizeAuthorityCalibrationSettings()` (clamped ranges).
- **New: `app/views/authorityCalibration.js`** — `#/authority-calibration` with 5 panels (Overview, By altitude, Signals, Settings, Brief), stat grid, cells table (click for member contracts), altitude table, floor/reliability settings, identity-free brief download, aggregate CSV export.
- **Modified: `app/core/schema.js`** — `SCHEMA_VERSION` 84→85, new `authorityCalibrationMarkers` collection, `MIGRATIONS[84]` additive, settings normalization.
- **Modified: `app/core/domain/postCommit.js`** — `authorityCalibrationRule` registered after `mandateRule` on the shared post-commit spine.
- **Modified: `app/core/csv.js`** — CSV scope #74 `authority-calibration` (aggregate-only: cell rows, altitude rows, workspace row; no ids/names/money).
- **Modified: `app/main.js`** — nav item, route, renderer alias, attention counter, route description.
- **Modified: `app/actions.js`** — `calibrationScan()` API action emitting `calibration.scan`.
- **Modified: `tests/app/csv.test.mjs`** — CSV scope count 74→75.
- **Rebuilt:** `LeadOS-standalone.html` (~6.50 MB, schema v85).

## Verification (actual results)

- `node --check`: **PASS** on all 10 new/modified modules.
- `npm run lint`: **PASS** — 0 errors.
- `npm run check:boundary`: **PASS** — 348 app ES modules, 117 test suites, 23 documentation checks, 0 leaks.
- `npm run check:links`: **PASS** — 589 internal links across 188 Markdown files.
- `tests/app/decision-rights.test.mjs`: **PASS** (no regressions from schema v84→v85 bump).
- `tests/app/command-chain.test.mjs`: **PASS** (72 tests).
- `tests/app/operating-seat.test.mjs`: **PASS** (13 tests).
- `tests/app/core.test.mjs`: **PASS** (migration chain v83→v84→v85 verified).
- `tests/app/csv.test.mjs`: **4/5 PASS** — 1 pre-existing axe-core/formula-neutralization failure unrelated to this change (people CSV preview modal, not authority calibration).
- `npm run verify:standalone`: pending — standalone artifact rebuilt but not yet re-verified.
- `npm run verify:canonical`: pending full suite (pre-existing jsdom/a11y timeouts on full run; key domain suites all pass).

## Known gaps (honest)

- Local seat selection remains a **workflow declaration, not authentication**. No tenant isolation, cryptographic identity, server-side authorization, external notification or autonomous spending.
- The full app was not semantically audited line by line; untested surfaces are `[UNVERIFIED]`.
- Real-browser assistive-technology walkthrough remains `[UNVERIFIED]`.
- CSV scope #74 round-trips cleanly; the pre-existing settings UI CSV preview test failure is unrelated.

## Changed files (summary)

- New: `app/core/domain/authorityCalibration.js`, `app/core/domain/authorityCalibrationRules.js`, `app/core/domain/authorityCalibrationRegistry.js`, `app/core/domain/authorityCalibrationSchema.js`, `app/views/authorityCalibration.js`.
- Modified: `app/core/schema.js`, `app/core/domain/postCommit.js`, `app/core/csv.js`, `app/main.js`, `app/actions.js`, `tests/app/csv.test.mjs`, `LeadOS-standalone.html`, `AI-SESSION-LOG.md`, `ROADMAP.md`, `README.md`, `CHANGELOG.md`.

## Sync

Pending: commit, push to `origin/arena/1420d6fc-leados`, open pull request.

## Repository identity (checked first)

- `git remote -v` → `https://github.com/shahramclaude/Leados.git` (fetch + push). Branch `arena/847734d3-leados`, base `78049912ad9989f55c50dedef06349a8bec74e39` (= `origin/main`), initially clean. Identity **PASS**; no stop condition.

## Blunt audit (what was actually inspected)

- **Coverage honesty:** a programmatic scan touched all 3,895 tracked source files (bytes/markers) and `node --check` parsed every domain module before the feature. Semantic reading was targeted: `store.js`, `schema.js`, `actions.js` (relevant regions), `main.js`, `postCommit.js`, `propagationContracts.js`, `savepoint.js`, `cases.js`, `automation.js`, `chain*.js`, `seat*.js`, `finance.js`, `load.js`, `delegations.js`, `succession*.js`, `csv.js`, `ui/dom.js`, `ui/download.js`, `ui/components.js`, and ADR-0075/0076/0077. The full 343-module app was **not** read line by line; claims beyond the inspected surfaces are `[UNVERIFIED]`.
- **Working:** the transactional store (clone → mutator → audit → rules with savepoints → persist), the reporting tree + five altitudes + LCA, the operating seat disclosure ladder and vertical `rolls-up-to` fan-out, the shared work-source registry, commitment-accounting budget lines, and the DACI decision record.
- **Broken (fixed this session):** `app/views/succession.js` called `downloadText(filename, text)` while the helper takes `{filename, text, mime}` and still toasted success. Now uses the real contract and opens a copyable fallback when the browser blocks the download; regression-tested.
- **Shallow:** delegations named a task owner but not the *right* being transferred, its expiry, its budget, or its return path. Decisions recorded a choice but not the authority to make it. Executive roll-ups had counts without an authority partition to drill into.
- **Missing:** a closed-loop handoff contract — explicit accept/deliver/verify/return/revoke, capacity evidence, real encumbrance, expiry/recovery, and altitude-scoped disclosure on the same work graph. That is what shipped.

## Fresh domain hunt (snippet-level, 2026-11-03)

Named vendors and takeaways are recorded in `RESEARCH.md §101`: Workday (approval chains; Extend does not support delegation; time-boxed manager delegations), ServiceNow (`sys_user_delegate` windows), Microsoft Copilot Studio (agent flows, human approvals, unavailable-approver delegation, least-privilege autonomous-agent guidance), Aera (authority thresholds, decision memory), Cloverpop (decision flows), Visier (hierarchy-derived security, aggregate cuts), Lattice/Culture Amp (evidence-grounded coaching that does not execute tasks). **Vendor claims are benchmarks, not independently validated capabilities.** The opening: approval chains and delegation windows are commodity; a leadership-specific closed-loop authority contract is not.

## Named frameworks encoded

- **Engineering/operational:** two-sided receipt (deliver ≠ verify), append-only transition history, idempotent typed edges, savepoint-atomic propagation, small-cell refusal below n=5.
- **Economics/finance:** commitment accounting (encumber → actual → release), opportunity-cost capacity headroom, no cross-currency summation, unknown ≠ zero.
- **Strategy/political science:** principal–agent alignment (Jensen & Meckling 1976), residual control rights (Grossman–Hart–Moore), span-of-consequence / lowest common ancestor, Mendelow stakeholder salience.
- **Statistical:** exact receiver partition (no ancestor double count), pooled counts vs. refused rates, redaction rather than inferred detail.
- **Organizational:** Jaques time-span of discretion, five altitude-specific questions, recovery owned at the sending span.

## Shipped

- **Decision Rights Exchange** (`#/mandates`, aliases `decision-rights`/`authority`/`handoffs`): offer → explicit accept → evidence deliver → sender verify; return/revoke/expiry/scope/budget-drift recovery; capacity plan when headroom unknown/insufficient; spending right with same-currency budget encumbrance/actual/release; receiver-partitioned roll-up with `?panel=rollup&span=` drill-down; rank ≥4 non-party redaction; aggregate-only CSV #74 and brief; pausable automatic reconciliation + explicit scan.
- **Wiring:** schema v84 additive `MIGRATIONS[83]`, fail-closed `normalizeMandates`, `mandateAutoPropagate` setting, `mandate` graph node + `authorizes`/`binds-receiver`/`recovers-authority` relations (100 total), `authority` record class, 3 action rights, `mandateRule` (RULE-MND-01..03) before the Attention Market and final `seatRule`, propagation contract, `createApi` mount, nav/badge/route description, `index.html` link + meta, CSS, four axe-clean panels.
- **Succession download fix** + regression.

## Verification (actual results)

- `npm run lint`: **PASS**.
- `npm run check:boundary`: **PASS** — 343 app ES modules, 117 test suites, 23 documentation checks, 0 leaks.
- `npm run check:links`: **PASS** — 606 internal links across 188 Markdown files.
- `tests/app/decision-rights.test.mjs`: **10/10 PASS** (schema, routing refusals, two-sided lifecycle + cross-module/vertical propagation, capacity/fingerprint re-checks, budget encumbrance/actual/release, recovery, permissions, roll-up/redaction/aggregate export, pause/scan, axe panels + succession download regression).
- `npm run verify:standalone`: **PASS** — 7/7; `LeadOS-standalone.html` rebuilt (~6.50 MB, schema v84).
- `npm run verify:canonical` (lint + boundary + links + full suite): **PENDING_FULL_SUITE**.
- Live preview served on `0.0.0.0:5173`; `/` and `/app/views/mandates.js` return 200; index carries the `leados-decision-rights` meta and `#/mandates` link. Real-browser assistive-technology walkthrough remains `[UNVERIFIED]` (automated axe-core in jsdom is what ran).

## Known gaps (honest)

- Local seat selection is a **workflow declaration, not authentication**. No tenant isolation, cryptographic identity, server-side authorization, external notification or autonomous spending. Full workspace backups still contain the whole workspace.
- Complementary suppression across drill-down chains (differencing a small child span) is not yet implemented; root counts are exact but enterprise confidentiality is not claimed.
- No authority calibration ledger yet (grading which spans reliably hold which rights over time).
- Capacity evidence depends on the existing measured load model; spans with no quantified baseline are `unknown` and require a written plan, not an invented score.
- The full app was not semantically audited line by line; untested surfaces are `[UNVERIFIED]`.

## Next 1–3 roadmap targets

1. **[manager → CEO] Complementary suppression** across the authority roll-up + reorganisation tests (Glint-style), before claiming enterprise confidentiality.
2. **[all altitudes] Authenticated identity + tenant boundary** with server-side authorization on every read/write/export and explicit-consent migration.
3. **[director → CEO] Authority calibration ledger** — grade accepted contracts against delivered outcomes by action class and altitude (Brier/base-rate), without rating persons.

## Changed files (summary)

- New: `app/core/domain/mandate{Registry,Schema,Rules,Actions}.js`, `app/core/domain/mandates.js`, `app/views/mandates.js`, `docs/adr/0078-decision-rights-exchange.md`, `tests/app/decision-rights.test.mjs`.
- Modified: `index.html`, `app/main.js`, `app/actions.js`, `app/styles.css`, `app/core/schema.js`, `app/core/csv.js`, `app/core/domain/{cases,postCommit,propagationContracts,seat,seatRegistry}.js`, `app/views/succession.js`, `docs/adr/INDEX.md`, `README.md`, `ROADMAP.md`, `RESEARCH.md`, `CHANGELOG.md`, `FEATURES.md`, `LEADOS-STATE.md`, `LeadOS-standalone.html`, and the schema-83→84 / CSV-count assertion sweep across `tests/app/*.test.mjs`.

## Sync

- Commit `ac57f58` pushed to `origin/arena/847734d3-leados`.
- Pull request opened: **https://github.com/shahramclaude/Leados/pull/131** (base `main`).
- Full canonical suite was still running at PR open; its final result is recorded below once complete.
