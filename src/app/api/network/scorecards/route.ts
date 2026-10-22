import { eq } from "drizzle-orm";
import { db } from "@/db";
import { partnerScorecards, riskRegister, spendRecords } from "@/db/schema";
import { loadEcosystemGraph } from "@/lib/network/graph";
import { computePartnerScorecard } from "@/lib/network/scorecards";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "2026-Q1";

  const graph = await loadEcosystemGraph();
  const partners = graph.nodes.filter((n) => n.type === "partner");

  const spend = await db.select().from(spendRecords).where(eq(spendRecords.period, period));
  const spendShares = Object.entries(
    spend.reduce<Record<string, number>>((acc, r) => {
      acc[r.partnerNodeId] = (acc[r.partnerNodeId] ?? 0) + Number(r.amount);
      return acc;
    }, {}),
  ).map(([key, amount]) => ({ key, amount }));

  const seedCards = await db.select().from(partnerScorecards);
  const risks = await db.select().from(riskRegister);

  const results = partners.map((partner) => {
    const seed = seedCards.find((c) => c.partnerNodeId === partner.id);
    const linkedRiskIds = (seed?.linkedRiskIds as string[]) ?? [];
    const linkedRiskSeverities = linkedRiskIds
      .map((riskId) => risks.find((r) => r.id === riskId)?.severity)
      .filter((s): s is "low" | "medium" | "high" | "critical" => !!s);

    const computed = computePartnerScorecard({
      partnerNodeId: partner.id,
      graph,
      spendShares,
      deliveryQuality: seed?.deliveryQuality ? Number(seed.deliveryQuality) : undefined,
      deliveryEvidenceClass: seed?.deliveryEvidenceClass ?? undefined,
      linkedRiskSeverities,
    });

    return {
      ...computed,
      partnerName: partner.name,
      linkedRisks: linkedRiskIds
        .map((id) => risks.find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => ({ id: r.id, title: r.title, severity: r.severity, status: r.status })),
    };
  });

  return Response.json({ period, scorecards: results.sort((a, b) => b.riskScore - a.riskScore) });
}
