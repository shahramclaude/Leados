import { NextRequest } from "next/server";
import { computeActionDesk } from "@/lib/recommender/ranking";
import { resolveOrgContext } from "@/lib/router/context";
import type { Context } from "@/lib/recommender/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/recommender/action-desk?orgId=org-1&allowSerendipity=true&teamSize=small&stage=growth...
 * Any query param other than orgId/listSize/allowSerendipity is treated as a
 * context tag override (stand-in for Part 33's router resolving a live org
 * profile).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId") ?? "demo-org";
  const listSize = Number(searchParams.get("listSize") ?? "5");
  const allowSerendipity = searchParams.get("allowSerendipity") !== "false";

  const reserved = new Set(["orgId", "listSize", "allowSerendipity"]);
  const explicitContext: Partial<Context> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!reserved.has(key)) explicitContext[key] = value;
  }

  const context = resolveOrgContext(explicitContext);

  try {
    const result = await computeActionDesk(orgId, context, { listSize, allowSerendipity });
    return Response.json({ orgId, context, ...result });
  } catch (err) {
    return Response.json(
      { status: "error", message: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
