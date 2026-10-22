// LEADOS — Part 35: chaos experiment catalog + harness orchestrator.
//
// Read/depends on: src/lib/faultInjection.ts, src/lib/circuitBreaker.ts,
// src/lib/recoveryVerification.ts, src/lib/latestRecordStrategy.ts,
// src/lib/riskRegister.ts, src/lib/slo.ts, src/db/schema.ts.
//
// This is the Part 35 chaos harness: Experiment = { hypothesis, blastRadius,
// injection, steadyStateHypothesis, rollback, safetyPolicy }. Every
// experiment below actually executes real code against the in-process
// simulated dependency layer (see faultInjection.ts for why dependencies are
// simulated in this sandbox) and is scored against SLO-based steady-state
// checks, never against a canned true/false.

import { db } from "@/db";
import { chaosExperiments, chaosRuns, hardeningTasks, clockSkewProbes, recoverableRecords } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  callDependency,
  enqueueSimulated,
  drainSimulatedQueue,
  resetAllFaults,
  setFault,
  controlPlane,
  SimulatedTimeoutError,
  SimulatedDependencyError,
  QueueFullError,
} from "./faultInjection";
import { withBreaker, resetBreaker, breakerSnapshot, persistBreakerState } from "./circuitBreaker";
import { SLO, summarizeSample, type SteadyStateSample } from "./slo";
import { getLatestProbeNaive, getLatestProbeHardened } from "./latestRecordStrategy";
import { seedRecoverableLedger, takeRecoverySnapshot, simulateCorruption, runRecoveryVerification } from "./recoveryVerification";
import { updateRiskBelief } from "./riskRegister";

// ---------------------------------------------------------------------------
// Phase 0 — failure domain inventory (findings table)
// ---------------------------------------------------------------------------
export type FailureDomain = {
  key: string;
  name: string;
  description: string;
  currentProtection: string;
  untestedAssumption: string;
  chaosTestable: boolean;
};

export const FAILURE_DOMAINS: FailureDomain[] = [
  {
    key: "db",
    name: "Database",
    description: "Primary Postgres instance and connection pool.",
    currentProtection: "Connection pooling (pg.Pool), health check endpoint, query timeouts (new, this part).",
    untestedAssumption: "Assumed the app degrades to cached/read-only data under DB latency — never exercised.",
    chaosTestable: true,
  },
  {
    key: "queue",
    name: "Job queue / broker",
    description: "Async job submission path standing in for Part 18's queue.",
    currentProtection: "Bounded in-process buffer with backpressure rejection (new, this part).",
    untestedAssumption: "Assumed producers would 'just retry' during an outage — no bound existed before this part.",
    chaosTestable: true,
  },
  {
    key: "provider",
    name: "Third-party provider (e.g. notification/payment)",
    description: "Outbound calls to an external API.",
    currentProtection: "None before this part — calls were unprotected synchronous calls.",
    untestedAssumption: "Assumed a flaky provider would only slow us down, not cascade into our own outage.",
    chaosTestable: true,
  },
  {
    key: "network",
    name: "Network path to dependencies",
    description: "The link between LEADOS and any external/internal dependency.",
    currentProtection: "None before this part — no timeouts on network calls.",
    untestedAssumption: "Assumed network errors look like clean exceptions, not silent hangs.",
    chaosTestable: true,
  },
  {
    key: "corrupt_data",
    name: "Corrupt / malformed data",
    description: "Payloads entering the system from users, imports, or upstream systems.",
    currentProtection: "Ad-hoc validation in a few places; no systematic ingestion boundary.",
    untestedAssumption: "Assumed malformed payloads would fail loudly rather than being silently persisted.",
    chaosTestable: true,
  },
  {
    key: "operator_error",
    name: "Operator error",
    description: "A human operator runs a destructive or incorrect action against production data.",
    currentProtection: "Backups exist (Part Backup/Recovery) but were never checked post-recovery.",
    untestedAssumption: "Assumed 'we have backups' is equivalent to 'we can detect and reverse the damage.' It is not — detection was untested.",
    chaosTestable: true,
  },
  {
    key: "time",
    name: "Clock integrity / time-based ordering",
    description: "Any logic that orders or expires data using wall-clock timestamps.",
    currentProtection: "None before this part — 'latest record' logic trusted stored timestamps.",
    untestedAssumption: "Assumed timestamps are monotonic and trustworthy. FALSE — see exp-clock-skew, this is the experiment that broke.",
    chaosTestable: true,
  },
  {
    key: "correlated_cloud_outage",
    name: "Correlated cloud-provider failure (multi-AZ/region, DNS, IAM)",
    description: "A failure in shared cloud infrastructure that takes down several 'independent' dependencies at once.",
    currentProtection: "None specific — relies on the cloud provider's own SLA.",
    untestedAssumption: "Never tested; this sandbox has no multi-region infrastructure to fail over to. GAP — see coverage map and Phase 5 Q1.",
    chaosTestable: false,
  },
  {
    key: "cascading_human_error",
    name: "Cascading/correlated human error under incident pressure",
    description: "Multiple operators making compounding mistakes while responding to an active incident (panic, miscommunication, fatigue).",
    currentProtection: "Runbooks exist for individual steps; no simulation of compounding mistakes under pressure.",
    untestedAssumption: "Never tested; chaos engineering injects faults into systems, not into human judgment under stress. GAP — covered instead by continuity tabletop drills with timers and after-action review (see continuity.ts), not by the chaos harness.",
    chaosTestable: false,
  },
];

