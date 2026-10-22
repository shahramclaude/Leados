// =============================================================================
// LEADOS — Part 11: cost/budget status API (dev cost badge support)
// =============================================================================
// GET /api/ai/budget?orgId=1&userId=1&feature=ask
// =============================================================================

import { getBudgetStatus } from "@/lib/ai/costGovernor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = Number(url.searchParams.get("orgId") ?? "1");
  const userIdParam = url.searchParams.get("userId");
  const userId = userIdParam ? Number(userIdParam) : null;
  const feature = url.searchParams.get("feature") ?? "ask";

  if (!Number.isFinite(orgId)) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    const status = await getBudgetStatus(orgId, userId, feature);
    return Response.json({ feature, ...status });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
