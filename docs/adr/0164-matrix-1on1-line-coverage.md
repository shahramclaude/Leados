# ADR-0164 — Matrix 1:1 Line Coverage & Holder Attribution (`RULE-OOL-01`)

- **Status:** Accepted and implemented across Sessions 227–239 (completed 2026-11-11, Session 239)
- **Schema:** v140 (additive migration `139 → 140` introduces `oneOnOneLineMarkers`, `settings.oneOnOneLineAskDueDays`, and `settings.oneOnOneLineAutoPropagate`; builds on Schema v132–v135 per-meeting holder fields `heldById`, `heldByBasis`, `heldByAt`, and `oneOnOneLineCadenceDays` / `oneOnOneLineMinSharePct`)
- **Decision:** In a multi-line reporting structure, a person's 1:1 cadence cannot be judged solely by the date of *any* held conversation — a weekly meeting with a home manager hides a silent project or product line, and vice versa. ADR-0164 completes the Matrix 1:1 Line Coverage terminal on top of the Session 227–232 holder/privacy slice: first-person holder logging, claim/release attribution, four governed coverage conventions, the protected read model (`buildProtectedOneOnOneLines`), `RULE-OOL-01` bounded cadence asks and unproven observations on the shared post-commit spine, `#/matrix?panel=one-on-ones` (with publication plan / differencing support), inline controls on `#/oneonones`, settings integration, and identity-free CSV scope `#130` (`one-on-one-lines`).
- **Altitude:** frontline / mid-manager PRIMARY × matrix (where 1:1 supervision happens and unattributed meetings are claimed/released), with rank ≥ 3 governance for scanning/conventions and aggregate counts above the individual detail floor.
- **Structure:** matrix. Single-chain workspaces remain strictly inert (zero silent-line asks, zero masks, legacy per-person 1:1 engine unchanged).
- **Surface:** `#/matrix?panel=one-on-ones` and `#/oneonones` (plus governance settings row in `#/settings`); included in `tests/app/access-audit.test.mjs` and verified in JSDOM with zero `axe-core` violations. CSV scope `#130` (`one-on-one-lines`), aggregate and identity-free.

## Context

Prior to this family of changes (Sessions 227–239):

1. `oneOnOnes` stored `{ personId, date, status }`, recording **with whom** a 1:1 occurred but never **who held it**. Any 1:1 on one reporting line turned every other reporting line green on person-level cadence cards (`masked` silence).
2. Sessions 227–228 (`ADR-0165`, Schema v132–v135) added per-meeting holder stamping (`heldById`, `heldByBasis`, `heldByAt`), fail-closed normalization, per-line 1:1 conversation body privacy (`meetingPrivacy.js`), and a read-only coverage summary on `#/oneonones` (Session 232).
3. What remained unfinished until Session 239:
   - `#/matrix?panel=one-on-ones` (the matrix-level panel alongside sibling matrix governance panels);
   - small-cell (`floor = 3`), complementary kind-table suppression, mixed-detail subtraction protection, and repeated-release differencing audit (`buildProtectedOneOnOneLines` + publication plan);
   - unlocking all four coverage conventions (`oneOnOneLineCadenceDays`, `oneOnOneLineMinSharePct`, `oneOnOneLineAskDueDays`, `oneOnOneLineAutoPropagate`);
   - `RULE-OOL-01` on the shared post-commit spine (`DEFAULT_POST_COMMIT_RULES` + 1:1 `PROPAGATION_CONTRACTS`) issuing bounded dated asks for proven silent on-roster lines with typed DAG provenance and recording unproven observations without blame tasks;
   - inline claim actions on `#/oneonones`, explicit `oneOnOneLineScan` for rank ≥ 3 / full access, and identity-free CSV `#130` (`one-on-one-lines`).

## Decision

1. **Additive Schema v140 (`oneOnOneLineMarkers`) and fail-closed normalization.**
   - `SCHEMA_VERSION` moves `139 → 140`; `MIGRATIONS[139]` creates empty `oneOnOneLineMarkers` and initializes `oneOnOneLineAskDueDays` (`7`, clamped `1..30`) and `oneOnOneLineAutoPropagate` (`true`).
   - `normalizeOneOnOneLineMarkers` runs before `normalizeLinks` in `schema.js` so `RULE-OOL-01` ask and observation markers validate deterministically without inventing holders or back-filling historical meetings.
   - `RECORD_POLICIES.oneOnOneLineMarkers` carries `classKey: 'unit'`, `detailCeiling: 0` so declared seats read only through protected adapters.

