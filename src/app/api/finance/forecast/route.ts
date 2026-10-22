// Part 08 — GET: rolling forecast P10/P50/P90 bands (Monte Carlo over the
// whole DAG) for the forecast horizon.

import { NextRequest } from "next/server";
import { evaluateModel, monteCarloForecast, FORECAST_OUTPUT_NODES } from "@/lib/finance/financeEngine";
import { loadOverrideMap } from "@/lib/finance/overridesStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const iterationsParam = req.nextUrl.searchParams.get("iterations");
  const iterations = Math.max(30, Math.min(500, Number(iterationsParam) || 150));
  const persisted = await loadOverrideMap();
  const model = evaluateModel(persisted);
  const start = performance.now();
  const forecast = monteCarloForecast(model, persisted, FORECAST_OUTPUT_NODES, iterations);
  const elapsedMs = performance.now() - start;
  return Response.json({ ...forecast, elapsedMs });
}