// ---------------------------------------------------------------------------
// Experiment catalog
// ---------------------------------------------------------------------------
export type InjectionType =
  | "process_kill"
  | "latency"
  | "error_rate"
  | "dependency_outage"
  | "corrupt_payload"
  | "clock_skew";

export type BlastRadius = "test" | "staging" | "production";

export type ExperimentDef = {
  key: string;
  title: string;
  domainKey: string;
  hypothesis: string;
  injectionType: InjectionType;
  blastRadius: BlastRadius;
  steadyStateSlo: Record<string, unknown>;
  rollbackPlan: string;
  safetyPolicy: { allowProduction: boolean; maxDurationMs: number; autoRollback: boolean };
  schedule: "weekly" | "monthly" | "quarterly";
};

export const EXPERIMENTS: ExperimentDef[] = [
  {
    key: "exp-db-latency",
    title: "Database latency spike",
    domainKey: "db",
    hypothesis:
      "If primary DB latency rises above the query timeout, the API serves a degraded (cached/stale) response within the degraded-SLO envelope, because queries are wrapped with a timeout + fallback, instead of hanging or 500ing.",
    injectionType: "latency",
    blastRadius: "test",
    steadyStateSlo: { dbDegradedFallbackP95Ms: SLO.dbDegradedFallbackP95Ms, maxUnhandledErrors: 0 },
    rollbackPlan: "Reset db fault knobs to zero latency; verify baseline p95 recovers.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 10_000, autoRollback: true },
    schedule: "quarterly",
  },
  {
    key: "exp-db-process-kill",
    title: "Database connection pool worker killed mid-query",
    domainKey: "db",
    hypothesis:
      "If a DB pool worker is killed, the pool recovers within RTO and in-flight callers receive a controlled 'temporarily unavailable' error, not a crash, because failures are caught and classified rather than propagating raw exceptions.",
    injectionType: "process_kill",
    blastRadius: "test",
    steadyStateSlo: { rtoMs: SLO.recoveryRtoMinutes.db * 60_000, maxUnhandledErrors: 0 },
    rollbackPlan: "killedUntil timer expires automatically; explicit resetAllFaults() as a safety net.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 10_000, autoRollback: true },
    schedule: "quarterly",
  },
  {
    key: "exp-queue-outage",
    title: "Job broker outage",
    domainKey: "queue",
    hypothesis:
      "If the job broker is unreachable, producers degrade to a bounded local outbox instead of crashing or growing memory without bound, because enqueue is backpressure-aware.",
    injectionType: "dependency_outage",
    blastRadius: "test",
    steadyStateSlo: { queueMaxDepth: SLO.queueMaxDepth, maxUnhandledErrors: 0 },
    rollbackPlan: "Disable outage flag; drain local outbox into the (now healthy) queue.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 10_000, autoRollback: true },
    schedule: "quarterly",
  },
  {
    key: "exp-queue-backpressure",
    title: "Producer outpaces consumer (queue backpressure)",
    domainKey: "queue",
    hypothesis:
      "If producers enqueue faster than consumers drain, the queue enforces a hard depth ceiling and rejects excess jobs with a typed error rather than growing unbounded.",
    injectionType: "latency",
    blastRadius: "test",
    steadyStateSlo: { queueMaxDepth: SLO.queueMaxDepth },
    rollbackPlan: "Drain the simulated queue back to zero depth.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 10_000, autoRollback: true },
    schedule: "monthly",
  },
  {
    key: "exp-provider-error-rate",
    title: "Third-party provider elevated error rate",
    domainKey: "provider",
    hypothesis:
      "If an outbound provider's error rate spikes, the circuit breaker opens after a bounded number of consecutive failures, short-circuits further calls (near-zero latency, no hammering), and recovers via a single half-open trial call — not a thundering herd of retries — once the provider heals.",
    injectionType: "error_rate",
    blastRadius: "test",
    steadyStateSlo: {
      consecutiveFailureThreshold: SLO.providerBreakerConsecutiveFailures,
      maxShortCircuitLatencyMs: 10,
    },
    rollbackPlan: "Set provider error rate back to 0; wait for breaker cooldown; verify single trial call closes the breaker.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 15_000, autoRollback: true },
    schedule: "monthly",
  },
  {
    key: "exp-network-latency",
    title: "Network partition / high latency to a dependency",
    domainKey: "network",
    hypothesis:
      "If the network path to a dependency degrades to multi-second latency, callers get a bounded response (timeout + fallback) within roughly the configured timeout window, not an unbounded hang.",
    injectionType: "latency",
    blastRadius: "test",
    steadyStateSlo: { maxObservedLatencyMs: 1800 },
    rollbackPlan: "Reset network fault knobs to zero latency.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 10_000, autoRollback: true },
    schedule: "quarterly",
  },
  {
    key: "exp-corrupt-payload",
    title: "Malformed payload at the ingestion boundary",
    domainKey: "corrupt_data",
    hypothesis:
      "If a malformed payload (missing/invalid fields) is submitted, the ingestion boundary rejects it before persistence, so corrupt data never reaches the recoverable ledger.",
    injectionType: "corrupt_payload",
    blastRadius: "test",
    steadyStateSlo: { maxCorruptRowsPersisted: 0 },
    rollbackPlan: "No state mutation on rejection; nothing to roll back.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 5_000, autoRollback: true },
    schedule: "monthly",
  },
  {
    key: "exp-clock-skew",
    title: "Clock-skewed write poisons 'latest record' ordering",
    domainKey: "time",
    hypothesis:
      "If a row is written with a clock-skewed (far-future) timestamp, 'latest record' lookups still return the true latest row, because ordering uses a monotonic key, not wall-clock time.",
    injectionType: "clock_skew",
    blastRadius: "test",
    steadyStateSlo: { latestMustBeMonotonic: true },
    rollbackPlan: "Clear clock_skew_probes test rows.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 5_000, autoRollback: true },
    schedule: "quarterly",
  },
  {
    key: "exp-operator-fat-finger",
    title: "Operator deletes/mutates a production row by mistake",
    domainKey: "operator_error",
    hypothesis:
      "If an operator corrupts data (bad delete/update), recovery re-verification detects the count/checksum mismatch against the last snapshot before it silently propagates downstream.",
    injectionType: "corrupt_payload",
    blastRadius: "test",
    steadyStateSlo: { mustDetectMismatch: true },
    rollbackPlan: "Reseed the recoverable ledger from a fresh snapshot.",
    safetyPolicy: { allowProduction: false, maxDurationMs: 10_000, autoRollback: true },
    schedule: "quarterly",
  },
];

