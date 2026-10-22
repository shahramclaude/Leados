import { resolveDemoTenantId } from "@/lib/demoTenant";
import { getHeatmap } from "@/db/repositories/heatmap";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenantId = await resolveDemoTenantId();
  const result = await getHeatmap(tenantId);
  return Response.json(
    {
      cells: result.value,
      stale: result.stale,
      staleForMs: result.staleForMs,
      computeMs: result.computeMs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
