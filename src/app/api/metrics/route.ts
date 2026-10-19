import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { holtWinters, detectStructuralBreaks, buildCrossMetricHypotheses, buildCalibrationReport } from "@/lib/metricsIntelligence";
import { METRIC_DEFINITIONS } from "@/lib/scenarioEngine";
import type { Hypothesis } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const metricKey = url.searchParams.get("metric");

    const events = await listEvents();
    const projection = project(events);

    const grid = METRIC_DEFINITIONS.map((def) => {
      const series = projection.metrics[def.key] ?? [];
      const latest = series.length ? series[series.length - 1].value : def.baseline;
      return { ...def, series, latest };
    });

    let detail = null;
    if (metricKey && projection.metrics[metricKey]) {
      const series = projection.metrics[metricKey];
      const forecast = holtWinters(series);
      const breaks = detectStructuralBreaks(series);
      detail = { metricKey, forecast, breaks };
    }

    const crossMetric = buildCrossMetricHypotheses(projection.metrics);

    const hypothesesByRule = new Map<string, Hypothesis[]>();
    for (const h of projection.hypotheses) {
      const list = hypothesesByRule.get(h.ruleId) ?? [];
      list.push({ id: h.id, ruleId: h.ruleId, entityId: h.entityId, createdAt: h.createdAt, status: h.status, confidence: h.confidence, resolveBy: h.resolveBy, statement: h.statement });
      hypothesesByRule.set(h.ruleId, list);
    }
    const calibration = [...hypothesesByRule.entries()]
      .filter(([, list]) => list.filter((h) => h.status !== "open").length >= 5)
      .map(([ruleId, list]) => buildCalibrationReport(ruleId, list));

    return Response.json({ grid, detail, crossMetric, calibration });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