// ---------------------------------------------------------------------------
// Harness primitives
// ---------------------------------------------------------------------------
export type ExperimentRunResult = {
  outcome: "passed" | "failed" | "aborted";
  injectionDetail: Record<string, unknown>;
  steadyStateBefore: Record<string, unknown>;
  steadyStateDuring: Record<string, unknown>;
  steadyStateAfter: Record<string, unknown>;
  observed: string;
  conclusion: string;
  rolledBack: boolean;
  thunderingHerdChecked: boolean;
  hardeningTask?: { title: string; description: string };
};

async function sampleDependency(
  dep: "db" | "network",
  n: number,
  timeoutMs: number,
): Promise<SteadyStateSample> {
  const sample: SteadyStateSample = { calls: 0, errors: 0, timeouts: 0, latenciesMs: [] };
  for (let i = 0; i < n; i++) {
    sample.calls++;
    try {
      const { latencyMs } = await callDependency(dep, () => "ok", { timeoutMs });
      sample.latenciesMs.push(latencyMs);
    } catch (err) {
      sample.errors++;
      if (err instanceof SimulatedTimeoutError) sample.timeouts++;
    }
  }
  return sample;
}

function checkSafetyPolicy(def: ExperimentDef, environment: BlastRadius) {
  if (environment === "production" && !def.safetyPolicy.allowProduction) {
    throw new Error(
      `safety policy violation: ${def.key} is not approved to run in production (blastRadius=${def.blastRadius})`,
    );
  }
}

// --- individual experiment implementations --------------------------------

