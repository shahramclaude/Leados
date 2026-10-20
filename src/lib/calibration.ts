/**
 * calibration.ts — Part 06 section E: fit-then-backtest pipeline.
 *
 * Design of the backtest (documented so results are not mistaken for more
 * than they are):
 *   - Train window: first 90 days of history.
 *   - Test window: last 90 days ("the past 2 quarters" relative to the
 *     180-day fixture) — held out entirely from fitting.
 *   - The test-window `loadRatio` (demand/capacity) trajectory is treated
 *     as a KNOWN planning input (organizations generally know their
 *     intended backlog/demand ahead of time); the backtest asks "given the
 *     realized demand trajectory, did the fitted dynamics model correctly
 *     predict workload-pressure proxies (overtime, defects, backlog
 *     growth)?" — it does NOT attempt to forecast demand itself. That is a
 *     separate, harder problem out of scope for this pass (see
 *     docs/SIMULATION.md "What we deliberately did not do").
 *   - Naive baseline: persistence — repeat the last training-window value
 *     for the entire test window.
 *   - Scoring: MAE (point) and CRPS (distributional, via a noise ensemble
 *     built from the SAME measurement-noise model used to generate the
 *     fixture — documented as a modeling choice, not a magic trick: a real
 *     deployment would estimate this noise from repeated measurements).
 *
 * This file also reports Brooks's-law coefficient recovery error against
 * the known synthetic ground truth, which is the strongest calibration
 * honesty check available before Part 01 ships real telemetry.
 */
import { getWorkloadPressureSeries, type SyntheticHistoryGroundTruth } from "@/lib/bitemporal";
import { fitOrgODEParameters, type OrgPhysicsCalibration } from "@/lib/orgPhysics";
import { backtestKpi, type KpiBacktestRow } from "@/lib/metricsEngine";
import { createRng } from "@/lib/prng";
import type { WorkloadPressureSample } from "@/lib/calibrationTypes";

export interface ParamRecoveryRow {
  param: string;
  trueValue: number;
  fittedValue: number;
  absoluteError: number;
  relativeErrorPct: number;
}

export interface CalibrationReport {
  calibration: OrgPhysicsCalibration;
  trainDays: [number, number];
  testDays: [number, number];
  backtest: KpiBacktestRow[];
  backtestBeatsNaiveCount: number;
  backtestTotalKpis: number;
  parameterRecovery?: ParamRecoveryRow[];
  generatedAt: string;
}

const TRAIN_END_DAY = 90;
const ENSEMBLE_SIZE = 80;
const MEASUREMENT_NOISE = { overtime: 0.35, defect: 0.006, backlog: 0.01 };

function splitTrainTest(history: WorkloadPressureSample[]) {
  const train = history.filter((h) => h.day < TRAIN_END_DAY);
  const test = history.filter((h) => h.day >= TRAIN_END_DAY);
  return { train, test };
}

