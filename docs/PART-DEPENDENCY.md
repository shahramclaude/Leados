# Part Dependency DAG (Parts 00–22, 23 parts total)

This is the execution critical path for the LEADOS program. Each part names: **Inputs** (which
earlier parts' outputs it consumes — a part may not start until its inputs are merged and its
predecessor's gate has passed `npm run verify`), **Outputs** (files/gates it owns and must leave
passing for the next part), and **Primary findings closed** (which rows of
`docs/FINDINGS-2026-PART-00.md` / `docs/EVIDENCE-LEDGER.md` this part is responsible for moving from
`false`/`unverified` to `verified`, with evidence).

No part may mark a ledger row `verified` for a claim it did not itself re-run the proof for. Marking
a row `verified` by narrative alone is the exact failure this program has already demonstrated five
times (`docs/FINDINGS-2026-PART-00.md` F3–F7) and is disallowed by `scripts/ledger-lint.mjs`.

| Part | Name | Inputs (consumes) | Outputs (owns) | Findings/ledger rows closed |
|---|---|---|---|---|
| **00** | Foundation & Constitution | none (root of the DAG) | `docs/LEADOS-ARCHITECTURE-2026.md`, `docs/EVIDENCE-LEDGER.md`, `docs/PART-DEPENDENCY.md`, `docs/FINDINGS-2026-PART-00.md`, `docs/adr/ADR-0001-*`, `docs/adr/ADR-0002-*`, `scripts/ledger-lint.mjs`, `npm run ledger:check` / `npm run verify` wiring | LD-036, LD-037–LD-042 (governance rows, verified by construction) |
| **01** | Repository consolidation & de-duplication | 00 (Constitution, findings baseline) | A single canonical `src/` tree; `deprecated/` actually populated with the legacy Vite app (`App.tsx`, `main.tsx`, `vite.config.ts`, `index.html`, `engine.ts/js`, `store.ts/js`, `events.js`, `health.ts/js`, `ui.tsx/js`, `leados-cli.html`) and the ~50 orphaned root-level `*.tsx` view components, moved with a dated README per `docs/history/README.md`'s own stated rule; a resolved precedence ADR for migrations-vs-push (closes LD-004) | F4, F14, F15, F16, LD-006, LD-007-T, LD-031, LD-033 |
| **02** | Truth substrate hardening | 01 (clean tree) | Single canonical event-store module (`src/lib/events/` only, root duplicates removed); `event_version` branching documented and tested; append-only guard verified against a real write attempt | LD-005, LD-006 |
| **03** | AuthN/AuthZ + multi-tenancy | 02 (events to attribute actions to) | Enforced session auth on all API routes (not just the 8 existing `api/auth/*` files); `tenant_id` scoping on every table in `src/db/schema.ts`; `scripts/test-tenant-isolation.ts` passing in CI | F25, LD-035 |
| **04** | Reasoning core consolidation | 02, 03 (events + actor identity) | One `beliefFabric`/Bayesian implementation (root + 2 duplicates retired); every return value carries `confidence_class` | LD-009, LD-010-T |
| **05** | Explainability & provenance | 04 | `Explain<T>` / `hasProvenance()` required (lint-enforced) on every function that returns a number consumed by UI or an agent | LD-008 |
| **06** | Causal engine consolidation | 04, 05 | `src/lib/causal/` declared canonical by ADR; 12 duplicate causal files (root + `domain/` + `intelligence/` copies) retired or re-exported from the canonical package only; `__tests__` suite actually executed in CI | F12, LD-011, LD-012, LD-013 |
| **07** | Causal → language bridge | 06 | One `causal/language.ts`; confidence-class-to-sentence mapping tested (an `assumed` input cannot render as an `observed`-confidence sentence) | LD-028 |
| **08** | Digital twin | 06 (structural model), 02 (events as anchor) | One seeded RNG (`src/lib/causal/rng.ts` or `domain/prng.ts`, not both) used by every simulation path; every simulation output carries `p10/p50/p90` | LD-014, LD-015, LD-016 |
| **09** | Financial operating system | 08 (twin), 02 (actuals) | `reconcile()`/`runwayDistribution()`/`runwayTornado()` executable end-to-end via a working `npm run verify`; board-pack route de-duplicated (`board-pack` vs `boardpack`) | LD-017, LD-018 |
| **10** | Strategy / OKR + decision engine | 09, 04 | `okr_objectives/okr_key_results/okr_initiatives` tables actually added to `src/db/schema.ts` (closing the `scripts/verify.ts` import mismatch); decision-tree/retrospective engine wired to Layer 1 events | LD-019, LD-020 |
| **11** | People operating system & fairness gate | 04 (reasoning core), 03 (consent/RBAC) | One canonical `flightRisk`/`succession`/`teamHealth`/`growth` package under `src/lib/domain/people/`; `docs/FAIRNESS.md` updated to cite the single enforced path; `scripts/test-proxy-exclusion.ts` running in CI | F17, LD-021, LD-022 |
| **12** | Execution engine | 09, 10 | Project/portfolio status and delivery-backtesting wired to the same event stream, no shadow state | — |
| **13** | Autonomous operations | 05 (provenance), 03 (RBAC/policy), 02 (events for reversibility) | One canonical agent-loop module (8 duplicates retired); every agent action has a tested compensating transaction; `UndoToast.tsx` either wired to a real undo endpoint or retired | F4 (agent half), LD-023, LD-024, LD-025 |
| **14** | Attention & workload governance | 13 | Attention-budget/fatigue/cognitive-load engines de-duplicated and tied to the agent scheduler so autonomous actions respect human attention limits (T4) | — |
| **15** | Language layer (i18n + narrative) | 07, 03 (tenant/locale context) | A real i18n provider wired from `src/app/layout.tsx`; an end-to-end Danish-session smoke test | F19, LD-026, LD-027 |
| **16** | Memory & sensing | 02, 04 | Capture → classify → propose → approve pipeline confirmed to append a Layer 1 event on approval (no silent bypass); retention/consent policy documented against T4 | LD-029, LD-030 |
| **17** | Experience layer unification | 15 (i18n/a11y), 01 (clean tree), all data-producing parts (04–14) | Exactly one UI tree under `src/app` + `src/components`; command palette and dashboards either migrated and wired, or formally retired into `deprecated/` | F4, F15, F16, LD-031, LD-032, LD-033 |
| **18** | Universality & proof (API surface) | 17, every route-owning part | One generated OpenAPI spec (`scripts/generate-openapi.ts` → single output file); the other 3 candidate spec files retired or marked explicitly non-canonical | F20, LD-034 |
| **19** | Observability & release engineering | 18, 13 (needs monitoring) | `.github/workflows/ci.yml` and `release.yml` actually created and green at least once; `docs/SLO.md`/`docs/RUNBOOKS.md` tied to a real alerting path | F7, F21 |
| **20** | Security & privacy hardening | 03, 19 (CI to enforce it) | Every one of the (at the time) ~300+ API routes passes an automated auth-enforcement check in CI; secret-scan (`scripts/secret-scan.mjs`, `scan-secrets.sh`) green | F25, LD-035 |
| **21** | Test & mutation-testing remediation | 19 (CI exists) | The 77 existing `*.test.ts` files actually run in CI; Stryker/Vitest mutation config fixed (closing the config-error-disguised-as-report problem) | F8, F18, LD-013 |
| **22** | Fairness & red team (final gate) | all prior parts, especially 11, 20 | A real "Red Team report" document is written, resolving the dangling `SEC-1` citation in `src/app/page.tsx`; full fairness audit per `docs/FAIRNESS.md`; adversarial self-review of every prior part's ledger rows, re-running their proofs, not re-reading their prose | F24, LD-021 |

