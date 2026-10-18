import { db } from "@/db";
import { leados_events, leados_people } from "@/db/schema";
import { sql, eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const [[{ eventCount }], [{ peopleCount }], [lastEventRow]] =
      await Promise.all([
        db.select({ eventCount: sql<number>`count(*)::int` }).from(leados_events),
        db.select({ peopleCount: sql<number>`count(*)::int` })
          .from(leados_people).where(eq(leados_people.archived, false)),
        db.select({ lastEvent: leados_events.ts })
          .from(leados_events)
          .orderBy(asc(leados_events.ts))
          .limit(1),
      ]);
    return Response.json({
      ok: true,
      schemaVersion: 1,
      eventCount,
      peopleCount,
      lastEvent: lastEventRow?.lastEvent ?? null,
    });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