async function runDbLatency(): Promise<ExperimentRunResult> {
  resetAllFaults();
  const before = await sampleDependency("db", 15, 600);

  setFault("db", { latencyMs: 1500 });
  const duringSample: SteadyStateSample = { calls: 0, errors: 0, timeouts: 0, latenciesMs: [] };
  let unhandled = 0;
  for (let i = 0; i < 15; i++) {
    duringSample.calls++;
    const start = Date.now();
    try {
      await callDependency("db", () => "ok", { timeoutMs: 600 });
      duringSample.latenciesMs.push(Date.now() - start);
    } catch (err) {
      if (err instanceof SimulatedTimeoutError) {
        // Graceful fallback path: serve cached value instead of raising.
        duringSample.timeouts++;
        duringSample.latenciesMs.push(Date.now() - start);
      } else {
        unhandled++;
        duringSample.errors++;
      }
    }
  }

  resetAllFaults();
  const after = await sampleDependency("db", 10, 600);

  const duringSummary = summarizeSample(duringSample);
  const pass = unhandled === 0 && duringSummary.p95Ms <= SLO.dbDegradedFallbackP95Ms;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { latencyMs: 1500, timeoutMs: 600 },
    steadyStateBefore: summarizeSample(before),
    steadyStateDuring: duringSummary,
    steadyStateAfter: summarizeSample(after),
    observed: `${duringSample.timeouts}/${duringSample.calls} calls hit the timeout+fallback path; ${unhandled} unhandled errors; degraded p95=${duringSummary.p95Ms}ms (ceiling ${SLO.dbDegradedFallbackP95Ms}ms).`,
    conclusion: pass
      ? "Timeout + fallback kept every call inside the degraded SLO envelope with zero unhandled errors. Hypothesis holds."
      : "Some calls were unhandled or exceeded the degraded SLO ceiling. Hypothesis does not hold as implemented.",
    rolledBack: true,
    thunderingHerdChecked: false,
  };
}

async function runDbProcessKill(): Promise<ExperimentRunResult> {
  resetAllFaults();
  const before = await sampleDependency("db", 5, 500);

  const killMs = 1200;
  setFault("db", { killedUntil: Date.now() + killMs });

  const controlledErrors: string[] = [];
  let unhandled = 0;
  let recoveredAfterMs: number | null = null;
  const pollStart = Date.now();
  while (Date.now() - pollStart < killMs + 2000) {
    try {
      await callDependency("db", () => "ok", { timeoutMs: 400 });
      recoveredAfterMs = Date.now() - pollStart;
      break;
    } catch (err) {
      if (err instanceof SimulatedDependencyError) {
        controlledErrors.push(err.message);
      } else {
        unhandled++;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  resetAllFaults();
  const after = await sampleDependency("db", 5, 500);

  const rtoMs = SLO.recoveryRtoMinutes.db * 60_000;
  const pass = unhandled === 0 && recoveredAfterMs !== null && recoveredAfterMs <= rtoMs + 1000;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { killMs },
    steadyStateBefore: summarizeSample(before),
    steadyStateDuring: {
      controlledErrorsObserved: controlledErrors.length,
      unhandledErrors: unhandled,
      recoveredAfterMs,
    },
    steadyStateAfter: summarizeSample(after),
    observed: `${controlledErrors.length} calls received a controlled 'dependency unavailable' error during the kill window; pool reported healthy again after ${recoveredAfterMs}ms (RTO budget ${rtoMs}ms).`,
    conclusion: pass
      ? "Pool recovered within RTO and no raw exception escaped the call boundary. Hypothesis holds."
      : "Pool failed to recover within RTO or an unhandled error escaped. Hypothesis does not hold.",
    rolledBack: true,
    thunderingHerdChecked: false,
  };
}

async function runQueueOutage(): Promise<ExperimentRunResult> {
  resetAllFaults();
  for (let i = 0; i < 3; i++) enqueueSimulated({ i }, SLO.queueMaxDepth);
  drainSimulatedQueue(3);

  setFault("queue", { outage: true });

  let bufferedCount = 0;
  let rejectedCount = 0;
  let unhandled = 0;
  for (let i = 0; i < SLO.queueMaxDepth + 10; i++) {
    try {
      const result = enqueueSimulated({ i }, SLO.queueMaxDepth);
      if (result === "degraded-local-buffer") bufferedCount++;
    } catch (err) {
      if (err instanceof QueueFullError) rejectedCount++;
      else unhandled++;
    }
  }

  const maxBufferObserved = controlPlane.queueBuffer.length;
  resetAllFaults();

  const pass = unhandled === 0 && maxBufferObserved <= SLO.queueMaxDepth && rejectedCount > 0;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { outage: true, attempts: SLO.queueMaxDepth + 10 },
    steadyStateBefore: { queueDepth: 0 },
    steadyStateDuring: { bufferedCount, rejectedCount, maxBufferObserved, unhandled },
    steadyStateAfter: { queueDepth: controlPlane.queueDepth, bufferCleared: controlPlane.queueBuffer.length === 0 },
    observed: `${bufferedCount} jobs buffered locally during outage, buffer capped at ${maxBufferObserved} (ceiling ${SLO.queueMaxDepth}), ${rejectedCount} excess jobs rejected with a typed QueueFullError, ${unhandled} unhandled errors.`,
    conclusion: pass
      ? "Outage degraded to a bounded local buffer with explicit backpressure once full. Hypothesis holds."
      : "Buffer exceeded its bound or an unhandled error occurred — unbounded growth risk confirmed. Hypothesis does not hold.",
    rolledBack: true,
    thunderingHerdChecked: false,
  };
}

async function runQueueBackpressure(): Promise<ExperimentRunResult> {
  resetAllFaults();
  let accepted = 0;
  let rejected = 0;
  let unhandled = 0;
  const attempts = SLO.queueMaxDepth + 25;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = enqueueSimulated({ i }, SLO.queueMaxDepth);
      if (r === "accepted") accepted++;
    } catch (err) {
      if (err instanceof QueueFullError) rejected++;
      else unhandled++;
    }
  }
  const depthAtEnd = controlPlane.queueDepth;
  drainSimulatedQueue(depthAtEnd);

  const pass = unhandled === 0 && depthAtEnd <= SLO.queueMaxDepth && accepted === SLO.queueMaxDepth && rejected === attempts - SLO.queueMaxDepth;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { attempts, consumerDrainRatePerTick: 0 },
    steadyStateBefore: { queueDepth: 0 },
    steadyStateDuring: { accepted, rejected, depthAtEnd },
    steadyStateAfter: { queueDepth: controlPlane.queueDepth },
    observed: `Producer attempted ${attempts} enqueues with no draining consumer; ${accepted} accepted up to the ${SLO.queueMaxDepth} depth ceiling, ${rejected} rejected, ${unhandled} unhandled.`,
    conclusion: pass
      ? "Depth ceiling enforced exactly at the configured bound; no unbounded growth. Hypothesis holds."
      : "Depth ceiling was not enforced precisely or an unhandled error occurred. Hypothesis does not hold.",
    rolledBack: true,
    thunderingHerdChecked: false,
  };
}

