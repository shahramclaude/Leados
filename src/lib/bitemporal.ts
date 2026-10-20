/**
 * bitemporal.ts — Part 01 seam (STAND-IN).
 *
 * The real Leados Part 01 owns the canonical bitemporal event store and its
 * `asOf(...)` query surface. This file reproduces the minimal subset of that
 * contract needed by Part 06 so the digital twin can be built, calibrated
 * and tested in this sandbox without Part 01's actual code present:
 *
 *   - `recordEvent(...)`      append an immutable fact with a validity window
 *   - `asOf(date, filter)`    read the world as it was known to be true at
 *                             `date` (valid-time), ignoring later corrections
 *   - `getServiceTimeSamples` derive historical stage-duration samples used
 *                             to fit the discrete-event model's service-time
 *                             distributions (Part 06 section A)
 *
 * HONESTY NOTE: because no real production event stream exists yet in this
 * sandbox, `seedSyntheticHistory()` deterministically generates a labelled
 * **synthetic calibration fixture** (clearly tagged `synthetic: true` in
 * every row's payload) so that the fitting/backtesting pipeline in
 * `orgPhysics.ts` / `calibration.ts` has something real to run against and
 * so its numbers are reproducible. Swap in real Part 01 event data by
 * pointing `getServiceTimeSamples`/`getCapacitySeries` at the production
 * `org_events` table — the query shape does not need to change.
 */
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { orgEvents } from "@/db/schema";
import { createRng } from "@/lib/prng";
import type {
  StageDurationSample,
  SyntheticHistoryGroundTruth,
  WorkloadPressureSample,
} from "@/lib/calibrationTypes";
import { SYNTHETIC_MEASUREMENT_MODEL } from "@/lib/calibrationTypes";

export type { StageDurationSample, SyntheticHistoryGroundTruth, WorkloadPressureSample };
export { SYNTHETIC_MEASUREMENT_MODEL };

export type EntityType = "agent" | "work_item" | "team";

export interface OrgEventPayload {
  [key: string]: unknown;
  synthetic?: boolean;
}

export interface RecordEventInput {
  entityType: EntityType;
  entityId: string;
  eventType: string;
  payload: OrgEventPayload;
  validFrom: Date;
  validTo?: Date | null;
}

export async function recordEvent(input: RecordEventInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(orgEvents).values({
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: input.eventType,
    payload: input.payload,
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
  });
  return id;
}

/** Read every event whose valid-time window covers `date` (bitemporal "as of"). */
export async function asOf(date: Date, entityType?: EntityType) {
  const conditions = [
    lte(orgEvents.validFrom, date),
    or(isNull(orgEvents.validTo), gte(orgEvents.validTo, date)),
  ];
  if (entityType) conditions.push(eq(orgEvents.entityType, entityType));
  return db
    .select()
    .from(orgEvents)
    .where(and(...conditions))
    .orderBy(asc(orgEvents.validFrom));
}

/**
 * Historical stage-duration samples, used by `simulation.ts` to fit
 * lognormal service-time distributions per stage/skill. Reads from the
 * event log directly (no caching) — callers should cache via
 * `forecastCache.ts` if calling repeatedly.
 */
export async function getServiceTimeSamples(): Promise<StageDurationSample[]> {
  const rows = await db
    .select()
    .from(orgEvents)
    .where(eq(orgEvents.eventType, "stage_duration_observed"));
  return rows.map((r) => {
    const p = r.payload as Record<string, unknown>;
    return {
      stage: String(p.stage ?? "active") as StageDurationSample["stage"],
      hours: Number(p.hours ?? 0),
      skill: String(p.skill ?? "general"),
      synthetic: Boolean(p.synthetic),
    };
  });
}

/** Historical daily org-physics observations used to fit `orgODE.ts`. */
export async function getWorkloadPressureSeries(): Promise<WorkloadPressureSample[]> {
  const rows = await db
    .select()
    .from(orgEvents)
    .where(eq(orgEvents.eventType, "daily_workload_observed"))
    .orderBy(asc(orgEvents.validFrom));
  return rows.map((r) => {
    const p = r.payload as Record<string, unknown>;
    return {
      day: Number(p.day ?? 0),
      teamId: String(p.teamId ?? "team-1"),
      loadRatio: Number(p.loadRatio ?? 1),
      overtimeHours: Number(p.overtimeHours ?? 0),
      defectRate: Number(p.defectRate ?? 0),
      backlogGrowth: Number(p.backlogGrowth ?? 0),
      teamSize: Number(p.teamSize ?? 1),
      throughputPerPerson: Number(p.throughputPerPerson ?? 0),
      synthetic: Boolean(p.synthetic),
    };
  });
}

/**
 * Deterministically generate and persist a synthetic-but-labelled history
 * fixture (idempotent-ish: callers typically run this once via the seed
 * script). All rows carry `payload.synthetic = true`.
 *
 * Ground-truth generative parameters are returned alongside so that
 * `orgPhysics.ts`'s fitting routine can be scored against known values
 * (recovered-vs-true parameter error), which is the calibration honesty
 * check required by the standing order ("fit, don't guess — show fitted
 * values and goodness-of-fit").
 */
