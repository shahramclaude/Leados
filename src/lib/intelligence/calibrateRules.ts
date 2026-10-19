// src/lib/intelligence/calibrateRules.ts
//
// Orchestrates ruleCalibration.ts + autoCalibrate.ts across the whole rule
// library to produce the "monthly calibration report per domain" required
// by Part 3 §3, plus the weight-adjustment proposals for human review.
import { applyWeightAdjustment, proposeWeightAdjustment, WeightAdjustmentProposal } from "./autoCalibrate";
import { generateAllCalibrationDatasets, GOLDEN_DATASET_LABEL } from "./goldenDataset";
import { buildCalibrationReport, CalibrationReport } from "./ruleCalibration";
import { DEFAULT_RULES, Rule } from "./ruleEngine";
import type { LabeledPrediction } from "./goldenDataset";

export interface DomainCalibrationReport {
  domain: string;
  periodLabel: string;
  datasetLabel: string;
  generatedAt: string;
  rules: {
    report: CalibrationReport;
    proposal: WeightAdjustmentProposal;
  }[];
  domainBrierScore: number;
  domainExpectedCalibrationError: number;
}

function splitForDrift(predictions: LabeledPrediction[]): { baseline: LabeledPrediction[]; recent: LabeledPrediction[] } {
  const mid = Math.floor(predictions.length / 2);
  return { baseline: predictions.slice(0, mid), recent: predictions.slice(mid) };
}

/** Runs a full calibration cycle over `rules` (defaults to the production
 * rule library) against the golden dataset, grouped into one report per
 * domain — this is what the monthly calibration job and
 * `npm run eval:intelligence` both call. */
export function runCalibrationCycle(
  rules: Rule[] = DEFAULT_RULES,
  periodLabel: string = monthLabel(new Date()),
): DomainCalibrationReport[] {
  const datasets = generateAllCalibrationDatasets();
  const byDomain = new Map<string, Rule[]>();
  for (const rule of rules) {
    byDomain.set(rule.domain, [...(byDomain.get(rule.domain) ?? []), rule]);
  }

  const reports: DomainCalibrationReport[] = [];
  for (const [domain, domainRules] of byDomain.entries()) {
    const ruleEntries = domainRules.map((rule) => {
      const predictions = datasets[rule.id] ?? [];
      const { baseline, recent } = splitForDrift(predictions);
      const report = buildCalibrationReport(rule.id, domain, periodLabel, predictions, { baseline, recent });
      const proposal = proposeWeightAdjustment(rule.id, rule.weight, predictions);
      return { report, proposal };
    });

    const totalSamples = ruleEntries.reduce((sum, e) => sum + e.report.sampleSize, 0);
    const domainBrierScore =
      ruleEntries.reduce((sum, e) => sum + e.report.brierScoreValue * e.report.sampleSize, 0) / (totalSamples || 1);
    const domainExpectedCalibrationError =
      ruleEntries.reduce((sum, e) => sum + e.report.expectedCalibrationErrorValue * e.report.sampleSize, 0) /
      (totalSamples || 1);

    reports.push({
      domain,
      periodLabel,
      datasetLabel: GOLDEN_DATASET_LABEL,
      generatedAt: new Date().toISOString(),
      rules: ruleEntries,
      domainBrierScore,
      domainExpectedCalibrationError,
    });
  }
  return reports;
}

function monthLabel(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Convenience helper mirroring autoCalibrate.applyWeightAdjustment, kept
 * here so callers only need one import when wiring up an approval API
 * route. */
export function approveProposal(proposal: WeightAdjustmentProposal, approvedBy: string) {
  return applyWeightAdjustment(proposal, approvedBy);
}