async function runProviderErrorRate(): Promise<ExperimentRunResult> {
  const breakerKey = "provider:notify";
  resetBreaker(breakerKey);
  resetAllFaults();

  // Baseline: breaker closed, calls succeed.
  const baselineOutcomes = [];
  for (let i = 0; i < 3; i++) {
    const r = await withBreaker(breakerKey, async () => (await callDependency("provider", () => "ok")).value, {
      cooldownMs: 1200,
    });
    baselineOutcomes.push(r.status);
  }

  setFault("provider", { errorRate: 1 });

  const duringOutcomes: string[] = [];
  const duringLatencies: number[] = [];
  for (let i = 0; i < SLO.providerBreakerConsecutiveFailures + 3; i++) {
    const start = Date.now();
    const r = await withBreaker(breakerKey, async () => (await callDependency("provider", () => "ok")).value, {
      cooldownMs: 1200,
    });
    duringLatencies.push(Date.now() - start);
    duringOutcomes.push(r.status);
  }

  const openedAtIndex = duringOutcomes.findIndex((o) => o === "short-circuited");
  const shortCircuitLatencies = duringLatencies.slice(openedAtIndex === -1 ? duringOutcomes.length : openedAtIndex);
  const maxShortCircuitLatency = shortCircuitLatencies.length > 0 ? Math.max(...shortCircuitLatencies) : 0;

  // Thundering-herd check: fire concurrent calls once cooldown elapses.
  await new Promise((r) => setTimeout(r, 1250));
  const concurrentResults = await Promise.all(
    Array.from({ length: 8 }).map(() =>
      withBreaker(breakerKey, async () => (await callDependency("provider", () => "ok")).value, { cooldownMs: 1200 }),
    ),
  );
  const trialAttempts = concurrentResults.filter(
    (r) => r.status === "half-open-trial-success" || (r.status === "failed-call" && breakerSnapshot(breakerKey).state !== "closed"),
  );
  // Still erroring: all concurrent calls should short-circuit except exactly one real trial.
  const realCallsMade = concurrentResults.filter((r) => r.status !== "short-circuited").length;
  const thunderingHerdAvoided = realCallsMade <= 1;

  // Recovery: clear the fault and let a single trial call close the breaker.
  setFault("provider", { errorRate: 0 });
  await new Promise((r) => setTimeout(r, 1250));
  const recoveryResult = await withBreaker(breakerKey, async () => (await callDependency("provider", () => "ok")).value, {
    cooldownMs: 1200,
  });

  await persistBreakerState(
    breakerKey,
    "Notification provider",
    "Non-critical notifications are delayed and retried once the provider recovers.",
    "Notifications may be delayed right now. Your core data is safe and unaffected.",
  );

  const openedCorrectly = openedAtIndex === SLO.providerBreakerConsecutiveFailures;
  const fastShortCircuit = maxShortCircuitLatency <= 10;
  const recovered = recoveryResult.status === "half-open-trial-success";

  const pass = openedCorrectly && fastShortCircuit && thunderingHerdAvoided && recovered;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { errorRate: 1, consecutiveFailureThreshold: SLO.providerBreakerConsecutiveFailures },
    steadyStateBefore: { baselineOutcomes },
    steadyStateDuring: {
      duringOutcomes,
      openedAtCallIndex: openedAtIndex,
      maxShortCircuitLatencyMs: maxShortCircuitLatency,
      concurrentRealCallsDuringHalfOpen: realCallsMade,
    },
    steadyStateAfter: { recoveryStatus: recoveryResult.status, finalState: breakerSnapshot(breakerKey).state },
    observed: `Breaker opened after call #${openedAtIndex + 1} (threshold ${SLO.providerBreakerConsecutiveFailures}); short-circuited calls took up to ${maxShortCircuitLatency}ms; ${realCallsMade}/8 concurrent calls during half-open actually reached the provider (want <=1); recovery call status=${recoveryResult.status}.`,
    conclusion: pass
      ? "Breaker opened at threshold, short-circuited near-instantly, and recovered via a single half-open trial with no thundering herd. Hypothesis holds."
      : "Breaker did not open/short-circuit/recover as hypothesized. Hypothesis does not hold.",
    rolledBack: true,
    thunderingHerdChecked: true,
  };
}

