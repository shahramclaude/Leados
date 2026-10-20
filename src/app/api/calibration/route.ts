import { NextResponse } from "next/server";
import { db } from "@/db";
import { calibrationReports } from "@/db/schema";
import { desc } from "drizzle-orm";
import { runCalibrationAndBacktest, scoreParameterRecovery } from "@/lib/calibration";
import { seedSyntheticHistory, getWorkloadPressureSeries } from "@/lib/bitemporal";

export const dynamic = "force-dynamic";

/**
 * GET /api/calibration — returns the most recently persisted calibration
 * reports (one per subsystem). If none exist yet, runs the calibration
 * pipeline fresh against whatever history is currently in `org_events`
 * (seed it first via `npm run db:seed` or POST to this route).
 */
export async function GET() {
  const existing = await db.select().from(calibrationReports).orderBy(desc(calibrationReports.generatedAt)).limit(10);
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, source: "persisted", reports: existing });
  }
  const history = await getWorkloadPressureSeries();
  if (history.length === 0) {
    return NextResponse.json({
      ok: true,
      source: "none",
      reports: [],
      message: "No history found. POST to this endpoint to seed a synthetic calibration fixture and run the pipeline.",
    });
  }
  const report = await runCalibrationAndBacktest();
  return NextResponse.json({ ok: true, source: "computed-not-persisted", report });
}

/**
 * POST /api/calibration — (re)seed the synthetic calibration fixture (if
 * `org_events` is empty) and run + persist a fresh calibration/backtest
 * report. Idempotent-ish: seeding only happens if no history exists yet.
 */
export async function POST() {
  let history = await getWorkloadPressureSeries();
  let truth = null;
  if (history.length === 0) {
    truth = await seedSyntheticHistory();
    history = await getWorkloadPressureSeries();
  }
  const report = await runCalibrationAndBacktest();
  const parameterRecovery = truth ? scoreParameterRecovery(report.calibration, truth) : undefined;

  await db.insert(calibrationReports).values({
    id: crypto.randomUUID(),
    subsystem: "org-physics",
    metrics: { ...report, parameterRecovery },
    beatsNaive: report.backtestBeatsNaiveCount > report.backtestTotalKpis / 2,
    notes:
      "Fitted on synthetic calibration fixture (see src/lib/bitemporal.ts seedSyntheticHistory). " +
      "Replace with real Part 01 event history when available — see docs/SIMULATION.md.",
  });

  return NextResponse.json({ ok: true, report, parameterRecovery });
}
