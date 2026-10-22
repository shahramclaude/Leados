// Part 28 — synthetic event-log generators.
//
// Used for (a) demo seeding via /api/process-mining/seed, and (b) the
// deterministic planted-bottleneck / seeded-deviation / steady-state
// benchmark fixtures exercised by scripts/verify.ts. All RNG here is a
// seeded mulberry32 generator so benchmark results are reproducible.
import type { ProcessDefinition, RawEvent } from "./types";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expSample(rand: () => number, meanMs: number): number {
  return -Math.log(1 - rand()) * meanMs;
}

let eventCounter = 0;
function nextEventId(prefix: string): string {
  eventCounter += 1;
  return `${prefix}-evt-${eventCounter.toString(36)}`;
}

export const BENCHMARK_PROCESS_NAME = "benchmark_flow";
export const BENCHMARK_STEPS = ["Intake", "Triage", "Review", "Approve", "Fulfill", "Close"] as const;

export interface BenchmarkWorld {
  events: RawEvent[];
  definition: ProcessDefinition;
  groundTruth: {
    plantedBottlenecks: string[];
    skipCaseIds: string[];
    reorderCaseIds: string[];
    reworkCaseIds: string[];
    illegalTransitionCaseIds: string[];
    cleanCaseIds: string[];
  };
}

/**
 * Builds a small, controlled "world" with:
 *  - a known declared process (Intake -> Triage -> Review -> Approve -> Fulfill -> Close)
 *  - a planted PRIMARY bottleneck at "Approve" (single overloaded resource, long queue)
 *  - a planted SECONDARY bottleneck at "Review" (moderate queue)
 *  - explicit seeded deviations with known case ids, so the conformance
 *    engine's recall can be checked exactly against ground truth.
 */