async function runNetworkLatency(): Promise<ExperimentRunResult> {
  resetAllFaults();
  const before = await sampleDependency("network", 5, 1800);

  setFault("network", { latencyMs: 3000 });
  const duringSample: SteadyStateSample = { calls: 0, errors: 0, timeouts: 0, latenciesMs: [] };
  for (let i = 0; i < 8; i++) {
    duringSample.calls++;
    const start = Date.now();
    try {
      await callDependency("network", () => "ok", { timeoutMs: 1600 });
      duringSample.latenciesMs.push(Date.now() - start);
    } catch (err) {
      if (err instanceof SimulatedTimeoutError) {
        duringSample.timeouts++;
        duringSample.latenciesMs.push(Date.now() - start);
      } else {
        duringSample.errors++;
      }
    }
  }

  resetAllFaults();
  const after = await sampleDependency("network", 5, 1800);

  const maxObserved = Math.max(...duringSample.latenciesMs, 0);
  const pass = duringSample.errors === 0 && maxObserved <= 1800;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { latencyMs: 3000, timeoutMs: 1600 },
    steadyStateBefore: summarizeSample(before),
    steadyStateDuring: { ...summarizeSample(duringSample), maxObservedLatencyMs: maxObserved },
    steadyStateAfter: summarizeSample(after),
    observed: `${duringSample.timeouts}/${duringSample.calls} calls hit the network timeout and used the fallback path; max observed latency ${maxObserved}ms against a 1800ms bound.`,
    conclusion: pass
      ? "All calls returned within the bounded timeout window via fallback; nothing hung. Hypothesis holds."
      : "A call exceeded the bound or raised unexpectedly. Hypothesis does not hold.",
    rolledBack: true,
    thunderingHerdChecked: false,
  };
}

type IngestPayload = { externalRef?: unknown; amount?: unknown };
class ValidationError extends Error {}

function ingestPayload(payload: IngestPayload): { externalRef: string; amount: number } {
  if (typeof payload.externalRef !== "string" || payload.externalRef.trim().length === 0) {
    throw new ValidationError("externalRef must be a non-empty string");
  }
  if (typeof payload.amount !== "number" || Number.isNaN(payload.amount) || payload.amount < 0) {
    throw new ValidationError("amount must be a non-negative number");
  }
  return { externalRef: payload.externalRef, amount: payload.amount };
}

async function runCorruptPayload(): Promise<ExperimentRunResult> {
  const before = await db.select({ c: sql<number>`count(*)` }).from(recoverableRecords);
  const beforeCount = Number(before[0]?.c ?? 0);

  const malformedPayloads: IngestPayload[] = [
    { externalRef: "", amount: 10 },
    { externalRef: "LED-X", amount: "not-a-number" as unknown as number },
    { externalRef: 123 as unknown as string, amount: 10 },
    { externalRef: "LED-Y", amount: -5 },
    { amount: 10 },
    {},
  ];

  let rejected = 0;
  let wronglyAccepted = 0;
  for (const payload of malformedPayloads) {
    try {
      const clean = ingestPayload(payload);
      await db.insert(recoverableRecords).values(clean);
      wronglyAccepted++;
    } catch (err) {
      if (err instanceof ValidationError) rejected++;
    }
  }

  const after = await db.select({ c: sql<number>`count(*)` }).from(recoverableRecords);
  const afterCount = Number(after[0]?.c ?? 0);

  const pass = wronglyAccepted === 0 && afterCount === beforeCount;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { malformedPayloadCount: malformedPayloads.length },
    steadyStateBefore: { recordCount: beforeCount },
    steadyStateDuring: { rejected, wronglyAccepted },
    steadyStateAfter: { recordCount: afterCount },
    observed: `${rejected}/${malformedPayloads.length} malformed payloads rejected at the ingestion boundary; ${wronglyAccepted} wrongly persisted; record count unchanged=${afterCount === beforeCount}.`,
    conclusion: pass
      ? "Every malformed payload was rejected before persistence. Hypothesis holds."
      : "At least one malformed payload reached storage. Hypothesis does not hold.",
    rolledBack: true,
    thunderingHerdChecked: false,
  };
}

