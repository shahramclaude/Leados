import { resolveDemoTenantId } from "@/lib/demoTenant";
import { loadBoundedNetwork } from "@/db/repositories/network";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenantId = await resolveDemoTenantId();
  const graph = await loadBoundedNetwork(tenantId);
  return Response.json(graph, { headers: { "Cache-Control": "no-store" } });
}