export function generateBenchmarkWorld(seed = 42): BenchmarkWorld {
  const rand = mulberry32(seed);
  const baseTime = new Date("2025-01-06T08:00:00Z").getTime();
  const events: RawEvent[] = [];

  const definition: ProcessDefinition = {
    processName: BENCHMARK_PROCESS_NAME,
    version: 1,
    steps: [
      { activity: "Intake", mandatory: true, allowedNext: ["Triage"] },
      { activity: "Triage", mandatory: true, allowedNext: ["Review"] },
      { activity: "Review", mandatory: true, allowedNext: ["Approve"] },
      { activity: "Approve", mandatory: true, allowedNext: ["Fulfill"] },
      { activity: "Fulfill", mandatory: true, allowedNext: ["Close"] },
      { activity: "Close", mandatory: true, allowedNext: [] },
    ],
  };

  const resourcesByStep: Record<string, string[]> = {
    Intake: ["intake-bot"],
    Triage: ["agent-a", "agent-b", "agent-c"],
    Review: ["reviewer-x", "reviewer-y"],
    Approve: ["approver-solo"], // single resource -> planted bottleneck + bus-factor risk
    Fulfill: ["fulfil-a", "fulfil-b", "fulfil-c", "fulfil-d"],
    Close: ["system"],
  };

  const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)];

  const CASE_COUNT = 220;
  const skipCaseIds: string[] = [];
  const reorderCaseIds: string[] = [];
  const reworkCaseIds: string[] = [];
  const illegalTransitionCaseIds: string[] = [];
  const cleanCaseIds: string[] = [];

  for (let i = 0; i < CASE_COUNT; i++) {
    const caseId = `BM-${(1000 + i).toString()}`;
    const correlationId = caseId;
    let cursor = baseTime + i * 45 * 60 * 1000 + rand() * 5 * 60 * 1000; // staggered arrivals

    const emit = (activity: string, activeMs: number, queueMs: number, attributes: Record<string, unknown> = {}) => {
      cursor += queueMs;
      events.push({
        eventId: nextEventId(caseId),
        caseId,
        correlationId,
        processName: BENCHMARK_PROCESS_NAME,
        activity,
        resourceId: pick(resourcesByStep[activity]),
        occurredAt: new Date(cursor),
        durationMs: Math.round(activeMs),
        status: "completed",
        attributes,
      });
      cursor += activeMs;
    };

    const variant = i % 11; // deterministic distribution of seeded scenarios

    if (variant === 0 && skipCaseIds.length < 10) {
      // SEEDED DEVIATION: skip mandatory "Triage"
      skipCaseIds.push(caseId);
      emit("Intake", expSample(rand, 4 * 60 * 1000), 0, { ruleBased: true });
      emit("Review", expSample(rand, 20 * 60 * 1000), expSample(rand, 40 * 60 * 1000));
      emit("Approve", expSample(rand, 15 * 60 * 1000), expSample(rand, 5 * 60 * 60 * 1000), { ruleBased: false });
      emit("Fulfill", expSample(rand, 30 * 60 * 1000), expSample(rand, 30 * 60 * 1000), { ruleBased: true });
      emit("Close", 60 * 1000, expSample(rand, 10 * 60 * 1000));
    } else if (variant === 1 && reorderCaseIds.length < 10) {
      // SEEDED DEVIATION: Review and Approve swapped
      reorderCaseIds.push(caseId);
      emit("Intake", expSample(rand, 4 * 60 * 1000), 0, { ruleBased: true });
      emit("Triage", expSample(rand, 8 * 60 * 1000), expSample(rand, 15 * 60 * 1000), { ruleBased: true });
      emit("Approve", expSample(rand, 15 * 60 * 1000), expSample(rand, 4 * 60 * 60 * 1000), { ruleBased: false });
      emit("Review", expSample(rand, 20 * 60 * 1000), expSample(rand, 40 * 60 * 1000));
      emit("Fulfill", expSample(rand, 30 * 60 * 1000), expSample(rand, 30 * 60 * 1000), { ruleBased: true });
      emit("Close", 60 * 1000, expSample(rand, 10 * 60 * 1000));
    } else if (variant === 2 && reworkCaseIds.length < 10) {
      // SEEDED DEVIATION (statistical, not a rule violation): duplicate Review
      reworkCaseIds.push(caseId);
      emit("Intake", expSample(rand, 4 * 60 * 1000), 0, { ruleBased: true });
      emit("Triage", expSample(rand, 8 * 60 * 1000), expSample(rand, 15 * 60 * 1000), { ruleBased: true });
      emit("Review", expSample(rand, 20 * 60 * 1000), expSample(rand, 40 * 60 * 1000));
      emit("Review", expSample(rand, 18 * 60 * 1000), expSample(rand, 20 * 60 * 1000));
      emit("Approve", expSample(rand, 15 * 60 * 1000), expSample(rand, 5 * 60 * 60 * 1000), { ruleBased: false });
      emit("Fulfill", expSample(rand, 30 * 60 * 1000), expSample(rand, 30 * 60 * 1000), { ruleBased: true });
      emit("Close", 60 * 1000, expSample(rand, 10 * 60 * 1000));
    } else if (variant === 3 && illegalTransitionCaseIds.length < 6) {
      // SEEDED DEVIATION: illegal jump straight from Intake to Fulfill
      illegalTransitionCaseIds.push(caseId);
      emit("Intake", expSample(rand, 4 * 60 * 1000), 0, { ruleBased: true });
      emit("Fulfill", expSample(rand, 30 * 60 * 1000), expSample(rand, 20 * 60 * 1000), { ruleBased: true });
      emit("Close", 60 * 1000, expSample(rand, 10 * 60 * 1000));
    } else {
      cleanCaseIds.push(caseId);
      emit("Intake", expSample(rand, 4 * 60 * 1000), 0, { ruleBased: true, errorFlag: rand() < 0.02 });
      emit("Triage", expSample(rand, 8 * 60 * 1000), expSample(rand, 15 * 60 * 1000), {
        ruleBased: true,
        errorFlag: rand() < 0.03,
      });
      // PLANTED SECONDARY BOTTLENECK: Review queue inflated (moderate)
      emit("Review", expSample(rand, 20 * 60 * 1000), expSample(rand, 90 * 60 * 1000), {
        ruleBased: false,
        errorFlag: rand() < 0.04,
      });
      // PLANTED PRIMARY BOTTLENECK: Approve queue heavily inflated + single resource
      emit("Approve", expSample(rand, 15 * 60 * 1000), expSample(rand, 6 * 60 * 60 * 1000), {
        ruleBased: false,
        errorFlag: rand() < 0.06,
      });
      emit("Fulfill", expSample(rand, 30 * 60 * 1000), expSample(rand, 25 * 60 * 1000), {
        ruleBased: true,
        errorFlag: rand() < 0.02,
      });
      emit("Close", 60 * 1000, expSample(rand, 10 * 60 * 1000), { ruleBased: true });
    }
  }

  return {
    events,
    definition,
    groundTruth: {
      plantedBottlenecks: ["Approve", "Review"],
      skipCaseIds,
      reorderCaseIds,
      reworkCaseIds,
      illegalTransitionCaseIds,
      cleanCaseIds,
    },
  };
}