## Critical path

```
00 → 01 → 02 → 03 → {04,09-prep} → 04 → 05 → 06 → 07 ↘
                                              ↘ 08 → 09 → 10 → 12
                                        06 → 11 ↗            ↘
                                    05,03 → 13 → 14            17 → 18 → 19 → 20 → 21 → 22
                            07,03 → 15 → 16 ↗              ↗
```

Linearized minimum path to a demoable, honest end-to-end slice (truth → reasoning → one decision
surfaced with provenance and an interval, read in two languages, actioned by one reversible
autonomous step): **00 → 01 → 02 → 03 → 04 → 05 → 06 → 13 → 15 → 17 → 18**. Everything else
(08–12, 14, 16, 19–22) deepens or hardens that slice but is not on the path to the first honest
demo.

## Riskiest edge

**00 → 01.** Every other part assumes it is building on a *de-duplicated* tree. Part 01 is the first
and only part whose job is to make that assumption true. If Part 01 fails, is skipped, or is
declared done by narrative instead of by a re-run `find`/`grep` (exactly the failure mode in
`docs/FINDINGS-2026-PART-00.md` F3–F7, which has already happened at least five times in this
repository's real history), then:
- Part 02 "hardens" an event store that still has a live duplicate sibling (LD-006), so hardening
  one copy leaves the other copy's callers silently un-hardened.
- Part 06's causal-engine consolidation has nothing stable to consolidate *into* if Part 01 didn't
  already pick a winner among the 13 candidate causal files.
- Part 17's UI unification — the part explicitly scoped to merge two UI trees — cannot be verified
  as complete, because Part 01 is the part that was supposed to establish which tree is canonical in
  the first place.
- Most importantly: **this exact failure has already occurred in the subject repository**, more
  than once (`docs/AUDIT-2026.md` and `docs/history/2026-part19-baseline-note.md` both declare "no
  duplication found" immediately before/alongside commits that introduce exactly this duplication —
  F3, F4). Part 01 is not a hypothetical risk; it is a demonstrated, repeated point of failure for
  this specific program.

This is why Part 01 is scoped as its own part rather than folded into Part 00 "while we're at it" —
it needs its own gate, its own re-run proofs, and its own ledger rows, not a paragraph in this
document.
