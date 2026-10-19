import { listEvents } from "@/lib/eventStore";
import { project, latestFinance } from "@/lib/eventBrain";
import { buildRuleContext, runRuleEngine } from "@/lib/ruleEngine";
import { detectCascades } from "@/lib/causalInference";
import { computeChangePhysics } from "@/lib/orgPhysics";
import { compositeEntropy, computePageRank } from "@/lib/orgIntelligence";
import { buildGraphEdges } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listEvents();
    const projection = project(events);
    const now = new Date();
    const ctx = buildRuleContext(projection, now);
    const evaluations = runRuleEngine(ctx);
    const cascades = detectCascades(evaluations);
    const snapshot = latestFinance(projection);

    const avgTenureMonths = projection.people.length
      ? projection.people.reduce((a, p) => a + (now.getTime() - new Date(p.startDate).getTime()) / (30 * 86400000), 0) / projection.people.length
      : 12;
    const physics = computeChangePhysics(snapshot?.headcount ?? projection.people.length, avgTenureMonths, ctx.execution.kpis.openBlockers);

    const domainCounts = new Map<string, number>();
    for (const e of evaluations) if (e.firing) domainCounts.set(e.domain, (domainCounts.get(e.domain) ?? 0) + 1);
    const entropy = compositeEntropy([...domainCounts.values()]);

    const edges = buildGraphEdges(evaluations);
    const ranks = computePageRank(
      evaluations.map((e) => e.ruleId),
      edges
    );
    const influential = [...ranks.entries()]
      .map(([ruleId, rank]) => ({ ruleId, rank, name: evaluations.find((e) => e.ruleId === ruleId)?.name ?? ruleId }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);

    return Response.json({
      physics,
      entropy,
      domainCounts: Object.fromEntries(domainCounts),
      activeCascades: cascades.filter((c) => c.active),
      allCascades: cascades,
      influential,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
