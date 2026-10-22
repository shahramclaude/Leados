import { getBudget, currentPeriod } from "@/lib/budget";
import { requireInternalOrgId } from "@/lib/tenant";
import { handleRouteError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const orgId = requireInternalOrgId(req);
    const row = await getBudget(orgId);
    return Response.json({
      ok: true,
      period: currentPeriod(),
      limit: row ? Number(row.limitUnits) : 0,
      used: row ? Number(row.usedUnits) : 0,
      remaining: row ? Number(row.limitUnits) - Number(row.usedUnits) : 0,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
