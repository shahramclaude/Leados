// LEADOS Part 14 — POST /api/notifications/undo
// Restores notifications to the states captured before a bulk-triage action.
// Body: { previousStates: { [id]: "unread" | "read" | "archived" | "reopened" } }
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveActor } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATES = new Set(["unread", "read", "archived", "reopened"]);

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  const body = (await req.json().catch(() => ({}))) as { previousStates?: Record<string, string> };
  const previousStates = body.previousStates ?? {};

  const restored: string[] = [];
  for (const [id, state] of Object.entries(previousStates)) {
    if (!VALID_STATES.has(state)) continue;
    const result = await db
      .update(notifications)
      .set({ state, updatedAt: new Date(), archivedAt: state === "archived" ? new Date() : null })
      .where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId)))
      .returning({ id: notifications.id });
    if (result[0]) restored.push(result[0].id);
  }

  return Response.json({ restored });
}
