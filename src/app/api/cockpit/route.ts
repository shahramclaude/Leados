import { listEvents } from "@/lib/eventStore";
import { project, latestFinance } from "@/lib/eventBrain";
import { buildRuleContext, runRuleEngine } from "@/lib/ruleEngine";
import { detectCascades } from "@/lib/causalInference";
import { buildMorningBrief, computeOrgHealthScore } from "@/lib/orgIntelligence";
import { runMonteCarloRunway } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const now = new Date();
    const ctx = buildRuleContext(projection, now);
    const evaluations = runRuleEngine(ctx);
    const cascades = detectCascades(evaluations);
    const firing = evaluations.filter((e) => e.firing).sort((a, b) => sevScore(b.severity) - sevScore(a.severity));
    const critical = firing.filter((e) => e.severity === "critical").length;

    const snapshot = latestFinance(projection);
    const runway = snapshot ? runMonteCarloRunway(snapshot.cash, snapshot.monthlyBurn) : null;

    const brief = buildMorningBrief({
      orgName: "Your organization",
      firingCount: firing.length,
      criticalCount: critical,
      topFinding: firing[0] ? `${firing[0].name} (${firing[0].domain})` : null,
      runwayMonths: runway?.monteCarlo.p50 ?? null,
    });

    const avgFlightRisk = projection.people.length ? projection.people.reduce((a, p) => a + p.flightRisk, 0) / projection.people.length : 0;
    const avgConfidence = ctx.execution.kpis.avgConfidence;
    const orgHealthScore = computeOrgHealthScore({
      teamHealthScore: ctx.okr.teamHealthScore,
      avgConfidence,
      bankruptcyRisk: ctx.runway?.bankruptcyRisk ?? 0,
      avgFlightRisk,
      firingCriticalCount: critical,
    });

    return Response.json({
      brief,
      orgHealthScore,
      firing: firing.slice(0, 8),
      activeCascades: cascades.filter((c) => c.active),
      kpis: {
        eventCount: events.length,
        peopleCount: projection.people.length,
        openDecisions: projection.decisions.filter((d) => !d.outcome).length,
        activeProjects: ctx.execution.kpis.activeProjects,
        blockedProjects: ctx.execution.kpis.blockedProjects,
        runwayP50: runway?.monteCarlo.p50 ?? null,
        okrOnTrack: ctx.okr.onTrack,
        okrTotal: ctx.okr.objectives.length,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

function sevScore(s: string | null) {
  return s === "critical" ? 4 : s === "high" ? 3 : s === "medium" ? 2 : s === "low" ? 1 : 0;
}
