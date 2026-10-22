# LEADOS — Part 35: Resilience Engineering & Chaos Program

Repository: https://github.com/shahramclaude/Leados
Part: 35 of 41. Depends on Parts 10 (scheduler), 18 (queue), 20 (runbooks/SLOs), 29 (risk register), 06 (shock
models), 12 (playbooks), 28 (process mining).

## 0. Standing-order compliance note (read this first)

Before writing any code, the mandated files were read:

- `src/lib/resilience.ts`, `stress.ts`, `recovery.ts`, `sustainability.ts`, `backup.ts`, `maintenance.ts` —
  **none of these existed in the repository snapshot this part was built against.** The checkout available in
  this sandbox contains only the bare Next.js + Drizzle starter (`src/db/schema.ts` was an empty placeholder,
  `src/app/page.tsx` was the stock template, no `src/lib/` directory existed at all).
- Part 20's runbooks/SLOs, Part 29's risk register, Part 06's shock models — **also absent.** No
  `RUNBOOKS.md`, `SLO.md`, `RISK-REGISTER.md`, or shock-model files were present anywhere in the tree.

**Consequence and decision:** rather than silently inventing content and pretending it came from earlier
parts, this part ships its own clearly-namespaced stand-ins (`src/lib/slo.ts`, `src/lib/riskRegister.ts`,
`src/lib/continuity.ts`'s `CRITICAL_PROCESSES`) with explicit comments at the top of each file stating they
are placeholders for Part 10/18/20/29/06/12/28 and describing the merge path once those parts' real artifacts
exist. This is also why the dependency layer (`src/lib/faultInjection.ts`) simulates the DB pool, queue
broker, provider, and network **in-process** rather than driving real infrastructure — there is no real queue
or provider client in this codebase to fail. Every injection still executes real code (real delays, real
thrown errors, real bounded arrays); only the "remote system" on the other end is a stand-in. This limitation
is treated honestly throughout (see Phase 5, Q4).

## Phase 0 — Discover: failure domains & blast-radius controls

| Domain | Current protection (before this part) | Untested assumption |
|---|---|---|
| Database | Connection pooling only; no query timeout | "App degrades to cached/read-only data under DB latency" — never exercised |
| Queue/broker | None — unbounded assumption | "Producers just retry during an outage" — no bound existed |
| Provider (3rd-party) | None — synchronous unprotected calls | "A flaky provider only slows us down" — no isolation existed |
| Network | None — no timeouts | "Network errors fail loudly" — assumed, not verified |
| Corrupt data | Ad-hoc validation in a few places | "Malformed payloads fail loudly" — no systematic ingestion boundary |
| Operator error | Backups exist (assumed, Part Backup/Recovery) | "We have backups" ≠ "we can detect the damage" — detection untested |
| Clock integrity | None — timestamps trusted | "Timestamps are monotonic and trustworthy" — **FALSE, proven false this part** |
| Correlated cloud outage | Relies on cloud SLA only | Never tested — no multi-region infra in this sandbox to fail over to |
| Cascading human error | Runbooks for individual steps only | Never tested — chaos injects into systems, not judgment |

This table **is** the blast-radius control inventory: everywhere "current protection" says "None", that is a
domain with effectively unlimited blast radius before this part. Phase 3 closes five of those six gaps
(db timeout+fallback, queue backpressure, provider circuit breaker, network timeout+fallback, ingestion
validation, clock-skew ordering fix); the operator-error gap is closed by recovery re-verification, not by
preventing the mistake.

## Phase 1 — Model

### Chaos experiment framework (`src/lib/resilience.ts`)

```
Experiment = {
  key, title, domainKey, hypothesis,           // "if X fails, Y degrades gracefully because Z"
  injectionType,                               // process_kill | latency | error_rate |
                                                // dependency_outage | corrupt_payload | clock_skew
  blastRadius,                                 // test | staging | production
  steadyStateSlo,                              // SLO-based pass/fail criteria (src/lib/slo.ts)
  rollbackPlan,
  safetyPolicy: { allowProduction, maxDurationMs, autoRollback },
}
```

`executeExperiment()` is the harness: checks the safety policy (aborts if `blastRadius=production` and
`safetyPolicy.allowProduction` is not explicitly true — every experiment in this catalog defaults to false),
runs the injection against the fault-injection control plane, measures steady state before/during/after
against the SLO, decides pass/fail **on the hypothesis, not on vibes**, rolls back automatically, persists a
full transcript to `resilience_chaos_runs`, opens a hardening task on failure, and updates
`resilience_risk_register` (an "untested" assumption becomes `tested_holds` or `tested_broken`). Scheduling
(`weekly`/`monthly`/`quarterly` per experiment) is declared on each catalog entry; `POST /api/resilience/run`
is the integration point for Part 10's real scheduler to call.

### Continuity model (`src/lib/continuity.ts`)

Five critical operational processes (`CRITICAL_PROCESSES`, standing in for Part 28's mining) each carry
RTO/RPO and a manual-workaround playbook (standing in for Part 12). Four scripted tabletop scenarios
(`DRILL_SCENARIOS`) match the brief's examples almost verbatim ("key vendor down 2 weeks", "finance system
offline at month-end") plus two LEADOS-specific ones (DB region outage affecting lead sync, on-call
unreachable). `scripts/continuity-drill.ts` and the Continuity Plans UI both drive `startDrill`/`completeDrill`
which record a timer, after-action notes, and action items.

### Graceful-degradation architecture (`src/lib/circuitBreaker.ts`, `src/lib/degradation.ts`)

A generic circuit breaker (closed → open → half-open → closed/open) wraps provider/queue/network calls.
Half-open allows **exactly one** concurrent trial call — this is the anti-thundering-herd guarantee, tested
explicitly in `exp-provider-error-rate` by firing 8 concurrent calls during the half-open window and asserting
at most one actually reaches the simulated dependency. `src/lib/degradation.ts` reads breaker state and fault
knobs and renders a **user-facing** (not ops-facing) status, exposed at `/degradation-status` and
`/api/degradation`.

### Anti-fragility loop

`exp-clock-skew` is run twice by `scripts/chaos-run.ts` and `scripts/verify-resilience.ts`: once against the
original ("naive") `getLatestProbeNaive()` implementation — which **genuinely fails** — and once against the
hardened `getLatestProbeHardened()` produced in direct response to that failure. The failing run opens a row
in `resilience_hardening_tasks`; `markHardeningTaskDone()` closes it once the fix is proven. Schedule decay
(re-run quarterly) is declared per-experiment on the catalog; the failure-domain coverage map
(`/failure-domain-coverage`, `computeFailureDomainCoverage()`) is the program's own coverage metric.

## Phase 2 — Design (surfaces)

- **Resilience Lab** (`/resilience-lab`) — experiment calendar with "Run now" buttons, honest recent-run
  transcripts (collapsible, full JSON of before/during/after), hardening task tracker, risk register view.
- **Continuity Plans** (`/continuity-plans`) — critical processes with RTO/RPO/workaround, drill scenarios
  with a "run scripted dry-run" button, drill history with after-action notes and action items.
- **Degradation Status** (`/degradation-status`) — plain-language, user-facing "what works right now" page.
- **Failure-Domain Coverage** (`/failure-domain-coverage`) — covered / testable-but-uncovered / deliberately
  excluded, explicitly, with reasons.

## Phase 3 — Build (what shipped)

| Item | File(s) |
|---|---|
| Fault injection control plane (6 injection types) | `src/lib/faultInjection.ts` |
| Circuit breakers + half-open single-trial anti-herd logic | `src/lib/circuitBreaker.ts` |
| SLO definitions (Part 20 stand-in) | `src/lib/slo.ts` |
| Chaos experiment catalog + harness orchestrator | `src/lib/resilience.ts` |
| Clock-skew naive vs. hardened strategies | `src/lib/latestRecordStrategy.ts` |
| Recovery re-verification (checksum/count) | `src/lib/recoveryVerification.ts` |
| Local risk register (Part 29 stand-in) | `src/lib/riskRegister.ts` |
| Continuity processes + drill tooling (Parts 12/28 stand-in) | `src/lib/continuity.ts` |
| User-facing degradation status | `src/lib/degradation.ts` |
| Schema | `src/db/schema.ts` |
| CLIs | `scripts/seed-resilience.ts`, `scripts/chaos-run.ts`, `scripts/continuity-drill.ts`, `scripts/verify-resilience.ts` |
| API routes | `src/app/api/resilience/{coverage,run}/route.ts`, `src/app/api/degradation/route.ts` |
| UI | `src/app/{resilience-lab,continuity-plans,degradation-status,failure-domain-coverage}/page.tsx` + `actions.ts` |

## Phase 4 — Measure (gate results)

All six gates are checked mechanically by `scripts/verify-resilience.ts`, which `npm run verify` runs. Full
transcript is in the Verification Log below. Summary:

1. **10 chaos runs executed** (9 experiment keys, clock-skew run twice) — **1 genuine failure**
   (`exp-clock-skew` naive) that produced a real hardening task, later closed after the fix was proven. ✅
2. **Circuit breaker green**: `exp-provider-error-rate` opened at the configured threshold, short-circuited at
   ~0ms, and recovered via exactly one half-open trial call out of 8 concurrent attempts (no thundering herd). ✅
3. **Continuity tabletop drill completed** with after-action items recorded (both the CLI dry-run and the
   verify-run dry-run produce real DB rows with real action items). ✅
4. **Recovery re-verification caught a seeded inconsistency**: `exp-operator-fat-finger` deletes a row after a
   snapshot is taken; `runRecoveryVerification` reports `consistent:false` with `countDelta:-1` and
   `checksumMismatch:true`. ✅
5. **Failure-domain coverage map published with gaps explicitly listed**: `correlated_cloud_outage` and
   `cascading_human_error` are listed as deliberately excluded from chaos coverage, with the reason and the
   alternative mitigation named (see Phase 5, Q1). ✅
6. **`npm run verify` exits 0.** ✅ (see Verification Log)

## Phase 5 — Attack

**1. What can chaos engineering structurally not test here, and how is it covered instead?**
Two domains are marked `chaosTestable: false` in `FAILURE_DOMAINS` and excluded from the chaos harness on
purpose, not by oversight:
- *Correlated cloud-provider failure* (a shared dependency — DNS, IAM, a whole AZ/region — taking down several
  "independent" systems at once). Chaos injection here simulates one dependency at a time failing; it cannot
  fabricate genuine infrastructure correlation without real multi-region infrastructure, which does not exist
  in this sandbox. Covered instead by: documenting the assumption in the coverage map as a standing risk, and
  by continuity planning (RTO/RPO + manual workarounds) that does not assume any particular failure is
  isolated — the invoicing and payments workaround playbooks work whether one system or five are down.
- *Cascading/correlated human error under incident pressure* (panic, miscommunication, fatigue compounding
  mistakes). You cannot inject "operator makes a worse decision because they're stressed" into a function
  call. This is covered instead by the **continuity tabletop drills** — timed, scripted, with mandatory
  after-action capture — which exercise human decision-making directly rather than pretending code-level
  fault injection can stand in for it.

**2. Where does degradation mislead users rather than inform them?**
`/degradation-status` currently reports **per-dependency** status (db / provider:notify), not **per-feature**
status. A user reading "Notification provider: degraded" has to infer for themselves whether that means their
invoice email will be late (true) or their login will fail (false — unrelated). This is a real design gap:
the honest fix is a feature-to-dependency map so the page says "Email receipts may be delayed" instead of
naming an internal component. That map does not exist yet — flagged here rather than silently shipped as if
it were feature-level. A second, subtler way it could mislead: the "operational" status for a dependency with
**zero** persisted breaker row (never tripped, never even called in this process) looks identical to a
dependency that is actively healthy after thousands of successful calls. We do not currently distinguish
"never exercised" from "exercised and healthy", which overstates confidence for undertested paths.

**3. What did the first chaos run break — and what did that teach?**
The very first full run of `scripts/chaos-run.ts` against `exp-clock-skew` broke the "latest record" lookup:
`getLatestProbeNaive()` (ordering by `recordedAt DESC`) returned a clock-skewed row that was inserted as a
simulated operator/NTP mistake, instead of the row that was genuinely written most recently. Transcript (also
in the Verification Log): `getLatestProbeNaive() returned id=2 ("probe-B-clock-skewed") instead of the true
latest id=3 ("probe-C-true-latest")`. The lesson generalizes well beyond this one probe table: **any** "latest
record wins" logic that orders by a client- or server-supplied wall-clock timestamp is one bad clock away from
being permanently wrong, silently, with no exception thrown anywhere. The fix — order by the database's own
monotonic sequence (`id`), never by a timestamp whose origin you don't fully control — was applied in
`src/lib/latestRecordStrategy.ts:getLatestProbeHardened` and the hardening task is tracked end-to-end in
`resilience_hardening_tasks`. The honest coverage note: this part only checked the one table built for this
experiment; a real audit of every `ORDER BY <timestamp column>` in the existing codebase was **not** performed
(see Q4) — that is exactly the kind of systemic follow-up a single contained chaos experiment should trigger
but cannot itself complete.

**4. What did we deliberately NOT do?**
- Did not run any experiment with `blastRadius=production` — every `safetyPolicy.allowProduction` is `false`.
  Nothing in this part should be read as "safe to chaos-test production LEADOS" without a separate review.
- Did not inject faults into real infrastructure (no real queue broker, no real third-party API, no real
  network layer exists in this snapshot to attack) — injections run against an in-process simulated
  dependency layer. The behaviours proven (backpressure math, breaker state machine, timeout+fallback,
  validation-before-persistence, monotonic ordering) are real and portable, but "the simulated queue degrades
  gracefully" is not the same claim as "Part 18's real broker does," until Part 18 exists and this harness is
  pointed at it.
- Did not perform a full-codebase audit for other `ORDER BY <timestamp>` "latest wins" bugs beyond the probe
  table built to demonstrate the class of bug — flagged as a concrete follow-up hardening task, not closed.
  Did not implement a feature-level mapping for the degradation status page (see Q2) — dependency-level only.
- Did not run a live, human-facilitated tabletop drill — the drill tooling runs a scripted, timed dry-run of
  itself and records plausible-but-synthetic after-action notes, explicitly labelled as such in both the code
  comments and the UI copy. A real drill with real process owners is one of the drill's own recorded action
  items.
- Did not wire `/api/resilience/run` into a real scheduler — Part 10 does not exist in this snapshot, so the
  route is built and documented as the integration point, not auto-invoked on a cron.

## Running it

```bash
npm run seed:resilience   # idempotent: failure domains, experiment catalog, risk register baseline, continuity processes
npm run chaos:run         # full chaos suite with printed transcripts (includes the naive-then-hardened clock-skew pair)
npm run drill:run -- finance-system-offline-month-end   # one scripted tabletop dry-run
npm run verify             # typecheck + seed + full gate check, exits non-zero on a real gate failure
```
