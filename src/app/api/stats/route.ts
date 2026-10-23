import { db } from "@/db";
import { decisions, leads } from "@/db/schema";
import { getOrCreateDemoTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDemoTenant();

  const allLeads = await db.select().from(leads).where(eq(leads.tenantId, tenant.id));
  const recentDecisions = await db
    .select()
    .from(decisions)
    .where(eq(decisions.tenantId, tenant.id))
    .orderBy(desc(decisions.sequence))
    .limit(10);

  const totalLeads = allLeads.length;
  const avgScore = totalLeads
    ? Math.round(allLeads.reduce((sum, l) => sum + l.score, 0) / totalLeads)
    : 0;

  const stageCounts: Record<string, number> = {};
  for (const lead of allLeads) {
    stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;
  }

  const topLeads = allLeads
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return Response.json({
    totalLeads,
    avgScore,
    stageCounts,
    topLeads,
    recentDecisions,
  });
}
