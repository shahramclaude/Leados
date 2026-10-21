// GET /api/attention/report — latest weekly attention report(s) for the
// current user. POST forces generation on demand (used by tests and by the
// "Your attention report" UI entry point).

import { db } from "@/db";
import { weeklyAttentionReports } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { generateWeeklyAttentionReport } from "@/lib/scheduler";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const rows = await db
    .select()
    .from(weeklyAttentionReports)
    .where(eq(weeklyAttentionReports.userId, user.id))
    .orderBy(desc(weeklyAttentionReports.weekStart))
    .limit(12);

  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const report = await generateWeeklyAttentionReport(user.id);
  return Response.json({ item: report });
}
