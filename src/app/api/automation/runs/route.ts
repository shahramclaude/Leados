import { desc } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { withApiHandler } from "@/lib/obs/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "automation_runs" }, async (req) => {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));
  const rows = await db.select().from(automationRuns).orderBy(desc(automationRuns.finishedAt)).limit(limit);
  const successRate = rows.length ? rows.filter((r) => r.status === "succeeded").length / rows.length : null;
  return Response.json({ runs: rows, sampleSize: rows.length, successRate });
});
