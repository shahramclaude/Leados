import { listEvents } from "@/lib/eventStore";
import { project } from "@/lib/eventBrain";
import { buildRuleContext, runRuleEngine } from "@/lib/ruleEngine";
import { detectCascades } from "@/lib/causalInference";
import { buildGraphNodes, buildGraphEdges, forceDirectedLayout } from "@/lib/knowledgeGraph";
import { buildCalibrationReport } from "@/lib/metricsIntelligence";
import type { Hypothesis } from "@/lib/types";

export const dynamic = "force-dynamic";

// DESIGN PARAMETER: temporal heatmap window = 14 days. Historical firing
// status per day is reconstructed from the hypothesis log (a hypothesis
// logged against a rule on day D is treated as evidence the rule fired on
// day D); today's column uses the live rule evaluation instead.
export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const now = new Date();
    const ctx = buildRuleContext(projection, now);
    const evaluations = runRuleEngine(ctx);
    const cascades = detectCascades(evaluations);

    const nodes = forceDirectedLayout(buildGraphNodes(evaluations), buildGraphEdges(evaluations), 900, 520);
    const edges = buildGraphEdges(evaluations);

    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now.getTime() - (13 - i) * 86400000);
      return d.toISOString().slice(0, 10);
    });
    const firedByDay = new Map<string, Map<string, boolean>>();
    for (const day of days) firedByDay.set(day, new Map());
    for (const h of projection.hypotheses) {
      const day = h.createdAt.slice(0, 10);
      if (firedByDay.has(day)) firedByDay.get(day)!.set(h.ruleId, true);
    }
    const todayKey = now.toISOString().slice(0, 10);
    for (const e of evaluations) {
      if (firedByDay.has(todayKey)) firedByDay.get(todayKey)!.set(e.ruleId, e.firing);
    }
    const heatmap = evaluations.map((e) => ({
      ruleId: e.ruleId,
      domain: e.domain,
      severity: e.severity,
      days: days.map((day) => ({ day, firing: firedByDay.get(day)?.get(e.ruleId) ?? false })),
    }));

    const hypothesesByRule = new Map<string, Hypothesis[]>();
    for (const h of projection.hypotheses) {
      const list = hypothesesByRule.get(h.ruleId) ?? [];
      list.push({ id: h.id, ruleId: h.ruleId, entityId: h.entityId, createdAt: h.createdAt, status: h.status, confidence: h.confidence, resolveBy: h.resolveBy, statement: h.statement });
      hypothesesByRule.set(h.ruleId, list);
    }
    const calibration = evaluations.map((e) => {
      const list = hypothesesByRule.get(e.ruleId) ?? [];
      return buildCalibrationReport(e.ruleId, list);
    });

    return Response.json({ evaluations, cascades, nodes, edges, heatmap, days, calibration });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