/** Steady-state single-queue (M/M/1-like) world for validating Little's Law numerically. */
export function generateSteadyStateQueueWorld(
  seed = 7,
  arrivals = 4000,
  arrivalRatePerHour = 10,
  serviceRatePerHour = 14,
): RawEvent[] {
  const rand = mulberry32(seed);
  const processName = "steady_state_mm1";
  const meanInterarrivalMs = (60 * 60 * 1000) / arrivalRatePerHour;
  const meanServiceMs = (60 * 60 * 1000) / serviceRatePerHour;

  const events: RawEvent[] = [];
  let arrivalClock = new Date("2025-02-01T00:00:00Z").getTime();
  let serverFreeAt = arrivalClock;

  for (let i = 0; i < arrivals; i++) {
    arrivalClock += expSample(rand, meanInterarrivalMs);
    const serviceStart = Math.max(arrivalClock, serverFreeAt);
    const serviceDuration = expSample(rand, meanServiceMs);
    serverFreeAt = serviceStart + serviceDuration;
    const caseId = `SS-${i}`;

    // "Arrive" is an instantaneous marker; the gap between it ending and
    // "Service" starting is exactly the queue wait the case experienced,
    // which case reconstruction will compute as queueMs on the Service event.
    events.push({
      eventId: nextEventId(caseId),
      caseId,
      correlationId: caseId,
      processName,
      activity: "Arrive",
      resourceId: null,
      occurredAt: new Date(arrivalClock),
      durationMs: 0,
      status: "completed",
      attributes: {},
    });
    events.push({
      eventId: nextEventId(caseId),
      caseId,
      correlationId: caseId,
      processName,
      activity: "Service",
      resourceId: "server-1",
      occurredAt: new Date(serviceStart),
      durationMs: Math.round(serviceDuration),
      status: "completed",
      attributes: {},
    });
  }

  return events;
}

export const LEAD_TO_CLOSE_PROCESS_NAME = "lead_to_close";

/**
 * A second, on-theme (LEADOS = leads) demo dataset for the UI surfaces. Not
 * used by the benchmark gates — purely illustrative seed data with its own
 * organically-forming bottleneck and bus-factor pattern (Proposal Drafting
 * concentrated on one rep) so the X-Ray/Bottleneck/Automation screens have
 * something believable to show besides the benchmark fixture.
 */
