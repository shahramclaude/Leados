# AI Session Log

## Part 35 — Resilience & Chaos Engineering

**Repository:** https://github.com/shahramclaude/Leados
**Scope:** Chaos experiment framework, operational business continuity, graceful-degradation architecture,
anti-fragility loop, Resilience Lab / Continuity Plans / Degradation Status / Failure-Domain Coverage surfaces.

### Files read before writing (standing order #1)

- `src/lib/resilience.ts`, `stress.ts`, `recovery.ts`, `sustainability.ts`, `backup.ts`, `maintenance.ts` —
  attempted via `glob_files`/`list_files`; **none existed**. The repository snapshot available to this session
  contained only the bare Next.js/Drizzle starter (`src/db/schema.ts` an empty placeholder, `src/app/page.tsx`
  the stock template, `src/app/layout.tsx`, `src/app/api/health/route.ts`, `src/db/index.ts`, config files).
- Part 20's runbooks/SLOs, Part 29's risk register, Part 06's shock models — also searched for and not found.
- Because the dependencies genuinely do not exist in this checkout, this part ships clearly-labelled local
  stand-ins (`src/lib/slo.ts`, `src/lib/riskRegister.ts`, the `CRITICAL_PROCESSES` list in
  `src/lib/continuity.ts`) with inline comments explaining the merge path once the real Part 10/18/20/29/06/12/28
  artifacts land, rather than inventing undocumented content or blocking on files that are not present.

### What was built

1. **Schema** (`src/db/schema.ts`): failure domains, risk register, chaos experiment catalog + run
   transcripts, hardening tasks, circuit breaker state, continuity processes + drills, recovery snapshots +
   verifications, and two small demo tables (`resilience_recoverable_records`, `resilience_clock_skew_probes`)
   that the chaos experiments act on.
2. **Fault injection control plane** (`src/lib/faultInjection.ts`): an in-process simulated dependency layer
   (db/queue/provider/network) supporting all six required injection types (process_kill, latency, error_rate,
   dependency_outage, corrupt_payload, clock_skew). Explicitly documented as a stand-in for real infra that
   does not exist in this codebase yet.
3. **Circuit breakers** (`src/lib/circuitBreaker.ts`): closed/open/half-open state machine with a hard
   single-trial-call guarantee during half-open, to prevent a thundering herd on recovery.
4. **Chaos harness** (`src/lib/resilience.ts`): 9 experiments across 7 chaos-testable failure domains (db x2,
   queue x2, provider x1, network x1, corrupt_data x1, operator_error x1, time x1), each with a real
   hypothesis, real injection, real SLO-based steady-state scoring, automatic rollback, DB-persisted
   transcript, hardening-task creation on failure, and risk-register belief update.
5. **The anti-fragility loop, for real, not narrated**: `exp-clock-skew` is executed against the *original*
   ("naive") latest-record strategy first — **and genuinely fails** — then against the hardened strategy
   built in direct response, which passes. Both runs are persisted with full transcripts.
6. **Recovery re-verification** (`src/lib/recoveryVerification.ts`): checksum + count comparison against a
   pre-incident snapshot; `exp-operator-fat-finger` seeds a ledger, snapshots it, simulates an operator
   deleting a row, and proves the mismatch is caught automatically.
7. **Continuity tooling** (`src/lib/continuity.ts`, `scripts/continuity-drill.ts`): 5 critical operational
   processes with RTO/RPO/workarounds, 4 scripted tabletop scenarios (including the brief's own two examples),
   drill start/complete with timer + after-action + action items, persisted and visible in the UI.
8. **Degradation status** (`src/lib/degradation.ts`): user-facing (not ops-facing) "what works right now" view
   over live circuit-breaker state and fault-injection knobs.
9. **Coverage map** (`computeFailureDomainCoverage` in `src/lib/resilience.ts`): the program's own gap map,
   explicitly naming two domains (correlated cloud outage, cascading human error) as out of chaos-engineering's
   structural reach, with the alternative mitigation stated.
10. **Surfaces**: `/resilience-lab`, `/continuity-plans`, `/degradation-status`, `/failure-domain-coverage`,
    plus a hub homepage, each a Next.js server component with Server Actions for "Run now" / "Run scripted
    dry-run" / "Mark done" interactions, no client-side JS framework needed.
11. **`npm run verify`**: seeds the catalog, runs the full 10-run chaos suite, runs a continuity drill,
    computes coverage, and checks all five Phase-4 gates mechanically — failing experiments (the naive
    clock-skew run) do not fail verify; only meta-gate violations do (e.g., "nothing ever failed" would).

### Honesty notes (standing order #6)

- The clock-skew experiment's naive run is a **real, reported failure** — not simulated as a failure, not
  asserted after the fact. It is the same code path a production bug would have hit, run against real
  Postgres rows with real timestamps.
- `npm run verify` prints an explicit warning if zero experiments fail, because an all-green chaos suite is a
  smell, not an achievement.
- The continuity drill tooling runs a **scripted dry-run**, not a live human tabletop, and says so in the code
  comments, the CLI output, and the UI copy. Its own recorded action items include "run a live version of
  this drill with real participants."
- Phase 5 names concrete things this part deliberately did not do (no production chaos runs, no real external
  infra to inject into, no full-codebase audit for the timestamp-ordering bug class, no feature-level mapping
  on the degradation page, no live tabletop, no scheduler wiring).

### Validation performed this session

- `npx next typegen` — pass
- `npm exec tsc -- --noEmit --pretty false` — pass, zero errors
- `npm run build` — pass (Next.js production build, all routes compiled)
- `npm run verify` — **exit 0**, all 5 gates pass, transcript includes 1 genuine experiment failure
  (`exp-clock-skew:naive`) and its hardening fix
- `build_and_start` — pass, `/api/health` returns `{"ok":true}`; smoke-tested `/`, `/resilience-lab`,
  `/continuity-plans`, `/degradation-status`, `/failure-domain-coverage`, `/api/degradation`,
  `/api/resilience/coverage` all return 200 with expected JSON/HTML.

### Known follow-ups left for later parts (not closed in this session)

- Reconcile `CRITICAL_PROCESSES` / `DRILL_SCENARIOS` against Part 28's real process-mining output once it
  exists.
- Point the fault-injection control plane at Part 18's real queue and any real provider client once they
  exist, instead of the in-process simulation.
- Audit the rest of the codebase for other "ORDER BY timestamp = latest" assumptions beyond the probe table
  built to demonstrate the bug class.
- Build a feature-to-dependency map for `/degradation-status` so messaging is feature-level, not
  component-level.
- Wire `POST /api/resilience/run` into Part 10's real scheduler using each experiment's declared `schedule`.