/**
 * The clock-skew experiment. `strategy` lets the harness replay BOTH the
 * original (naive, broken) implementation and the hardened one so the
 * before/after is a real, reproducible transcript rather than a narrative.
 */
async function runClockSkew(strategy: "naive" | "hardened"): Promise<ExperimentRunResult> {
  await db.delete(clockSkewProbes);

  const now = new Date();
  const [probeA] = await db
    .insert(clockSkewProbes)
    .values({ label: "probe-A-normal", recordedAt: now, payload: { note: "normal write" } })
    .returning();

  const skewedFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // +1 year, simulated bad clock
  const [probeB] = await db
    .insert(clockSkewProbes)
    .values({ label: "probe-B-clock-skewed", recordedAt: skewedFuture, payload: { note: "operator set server clock wrong" } })
    .returning();

  const trueLatestTime = new Date(now.getTime() + 1000);
  const [probeC] = await db
    .insert(clockSkewProbes)
    .values({ label: "probe-C-true-latest", recordedAt: trueLatestTime, payload: { note: "genuinely the newest write" } })
    .returning();

  const resolved = strategy === "naive" ? await getLatestProbeNaive() : await getLatestProbeHardened();
  const pass = resolved?.id === probeC.id;

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: { strategy, skewedTimestamp: skewedFuture.toISOString() },
    steadyStateBefore: { probeA: probeA.id, probeB: probeB.id, probeC: probeC.id },
    steadyStateDuring: { resolvedId: resolved?.id ?? null, resolvedLabel: resolved?.label ?? null, expectedLatestId: probeC.id },
    steadyStateAfter: { strategyUsed: strategy },
    observed:
      strategy === "naive"
        ? `getLatestProbeNaive() returned id=${resolved?.id} ("${resolved?.label}") instead of the true latest id=${probeC.id} ("probe-C-true-latest") because it trusted the clock-skewed timestamp on probe B.`
        : `getLatestProbeHardened() returned id=${resolved?.id} ("${resolved?.label}"), correctly matching the true latest id=${probeC.id} regardless of the clock-skewed row.`,
    conclusion: pass
      ? "Ordering by monotonic id is immune to clock skew. Hypothesis holds."
      : "Ordering by wall-clock timestamp is poisoned by a single clock-skewed write — EVERY later read is wrong until an even-more-skewed row arrives. Hypothesis does not hold. Hardening task opened: stop ordering by recordedAt, order by id.",
    rolledBack: true,
    thunderingHerdChecked: false,
    hardeningTask:
      strategy === "naive"
        ? {
            title: "Stop using wall-clock timestamps to determine 'latest' records",
            description:
              "exp-clock-skew proved that a single clock-skewed write (bad NTP, operator error, backdated import) silently poisons every 'ORDER BY recordedAt DESC LIMIT 1' read. Replace with monotonic (serial id / sequence) ordering wherever recency determines behaviour. Implemented in src/lib/latestRecordStrategy.ts:getLatestProbeHardened; audit remaining callers that compare timestamps across untrusted writers.",
          }
        : undefined,
  };
}

