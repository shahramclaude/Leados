import { db } from "@/db";
import { objectives } from "@/db/schema";
import { sql } from "drizzle-orm";
import { recordAudit } from "@/lib/server/idempotency";

// ---------------------------------------------------------------------------
// Demo/test-only endpoint: simulates a second actor ("Automation Bot") editing
// a random objective concurrently, bumping its version. This is what the
// conflict-resolution panel and the two-tab divergence test exercise against
// — see PART-03-REPORT.md Phase 5, question 1.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function POST() {
  const statuses = ["draft", "active", "at_risk", "done"] as const;
  const [row] = await db.select().from(objectives).orderBy(sql`random()`).limit(1);
  if (!row) return Response.json({ code: "NOT_FOUND", message: "No objectives to simulate against." }, { status: 404 });

  const nextStatus = statuses[Math.floor(Math.random() * statuses.length)];
  const [updated] = await db
    .update(objectives)
    .set({ status: nextStatus, version: sql`${objectives.version} + 1`, updatedAt: new Date() })
    .where(sql`${objectives.id} = ${row.id}`)
    .returning();

  await recordAudit("objective", updated.id, "status_changed", `Automation Bot set "${updated.title}" to ${nextStatus}`, "Automation Bot");

  return Response.json(updated);
}
