# LEADOS Architecture 2026 — Target End-State (Part 00)

**Status:** Target model. This document describes where LEADOS is going, not where it is. Every
claim about current state is cross-referenced to `docs/FINDINGS-2026-PART-00.md` (what's true today)
and `docs/EVIDENCE-LEDGER.md` (claim-by-claim proof status). Do not quote this document as evidence
that a layer is built — quote the ledger.

**Scope note on this delivery:** Discovery (Phase 0) was performed against the live repository
`https://github.com/shahramclaude/Leados` at commit `2792e89c`. The documents and scripts in this
Part 00 delivery (this file, the ledger, the dependency DAG, the ADRs, `scripts/ledger-lint.mjs`,
the `package.json` script wiring) are written to be uploaded into that repository. The sandbox this
session's own build/typecheck/`build_and_start` validation runs against is the minimal
`nextjs-postgresql-template` starter baseline provided by the execution environment — confirmed
byte-identical in spirit to the starting point three prior sessions in the subject repository
(`docs/AUDIT-2026.md`, `docs/history/2026-part19-baseline-note.md`, `AI-SESSION-LOG.md`) each
independently reported finding (same "Arena Next.js PostgreSQL Starter" branding, same
`__arenaNextJsPostgresqlPool` global variable name). That repeated pattern — every session narrating
"I found a clean minimal starter" right before the repository's actual file tree shows 1,639 files —
is precisely the failure mode this document and the Evidence Ledger exist to stop. See
`docs/FINDINGS-2026-PART-00.md` F3–F7.

---

## The Constitution — seven tenets, enforced in code

Each tenet below names the mechanism that enforces it and the gate that fails if the mechanism is
missing or bypassed. A tenet with no enforcement mechanism yet is marked **UNENFORCED** —
honestly, not as a footnote.

### T1 — Evidence over assertion
Every surfaced claim (a number on a dashboard, a recommendation, a risk flag) carries provenance:
what observation(s) produced it, computed by what code, as of what event version.
- **Mechanism:** the `Explain<T>` envelope (`src/lib/explain.ts` in the subject repo) wraps every
  value with `{ value, provenance }`; `hasProvenance()` is a runtime assertion usable in tests and
  gates.
- **Release gate:** `scripts/ledger-lint.mjs` (this part) refuses to let a claim be marked `verified`
  in `docs/EVIDENCE-LEDGER.md` unless its `proof` column resolves to a real file or a reproducible
  command.
- **Current violation on record:** `docs/FINDINGS-2026-PART-00.md` F24 — the shipped UI cites "the
  Red Team report, finding SEC-1," a document that does not exist. This is T1 violated in the
  product itself, not only in documentation. **UNENFORCED at runtime today** — there is no check
  that prevents a route from rendering a citation to a nonexistent document.

### T2 — Calibrated uncertainty
Every estimate carries an interval and a confidence class drawn from a closed vocabulary:
`observed | estimated | inferred | assumed`.
- `observed`: read directly from a stored event/fact, no modeling.
- `estimated`: computed via a declared, deterministic formula from observed inputs (e.g. rule-based
  scoring).
- `inferred`: produced by a statistical/causal model with a stated method and sample size.
- `assumed`: a parameter supplied by a human because no data exists yet (must be flagged, must be
  revisited).
- **Mechanism:** `docs/EVIDENCE-LEDGER.md`'s `confidence_class` column uses exactly this vocabulary;
  any new numeric claim in the product must declare one. The subject repo's
  `runwayTornado()`/`runwayDistribution()` (`src/lib/financialOS.ts`, referenced in
  `scripts/verify.ts`) already return `p10/p50/p90`, which is the right shape to generalize from.
- **Current violation on record:** F18 — the mutation-testing report presents a tool configuration
  failure as if it were a coverage result, i.e. a `0`-confidence artifact rendered with no
  confidence class at all.

### T3 — Human command
Every autonomous action is reversible, attributable to a human-approved policy, and bounded by that
policy. No agent action is "fire and forget."
- **Mechanism:** an action must (a) write an event before taking effect, (b) carry an `actor` and a
  `policy_id`, (c) have a defined compensating action. The subject repo's `agentRuns`/`agentActions`
  tables plus an `approve` route (`src/app/api/agent-runs/[id]/actions/[actionId]/approve/route.ts`)
  are the right shape but are **UNVERIFIED for reversibility** — `src/components/UndoToast.tsx`
  exists at repo root, disconnected from `src/app`, which means "undo" may currently be UI sugar
  with no compensating transaction behind it (see `docs/FINDINGS-2026-PART-00.md`, and
  `docs/EVIDENCE-LEDGER.md` row `LD-021`).
- **Release gate (target):** no agent action handler may be merged without a paired "undo" test that
  asserts the system returns to its prior observable state.

### T4 — Dignity by design
People data is consent-scoped, aggregation-gated (no single-person inference surfaced without a
minimum cohort size, except to that person about themselves), and never used to punish
(no auto-triggered negative HR action from a model score).
- **Mechanism:** `docs/FAIRNESS.md`'s protected-attribute denylist and flight-risk allow-list
  (`src/lib/protectedAttributes.ts`), a `consent` API surface (`src/app/api/consent/route.ts`).
- **Current violation on record:** F17 — the flight-risk engine is duplicated
  (`src/lib/flightRisk.ts` vs `src/lib/domain/people/flightRisk.ts`); which copy is wired to the live
  route, and therefore which copy the fairness document is actually describing, is unverified. A
  fairness control that cannot be pointed at a single enforced code path is **UNENFORCED** even if
  the policy text is correct.

### T5 — Universal access
Language, ability, device, and tenancy must never gate comprehension of what the system is telling
a person.
- **Mechanism:** `messages/en-US.json` / `messages/da-DK.json` (key parity confirmed, 188/188 —
  `docs/FINDINGS-2026-PART-00.md` F19), `src/lib/a11y.ts` / `a11yPrefs.ts`.
- **Current gap on record:** F19 — key-file parity is confirmed; an actual rendered end-to-end
  Danish session is **UNVERIFIED** (no i18n provider wiring found from the minimal baseline
  forward). "The translation files exist" and "a Danish-speaking user can use the product" are
  different claims and must not be conflated in the ledger.

### T6 — Reversible change
Schema changes are expand/contract, not destructive. Every mutation has a compensating transaction.
Risky code paths ship behind feature flags.
- **Mechanism:** `drizzle/0000_init_truth_engine.sql`, `drizzle/0001_events_append_only_guard.sql`
  (append-only guard on an events table), `src/app/api/feature-flags`.
- **Current gap on record:** F22 — the repository simultaneously documents a generated-migration
  workflow (the two SQL files above) and a schemaless-push workflow (`README.md`'s `npm run
  db:push`) with no ADR stating which is authoritative today. Reversibility cannot be assessed for a
  schema-change process that is itself ambiguous.

### T7 — Measured, not claimed
No performance or intelligence claim ships without a reproduced number, from a command whose output
is pasted into the verification log, not paraphrased.
- **Mechanism:** `scripts/verify.ts` (subject repo) is explicitly designed this way — "Exits 0 only
  if every gate passes. Prints real numbers... so the VERIFICATION LOG can be copied directly from
  this output." This is the correct pattern.
- **Current violation on record:** F10/F26 — `scripts/verify.ts` is not wired to any `npm` script
  and cannot currently run (it imports `okrObjectives`/`okrKeyResults`/`okrInitiatives` from
  `src/db/schema`, which does not export them). The mechanism designed to enforce T7 is itself
  currently broken, which is the direct, demonstrated cause of F3–F7 (five narrative claims that
  turned out false because nothing automated re-checked them).

**Honest summary:** as of this Part 00 baseline, **T1, T3, T4, T5, T6, and T7 all have at least one
concretely demonstrated violation or unenforced gap**, cited above with evidence. T2 has a correct
existing example (`runwayDistribution`) but no enforced requirement that *all* estimates follow it.
This is not a reason to despair; it is the reason this part exists. Parts 01–22 are scoped against
these specific, named gaps — see `docs/PART-DEPENDENCY.md`.

---

## The ten layers

For each layer: **responsibility**, **owned modules** (current, per discovery — may be duplicated;
see findings), **inbound contract**, **outbound contract**, **failure modes** (observed or
foreseeable).

### Layer 1 — Truth substrate
**Responsibility:** the single, append-only record of everything that happened: who did what, when,
to what, with what payload and schema version. Every other layer either writes an event here or
reads a projection derived from here. No layer is allowed to be "the" source of truth for a fact
that this layer also claims to record.
**Owned modules (current):** `src/db/schema.ts` (`events`, `agentRuns`, `agentActions`,
`llmProposals`), `drizzle/0000_init_truth_engine.sql`, `drizzle/0001_events_append_only_guard.sql`,
`src/lib/events/**` (`eventStore.ts`, `eventSchema.ts`, `eventCatalog.ts`, `projections/**` — note:
duplicated at `src/lib/eventStore.ts`, `src/lib/eventSchema.ts`, `src/lib/eventCatalog.ts` as
top-level siblings of the same names inside `src/lib/events/` — an unresolved duplicate, logged as
`LD-006`).
**Inbound contract:** every state-changing use case calls `append(eventType, version, payload,
actor)` before or as part of its primary write.
**Outbound contract:** `recent()`/`asOf()` reads return events in order, each carrying
`event_version`; no consumer may assume the latest payload shape without checking it.
**Failure modes:** dual-write (state mutated without a matching event — unverified whether this
happens today, flagged `LD-009`); duplicate truth stores (`events` table vs. `findings` table with
no documented relationship, F2/F5); schema drift without version branching.

### Layer 2 — Reasoning core
**Responsibility:** turn raw observations into calibrated beliefs: Bayesian updating, belief fusion
across signals, explicit confidence classes (T2), explanations attached to every output (T1).
**Owned modules (current, duplicated — see F12-adjacent finding on Bayesian code):**
`src/lib/bayesian.ts`, `bayesianNetwork.ts`, `beliefFabric.ts` (root) vs.
`src/lib/domain/intelligence/bayesian.ts`, `beliefFabric.ts` vs.
`src/lib/intelligence/bayesian.ts`, `bayesianNetwork.ts`, `beliefFabric.ts` — **three parallel
copies**, logged as `LD-007`. `src/lib/explain.ts` (the `Explain<T>` envelope) is the one piece of
this layer with a single, unambiguous home.
**Inbound contract:** consumes Layer 1 events as evidence.
**Outbound contract:** every belief returned must satisfy `hasProvenance()` and declare a
`confidence_class`.
**Failure modes:** three divergent belief-fusion implementations silently returning different
numbers for nominally the same question depending on which file a route imports (LD-007); point
estimates returned without an interval (violates T2 by omission, not by design).

### Layer 3 — Causal engine
**Responsibility:** structural causal models (DAGs), identification (is this effect even estimable
from this data), estimation, counterfactual queries, validation against known confounders.
**Owned modules (current, the single worst duplication cluster found — `docs/FINDINGS-2026-PART-00.md`
F12):** canonical candidate `src/lib/causal/` (11 files + `__tests__/`: `dag.ts`, `identification.ts`,
`estimation.ts`, `counterfactual.ts`, `validation.ts`, `scm.ts`, `store.ts`, `types.ts`, `query.ts`,
`domainModel.ts`, `linalg.ts`, `rng.ts`, `metricsIntelligence.ts`, `language.ts`) competing with
`src/lib/causal.ts`, `causalChain.ts`, `causalInference.ts`, `causalLanguage.ts`,
`causal-language.ts` (root) and `src/lib/domain/causal.ts`, `src/lib/intelligence/causal.ts`,
`causalChain.ts`, `causalInference.ts`.
**Inbound contract:** reasoning-core distributions plus Layer 1 events as the observational dataset.
**Outbound contract:** a counterfactual answer must name its identification strategy and its
untestable assumptions (T2 `assumed` class) explicitly, not silently.
**Failure modes:** F12 (13 files, 4 directories, no canonical pointer); an identification failure
(effect not estimable) silently returning a number anyway instead of refusing.

### Layer 4 — Digital twin
**Responsibility:** a simulateable model of the organization (headcount, budget, velocity, OKR
cascade) that can run forward (forecast) and be perturbed (scenario/what-if) without touching real
data, always returning a distribution, never a point forecast (T2).
**Owned modules (current):** `src/lib/domain/orgODE.ts`, `src/lib/intelligence/monteCarlo.ts`
(+ root `src/lib/monteCarlo.ts`? verify at Part 08 — flagged `LD-010`), `simulation.ts`,
`scenarioEngine.ts`, `src/app/api/simulate`, `src/app/api/scenarios`.
**Inbound contract:** the causal engine's structural model; Layer 1 events as current-state anchor.
**Outbound contract:** every simulation output carries `p10/p50/p90` (or equivalent interval) and a
seed, so it is reproducible (T7) — `src/lib/causal/rng.ts` vs `src/lib/domain/prng.ts` duplication
(`LD-011`) must be resolved before this can be guaranteed.
**Failure modes:** unseeded randomness silently breaking reproducibility; a scenario result rendered
without an interval, mistaken for a forecast (T2 violation).

### Layer 5 — Strategy / finance / people operating system
**Responsibility:** the actual operating cadence of the organization — OKRs, financial
reconciliation and runway, project/portfolio execution status, people signals (flight risk,
succession, team health) — each as a first-class, auditable engine, not a dashboard widget.
**Owned modules (current):** `src/lib/financialOS.ts`, `okr.ts` (referenced by `scripts/verify.ts`
but its schema tables `okrObjectives/okrKeyResults/okrInitiatives` are **not present** in
`src/db/schema.ts` today — F10, blocking), `boardPack.ts`, `executionEngine.ts`, `delivery.ts`,
`src/lib/domain/people/**` (`flightRisk.ts`, `succession.ts`, `teamHealth.ts`, `growth.ts`,
`oneOnOne.ts`), duplicated at `src/lib/flightRisk.ts`, `succession.ts`, `teamHealth.ts`,
`growthPlans.ts` (root — `LD-012`).
**Inbound contract:** digital-twin projections, Layer 1 actuals.
**Outbound contract:** every financial/strategy number traces to an assumption or event
(`hasProvenance()`, per `scripts/verify.ts`'s own stated Gate 5).
**Failure modes:** F10 (verification harness references schema that doesn't exist — a build-breaking
contract mismatch between this layer and Layer 1); duplicate people-engines (LD-012) risking
different flight-risk scores for the same person depending on call path (a T4 dignity concern, not
just a code-quality one — a person could be flagged by one copy and cleared by the other).

### Layer 6 — Autonomous operations
**Responsibility:** agents that take bounded, reversible, human-approved actions on the
organization's behalf (schedule a 1:1, draft a briefing, flag a budget overrun) — never silent,
never unbounded (T3).
**Owned modules (current, duplicated — `LD-013`):** `src/lib/agent.ts`, `agentCore.ts`,
`agentCycle.ts`, `agentLoop.ts`, `agentScheduler.ts`, `autonomousAgent.ts`, `autonomousRunner.ts`,
`autonomousPersist.ts` — eight files with overlapping responsibility and no index explaining which
owns the canonical loop; `src/app/api/agent-runs`, `api/autonomous/{run,resume,status,undo,history}`,
`api/approvals`.
**Inbound contract:** Layer 5 recommendations plus an explicit policy/approval object.
**Outbound contract:** every action is itself a Layer 1 event with a defined compensating action
before it is allowed to execute irreversibly.
**Failure modes:** eight-file ambiguity over "the" agent loop (LD-013); `UndoToast.tsx` existing only
as a disconnected root-level UI component with no confirmed compensating-transaction backend (T3
gap, cited in the Constitution section above).

### Layer 7 — Language layer
**Responsibility:** render every number, causal claim, and recommendation as a correct, honest,
plain-language sentence, in every supported locale, at every ability level (T1 + T5 together —
"comprehensible," not just "translated").
**Owned modules (current):** `src/lib/causal/language.ts` vs. root `causalLanguage.ts` /
`causal-language.ts` (three candidates, part of the Layer 3 duplication cluster, F12); `src/lib/i18n.ts`;
`messages/en-US.json`, `messages/da-DK.json`; `src/lib/domain/narratives.ts`.
**Inbound contract:** causal-engine and reasoning-core outputs, already carrying `confidence_class`.
**Outbound contract:** a generated sentence must not claim more certainty than its input's
`confidence_class` allows (e.g. an `assumed` input must never render as "X causes Y," only as "if
we assume X, the model estimates Y").
**Failure modes:** F19 (translation keys exist, rendering path unverified); confidence laundering —
an `inferred` or `assumed` number rendered in language that reads as `observed`.

### Layer 8 — Memory & sensing
**Responsibility:** ingest raw signals (meeting notes, Slack-style capture, imported documents),
classify them, and propose new structured facts for human approval before they become events in
Layer 1 — the write path into the truth substrate from the messy outside world.
**Owned modules (current):** `src/lib/institutionalMemory.ts`, `classify.ts`,
`src/app/api/capture/**` (including `proposals/[id]/approve`, `/reject`), `src/app/api/knowledge`.
**Inbound contract:** arbitrary unstructured input plus an actor.
**Outbound contract:** nothing reaches Layer 1 as a durable event without passing through an
approve/reject gate (T3 again — autonomy over *memory*, not only over action, must be
human-commanded).
**Failure modes:** no documented retention/consent policy ties this pipeline to T4; an approved
capture silently skipping the Layer 1 append (unverified, flagged `LD-014`).

### Layer 9 — Experience
**Responsibility:** the one UI a person actually uses — dashboards, command palette, accessibility,
and *only* this layer renders. No business logic lives here.
**Owned modules (current — the layer with the worst split identity in the repo):** `src/app/**` and
`src/components/**` (the Next.js App Router surface, the only one wired into `src/app/layout.tsx`)
vs. ~50 orphaned root-level `*.tsx` files (`Shell.tsx`, `CommandPalette.tsx`, `FinanceDashboard.tsx`,
`PeopleDashboard.tsx`, `IntelligenceDashboard.tsx`, `DomainViews.tsx`, etc.) that belong to the
disconnected legacy Vite app (F4/F16) and are not imported by `src/app` (two exceptions found —
`src/components/AboutView.tsx` and `src/components/ProvenanceView.tsx` exist as both a root file and
a `src/components` file, suggesting a partial, incomplete migration — `LD-015`).
**Inbound contract:** every other layer's data via API routes only — never a direct DB import (the
one documented exception is `/api/health`, per `ARCHITECTURE.md` rule 5, itself only verifiable
within the minimal baseline, not the full tree).
**Outbound contract:** none — this is a leaf layer.
**Failure modes:** two parallel UI trees competing for "the" experience layer (F4, F15, F16, LD-015);
an a11y/i18n requirement (Layer 7/T5) satisfied in one tree and not the other.

### Layer 10 — Universality & proof
**Responsibility:** the mechanisms that let anyone — a new engineer, an auditor, a regulator, a
future AI session — verify what the previous nine layers claim, without re-reading all 1,639 files.
This is the layer this Part 00 delivery lives in.
**Owned modules (current, fragmented — F20):** four competing API-spec artifacts (`api-spec.yaml`,
`api-spec.json`, `docs/openapi.yaml`, `docs/api/openapi.json`) plus `scripts/generate-openapi.ts`;
`scripts/test-tenant-isolation.ts`, `test-privacy.ts`, `test-contracts.ts`; and, as of this part,
`docs/EVIDENCE-LEDGER.md` + `scripts/ledger-lint.mjs` as the new, single, machine-checked proof
mechanism this document designates as canonical going forward.
**Inbound contract:** every other layer's claims, in ledger-row form.
**Outbound contract:** `npm run verify` exits 0 only if the ledger is internally consistent and every
`verified` row's proof resolves. This is the release gate for the entire system.
**Failure modes:** F20 (four API specs, no declared canonical one — this layer has the same disease
it exists to cure); a human marking a ledger row `verified` by assertion instead of by running the
proof command (exactly the failure pattern documented in F3–F7) — this is why `ledger-lint.mjs`
checks file existence mechanically rather than trusting the `status` column at face value.

---

## Inter-layer contract summary

```
 1 Truth substrate  --events-->  2 Reasoning core  --beliefs+CI-->  3 Causal engine
        ^                                                                 |
        | (actions as events, T3)                                        v
 6 Autonomous ops  <--recommendations--  5 Strategy/Finance/People  <--structural model-- 4 Digital twin
        |                                        |
        v                                        v
 8 Memory & sensing --(approved facts)--> 1      7 Language layer --sentences--> 9 Experience
                                                                                       |
                                                                                       v
                                                                          10 Universality & proof
                                                                     (verifies claims from all of 1-9)
```

Layer 10 does not sit "above" the others in a control sense — it is the audit layer every other
layer's outputs must pass through before being called `verified`. See `docs/EVIDENCE-LEDGER.md` and
`docs/adr/ADR-0002-evidence-ledger-release-gate.md`.
