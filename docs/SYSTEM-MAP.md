# LEADOS System Map

> Scope: this is a map of the code that actually exists in this repository as of
> this session. It is deliberately **not** a map of a fictional 56-part prior
> system — no such code or docs existed here before this session.

## 1. Runtime architecture

```
index.html
 └─ src/main.tsx                 → mounts <App/>
     └─ src/App.tsx              → AppStateProvider + Shell (Sidebar/TopBar/Router)
         ├─ src/context/AppStateContext.tsx   (crisis mode, attention budget)
         ├─ src/components/
         │    ├─ Sidebar.tsx     (nav, crisis-aware filtering)
         │    ├─ TopBar.tsx      (module title, attention meter, crisis banner)
         │    └─ ui.tsx          (Card, Badge, EvidenceTag, ProgressBar, StatTile)
         ├─ src/data/mockData.ts (single source of mock content for every module)
         ├─ src/types.ts         (shared domain types)
         └─ src/modules/*.tsx    (17 views, one per nav item)
```

No backend, no network calls, no persistence layer exist. All state is in-memory
React state; a full page reload resets everything to the mock defaults. This is
disclosed, not hidden (see Evidence Ledger L10–L12).

## 2. Module inventory (17)

| Module | File | Primary seam concern it demonstrates |
|---|---|---|
| Dashboard | `modules/Dashboard.tsx` | Cross-module rollup; crisis-aware copy |
| Conversation | `modules/ConversationalAssistant.tsx` | Draft → Review → Commit gate |
| Coaching | `modules/Coaching.tsx` | Data wall vs. evaluation |
| Collective Intelligence | `modules/CollectiveIntelligence.tsx` | Dissent preservation |
| Time Analytics | `modules/TimeAnalytics.tsx` | Self-ownership of personal data |
| Ethics Flags | `modules/EthicsFlags.tsx` | Decision-flow gating, no skip-stage path |
| Crisis Mode | `modules/CrisisMode.tsx` | Whole-product coherent degradation |
| Proactive Drafts | `modules/ProactiveDrafts.tsx` | Attention budget, no auto-send |
| Org/Spatial View | `modules/SpatialView.tsx` | Spatial/semantic view parity |
| Industry Benchmarks | `modules/IndustryBenchmarks.tsx` | Evidence-class tagging of external figures |
| Recommender | `modules/Recommender.tsx` | Honesty lint, visible failure |
| Leader State | `modules/LeaderState.tsx` | Self-scoped, not shared upward/outward |
| Legal Drafts | `modules/LegalDrafts.tsx` | Human confirmation gate |
| Reorg Simulator | `modules/ReorgSimulator.tsx` | Human Impact Ledger paired with cost |
| Board Readiness | `modules/BoardReadiness.tsx` | Completeness gating before "ready" label |
| Algorithm Registry | `modules/AlgorithmRegistry.tsx` | Central inventory of all scoring mechanisms |
| Evidence Ledger | `modules/EvidenceLedgerView.tsx` | In-app mirror of the honesty record |

## 3. Data flow

All modules import from the single `src/data/mockData.ts`. There is exactly one
`orgTree` object, one `ledgerClaims` array, etc. — this is deliberate: it is what
makes the "spatial/semantic parity" and "one source of truth" seam claims
checkable by reading one file, not by trusting prose.

## 4. State ownership

| State | Owner | Scope |
|---|---|---|
| `crisisMode` | `AppStateContext` | Global (affects Sidebar, TopBar, Dashboard) |
| `attentionBudget` | `AppStateContext` | Global, decremented only by explicit user "send" actions |
| Chat gate (`draft/review/committed`) | `ConversationalAssistant` local state | Local to that module/session |
| Legal draft confirmation | `LegalDrafts` local state | Local |
| Board checklist | `BoardReadiness` local state | Local |
| Ethics case stage, drafts, benchmarks, registry | Read-only from `mockData.ts` | N/A (no mutation UI — intentionally, these represent governance records a demo UI should not let a user silently alter) |

## 5. Known seams and their current disposition

This is the "seam audit" requested in the brief, scored against the code that
actually exists (not against a hypothetical 56-part history):

| Seam | Status | Where enforced |
|---|---|---|
| Adaptive UI cannot change content | N/A — no adaptive UI exists yet | Ledgered as `planned` |
| Conversation commits through the same gates | ✅ Implemented | `ConversationalAssistant.tsx` state machine |
| Coaching data walled from evaluation | ✅ Implemented (UI-level assertion + structural separation, no shared data import) | `Coaching.tsx`, `mockData.ts` has no cross-reference |
| Collective intelligence preserves dissent | ✅ Implemented | `CollectiveIntelligence.tsx` |
| Time analytics self-owned | ✅ Implemented (UI-level; no export control exists to test against) | `TimeAnalytics.tsx` |
| Ethics red flags on decision flow | ✅ Implemented | `EthicsFlags.tsx` kanban, no skip-stage transition in data |
| Crisis mode degrades the whole product coherently | ✅ Implemented | `AppStateContext` + `Sidebar`/`TopBar`/`Dashboard` |
| Proactive drafts respect attention budget | ✅ Implemented | `AppStateContext.spendAttention`, `ProactiveDrafts.tsx` |
| Spatial views have semantic equivalents | ✅ Implemented | `SpatialView.tsx` (single data source, two renderers) |
| Industry figures carry evidence classes | ✅ Implemented | `IndustryBenchmarks.tsx`, `BenchmarkFigure.evidenceClass` |
| Recommender passes the same honesty lint | ✅ Implemented (one deliberately-failing example included) | `Recommender.tsx`, `recommendations[2]` |
| Leader-state is self-scoped | ✅ Implemented (UI-level) | `LeaderState.tsx` |
| Legal drafts human-confirmed | ✅ Implemented | `LegalDrafts.tsx` checkbox-gated Finalize button |
| Reorg sims carry human-impact ledgers | ✅ Implemented | `ReorgSimulator.tsx` — cost and impact render in the same card set |
| Board completeness checks active | ✅ Implemented | `BoardReadiness.tsx` |
| Algorithmic registry complete | ✅ Implemented for the 5 mechanisms referenced in this UI | `AlgorithmRegistry.tsx` |

"✅ Implemented" above means: implemented and observable in this UI as a
real, runnable client-side behavior. None of it means "backed by a production
backend, auth, or persistence" — see Evidence Ledger for that distinction.
