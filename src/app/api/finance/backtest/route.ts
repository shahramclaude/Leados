// Part 08 — GET: rolling-origin forecast calibration table (P10/P90
// coverage per driver), surfaced in the UI for transparency.

import { runBacktest } from "@/lib/finance/backtest";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = runBacktest();
  return Response.json(report);
}
