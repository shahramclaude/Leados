/**
 * /api/ai-learn — the online-learning surface for the calibration loop.
 *
 * POST { action: "log", modelCardId, metric, predictedP, context? }
 *   Logs a new probability forecast for later resolution.
 * POST { action: "resolve", id, outcome }
 *   Resolves a previously logged prediction with its realized 0/1 outcome,
 *   then immediately re-runs the calibration self-check (the same check
 *   Part 07's scheduler will later run weekly) and auto-opens a finding if
 *   ECE > 0.05.
 * GET
 *   Runs the self-check on demand and returns the current status plus any
 *   open findings — used by the dashboard's Calibration panel.
 */
import {
  logPrediction,
  resolvePrediction,
  runCalibrationSelfCheck,
  listOpenFindings,
} from "@/lib/intelligence/forecastService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const check = await runCalibrationSelfCheck();
    const openFindings = await listOpenFindings();
    return Response.json({ check, openFindings });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "log") {
      const row = await logPrediction({
        modelCardId: body.modelCardId,
        metric: body.metric,
        predictedP: body.predictedP,
        context: body.context,
      });
      return Response.json({ prediction: row });
    }
    if (body.action === "resolve") {
      const row = await resolvePrediction(Number(body.id), body.outcome === 1 ? 1 : 0);
      const check = await runCalibrationSelfCheck();
      return Response.json({ prediction: row, check });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
