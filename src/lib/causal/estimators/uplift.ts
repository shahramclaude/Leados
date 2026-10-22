/**
 * src/lib/causal/estimators/uplift.ts
 * Two-model uplift ("T-learner"): fit separate outcome models on treated and
 * control units, predict per-unit uplift = E[Y|X,T=1] - E[Y|X,T=0], and
 * evaluate ranking quality with a Qini curve + Qini coefficient.
 */
import { olsFit } from "../../mathUtils";

export interface UpliftRow {
  covariates: number[];
  treated: boolean;
  outcome: number; // binary (0/1) conversion or continuous value
}

export interface UpliftResult {
  predictedUplift: number[]; // per-row, row-aligned with input
  qiniCurve: { fractionTargeted: number; incrementalGain: number }[];
  qiniCoefficient: number;
  averageUplift: number;
}

function fitLinearModel(rows: UpliftRow[]): (x: number[]) => number {
  const X = rows.map((r) => [1, ...r.covariates]);
  const y = rows.map((r) => r.outcome);
  const { coef } = olsFit(X, y);
  return (x: number[]) => [1, ...x].reduce((s, v, j) => s + v * coef[j], 0);
}

export function runUplift(rows: UpliftRow[]): UpliftResult {
  const treatedRows = rows.filter((r) => r.treated);
  const controlRows = rows.filter((r) => !r.treated);
  const modelTreated = fitLinearModel(treatedRows);
  const modelControl = fitLinearModel(controlRows);

  const predictedUplift = rows.map((r) => modelTreated(r.covariates) - modelControl(r.covariates));

  // Qini curve: sort units by predicted uplift descending, cumulatively compare
  // treated-conversion-rate-weighted gains vs control, scaled to the control group size (standard Qini normalization).
  const order = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => predictedUplift[b.i] - predictedUplift[a.i]);

  const nT = treatedRows.length || 1;
  const nC = controlRows.length || 1;
  let cumTreatedY = 0;
  let cumTreatedN = 0;
  let cumControlY = 0;
  let cumControlN = 0;
  const qiniCurve: { fractionTargeted: number; incrementalGain: number }[] = [{ fractionTargeted: 0, incrementalGain: 0 }];
  order.forEach(({ r }, idx) => {
    if (r.treated) {
      cumTreatedY += r.outcome;
      cumTreatedN += 1;
    } else {
      cumControlY += r.outcome;
      cumControlN += 1;
    }
    const incrementalGain = cumTreatedY - (cumControlN > 0 ? cumControlY * (cumTreatedN / Math.max(cumControlN, 1)) : 0);
    qiniCurve.push({ fractionTargeted: (idx + 1) / rows.length, incrementalGain });
  });

  // Qini coefficient: area between the model's Qini curve and the random-targeting diagonal.
  const randomEndpoint = (treatedRows.reduce((s, r) => s + r.outcome, 0) / nT - controlRows.reduce((s, r) => s + r.outcome, 0) / nC) * nT;
  let modelArea = 0;
  let randomArea = 0;
  for (let i = 1; i < qiniCurve.length; i++) {
    const dx = qiniCurve[i].fractionTargeted - qiniCurve[i - 1].fractionTargeted;
    modelArea += dx * (qiniCurve[i].incrementalGain + qiniCurve[i - 1].incrementalGain) / 2;
    const randomY0 = randomEndpoint * qiniCurve[i - 1].fractionTargeted;
    const randomY1 = randomEndpoint * qiniCurve[i].fractionTargeted;
    randomArea += dx * (randomY1 + randomY0) / 2;
  }
  const qiniCoefficient = modelArea - randomArea;

  return {
    predictedUplift,
    qiniCurve,
    qiniCoefficient,
    averageUplift: predictedUplift.reduce((s, v) => s + v, 0) / predictedUplift.length,
  };
}
