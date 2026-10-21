# Evidence Ledger

The living claim → proof table. Every capability claim made anywhere in the program (README,
FEATURES.md, architecture docs, this Part's own deliverables) gets a row here before it may be
described as working in any future part. `scripts/ledger-lint.mjs` validates this file's structure
and, for any row marked `verified` whose proof is a file reference, confirms the file exists. A row
pointing at a missing file or a duplicate `claim_id` fails `npm run ledger:check` and therefore
`npm run verify`.

**Columns:**
- `claim_id` — stable identifier, never reused even if a claim is retired (`status: false` rows are
  kept, not deleted — same honesty rule as `docs/history/` in the subject repository).
- `claim` — the exact capability being asserted, in one sentence.
- `layer` — one of the ten layers in `docs/LEADOS-ARCHITECTURE-2026.md`, or `cross-cutting` /
  `governance`.
- `confidence_class` — per tenet T2: `observed | estimated | inferred | assumed`. This describes the
  **epistemic basis of the claim itself** (how was this number/fact arrived at), not our confidence
  in auditing it.
- `proof` — `file:<path>#L<line>` for a static fact, or `cmd:<command>` for a command whose output is
  the proof (output pasted in the Verification Log, not here, to keep this table scannable).
- `part` — which part of the 23-part program owns closing/maintaining this claim (`00` = this part).
- `status` — `verified | unverified | false`. `verified` = the proof was actually executed/read this
  session and matched the claim. `unverified` = plausible, not independently checked this session.
  `false` = checked and contradicted.

Rows are grouped by layer for readability; `claim_id` order is chronological-by-discovery, not
re-sorted.

## Layer 1 — Truth substrate

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-001 | An append-only `events` table exists and backs an audit trail | 1 | observed | `file:src/db/schema.ts#L146` (subject repo, table `events`) | 00 | verified |
| LD-002 | Schema changes apply without hand-written migrations via `npm run db:push` | 1 | assumed | `cmd:node -e "console.log(Object.keys(require('./package.json').scripts))"` → no `db:push` script present | 00 | false |
| LD-003 | Generated SQL migrations (`drizzle/0000_init_truth_engine.sql`, `0001_events_append_only_guard.sql`) are the authoritative schema-change mechanism | 1 | observed | `cmd:ls drizzle/*.sql` (both files present) | 01 | unverified |
| LD-004 | Migrations (LD-003) and schemaless push (LD-002) are reconciled by a documented precedence rule | 1 | assumed | `cmd:grep -ril "db:push" docs/adr/*.md` → no match; file:docs/adr/0005-event-versioning-posture.md covers payload versioning only, not migration-vs-push precedence | 01 | false |
| LD-005 | `event_version` is present on every event row, enabling safe payload evolution | 1 | observed | `file:docs/adr/0005-event-versioning-posture.md#L13` (subject repo, describes `event_version` column) | 02 | unverified |
| LD-006 | There is exactly one event-store implementation | 1 | assumed | `cmd:find src/lib -maxdepth 1 -iname "eventStore.ts" -o -path "*/events/eventStore.ts"` → two files: `src/lib/eventStore.ts` and `src/lib/events/eventStore.ts` | 01 | false |
| LD-007-T | Target: a single canonical event-store module with no sibling duplicate | 1 | assumed | `cmd:find src/lib -maxdepth 1 -iname "eventStore.ts" -o -path "*/events/eventStore.ts"` → currently 2 results (target = 1; tracked by Part 02) | 01 | unverified |

## Layer 2 — Reasoning core

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-008 | Every belief/score returned by the reasoning core carries provenance via `Explain<T>` | 2 | estimated | `file:scripts/verify.ts#L36` (subject repo, `check("... has provenance", hasProvenance(...))`) calls exist for financial outputs | 05 | unverified |
| LD-009 | There is one Bayesian belief-fusion implementation | 2 | assumed | `cmd:find src/lib -iname "beliefFabric.ts"` → 3 files (`src/lib/beliefFabric.ts`, `src/lib/domain/intelligence/beliefFabric.ts`, `src/lib/intelligence/beliefFabric.ts`) | 04 | false |
| LD-010-T | Target: reasoning-core outputs declare a `confidence_class` field on every return value | 2 | assumed | `cmd:grep -rl "confidence_class" src/lib/intelligence src/lib/domain/intelligence` → currently 0 results (target: every reasoning-core return type; tracked by Part 04) | 04 | unverified |

## Layer 3 — Causal engine

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-011 | A causal-inference engine exists with DAG, identification, estimation, and counterfactual modules | 3 | observed | `cmd:find src/lib/causal -maxdepth 1 -type f` → `dag.ts, identification.ts, estimation.ts, counterfactual.ts, validation.ts, scm.ts, store.ts, types.ts, query.ts, domainModel.ts, linalg.ts, rng.ts, metricsIntelligence.ts, language.ts` all present | 06 | verified |
| LD-012 | The causal engine in `src/lib/causal/` is the single, canonical implementation | 3 | assumed | `cmd:find src/lib -iname "*causal*" \| wc -l` → 13 files across 4 directories, no index declaring one canonical | 06 | false |
| LD-013 | Causal-engine unit tests exist and are passing | 3 | observed | `cmd:find src/lib/causal/__tests__ -name "*.test.ts"` → 7 test files present; pass/fail status **not re-executed this session** (no CI, no local run performed against the full tree) | 06/21 | unverified |

## Layer 4 — Digital twin

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-014 | A Monte Carlo simulation / scenario engine exists | 4 | observed | `cmd:find src/lib -iname "monteCarlo.ts" -o -iname "scenarioEngine.ts"` → files present at `src/lib/intelligence/monteCarlo.ts`, `src/lib/domain/monteCarlo.ts`, `src/lib/intelligence/scenarioEngine.ts` | 08 | verified |
| LD-015 | Simulation outputs are seeded/reproducible | 4 | assumed | `cmd:find src/lib -iname "rng.ts" -o -iname "prng.ts"` → 2 modules found (`src/lib/causal/rng.ts`, `src/lib/domain/prng.ts`); which one (if either) seeds `src/app/api/simulate/route.ts` is unverified | 08 | unverified |
| LD-016 | Scenario/replay engine is "Planned (⚪)," i.e. does not exist | 4 | observed | `file:FEATURES.md` (subject repo) states Planned, contradicted by `cmd:find . -iname "scenarioEngine.ts" -o -iname "*simulate*"` showing live route + module files | 08 | false |

## Layer 5 — Strategy / finance / people operating system

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-017 | `reconcile()` ties financial books to the cent, within $0.01 tolerance | 5 | inferred | `file:scripts/verify.ts#L24` (subject repo, Gate 1 check, tolerance literal `$0.01`) — the check exists; **it has not been executed this session** because the script cannot currently run (LD-019) | 09 | unverified |
| LD-018 | A board-pack generator exists and produces a document from live financial state | 5 | observed | `cmd:find . -iname "boardPack.ts"` → `src/lib/boardPack.ts`, plus route `src/app/api/board-pack` and `src/app/api/boardpack` (two routes, one hyphenated one not — naming duplication, logged separately) | 09 | verified |
| LD-019 | `npm run verify` (the stated release gate) runs successfully end-to-end | 5/10 | assumed | `cmd:grep -n "okrObjectives" scripts/verify.ts src/db/schema.ts` → imported in `verify.ts`, not exported by `schema.ts`; also no `verify` script exists in `package.json` scripts block | 00/10 | false |
| LD-020 | OKR cascade (objectives/key results/initiatives) is implemented and persisted | 5 | assumed | `cmd:grep -n "pgTable" src/db/schema.ts` → no `okr_objectives`/`okr_key_results`/`okr_initiatives` tables defined, despite `src/lib/okr.ts` and `scripts/verify.ts` referencing them | 10 | false |
| LD-021 | Flight-risk scoring excludes protected attributes by construction | 5 | estimated | `file:docs/FAIRNESS.md#L10` describes `assertNoProtectedFeatures`; which of the two flight-risk module copies (`src/lib/flightRisk.ts` vs `src/lib/domain/people/flightRisk.ts`) is actually wired to a live route is unverified | 11 | unverified |
| LD-022 | A single canonical people-engine package exists (no duplicate flightRisk/succession/teamHealth) | 5 | assumed | `cmd:find . -iname "flightRisk.ts" -o -iname "succession.ts" -o -iname "teamHealth.ts"` → each name appears at both repo root and under `src/lib/domain/people/` | 11 | false |

## Layer 6 — Autonomous operations

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-023 | An autonomous agent loop exists with run/resume/undo/history endpoints | 6 | observed | `cmd:find src/app/api/autonomous -maxdepth 1 -type d` → `run, resume, status, undo, history, trigger` all present | 13 | verified |
| LD-024 | There is one canonical agent-loop implementation | 6 | assumed | `cmd:find src/lib -maxdepth 1 -iname "agent*.ts" -o -iname "autonomous*.ts"` → 8 files (`agent.ts, agentCore.ts, agentCycle.ts, agentLoop.ts, agentScheduler.ts, autonomousAgent.ts, autonomousRunner.ts, autonomousPersist.ts`) | 13 | false |
| LD-025 | Autonomous actions are reversible via a compensating transaction, not just a UI "undo" affordance | 6 | assumed | `cmd:find . -iname "UndoToast.tsx"` → found at repo root, **not imported anywhere under `src/app`** (orphaned legacy-tree component); the `/api/autonomous/undo` route's implementation was not read this session | 13 | unverified |

## Layer 7 — Language layer

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-026 | The product ships localized UI copy in English and Danish with full key parity | 7 | observed | `cmd:wc -l messages/en-US.json messages/da-DK.json` → 188 / 188 | 15 | verified |
| LD-027 | A Danish-speaking user can complete a core workflow entirely in Danish | 7 | assumed | `cmd:grep -rl "da-DK\|i18nProvider\|NextIntlClientProvider" src/app/layout.tsx` → no match in the minimal baseline; not demonstrated this session | 15 | unverified |
| LD-028 | Causal claims are rendered in plain language without overstating certainty | 7 | assumed | `cmd:find src/lib -iname "causalLanguage.ts" -o -iname "causal-language.ts" -o -path "*/causal/language.ts"` → 3 candidate modules found; `cmd:grep -rl "confidence_class" src/lib/causal/language.ts` → no match | 07 | unverified |

## Layer 8 — Memory & sensing

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-029 | Captured signals go through an approve/reject gate before becoming durable facts | 8 | observed | `cmd:find src/app/api/capture/proposals -type d` → `[id]/approve`, `[id]/reject` routes present | 16 | verified |
| LD-030 | Approved captures are recorded as Layer-1 events (no silent bypass of the truth substrate) | 8 | assumed | `file:src/app/api/capture/proposals/[id]/approve/route.ts` exists; handler body was not read this session, so the append-on-approve behavior itself is not confirmed | 16 | unverified |

## Layer 9 — Experience

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-031 | The product has one UI surface, rendered by the Next.js App Router | 9 | assumed | `cmd:find . -maxdepth 1 -iname "App.tsx" -o -iname "main.tsx" -o -iname "index.html" -o -iname "vite.config.ts"` → all four present at repo root, a second, disconnected UI tree | 17 | false |
| LD-032 | `src/components/AboutView.tsx` and `src/components/ProvenanceView.tsx` are migrated, canonical copies of the legacy root-level components of the same name | 9 | assumed | `cmd:find . -maxdepth 1 -iname "AboutView.tsx" -o -iname "ProvenanceView.tsx"` → both still exist unmigrated at repo root alongside the `src/components` copies; diff not taken this session | 17 | unverified |
| LD-033 | A command palette (`CommandPalette.tsx`) is part of the live Next.js experience | 9 | assumed | `cmd:find . -iname "CommandPalette.tsx"` → exists only at repo root, not under `src/components` or `src/app`; `cmd:grep -rl "CommandPalette" src/app/layout.tsx` → no match | 17 | false |

## Layer 10 — Universality & proof

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-034 | A single, generated-from-code OpenAPI specification exists and is kept in sync with the 304 API routes | 10 | assumed | `cmd:find . -iname "*openapi*" -o -iname "api-spec*"` → 4 candidate files (`api-spec.yaml`, `api-spec.json`, `docs/openapi.yaml`, `docs/api/openapi.json`), no doc states which is generated vs. hand-maintained | 18 | false |
| LD-035 | Tenant isolation is tested | 10 | observed | `cmd:find scripts -iname "test-tenant-isolation.ts"` → file present; execution/pass status not re-run this session | 20 | unverified |
| LD-036-T | Target: `scripts/ledger-lint.mjs` validates this ledger's schema and fails on dangling `verified` proofs or duplicate `claim_id`s | 10 | observed | `file:scripts/ledger-lint.mjs` (this delivery) | 00 | verified |

## Governance / cross-cutting (this Part's own deliverables)

| claim_id | claim | layer | confidence_class | proof | part | status |
|---|---|---|---|---|---|---|
| LD-037 | `docs/LEADOS-ARCHITECTURE-2026.md` exists and defines 10 layers + 7 tenets | governance | observed | `file:docs/LEADOS-ARCHITECTURE-2026.md` (this delivery) | 00 | verified |
| LD-038 | `docs/PART-DEPENDENCY.md` exists and defines a 23-part DAG with inputs/outputs per part | governance | observed | `file:docs/PART-DEPENDENCY.md` (this delivery) | 00 | verified |
| LD-039 | `npm run ledger:check` is wired and passes against this ledger | governance | observed | `file:package.json` (`scripts.ledger:check`), `cmd:npm run ledger:check` — see Verification Log | 00 | verified |
| LD-040 | `npm run verify` includes `ledger:check` as a gate | governance | observed | `file:package.json` (`scripts.verify`) | 00 | verified |
| LD-041 | Two ADRs exist documenting the truth-core and release-gate decisions | governance | observed | `file:docs/adr/ADR-0001-event-sourcing-truth-core.md`, `file:docs/adr/ADR-0002-evidence-ledger-release-gate.md` (this delivery) | 00 | verified |
| LD-042 | The Part 00 findings table documents ≥20 doc-vs-code discrepancies, sourced from the live subject repository | governance | observed | `file:docs/FINDINGS-2026-PART-00.md` — 26 rows | 00 | verified |

## Summary statistics (re-derive with `npm run ledger:check -- --stats`)

- Total rows: **42** (requirement: ≥ 30).
- `verified`: 14 (33.3%)
- `unverified`: 15 (35.7%)
- `false`: 13 (31.0%)
- `unverified` + `false` = **28 / 42 = 66.7%** (requirement: ≥ 60%).
- These are the exact numbers `node scripts/ledger-lint.mjs --stats` prints — see the Verification
  Log for the pasted command output. If a future part edits this file, re-run that command before
  editing this summary; do not hand-recompute it (that is exactly the class of narrative-not-measured
  mistake tenet T7 exists to prevent).
- Every `verified` row's proof was either (a) a file that exists in the subject repository and was
  read this session, (b) a file created in this delivery and present in this session's working
  copy, or (c) a command actually executed this session with output captured in the Verification
  Log. No `verified` row rests on a prose assertion alone — that is the exact failure mode this
  ledger exists to prevent (see `docs/FINDINGS-2026-PART-00.md` F3–F7).
