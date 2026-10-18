import { db } from "@/db";
import { leados_events, leados_people } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { project } from "@/lib/engine";
import { runSimulation } from "@/lib/simulation";
import { buildAttentionItems, optimizeAttention } from "@/lib/attention";

export const dynamic = "force-dynamic";

export async function GET() {
  const [events, people] = await Promise.all([
    db.select().from(leados_events).orderBy(desc(leados_events.ts)),
    db.select().from(leados_people).where(eq(leados_people.archived, false)),
  ]);

  const mappedEvents = events.map((e) => ({
    id: e.id,
    type: e.type,
    domain: e.domain,
    ts: new Date(e.ts),
    data: e.data as Record<string, unknown>,
    personId: e.person_id,
  }));
  const mappedPeople = people.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    reports_to: p.reports_to,
    cadence_days: p.cadence_days,
    archived: p.archived,
    joined_at: new Date(p.joined_at),
  }));

  // Core projection: 60-rule engine + correlation/inference/belief/flight-risk layers
  const state = project(mappedEvents, mappedPeople);

  // Multi-agent simulation (quick settings for API response time)
  const planPersonIds = new Set(state.openPlans.map((p) => p.personId));
  const simulation = runSimulation(mappedPeople, Object.values(state.pulseByPerson), planPersonIds, 8, 20);

  // Attention optimization
  const attentionItems = buildAttentionItems(state.findings);
  const attentionPlan = optimizeAttention(attentionItems, 30, 40, 2000);

  // Strategic consciousness: the highest-leverage action right now
  const topBelief = [...state.beliefs].sort((a, b) => b.posteriorPct - a.posteriorPct)[0];
  const topFinding = state.findings[0] ?? null;
  const highFlightRisk = state.flightRisk.filter((r) => r.riskLevel === "HIGH");

  const highestLeverageAction = (() => {
    if (topFinding?.sev === 5) {
      return { action: topFinding.title, source: "engine.finding.sev5", urgency: "NOW" };
    }
    if (highFlightRisk.length) {
      return {
        action: `1:1 with ${highFlightRisk[0].personName} (flight risk ${Math.round(highFlightRisk[0].riskScore * 100)}%)`,
        source: "flight_risk",
        urgency: "TODAY",
      };
    }
    if (topBelief?.highRisk) {
      return {
        action: `Address ${topBelief.hypothesis.replace(/_/g, " ")} (${topBelief.posteriorPct}% probability)`,
        source: "bayesian.belief",
        urgency: "THIS_WEEK",
      };
    }
    return {
      action: attentionPlan.sequence[0]?.title ?? "Review active findings",
      source: "attention_optimizer",
      urgency: "TODAY",
    };
  })();

  return Response.json({
    ...state,
    simulation,
    attentionPlan,
    highestLeverageAction,
    generatedAt: new Date().toISOString(),
  });
}