2. **Protected read model (`buildProtectedOneOnOneLines`) and CSV `#130`.**
   - `buildOneOnOneLines` partitions every held meeting into one attribution class (`home`, `line`, `other`, `dangling`, `unattributed`) and classifies every `(person, line)` pair strictly as `exempt`, `ok`, `new`, `unproven`, `due`, `overdue`, or `never`.
   - `buildProtectedOneOnOneLines` wraps that read model with:
     - **Aggregate small-cell floor (`MATRIX_FLOORS.people` = 3)** at rank ≥ 3 (board and kind breakdowns withheld when `peopleN < floor` or `structuralRefusedN < floor`);
     - **Complementary kind-row suppression** via `planAggregateSuppression` (blanking sub-floor `pairsN`/`owingN`/state counts or withholding kinds if totals would leak);
     - **Mixed-detail subtraction protection** at manager altitude (withholding board & kinds when hidden aggregate-only descendants sit below `floor` or residual kind counts leak sub-floor values);
     - **Publication register differencing check** (`auditAggregateRelease` on route `'oneonones'`), withholding conflicting repeated aggregate releases and rendering the shared `publicationPanel` on `#/matrix?panel=one-on-ones`.
   - `CSV_EXPORTS` scope `#130` (`one-on-one-lines`, `sensitive: false`) exports from `buildProtectedOneOnOneLines` so withheld boards and suppressed kind rows produce explicit withheld/blanked cells with zero person, manager, or meeting identifiers.

3. **`RULE-OOL-01` (`oneOnOneLineRules.js`) on the shared post-commit spine.**
   - Registered immediately before `seatRule` and `sealRule` in `DEFAULT_POST_COMMIT_RULES` and `PROPAGATION_CONTRACTS` (108 rules / 108 contracts).
   - Fast-exits in `O(1)` when `reportingLines` is empty (inert in single-chain workspaces) or when `settings.oneOnOneLineAutoPropagate === false` (while explicit `oneonone.line.scan` always executes).
   - Closes open `delegations` tracked by prior `ask` markers once the pair settles (`ok`, `due`, `new`, `exempt`), transitions to `unproven`, ends, or ceases to be multi-line.
   - For proven silent pairs (`overdue` or `never`) whose line manager is active on the roster, issues at most ONE bounded dated `delegation` per commit (capped at `ONE_ON_ONE_LINE_LIMITS.asksPerCommit = 8`, remaining deferred count tracked cleanly) with `concerns`, `issues-obligation`, and matrix-DAG `rolls-up-to` edges (`ensureEntityLink`).
   - For `unproven` pairs (blocked by an unattributed or undated meeting), structural defects, or silent pairs whose manager left the roster, records bounded `observation` markers only — never issuing blame tasks to an unattributed line or a nonexistent holder.
   - Never back-fills `heldById`, never marks a meeting held, never edits `reportingLines`, and never rates a person.

4. **Governance & UI surfaces (`#/matrix?panel=one-on-ones`, `#/oneonones`, `#/settings`).**
   - `ACCESS_RIGHTS`: `'govern-oneonone-lines'` (`minRank: 3, maxRank: 5`) governs both `oneOnOneLineSetConventions` and `oneOnOneLineScan` (`API_RIGHTS` + `SAFE_READS`). Note `canGovern` (changing conventions) stays gated for full-access/operator or authorized rank ≥ 3 as designed; `actor.canScan` allows rank ≥ 3 seats to run explicit scans (`!seat.readOnly && (seat.fullAccess || canAct('govern-oneonone-lines', seat).allow)`).
   - `#/matrix?panel=one-on-ones` (`matrixOneOnOnePanel.js`) displays the status/reconciliation strip, convention summary + editor, `Scan silent lines`, protected CSV `#130` export, kind table, per-person/line table (when allowed by seat detail ceiling), claimable unattributed meetings, publication register card, and closed method/framework notes.
   - `#/oneonones` integrates the protected coverage card with inline `Claim` buttons inside `!report.aggregateWithheld`, quick jump to `#/matrix?panel=one-on-ones`, and scan button when permitted.
   - `#/settings` exposes the `Matrix 1:1 additional-line governance` settings strip (`Cadence days`, `Min share %`, `Ask due days`, `Auto-propagate`).

## Reliability identities (verified and printed)

- `stateSum === pairsN` across the 7 closed pair states (`ok + due + overdue + never + unproven + new + exempt = pairsN`).
- `classSum === meetings.heldN` across the 5 closed attribution classes (`home + line + other + dangling + unattributed = heldN`).
- Both are displayed on `#/matrix?panel=one-on-ones` and `#/oneonones`, and mismatching totals fail closed with explicit warnings rather than quiet numbers.

## Limits & verification boundary

- **Today's reporting lines vs historical structure:** Coverage reads active `reportingLines` on the read date; a meeting logged before a recent line began may satisfy that pair until historical as-of matrix-line reconstruction lands (tracked separately in `ROADMAP.md`).
- **Local seat model:** Seats remain local workflow declarations (`ADR-0076`), not server authentication.
- **Verification boundary:** Verified across focused unit, rule, protection, CSV, store reload, JSDOM UI parity, and `axe-core` tests, plus `npm run lint`, `npm run check:boundary`, `npm run check:links`, and `npm run verify:standalone`. Real-browser layout and screen-reader walkthroughs remain **[UNVERIFIED]**.
