import { getOrCreateDemoTenant } from "@/lib/tenant";
import { verifyChain } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDemoTenant();
  const result = await verifyChain(tenant.id);
  return Response.json(result);
}
