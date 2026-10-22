import { NextResponse } from "next/server";
import { db } from "@/db";
import { workQueueJobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { withRoute } from "@/lib/withRoute";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const jobs = await db.select().from(workQueueJobs).orderBy(desc(workQueueJobs.createdAt)).limit(50);
  return NextResponse.json({ jobs });
});
