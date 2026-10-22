// LEADOS Part 14 — /api/notifications/prefs
// GET: current channel prefs for the user (per class: muted + reason + opt-in)
// POST: upsert one class's prefs — this is how a user mutes a class "with a
//       reason" or opts in to immediate delivery, which attention.ts reads.
import { db } from "@/db";
import { notificationPrefs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveActor } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLASSES = ["alert", "action", "info", "digest"];

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const rows = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, actor.userId));
  const byClass = new Map(rows.map((r) => [r.class, r]));
  const prefs = CLASSES.map((klass) => {
    const row = byClass.get(klass);
    return {
      class: klass,
      muted: row?.muted ?? false,
      muteReason: row?.muteReason ?? "",
      optedInImmediate: row?.optedInImmediate ?? false,
    };
  });
  return Response.json({ prefs });
}

export async function POST(req: Request) {
  const actor = await resolveActor(req);
  const body = (await req.json().catch(() => ({}))) as {
    class?: string;
    muted?: boolean;
    muteReason?: string;
    optedInImmediate?: boolean;
  };

  if (!body.class || !CLASSES.includes(body.class)) {
    return Response.json({ error: `class must be one of ${CLASSES.join("|")}` }, { status: 400 });
  }
  if (body.muted && !body.muteReason) {
    return Response.json({ error: "muteReason is required when muting a class" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(notificationPrefs)
    .where(and(eq(notificationPrefs.userId, actor.userId), eq(notificationPrefs.class, body.class)))
    .limit(1);

  if (existing) {
    await db
      .update(notificationPrefs)
      .set({
        muted: body.muted ?? existing.muted,
        muteReason: body.muted ? body.muteReason ?? existing.muteReason : "",
        optedInImmediate: body.optedInImmediate ?? existing.optedInImmediate,
        updatedAt: new Date(),
      })
      .where(eq(notificationPrefs.id, existing.id));
  } else {
    await db.insert(notificationPrefs).values({
      userId: actor.userId,
      class: body.class,
      muted: body.muted ?? false,
      muteReason: body.muted ? body.muteReason ?? "" : "",
      optedInImmediate: body.optedInImmediate ?? false,
    });
  }

  return Response.json({ ok: true });
}
