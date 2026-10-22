import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { withRoute } from "@/lib/withRoute";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const runs = await db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(50);
  return NextResponse.json({ runs });
});
