/**
 * orgPhysics.ts — Part 06 section B: fitting + simulation wrapper around
 * `orgODE.ts`.
 *
 * Two responsibilities:
 *   1. `fitOrgODEParameters(history)` — calibrate the six dynamics rate
 *      constants against observed proxy signals (overtime hours, defect
 *      rate, backlog growth) using coordinate-descent least squares, and
 *      the Brooks's-law coefficient against throughput-per-person vs team
 *      size via OLS. Reports goodness-of-fit (R²) per channel so the
 *      caller can judge calibration quality instead of trusting it blindly.
 *   2. `simulateOrgPhysics(...)` — run the fitted (or default) ODE forward
 *      for a given horizon under a load/capacity/team-size schedule,
 *      producing a full daily trace for scenario studio charts.
 */
import {
  DEFAULT_ORG_ODE_PARAMS,
  OrgODEParams,
  OrgODEState,
  brooksOverhead,
  initialOrgODEState,
  stepOrgODE,
} from "@/lib/orgODE";
import { SYNTHETIC_MEASUREMENT_MODEL, WorkloadPressureSample } from "@/lib/calibrationTypes";
import { minimizeCoordinateDescent, ols } from "@/lib/stats";

export interface FitChannelReport {
  r2: number;
  n: number;
}

export interface OrgPhysicsCalibration {
  params: OrgODEParams;
  provenance: "fitted" | "default";
  fitDiagnostics?: {
    objectiveValue: number;
    channels: {
      overtime: FitChannelReport;
      defect: FitChannelReport;
      backlog: FitChannelReport;
    };
    brooks: FitChannelReport & { coefficient: number };
    sampleSize: number;
    teamsUsed: string[];
  };
  measurementModel: { overtimeScale: number; defectScale: number };
}

/**
 * Fit ODE rate constants + Brooks coefficient against a workload-pressure
 * history (see `bitemporal.getWorkloadPressureSeries`). Falls back to
 * documented defaults (provenance: "default") if too little history is
 * available (< 20 daily samples) rather than pretending to calibrate on
 * noise.
 */
