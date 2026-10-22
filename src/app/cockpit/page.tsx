import { CockpitDashboard } from "@/components/CockpitDashboard";
import { resolveDemoTenantId } from "@/lib/demoTenant";
import { tenantHeadcountAndRisk } from "@/db/repositories/people";
import { countRecentDecisions, countRelationships } from "@/db/repositories/kpis";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const tenantId = await resolveDemoTenantId();

  // Parallel server queries — no waterfall for the above-the-fold KPI strip.
  const [{ headcount, avgRisk }, decisions90d, relationshipCount] = await Promise.all([
    tenantHeadcountAndRisk(tenantId),
    countRecentDecisions(tenantId),
    countRelationships(tenantId),
  ]);

  return (
    <CockpitDashboard
      kpis={{ headcount, avgRisk, decisions90d, relationships: relationshipCount }}
    />
  );
}
