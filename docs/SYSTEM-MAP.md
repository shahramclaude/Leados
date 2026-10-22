# System Map — LEADOS runtime view

This is the sensing → truth → reasoning → decision → action → learning view
of the product, with the module that owns each link. "Owns" means: this is
the file you change if this link is wrong.

```
 SENSING                 TRUTH                  REASONING              DECISION / ACTION         LEARNING
 (raw input)         (stored record)        (scored interpretation)    (human-triggered)       (belief update)

 metrics POST    ->  metrics table      ->  computeFitnessScore()  ->  dashboard display    ->  fitnessScores
 (api/metrics)        (db/schema.ts)        (lib/fitness.ts)           (app/page.tsx)             snapshot
                                                                                                   (api/fitness)

 assuranceChecks ->  assurance_checks  ->  summarizeAssurance()   ->  dashboard + alert     ->  engines.status
 POST                 table                 (lib/assurance.ts via      banner (app/page.tsx)      updated
 (api/assurance)                            lib/assuranceData.ts)                                (api/assurance)

 chaos experiment ->  chaos_experiments ->  applyChaosToRisk()     ->  "Run chaos            ->  risks.beliefScore
 POST                  table                (lib/chaos.ts)              experiment" form           updated
 (api/chaos)                                                            (ActionForm)               (api/chaos)

 entities POST    ->  entities table    ->  runConsolidation()     ->  "Run consolidation"   ->  consolidationRuns
 (api/entities)                             (lib/consolidation.ts)     form -> board pack         + boardPacks
                                                                        (ActionForm)                (api/consolidation)

 voc POST         ->  voc_feedback      ->  rankVocThemes() +      ->  dashboard theme       ->  vocFeedback
 (api/voc)             table                suggestStrategyLink()      ranking + linked           .linkedStrategyId
                                             (lib/voc.ts)                strategy display

 process events   ->  process_events    ->  computeAutomationScore()->  dashboard preview +  ->  automationScores
 POST                  table                (lib/automation.ts)        "Persist score" form        snapshot
 (api/process-mining)                                                  (ActionForm)                (api/automation-score)
```

## Reading this map

1. **Sensing is always a POST to an `/api/*` route.** There is no background
   ingestion job in this build — every table is populated either by the seed
   script (`scripts/seed.mjs`) or by a human/API caller. This is a named gap,
   not an oversight: see `docs/EVIDENCE-LEDGER.md` ("Autonomous closed-loop
   action").
2. **Truth is a Postgres row**, defined once in `src/db/schema.ts`. There is
   exactly one schema file; nothing is modeled twice.
3. **Reasoning is a pure function in `src/lib/*.ts`** with no side effects and
   no database access (except `src/lib/assuranceData.ts` and
   `src/lib/dashboard.ts`, which are explicitly the DB-reading orchestration
   layer, not business logic). Every reasoning function has a unit test with
   the same name pattern (`*.test.ts`) in the same folder.
4. **Decision/action is a human clicking a button** (`src/components/ActionForm.tsx`)
   that calls the same API route a script or external system could call.
   There is no autonomous trigger in this build.
5. **Learning is a persisted row** that changes what the next read of "truth"
   sees — a fitness snapshot, an updated risk belief, a new board pack, a
   new strategy link, a new automation score. This is what makes each arrow
   in the diagram above a real, closed loop rather than a one-way read.

## What is NOT on this map (by design, this session)

- A scheduler / cron that runs these POSTs automatically.
- An identity layer that attributes which human (or system) triggered an
  action (see `docs/RED-TEAM-FINAL.md` #26, audit log gap).
- Any inference step that produces a *new* metric, risk, or theme from raw
  unstructured input (e.g. an LLM reading a support ticket and proposing a
  theme) — `theme` and `sentiment` are supplied by the caller in this build,
  not inferred. This is the most important thing a board member or an
  engineer should both understand is still missing; see
  `docs/LEADOS-VISION.md`.
