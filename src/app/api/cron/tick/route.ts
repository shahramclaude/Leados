// POST /api/cron/tick
//
// Part 07 scheduler seam: this is the endpoint a real deployment's scheduler
// (cron, queue consumer, etc.) invokes periodically to run unattended
// digest generation/send and weekly attention reports. Protected by a
// shared-secret header so it can't be hit by arbitrary clients; falls back
// to allowing unauthenticated calls only when no secret is configured
// (acceptable for this sandbox, NOT for production — documented in
// docs/REALTIME.md).

import { db } from "@/db";
import { users, weeklyAttentionReports } from "@/db/schema";
import { runDueDigests, generateWeeklyAttentionReport } from "@/lib/scheduler";
import { and, eq } from "drizzle-orm";
import { startOfWeek } from "@/lib/temporal";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== secret) return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const digestResult = await runDueDigests();

  const weekStart = startOfWeek(new Date());
  const allUsers = await db.select().from(users);
  let reportsGenerated = 0;
  for (const u of allUsers) {
    const [existing] = await db
      .select()
      .from(weeklyAttentionReports)
      .where(and(eq(weeklyAttentionReports.userId, u.id), eq(weeklyAttentionReports.weekStart, weekStart)))
      .limit(1);
    if (!existing) {
      await generateWeeklyAttentionReport(u.id);
      reportsGenerated++;
    }
  }

  return Response.json({ ok: true, digestsSent: digestResult.digestsSent, weeklyReportsGenerated: reportsGenerated });
}
