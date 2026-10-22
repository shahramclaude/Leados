// LEADOS Part 14 — /api/focus-mode
// GET: current focus-mode state.
// POST: toggle focus mode { enabled, allowedClasses, reason }. Always
//       reversible — turning it off simply restores normal dispatch; nothing
//       suppressed while focus mode was on is deleted (it is preserved in the
//       digest queue, see notifications.ts).
import { db } from "@/db";
import { focusMode } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveActor } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const [row] = await db.select().from(focusMode).where(eq(focusMode.userId, actor.userId)).limit(1);
  return Response.json(
    row ?? { userId: actor.userId, enabled: false, allowedClasses: ["action"], reason: "", enabledAt: null },
  );
}

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; allowedClasses?: string[]; reason?: string };

  const [existing] = await db.select().from(focusMode).where(eq(focusMode.userId, actor.userId)).limit(1);
  const enabled = body.enabled ?? false;
  const allowedClasses = body.allowedClasses ?? existing?.allowedClasses ?? ["action"];
  const reason = body.reason ?? existing?.reason ?? "";

  if (existing) {
    await db
      .update(focusMode)
      .set({ enabled, allowedClasses, reason, enabledAt: enabled ? new Date() : null, updatedAt: new Date() })
      .where(eq(focusMode.id, existing.id));
  } else {
    await db.insert(focusMode).values({ userId: actor.userId, enabled, allowedClasses, reason, enabledAt: enabled ? new Date() : null });
  }

  return Response.json({ ok: true, enabled, allowedClasses, reason });
}