function simulateForwardEnsemble(
  calibration: OrgPhysicsCalibration,
  trainTailByTeam: Map<string, { burnout: number; quality: number; debt: number }>,
  testByTeam: Map<string, WorkloadPressureSample[]>,
  seedRoot: string,
): { overtime: number[][]; defect: number[][]; backlog: number[][]; days: number } {
  const teams = [...testByTeam.keys()];
  const testLen = testByTeam.get(teams[0])?.length ?? 0;
  const overtime: number[][] = Array.from({ length: testLen }, () => []);
  const defect: number[][] = Array.from({ length: testLen }, () => []);
  const backlog: number[][] = Array.from({ length: testLen }, () => []);

  for (let e = 0; e < ENSEMBLE_SIZE; e++) {
    const rng = createRng(seedRoot).substream(`ensemble#${e}`);
    for (const teamId of teams) {
      const tail = trainTailByTeam.get(teamId)!;
      let burnout = tail.burnout;
      let quality = tail.quality;
      let debt = tail.debt;
      const testSeries = testByTeam.get(teamId)!;
      for (let i = 0; i < testSeries.length; i++) {
        const sample = testSeries[i];
        const pressure = Math.max(0, sample.loadRatio - 1);
        const slack = Math.max(0, 1 - sample.loadRatio);
        const p = calibration.params;
        burnout = Math.max(0, Math.min(1, burnout + p.kAccum * pressure - p.kRecover * slack * burnout));
        quality = Math.max(p.qualityFloor, Math.min(1, quality - p.kQualityDegrade * pressure * (quality - p.qualityFloor) + p.kQualityRecover * slack * (1 - quality)));
        debt = Math.max(0, debt + p.kDebtAccum * pressure - p.kDebtPayoff * slack * debt);

        const ot = Math.max(0, calibration.measurementModel.overtimeScale * burnout + rng.normal(0, MEASUREMENT_NOISE.overtime));
        const df = Math.max(0, calibration.measurementModel.defectScale * (1 - quality) + rng.normal(0, MEASUREMENT_NOISE.defect));
        const bl = Math.max(0, debt + rng.normal(0, MEASUREMENT_NOISE.backlog));

        overtime[i].push(ot);
        defect[i].push(df);
        backlog[i].push(bl);
      }
    }
  }
  return { overtime, defect, backlog, days: testLen };
}

