import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projectionState } from "@/db/schema";
import { requireAdmin } from "@/lib/adminAuth";
import { withRoute } from "@/lib/withRoute";

export const dynamic = "force-dynamic";

// SRE drill endpoint: backdates (or creates) a projection_state row so the
// projection-freshness health signal goes degraded/failing for real.
export const POST = withRoute(async (req: NextRequest) => {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "lead_forecast_projection";
  const ageSeconds = typeof body.ageSeconds === "number" ? body.ageSeconds : 400;
  const lastRefreshedAt = new Date(Date.now() - ageSeconds * 1000);

  const [row] = await db
    .insert(projectionState)
    .values({ name, lastRefreshedAt, rowCount: 0 })
    .onConflictDoUpdate({
      target: projectionState.name,
      set: { lastRefreshedAt, updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json({ injected: true, projection: row });
});
