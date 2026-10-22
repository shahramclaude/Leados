// LEADOS Part 14 — /api/notifications/[id]
// GET: chain view (root + all children, newest first)
// PATCH: { action: "read"|"archive"|"reopen"|"act"|"dismiss" } — also used
//        for bulk-triage undo by the client re-issuing the inverse action.
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { recordTriageOutcome } from "@/lib/notifications";
import { recordEngagement } from "@/lib/attentionOpt";
import { hourOfDayInTz } from "@/lib/temporal";
import { resolveActor } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [root] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!root) return Response.json({ error: "not found" }, { status: 404 });

  const rootId = root.parentId ?? root.id;
  const [rootRow] = root.parentId ? await db.select().from(notifications).where(eq(notifications.id, rootId)).limit(1) : [root];
  const children = await db.select().from(notifications).where(eq(notifications.parentId, rootId));

  return Response.json({ root: rootRow, children: children.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) });
}

const VALID_ACTIONS = new Set(["read", "archive", "reopen", "act", "dismiss"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await resolveActor(req);
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (!VALID_ACTIONS.has(action)) {
    return Response.json({ error: `invalid action, expected one of ${[...VALID_ACTIONS].join("|")}` }, { status: 400 });
  }

  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const now = new Date();
  const stateMap: Record<string, string> = { read: "read", archive: "archived", reopen: "reopened", act: "archived", dismiss: "archived" };
  const nextState = stateMap[action];

  await db
    .update(notifications)
    .set({
      state: nextState,
      updatedAt: now,
      readAt: action === "read" || action === "act" ? now : row.readAt,
      archivedAt: nextState === "archived" ? now : null,
    })
    .where(or(eq(notifications.id, id), eq(notifications.parentId, id)));

  if (action === "act" || action === "dismiss") {
    await recordTriageOutcome(id, action);
    const hourOfDay = hourOfDayInTz(now, actor.timezone);
    await recordEngagement(row.userId, row.class, hourOfDay, action === "act");
  }

  const [updated] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return Response.json({ notification: updated });
}