export async function seedSyntheticHistory(
  seed = "leados-synthetic-history-v1",
  days = 180,
): Promise<SyntheticHistoryGroundTruth> {
  const rng = createRng(seed);
  const truth: SyntheticHistoryGroundTruth = {
    kAccum: 0.18,
    kRecover: 0.12,
    kQualityDegrade: 0.22,
    kQualityRecover: 0.08,
    kDebtAccum: 0.3,
    kDebtPayoff: 0.1,
    brooksCoefficient: 0.009,
    serviceTimeMuByStage: { backlog: 1.1, active: 2.1, review: 0.9, done: 0 },
    serviceTimeSigmaByStage: { backlog: 0.5, active: 0.6, review: 0.4, done: 0 },
  };

  const events: RecordEventInput[] = [];
  const base = new Date("2025-01-06T00:00:00Z");
  const teams = ["team-1", "team-2"];

  // Measurement-model constants: overtimeHours and defectRate are NOISY
  // PROXIES of the latent burnout/quality states (we never observe burnout
  // or quality directly — only instrumented signals correlated with them).
  // These scale constants are treated as *known sensor calibration*, kept
  // separate from the dynamics parameters that `orgPhysics.ts` fits.
  const OVERTIME_SCALE = 8; // hours of overtime per unit of burnout index, at nominal capacity=1
  const DEFECT_SCALE = 0.3; // defect-rate units per unit of (1 - quality)
  const MEASUREMENT_NOISE = { overtime: 0.35, defect: 0.006, backlog: 0.01, throughput: 0.25 };

  for (const teamId of teams) {
    let burnout = 0.1;
    let quality = 0.95;
    let debt = 0.05;
    let teamSize = teamId === "team-1" ? 5 : 8;
    for (let day = 0; day < days; day++) {
      // Demand oscillates with a crunch period around days 60-90 to create
      // an identifiable signal for the fitting routine.
      const crunch = day >= 60 && day <= 90 ? 1.35 : 1.0;
      const capacity = teamSize * 6; // hours/day effective capacity
      const demand = capacity * (0.75 + 0.3 * Math.sin(day / 11) * 0.3 + (crunch - 1));
      const loadRatio = demand / capacity;
      const pressure = Math.max(0, loadRatio - 1);
      const slack = Math.max(0, 1 - loadRatio);

      // True latent dynamics (ground truth parameters) — NOT observed directly.
      burnout = Math.max(
        0,
        Math.min(1, burnout + truth.kAccum * pressure - truth.kRecover * slack * burnout),
      );
      quality = Math.max(
        0.4,
        Math.min(
          1,
          quality -
            truth.kQualityDegrade * pressure * (1 - quality) +
            truth.kQualityRecover * slack * (1 - quality),
        ),
      );
      debt = Math.max(0, debt + truth.kDebtAccum * pressure - truth.kDebtPayoff * slack * debt);

      const pairsOverN = (teamSize * (teamSize - 1)) / 2 / teamSize;
      const throughputPerPerson =
        6 * (1 - 0.5 * pressure) * (1 - truth.brooksCoefficient * pairsOverN);

      events.push({
        entityType: "team",
        entityId: teamId,
        eventType: "daily_workload_observed",
        validFrom: new Date(base.getTime() + day * 86400000),
        payload: {
          synthetic: true,
          day,
          teamId,
          loadRatio,
          // Proxy measurements = scale * latent state + sensor noise.
          overtimeHours: Math.max(0, OVERTIME_SCALE * burnout + rng.normal(0, MEASUREMENT_NOISE.overtime)),
          defectRate: Math.max(0, DEFECT_SCALE * (1 - quality) + rng.normal(0, MEASUREMENT_NOISE.defect)),
          backlogGrowth: Math.max(0, debt + rng.normal(0, MEASUREMENT_NOISE.backlog)),
          teamSize,
          throughputPerPerson: Math.max(
            0,
            throughputPerPerson + rng.normal(0, MEASUREMENT_NOISE.throughput),
          ),
        },
      });

      if (day === 100 && teamId === "team-2") teamSize += 2; // mid-stream hire event
    }
  }

  // Stage-duration samples (lognormal ground truth per stage).
  for (const stage of ["backlog", "active", "review"] as const) {
    const mu = truth.serviceTimeMuByStage[stage];
    const sigma = truth.serviceTimeSigmaByStage[stage];
    for (let i = 0; i < 400; i++) {
      const hours = rng.lognormal(mu, sigma);
      events.push({
        entityType: "work_item",
        entityId: `synthetic-${stage}-${i}`,
        eventType: "stage_duration_observed",
        validFrom: new Date(base.getTime() + i * 3600000),
        payload: { synthetic: true, stage, hours, skill: i % 2 === 0 ? "backend" : "frontend" },
      });
    }
  }

  // Chunked insert to keep statement size reasonable.
  const CHUNK = 500;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    await db.insert(orgEvents).values(
      chunk.map((e) => ({
        id: crypto.randomUUID(),
        entityType: e.entityType,
        entityId: e.entityId,
        eventType: e.eventType,
        payload: e.payload,
        validFrom: e.validFrom,
        validTo: e.validTo ?? null,
      })),
    );
  }

  return truth;
}
