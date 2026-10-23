import { NextRequest } from "next/server";
import { getImpactHistory } from "@/lib/recommender/impactHistory";

export const dynamic = "force-dynamic";

/** GET /api/recommender/impact-history?orgId=demo-org */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId") ?? "demo-org";
  const items = await getImpactHistory(orgId);
  return Response.json({ orgId, items });
}