export function fitOrgODEParameters(
  history: WorkloadPressureSample[],
  measurementModel = SYNTHETIC_MEASUREMENT_MODEL,
): OrgPhysicsCalibration {
  if (history.length < 20) {
    return {
      params: DEFAULT_ORG_ODE_PARAMS,
      provenance: "default",
      measurementModel,
    };
  }

  const byTeam = new Map<string, WorkloadPressureSample[]>();
  for (const s of history) {
    const arr = byTeam.get(s.teamId) ?? [];
    arr.push(s);
    byTeam.set(s.teamId, arr);
  }
  for (const arr of byTeam.values()) arr.sort((a, b) => a.day - b.day);

  function simulateProxies(params: OrgODEParams) {
    const predicted: { overtime: number[]; defect: number[]; backlog: number[] } = {
      overtime: [],
      defect: [],
      backlog: [],
    };
    const actual: { overtime: number[]; defect: number[]; backlog: number[] } = {
      overtime: [],
      defect: [],
      backlog: [],
    };
    for (const arr of byTeam.values()) {
      let burnout = 0.1;
      let quality = 0.95;
      let debt = 0.05;
      for (const sample of arr) {
        const pressure = Math.max(0, sample.loadRatio - 1);
        const slack = Math.max(0, 1 - sample.loadRatio);
        burnout = Math.max(
          0,
          Math.min(1, burnout + params.kAccum * pressure - params.kRecover * slack * burnout),
        );
        quality = Math.max(
          params.qualityFloor,
          Math.min(
            1,
            quality -
              params.kQualityDegrade * pressure * (quality - params.qualityFloor) +
              params.kQualityRecover * slack * (1 - quality),
          ),
        );
        debt = Math.max(0, debt + params.kDebtAccum * pressure - params.kDebtPayoff * slack * debt);

        predicted.overtime.push(measurementModel.overtimeScale * burnout);
        predicted.defect.push(measurementModel.defectScale * (1 - quality));
        predicted.backlog.push(debt);
        actual.overtime.push(sample.overtimeHours);
        actual.defect.push(sample.defectRate);
        actual.backlog.push(sample.backlogGrowth);
      }
    }
    return { predicted, actual };
  }

  function objective(x: number[]): number {
    const params: OrgODEParams = {
      kAccum: x[0],
      kRecover: x[1],
      kQualityDegrade: x[2],
      kQualityRecover: x[3],
      kDebtAccum: x[4],
      kDebtPayoff: x[5],
      brooksCoefficient: DEFAULT_ORG_ODE_PARAMS.brooksCoefficient,
      qualityFloor: DEFAULT_ORG_ODE_PARAMS.qualityFloor,
    };
    const { predicted, actual } = simulateProxies(params);
    let sse = 0;
    for (let i = 0; i < predicted.overtime.length; i++) {
      sse += ((predicted.overtime[i] - actual.overtime[i]) / 8) ** 2;
      sse += ((predicted.defect[i] - actual.defect[i]) / 0.3) ** 2;
      sse += ((predicted.backlog[i] - actual.backlog[i]) / 1) ** 2;
    }
    return sse;
  }

  const bounds: Array<[number, number]> = [
    [0.001, 1],
    [0.001, 1],
    [0.001, 1],
    [0.001, 1],
    [0.001, 2],
    [0.001, 1],
  ];
  const initial = [0.15, 0.1, 0.2, 0.08, 0.25, 0.08];
  const result = minimizeCoordinateDescent(initial, bounds, objective, {
    rounds: 7,
    stepsPerDim: 16,
  });

  const fittedParams: OrgODEParams = {
    kAccum: result.params[0],
    kRecover: result.params[1],
    kQualityDegrade: result.params[2],
    kQualityRecover: result.params[3],
    kDebtAccum: result.params[4],
    kDebtPayoff: result.params[5],
    brooksCoefficient: DEFAULT_ORG_ODE_PARAMS.brooksCoefficient, // overwritten below
    qualityFloor: DEFAULT_ORG_ODE_PARAMS.qualityFloor,
  };

  const { predicted, actual } = simulateProxies(fittedParams);
  const r2Of = (p: number[], a: number[]) => ols(p, a).r2;

  // Brooks's-law coefficient: fit via OLS on
  //   throughputPerPerson / (6 * (1 - 0.5*pressure)) = 1 - c * (pairs/n)
  const xs: number[] = [];
  const ys: number[] = [];
  for (const arr of byTeam.values()) {
    for (const sample of arr) {
      if (sample.teamSize <= 1) continue;
      const pressure = Math.max(0, sample.loadRatio - 1);
      const denom = 6 * (1 - 0.5 * pressure);
      if (denom <= 0) continue;
      const yRatio = sample.throughputPerPerson / denom;
      const pairsOverN = (sample.teamSize * (sample.teamSize - 1)) / 2 / sample.teamSize;
      xs.push(pairsOverN);
      ys.push(1 - yRatio);
    }
  }
  const brooksFit = ols(xs, ys); // ys ≈ c * xs  (intercept should be ~0)
  const brooksCoefficient = Math.max(0, brooksFit.slope);

  fittedParams.brooksCoefficient = brooksCoefficient;

  return {
    params: fittedParams,
    provenance: "fitted",
    measurementModel,
    fitDiagnostics: {
      objectiveValue: result.value,
      channels: {
        overtime: { r2: r2Of(predicted.overtime, actual.overtime), n: predicted.overtime.length },
        defect: { r2: r2Of(predicted.defect, actual.defect), n: predicted.defect.length },
        backlog: { r2: r2Of(predicted.backlog, actual.backlog), n: predicted.backlog.length },
      },
      brooks: { r2: brooksFit.r2, n: xs.length, coefficient: brooksCoefficient },
      sampleSize: history.length,
      teamsUsed: [...byTeam.keys()],
    },
  };
}

export interface PhysicsScheduleDay {
  day: number;
  inflow: number;
  rawCapacity: number;
  teamSize: number;
  interruptionLoad: number;
  onboardingRampFactor: number;
}

export interface PhysicsTraceDay {
  day: number;
  load: number;
  burnout: number;
  quality: number;
  debt: number;
  throughput: number;
  effectiveCapacity: number;
  commOverheadFraction: number;
  schedulePressure: number;
}

/** Run the ODE forward across a day-by-day schedule, returning a full trace. */
export function simulateOrgPhysics(
  schedule: PhysicsSchedule,
  params: OrgODEParams,
): PhysicsTraceDay[] {
  if (schedule.length === 0) return [];
  let state: OrgODEState = initialOrgODEState(schedule[0].teamSize, schedule[0].rawCapacity);
  const trace: PhysicsTraceDay[] = [];
  for (const day of schedule) {
    const out = stepOrgODE({
      state,
      inflow: day.inflow,
      rawCapacity: day.rawCapacity,
      teamSize: day.teamSize,
      interruptionLoad: day.interruptionLoad,
      onboardingRampFactor: day.onboardingRampFactor,
      params,
    });
    state = out.state;
    trace.push({
      day: day.day,
      load: state.load,
      burnout: state.burnout,
      quality: state.quality,
      debt: state.debt,
      throughput: out.throughput,
      effectiveCapacity: out.effectiveCapacity,
      commOverheadFraction: out.commOverheadFraction,
      schedulePressure: out.schedulePressure,
    });
  }
  return trace;
}

export type PhysicsSchedule = PhysicsScheduleDay[];

export { brooksOverhead };
