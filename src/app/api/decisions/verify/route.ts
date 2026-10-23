import { verifyChain } from "@/lib/ledger";
import { getOrCreateDefaultTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const result = await verifyChain(tenant.id);
  return Response.json(result);
}