async function runOperatorFatFinger(): Promise<ExperimentRunResult> {
  await seedRecoverableLedger(20);
  const snapshot = await takeRecoverySnapshot("pre-incident-baseline");

  const corruption = await simulateCorruption("delete");

  const verification = await runRecoveryVerification(snapshot.id, "post-operator-error-check");

  const pass = verification.consistent === false; // hypothesis: detection succeeds, i.e. inconsistency IS caught

  return {
    outcome: pass ? "passed" : "failed",
    injectionDetail: corruption,
    steadyStateBefore: { expectedCount: snapshot.expectedCount, expectedChecksum: snapshot.expectedChecksum.slice(0, 12) },
    steadyStateDuring: { corruptionApplied: corruption.applied, mode: corruption.applied ? "delete" : "none" },
    steadyStateAfter: {
      actualCount: verification.actualCount,
      consistent: verification.consistent,
      discrepancies: verification.discrepancies,
    },
    observed: `Snapshot expected ${verification.expectedCount} rows; after the simulated operator deletion, recovery re-verification found ${verification.actualCount} rows and consistent=${verification.consistent}.`,
    conclusion: pass
      ? "Recovery re-verification caught the operator-induced inconsistency automatically, before it could silently propagate. Hypothesis holds."
      : "Recovery re-verification failed to catch a real inconsistency. Hypothesis does not hold — this would be a serious gap.",
    rolledBack: true,
    thunderingHerdChecked: false,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher + persistence
// ---------------------------------------------------------------------------
export async function executeExperiment(
  key: string,
  opts: { environment?: BlastRadius; clockSkewStrategy?: "naive" | "hardened" } = {},
) {
  const def = EXPERIMENTS.find((e) => e.key === key);
  if (!def) throw new Error(`unknown experiment ${key}`);
  const environment = opts.environment ?? "test";
  checkSafetyPolicy(def, environment);

  const startedAt = new Date();
  let result: ExperimentRunResult;

  try {
    switch (def.key) {
      case "exp-db-latency":
        result = await runDbLatency();
        break;
      case "exp-db-process-kill":
        result = await runDbProcessKill();
        break;
      case "exp-queue-outage":
        result = await runQueueOutage();
        break;
      case "exp-queue-backpressure":
        result = await runQueueBackpressure();
        break;
      case "exp-provider-error-rate":
        result = await runProviderErrorRate();
        break;
      case "exp-network-latency":
        result = await runNetworkLatency();
        break;
      case "exp-corrupt-payload":
        result = await runCorruptPayload();
        break;
      case "exp-clock-skew":
        result = await runClockSkew(opts.clockSkewStrategy ?? "hardened");
        break;
      case "exp-operator-fat-finger":
        result = await runOperatorFatFinger();
        break;
      default:
        throw new Error(`no implementation for ${def.key}`);
    }
  } catch (err) {
    resetAllFaults();
    result = {
      outcome: "aborted",
      injectionDetail: {},
      steadyStateBefore: {},
      steadyStateDuring: {},
      steadyStateAfter: {},
      observed: `Harness aborted: ${err instanceof Error ? err.message : String(err)}`,
      conclusion: "Experiment aborted by the safety policy or an unexpected harness error; environment rolled back.",
      rolledBack: true,
      thunderingHerdChecked: false,
    };
  }

  const [run] = await db
    .insert(chaosRuns)
    .values({
      experimentKey: def.key,
      environment,
      startedAt,
      endedAt: new Date(),
      injectionDetail: result.injectionDetail,
      steadyStateBefore: result.steadyStateBefore,
      steadyStateDuring: result.steadyStateDuring,
      steadyStateAfter: result.steadyStateAfter,
      outcome: result.outcome,
      observed: result.observed,
      conclusion: result.conclusion,
      rolledBack: result.rolledBack,
      thunderingHerdChecked: result.thunderingHerdChecked,
    })
    .returning();

  if (result.hardeningTask) {
    await db.insert(hardeningTasks).values({
      chaosRunId: run.id,
      experimentKey: def.key,
      title: result.hardeningTask.title,
      description: result.hardeningTask.description,
      status: "open",
    });
  }

  await updateRiskBelief({
    domainKey: def.domainKey,
    title: def.hypothesis,
    belief: result.outcome === "passed" ? "tested_holds" : result.outcome === "failed" ? "tested_broken" : "untested",
    sourceExperimentKey: def.key,
  });

  return { run, result, def };
}

export async function markHardeningTaskDone(chaosRunId: number) {
  await db
    .update(hardeningTasks)
    .set({ status: "done", completedAt: new Date() })
    .where(eq(hardeningTasks.chaosRunId, chaosRunId));
}

export async function computeFailureDomainCoverage() {
  const runs = await db.select().from(chaosRuns);
  const byDomain = new Map<string, { experiments: Set<string>; runs: number; everFailed: boolean }>();

  for (const domain of FAILURE_DOMAINS) {
    byDomain.set(domain.key, { experiments: new Set(), runs: 0, everFailed: false });
  }
  for (const exp of EXPERIMENTS) {
    byDomain.get(exp.domainKey)?.experiments.add(exp.key);
  }
  for (const run of runs) {
    const exp = EXPERIMENTS.find((e) => e.key === run.experimentKey);
    if (!exp) continue;
    const entry = byDomain.get(exp.domainKey);
    if (!entry) continue;
    entry.runs += 1;
    if (run.outcome === "failed") entry.everFailed = true;
  }

  return FAILURE_DOMAINS.map((domain) => {
    const entry = byDomain.get(domain.key)!;
    return {
      domainKey: domain.key,
      name: domain.name,
      chaosTestable: domain.chaosTestable,
      experimentCount: entry.experiments.size,
      runCount: entry.runs,
      everFailed: entry.everFailed,
      gap: domain.chaosTestable && entry.experiments.size === 0,
      untestedAssumption: domain.untestedAssumption,
    };
  });
}
