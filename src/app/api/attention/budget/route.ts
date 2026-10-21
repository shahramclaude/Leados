// GET /api/attention/budget — visible interrupt-budget spend for the
// current user: how many of today's interrupts have been used, fatigue
// score, and the most recent interrupt-policy decisions (for transparency).

import { db } from "@/db";
import { interruptLog, users } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { getUserAttentionPrefs, spentToday, minutesSinceLastInterrupt } from "@/lib/attention";
import { computeFatigue } from "@/lib/fatigue";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const [userRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const prefs = await getUserAttentionPrefs(user.id);
  const spend = await spentToday(user.id, userRow?.timezone ?? prefs.timezone);
  const minutesSince = await minutesSinceLastInterrupt(user.id);

  const fatigue = computeFatigue({
    interruptsToday: spend,
    dailyBudget: prefs.dailyInterruptBudget,
    minutesSinceLastInterrupt: minutesSince,
  });

  const recentDecisions = await db
    .select()
    .from(interruptLog)
    .where(eq(interruptLog.userId, user.id))
    .orderBy(desc(interruptLog.occurredAt))
    .limit(20);

  return Response.json({
    budget: prefs.dailyInterruptBudget,
    spent: spend,
    remaining: Math.max(0, prefs.dailyInterruptBudget - spend),
    exhausted: spend >= prefs.dailyInterruptBudget,
    fatigue,
    recentDecisions,
  });
}
