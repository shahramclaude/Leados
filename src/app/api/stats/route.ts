import { db } from "@/db";
import { decisions, knowledgeEntries, leads } from "@/db/schema";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { verifyChain } from "@/lib/ledger";
import { avg, count, eq, max } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const [[leadStats], [decisionStats], [knowledgeStats], chain] = await Promise.all([
    db
      .select({ total: count(), avgScore: avg(leads.score) })
      .from(leads)
      .where(eq(leads.tenantId, tenant.id)),
    db
      .select({ total: count(), lastAt: max(decisions.createdAt) })
      .from(decisions)
      .where(eq(decisions.tenantId, tenant.id)),
    db
      .select({ total: count() })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.tenantId, tenant.id)),
    verifyChain(tenant.id),
  ]);

  return Response.json({
    tenant,
    leads: {
      total: leadStats?.total ?? 0,
      averageScore: leadStats?.avgScore ? Math.round(Number(leadStats.avgScore)) : 0,
    },
    decisions: {
      total: decisionStats?.total ?? 0,
      lastAt: decisionStats?.lastAt ?? null,
    },
    knowledge: {
      total: knowledgeStats?.total ?? 0,
    },
    ledgerIntegrity: chain,
  });
}