export function generateLeadToCloseWorld(seed = 11, caseCount = 260): RawEvent[] {
  const rand = mulberry32(seed);
  const processName = LEAD_TO_CLOSE_PROCESS_NAME;
  const baseTime = new Date("2025-04-01T09:00:00Z").getTime();
  const events: RawEvent[] = [];

  const resourcesByStep: Record<string, string[]> = {
    "Lead Captured": ["web-form", "inbound-call"],
    Qualification: ["sdr-amy", "sdr-ben", "sdr-cleo"],
    "Proposal Drafting": ["ae-dana"], // concentrated -> organic bus-factor risk
    Negotiation: ["ae-dana", "ae-evan"],
    "Contract Signed": ["legal-ops"],
    Closed: ["system"],
  };
  const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)];

  for (let i = 0; i < caseCount; i++) {
    const caseId = `LEAD-${(2000 + i).toString()}`;
    let cursor = baseTime + i * 50 * 60 * 1000 + rand() * 10 * 60 * 1000;

    const emit = (activity: string, activeMs: number, queueMs: number, attributes: Record<string, unknown> = {}) => {
      cursor += queueMs;
      events.push({
        eventId: nextEventId(caseId),
        caseId,
        correlationId: caseId,
        processName,
        activity,
        resourceId: pick(resourcesByStep[activity]),
        occurredAt: new Date(cursor),
        durationMs: Math.round(activeMs),
        status: "completed",
        attributes,
      });
      cursor += activeMs;
    };

    emit("Lead Captured", expSample(rand, 2 * 60 * 1000), 0, { ruleBased: true, errorFlag: rand() < 0.01 });
    emit("Qualification", expSample(rand, 25 * 60 * 1000), expSample(rand, 3 * 60 * 60 * 1000), {
      ruleBased: true,
      errorFlag: rand() < 0.05,
    });

    // ~22% of leads drop off after qualification (do not reach proposal) — a
    // genuine, organically-occurring short path, not an error.
    if (rand() < 0.22) {
      emit("Closed", 60 * 1000, expSample(rand, 60 * 60 * 1000), { outcome: "disqualified" });
      continue;
    }

    emit("Proposal Drafting", expSample(rand, 90 * 60 * 1000), expSample(rand, 8 * 60 * 60 * 1000), {
      ruleBased: false,
      errorFlag: rand() < 0.08,
    });
    emit("Negotiation", expSample(rand, 60 * 60 * 1000), expSample(rand, 20 * 60 * 60 * 1000), {
      ruleBased: false,
      errorFlag: rand() < 0.1,
    });
    emit("Contract Signed", expSample(rand, 15 * 60 * 1000), expSample(rand, 10 * 60 * 60 * 1000), {
      ruleBased: true,
      errorFlag: rand() < 0.02,
    });
    emit("Closed", 60 * 1000, expSample(rand, 2 * 60 * 60 * 1000), { outcome: "won" });
  }

  return events;
}

/** Fast, low-fidelity event generator purely for the 100k-event performance gate. */
export function generateVolumeLog(targetEventCount: number, seed = 99): RawEvent[] {
  const rand = mulberry32(seed);
  const processName = "volume_perf_flow";
  const steps = ["Step1", "Step2", "Step3", "Step4", "Step5"];
  const resources = ["r1", "r2", "r3", "r4", "r5", "r6"];
  const events: RawEvent[] = [];
  const baseTime = new Date("2025-03-01T00:00:00Z").getTime();
  const casesNeeded = Math.ceil(targetEventCount / steps.length);

  for (let i = 0; i < casesNeeded; i++) {
    const caseId = `VOL-${i}`;
    let cursor = baseTime + i * 60 * 1000;
    for (const step of steps) {
      const queueMs = rand() * 5 * 60 * 1000;
      const activeMs = 30_000 + rand() * 120_000;
      cursor += queueMs;
      events.push({
        eventId: nextEventId(caseId),
        caseId,
        correlationId: caseId,
        processName,
        activity: step,
        resourceId: resources[Math.floor(rand() * resources.length)],
        occurredAt: new Date(cursor),
        durationMs: Math.round(activeMs),
        status: "completed",
        attributes: {},
      });
      cursor += activeMs;
    }
  }

  return events.slice(0, targetEventCount);
}
