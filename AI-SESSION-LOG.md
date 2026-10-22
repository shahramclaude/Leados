# AI Session Log

## Part 28 — Process Intelligence (mining / conformance / queueing / automation ROI)

**Repository:** https://github.com/shahramclaude/Leados
**Depends on:** Part 01 (event store), Part 06 (work-system model / twin), Part 10 (capability registry)

### What this session found (Phase 0)

The sandbox snapshot of the repo at the start of this session contained only the bare
`nextjs-postgresql-template` scaffold — `src/db/schema.ts` was an empty placeholder,
and none of `src/lib/portfolioMath.ts`, `optimizer.ts`, `loadBalancer.ts`,
`workQueue*`, a Part 01 event store, or a Part 06 work-system model were present.
This was confirmed by `list_files`/`grep_files` before any writes (see files-read
list in the PR description below). Rather than guess at APIs for modules that
don't exist in this checkout, Part 28 ships:

1. Its own minimal, explicitly-labelled event-store table (`process_events`)
   shaped like what Part 01's correlationId/entity-chain model implies, so the
   mining pipeline has something real to read.
2. Minimal local stand-ins for the EWMA utility (Part 04) and the control
   chart (Part 13), clearly commented as "replace with the shared module once
   it lands in this repo".
3. A minimal capacity/"twin" stand-in for ROI projection (Part 06), and a
   `automation_proposals` draft table as the hand-off point for Part 10's
   capability registry.

This is documented in-code (top-of-file comments in `src/db/schema.ts` and
each `src/lib/processMining/*.ts` file) and in the Findings table delivered in
chat, so nobody mistakes these stand-ins for the real upstream modules.

### What was built (Phases 1–3)

- `src/lib/processMining/*` — case reconstruction (with honest degradation on
  overlapping/shared correlation ids), directly-follows graph discovery with a
  Heuristics-Miner-lite frequency/dependency filter (+ incremental merge for
  streaming updates), conformance checking split into **mined** (statistical
  rarity, never auto-fails a case) vs **declared** (rule violations only),
  waiting-time bottleneck decomposition with root-cause heuristics, queueing
  analytics with Little's-Law cross-validation, aggregate-safe bus-factor
  scoring (k=3 anonymity), `Explain<T>`-wrapped automation scoring, and an
  operational metrics + control-chart layer.
- `src/app/api/process-mining/*` — seed, processes, overview, cases,
  conformance, automation, automation/propose.
- `src/app/process-mining/*` — Process X-Ray, Bottleneck Board, Conformance
  Explorer, Automation ROI, plus an Overview landing page. Every surface
  renders the mandatory "discovered, not designed" provenance banner.
- `scripts/verify.ts` — the Phase 4 gate suite (planted-bottleneck recall/
  precision, seeded-deviation detection, Little's Law delta, automation
  score fixture check, 100k-event performance timing). Run via
  `npx tsx scripts/verify.ts`. **Not** wired as `npm run verify` because this
  session's platform policy prohibits editing `package.json` directly; see
  the note at the top of `scripts/verify.ts`.

### Verification performed this session

- `npx tsx scripts/verify.ts` → all gates PASS (see VERIFICATION LOG in the
  chat delivery for full output).
- `npx eslint .` → clean (0 errors, 0 warnings) after two small fixes
  (lazy localStorage initializer instead of setState-in-effect; removed a
  stale eslint-disable comment).
- `npx next typegen`, `npm exec tsc -- --noEmit`, `npm run build` → all pass.
- `npx drizzle-kit push` → applied the 5 new tables to the local Postgres
  instance.
- `build_and_start` → preview boots, `/api/health` returns `{ok:true}`,
  manually exercised `/api/process-mining/seed`, `/overview`, `/automation`,
  `/conformance` against the live server and confirmed correct output.

### Honesty notes carried into the UI/API copy

- Mined-model conformance is always labelled "statistical" and never flips a
  case to non-conformant by itself (over-standardization guard, verified by
  an explicit test in `scripts/verify.ts`).
- Automation scores whose `ruleBasedFraction`/`errorRate` were never
  instrumented are marked `confidence: "estimated"` with an explicit
  surfaced note; the UI shows an amber "estimated inputs — directional only"
  badge rather than presenting all scores as equally trustworthy.
- Case-reconstruction ambiguity (overlapping starts, shared correlation ids)
  is surfaced as a count on the Overview page, not silently resolved.

### Known limitations (deliberately not done — see Phase 5 in the PR)

- No full inductive-miner / Petri-net with places and silent transitions —
  the discovery engine is a heuristics-miner-lite DFG filter.
- No true full-history streaming recompute for conformance/bottlenecks/
  queueing — only the discovered-model DFG edges support incremental merge;
  the rest are batch-recomputed per request against whatever events are
  currently in `process_events`.
- No real Part 06 twin simulation of cross-step capacity reallocation — the
  ROI projection only reallocates a step's own freed hours into its own
  volume.
