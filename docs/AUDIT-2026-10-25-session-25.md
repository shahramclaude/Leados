# Session 25 audit — delegation-to-portfolio closed loop

**Date:** 2026-10-25 · **Branch:** `arena/57c80a5a-leados` · **Base:** `ef133adecae12fdc7c53c51066c7aceb3512ff32`

## 0. Repository identity and initial state

Before any repository inspection, `git remote get-url origin` returned
`https://github.com/shahramclaude/Leados.git`, matching the designated repository. The active
branch was `arena/57c80a5a-leados`; the worktree was clean at start.

## 1. Audit scope and honest state assessment

Inventory found **3,711 tracked files**, **65 canonical `app/**` files** and **26 canonical app
test files**. The canonical product remains `index.html` → `app/main.js` with pure domain rules
under `app/core/domain/**`, validated writes through `app/actions.js`, versioned/local persistence
in `app/core/{schema,store}.js`, and a static server. The canonical product already works in its
Node/JSDOM test harness. The non-canonical React/Next/Drizzle, root TSX, and `public/index.html`
trees were not executed or reviewed line-by-line this session; their runtime/security/deployment
state remains **[UNVERIFIED]**. Inventory and focused code reading are not a line-by-line audit of
all 3,711 files.

Focused review covered the current capacity model/rules, delegation-completion action, portfolio
creation/source validation, capacity UI source picker, cross-module tests, and current README,
ROADMAP and RESEARCH. Confirmed baseline features include schema v16 migrations, append-oriented
audit events, typed privacy-constrained record links, case-to-capacity reserve propagation, and
capacity-to-goal/decision automation. The meaningful gap was narrower: a leader could explicitly
link planned portfolio work to an active delegation, but when the delegation was marked complete,
the linked work stayed open and continued to consume capacity and distort WIP/throughput.

## 2. What shipped

Added **`RULE-CAP-04`** to the shared, declarative `AUTOMATION_RULES` inventory. On the existing
`delegation.completed` event, the existing cross-module engine now finds only open portfolio work
explicitly sourced from that delegation and, atomically:

- marks it delivered (`status: done`) on the delegation's recorded completion date;
- retains/repairs its typed `portfolio → delegation` graph link;
- emits the normal append-only `automation.propagated` audit event and structured propagation
  result; and
- thereby removes it from committed capacity and counts its actual completion for flow metrics.

No estimate is invented, unrelated or manually sourced work is untouched, and returned delegations
are not treated as delivery. The action layer rejects creating open portfolio demand from a closed
delegation and rejects a completion date that predates linked plan work. **Sync rules** also
reconciles already-completed delegation links from pre-rule workspace state, idempotently. The
completion action now returns its structured propagation details to callers.

No schema migration was needed: this reuses existing source provenance, relationships, lifecycle
fields and event machinery. No runtime dependency, network call or backend was added.

## 3. Cross-module trace and regression tests

`tests/app/capacity-flow.test.mjs` now traces a real action-layer sequence: add a person → create an
active delegation → explicitly link funded, estimated plan work → confirm the work is committed →
complete the delegation with a recorded date and evidence note → assert the plan item's delivered
status/date, preserved typed edge, exactly one RULE-CAP-04 audit entry, and zero remaining committed
demand. It also checks duplicate-completion and impossible-chronology rejection, closed-delegation
source validation, and `syncCapacityPlan()` repair/idempotency against a simulated pre-rule
workspace. `tests/app/cases-automation.test.mjs` updates the declared rules inventory count (7 case
+ 4 capacity rules).

## 4. Verification

- Initial `npm test` correctly failed because `node_modules` was absent (`jsdom` missing); `npm ci
  --no-audit --no-fund` installed the locked dependencies without modifying the lockfile.
- Focused `node --test tests/app/capacity-flow.test.mjs`: **19 passed, 0 failed**.
- The first full-suite run found a stale expected automation-rule count (10 instead of 11); the
  assertion was corrected.
- Final `npm test`: **341 passed, 0 failed, 0 skipped across 26 files**.
- Focused ESLint and `node --check` pass for all modified JS modules/tests; `git diff --check` is
  clean. JSDOM/axe checks for the capacity UI are included in the full suite. A real graphical
  browser, screen reader, manager comprehension test and production-scale dataset were not run;
  these remain **[UNVERIFIED]**.

## 5. Changes in this session

- `app/core/domain/automation.js`
- `app/actions.js`
- `tests/app/capacity-flow.test.mjs`
- `tests/app/cases-automation.test.mjs`
- `index.html`
- `README.md`
- `RESEARCH.md`
- `ROADMAP.md`
- `AI-SESSION-LOG.md`
- `docs/AUDIT-2026-10-25-session-25.md`

## 6. Repository sync

Push/PR status is **not yet verified** at the time this audit draft was written. The final actual
commit and push result must be recorded here after the sync attempt; if it fails, all changed files
are listed above so no work is silently lost.
