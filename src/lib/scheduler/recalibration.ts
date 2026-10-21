// Part 07 seam: monthly recalibration of the flight-risk model. This module
// is designed to be invoked unattended by Part 07's scheduler; it is also
// reachable manually via POST /api/admin/recalibration/run for demo/testing
// purposes. It recalculates calibration-by-decile against REALIZED OUTCOMES
// (attritionOutcomes), never against demographics, and files a report.

import { db } from "@/db";
import { people, attritionOutcomes, calibrationReports } from "@/db/schema";
import { newId } from "../ids";
import { buildFlightRiskFeatures, computeFlightRisk } from "../flightRisk";

export interface CalibrationBucket {
  bucket: string;
  predictedMean: number;
  actualRate: number;
  n: number;
}

export interface CalibrationReport {
  modelName: string;
  periodStart: string;
  periodEnd: string;
  buckets: CalibrationBucket[];
  overallBrierScore: number;
  n: number;
  note: string;
}

export async function runMonthlyRecalibration(periodEnd: Date = new Date()): Promise<CalibrationReport> {
  const periodStart = new Date(periodEnd.getTime() - 90 * 24 * 60 * 60 * 1000);

  const allPeople = await db.select().from(people);
  const outcomes = await db.select().from(attritionOutcomes);
  const outcomeByPerson = new Map(outcomes.map((o) => [o.personId, o]));

  const points: { predicted: number; actual: number }[] = [];
  for (const p of allPeople) {
    const { features, observationCount } = await buildFlightRiskFeatures(p.id, periodStart);
    const explain = computeFlightRisk(features, { asOf: periodStart, observationCount });
    const outcome = outcomeByPerson.get(p.id);
    const leftInWindow =
      !!outcome?.leftAt &&
      new Date(outcome.leftAt) >= periodStart &&
      new Date(outcome.leftAt) <= periodEnd &&
      !!outcome.leftVoluntary;
    points.push({ predicted: explain.value, actual: leftInWindow ? 1 : 0 });
  }

  points.sort((a, b) => a.predicted - b.predicted);
  const bucketCount = 5;
  const buckets: CalibrationBucket[] = [];
  const size = Math.ceil(points.length / bucketCount) || 1;
  for (let i = 0; i < bucketCount; i++) {
    const slice = points.slice(i * size, (i + 1) * size);
    if (slice.length === 0) continue;
    const predictedMean = slice.reduce((s, x) => s + x.predicted, 0) / slice.length;
    const actualRate = slice.reduce((s, x) => s + x.actual, 0) / slice.length;
    buckets.push({
      bucket: `Q${i + 1}`,
      predictedMean: Number(predictedMean.toFixed(3)),
      actualRate: Number(actualRate.toFixed(3)),
      n: slice.length,
    });
  }

  const brier =
    points.length > 0
      ? points.reduce((s, x) => s + (x.predicted - x.actual) ** 2, 0) / points.length
      : 0;

  const report: CalibrationReport = {
    modelName: "flightRisk.v1",
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    buckets,
    overallBrierScore: Number(brier.toFixed(4)),
    n: points.length,
    note:
      "Calibration computed against realized voluntary-attrition outcomes only. Coefficients are NOT re-fit against demographic data under any circumstance (see docs/FAIRNESS.md). This seam is invoked by Part 07's scheduler on a monthly cadence; see /api/admin/recalibration/run for the manual trigger used in tests.",
  };

  await db.insert(calibrationReports).values({
    id: newId("calib"),
    modelName: report.modelName,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    reportJson: report,
  });

  return report;
}