export async function runCalibrationAndBacktest(seedRoot = "leados-calibration-v1"): Promise<CalibrationReport> {
  const history = await getWorkloadPressureSeries();
  const { train, test } = splitTrainTest(history);
  const calibration = fitOrgODEParameters(train);

  const teams = [...new Set(history.map((h) => h.teamId))];
  const trainTailByTeam = new Map<string, { burnout: number; quality: number; debt: number }>();
  const testByTeam = new Map<string, WorkloadPressureSample[]>();

  // Re-derive the latent state at the end of training by rolling the fitted
  // ODE forward across the training window (we never observe burnout
  // directly — only through the noisy proxies — so this is the model's own
  // best estimate of the end-of-train latent state, which is exactly what
  // a real forecaster would have to work with too).
  for (const teamId of teams) {
    const teamTrain = train.filter((h) => h.teamId === teamId).sort((a, b) => a.day - b.day);
    let burnout = 0.1;
    let quality = 0.95;
    let debt = 0.05;
    for (const sample of teamTrain) {
      const pressure = Math.max(0, sample.loadRatio - 1);
      const slack = Math.max(0, 1 - sample.loadRatio);
      const p = calibration.params;
      burnout = Math.max(0, Math.min(1, burnout + p.kAccum * pressure - p.kRecover * slack * burnout));
      quality = Math.max(p.qualityFloor, Math.min(1, quality - p.kQualityDegrade * pressure * (quality - p.qualityFloor) + p.kQualityRecover * slack * (1 - quality)));
      debt = Math.max(0, debt + p.kDebtAccum * pressure - p.kDebtPayoff * slack * debt);
    }
    trainTailByTeam.set(teamId, { burnout, quality, debt });
    testByTeam.set(teamId, test.filter((h) => h.teamId === teamId).sort((a, b) => a.day - b.day));
  }

  const ensemble = simulateForwardEnsemble(calibration, trainTailByTeam, testByTeam, seedRoot);

  // Actuals + naive baseline, pooled across teams aligned by test-day-index.
  const testLen = ensemble.days;
  const actualOvertime: number[] = [];
  const actualDefect: number[] = [];
  const actualBacklog: number[] = [];
  const naiveOvertime: number[] = [];
  const naiveDefect: number[] = [];
  const naiveBacklog: number[] = [];

  for (let i = 0; i < testLen; i++) {
    for (const teamId of teams) {
      const teamTrain = train.filter((h) => h.teamId === teamId).sort((a, b) => a.day - b.day);
      const lastTrain = teamTrain[teamTrain.length - 1];
      const teamTest = testByTeam.get(teamId)!;
      const sample = teamTest[i];
      if (!sample) continue;
      actualOvertime.push(sample.overtimeHours);
      actualDefect.push(sample.defectRate);
      actualBacklog.push(sample.backlogGrowth);
      naiveOvertime.push(lastTrain.overtimeHours);
      naiveDefect.push(lastTrain.defectRate);
      naiveBacklog.push(lastTrain.backlogGrowth);
    }
  }

  // Flatten ensemble (already indexed by test-day across all teams
  // interleaved in the same order as the actual/naive arrays above) —
  // rebuild per-day-per-team ensembles to align 1:1.
  const perPointEnsembleOvertime: number[][] = [];
  const perPointEnsembleDefect: number[][] = [];
  const perPointEnsembleBacklog: number[][] = [];
  for (let i = 0; i < testLen; i++) {
    for (let t = 0; t < teams.length; t++) {
      // ensemble arrays were built by iterating teams inside each ensemble
      // member for a fixed day i, so values for all teams at day i are
      // concatenated per ensemble member. We reconstruct per (day, team)
      // ensembles by re-simulating would be wasteful; instead we built
      // `ensemble.overtime[i]` as length ENSEMBLE_SIZE * teams.length
      // already (see simulateForwardEnsemble loop order: team outer loop
      // inside each ensemble member) — slice out this team's stride.
      const stride = teams.length;
      const vals = ensemble.overtime[i].filter((_, idx) => idx % stride === t);
      perPointEnsembleOvertime.push(vals);
      perPointEnsembleDefect.push(ensemble.defect[i].filter((_, idx) => idx % stride === t));
      perPointEnsembleBacklog.push(ensemble.backlog[i].filter((_, idx) => idx % stride === t));
    }
  }

  const backtest: KpiBacktestRow[] = [
    backtestKpi("overtimeHours", perPointEnsembleOvertime, naiveOvertime, actualOvertime),
    backtestKpi("defectRate", perPointEnsembleDefect, naiveDefect, actualDefect),
    backtestKpi("backlogGrowth", perPointEnsembleBacklog, naiveBacklog, actualBacklog),
  ];

  return {
    calibration,
    trainDays: [0, TRAIN_END_DAY],
    testDays: [TRAIN_END_DAY, Math.max(...history.map((h) => h.day)) + 1],
    backtest,
    backtestBeatsNaiveCount: backtest.filter((b) => b.beatsNaive).length,
    backtestTotalKpis: backtest.length,
    generatedAt: new Date().toISOString(),
  };
}

/** Compare fitted params against known synthetic ground truth (sandbox-only honesty check). */
export function scoreParameterRecovery(calibration: OrgPhysicsCalibration, truth: SyntheticHistoryGroundTruth): ParamRecoveryRow[] {
  const pairs: Array<[string, number, number]> = [
    ["kAccum", truth.kAccum, calibration.params.kAccum],
    ["kRecover", truth.kRecover, calibration.params.kRecover],
    ["kQualityDegrade", truth.kQualityDegrade, calibration.params.kQualityDegrade],
    ["kQualityRecover", truth.kQualityRecover, calibration.params.kQualityRecover],
    ["kDebtAccum", truth.kDebtAccum, calibration.params.kDebtAccum],
    ["kDebtPayoff", truth.kDebtPayoff, calibration.params.kDebtPayoff],
    ["brooksCoefficient", truth.brooksCoefficient, calibration.params.brooksCoefficient],
  ];
  return pairs.map(([param, trueValue, fittedValue]) => ({
    param,
    trueValue,
    fittedValue,
    absoluteError: Math.abs(trueValue - fittedValue),
    relativeErrorPct: trueValue !== 0 ? (Math.abs(trueValue - fittedValue) / Math.abs(trueValue)) * 100 : NaN,
  }));
}
