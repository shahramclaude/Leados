// src/lib/intelligence/fairness/report.ts
//
// Assembles per-people-computation fairness audits into one report. This is
// what `npm run test:fairness` prints, and what a future admin UI would
// render verbatim — gates that fail are reported as failures, not hidden.

import { evaluateDifferenceGate, FAIRNESS_THRESHOLDS, type GateResult } from "./gates";
import {
  calibrationByGroup,
  demographicParityDifference,
  equalizedOddsDifference,
  type CalibrationReport,
  type GroupMetricResult,
  type GroupOutcome,
  type GroupOutcomeLabel,
  type GroupPrediction,
} from "./metrics";

export interface ComputationAudit {
  name: string;
  description: string;
  sampleSizeTotal: number;
  demographicParity: GroupMetricResult;
  dpdGate: GateResult;
  equalizedOdds: (ReturnType<typeof equalizedOddsDifference>) | null;
  eoGate: GateResult | null;
  calibration: CalibrationReport | null;
  calibrationGate: GateResult | null;
}

function calibrationGateFromReport(report: CalibrationReport | null): GateResult | null {
  if (!report) return null;
  const evaluableGroups = report.expectedCalibrationErrorByGroup.filter((g) => g.ece !== null);
  const worst = evaluableGroups.length ? Math.max(...evaluableGroups.map((g) => g.ece as number)) : null;
  return evaluateDifferenceGate(
    "calibration_ece_max_group",
    worst,
    FAIRNESS_THRESHOLDS.calibrationEce,
    report.evaluable && worst !== null,
    report.note,
  );
}

export function auditOutcome(name: string, description: string, rows: GroupOutcome[]): ComputationAudit {
  const dpd = demographicParityDifference(rows);
  return {
    name,
    description,
    sampleSizeTotal: rows.length,
    demographicParity: dpd,
    dpdGate: evaluateDifferenceGate("demographic_parity_difference", dpd.value, FAIRNESS_THRESHOLDS.demographicParityDifference, dpd.evaluable, dpd.note),
    equalizedOdds: null,
    eoGate: null,
    calibration: null,
    calibrationGate: null,
  };
}

export function auditOutcomeWithLabel(name: string, description: string, rows: GroupOutcomeLabel[]): ComputationAudit {
  const dpd = demographicParityDifference(rows);
  const eo = equalizedOddsDifference(rows);
  return {
    name,
    description,
    sampleSizeTotal: rows.length,
    demographicParity: dpd,
    dpdGate: evaluateDifferenceGate("demographic_parity_difference", dpd.value, FAIRNESS_THRESHOLDS.demographicParityDifference, dpd.evaluable, dpd.note),
    equalizedOdds: eo,
    eoGate: evaluateDifferenceGate("equalized_odds_difference", eo.value, FAIRNESS_THRESHOLDS.equalizedOddsDifference, eo.evaluable, eo.note),
    calibration: null,
    calibrationGate: null,
  };
}

export function auditPrediction(name: string, description: string, rows: GroupPrediction[]): ComputationAudit {
  const asOutcome: GroupOutcomeLabel[] = rows.map((r) => ({ group: r.group, outcome: r.predictedProb >= 0.5, label: r.label }));
  const base = auditOutcomeWithLabel(name, description, asOutcome);
  const calibration = calibrationByGroup(rows);
  return { ...base, calibration, calibrationGate: calibrationGateFromReport(calibration) };
}

export interface FairnessReport {
  generatedAt: string;
  thresholds: typeof FAIRNESS_THRESHOLDS;
  computations: ComputationAudit[];
  summary: { pass: number; fail: number; notEvaluated: number };
  overallVerdict: "all-gates-pass" | "some-gates-failed" | "no-gates-evaluable";
}

export function generateFairnessReport(computations: ComputationAudit[], now: Date = new Date()): FairnessReport {
  const gates = computations.flatMap((c) => [c.dpdGate, c.eoGate, c.calibrationGate].filter((g): g is GateResult => g !== null));
  const pass = gates.filter((g) => g.verdict === "pass").length;
  const fail = gates.filter((g) => g.verdict === "fail").length;
  const notEvaluated = gates.filter((g) => g.verdict === "not-evaluated").length;

  let overallVerdict: FairnessReport["overallVerdict"] = "no-gates-evaluable";
  if (pass + fail > 0) overallVerdict = fail === 0 ? "all-gates-pass" : "some-gates-failed";

  return { generatedAt: now.toISOString(), thresholds: FAIRNESS_THRESHOLDS, computations, summary: { pass, fail, notEvaluated }, overallVerdict };
}

export function formatReportAsText(report: FairnessReport): string {
  const lines: string[] = [];
  lines.push(`Fairness report generated ${report.generatedAt}`);
  lines.push(`Thresholds: DPD<=${report.thresholds.demographicParityDifference}, EOD<=${report.thresholds.equalizedOddsDifference}, calibration-ECE<=${report.thresholds.calibrationEce}, min group n=${report.thresholds.minGroupSize}, k-anonymity=${report.thresholds.kAnonymity}`);
  lines.push("");
  for (const c of report.computations) {
    lines.push(`## ${c.name} (n=${c.sampleSizeTotal})`);
    lines.push(`   ${c.description}`);
    lines.push(`   demographic_parity_difference: ${c.demographicParity.value ?? "n/a"} [${c.dpdGate.verdict}] — ${c.demographicParity.note}`);
    lines.push(`     groups: ${c.demographicParity.groups.map((g) => `${g.group}(n=${g.n}${g.rate !== undefined ? `, rate=${g.rate.toFixed(2)}` : ""})`).join(", ")}`);
    if (c.equalizedOdds && c.eoGate) {
      lines.push(`   equalized_odds_difference: ${c.equalizedOdds.value ?? "n/a"} (tpr diff ${c.equalizedOdds.tprDiff ?? "n/a"}, fpr diff ${c.equalizedOdds.fprDiff ?? "n/a"}) [${c.eoGate.verdict}]`);
    }
    if (c.calibration && c.calibrationGate) {
      lines.push(`   calibration_by_group max ECE: ${c.calibrationGate.observed ?? "n/a"} [${c.calibrationGate.verdict}]`);
    }
    lines.push("");
  }
  lines.push(`SUMMARY: ${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.notEvaluated} not evaluated (insufficient sample).`);
  lines.push(`OVERALL: ${report.overallVerdict}`);
  return lines.join("\n");
}
