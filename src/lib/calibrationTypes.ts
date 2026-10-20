/**
 * calibrationTypes.ts — pure (no DB, no I/O) types & constants shared
 * between the DB-backed event log (`bitemporal.ts`) and the pure physics
 * fitting code (`orgPhysics.ts`). Split out deliberately so that
 * `orgPhysics.ts` (and anything that imports it, e.g. the Monte Carlo
 * worker thread) never needs a live `DATABASE_URL` just to run a
 * computation on already-loaded-in-memory history.
 */

export interface StageDurationSample {
  stage: "backlog" | "active" | "review" | "done";
  hours: number;
  skill: string;
  synthetic: boolean;
}

export interface WorkloadPressureSample {
  day: number;
  teamId: string;
  loadRatio: number; // load / capacity for that day
  overtimeHours: number; // proxy for workload-pressure accumulation
  defectRate: number; // proxy for quality degradation
  backlogGrowth: number; // proxy for debt accumulation
  teamSize: number;
  throughputPerPerson: number;
  synthetic: boolean;
}

export interface SyntheticHistoryGroundTruth {
  kAccum: number;
  kRecover: number;
  kQualityDegrade: number;
  kQualityRecover: number;
  kDebtAccum: number;
  kDebtPayoff: number;
  brooksCoefficient: number;
  serviceTimeMuByStage: Record<string, number>;
  serviceTimeSigmaByStage: Record<string, number>;
}

/**
 * Measurement-model constants shared with `orgPhysics.ts`'s fitting
 * routine. In a real deployment these would themselves be calibrated
 * (e.g. via a regression of self-reported overtime against HR timesheet
 * data) rather than assumed; here they are fixed and documented so the
 * dynamics-parameter recovery test is well-posed.
 */
export const SYNTHETIC_MEASUREMENT_MODEL = {
  overtimeScale: 8,
  defectScale: 0.3,
};
