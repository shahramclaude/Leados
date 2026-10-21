import { db } from "@/db";
import { actors } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Demo-only endpoint powering the actor switcher. Returns id/name/role only
 * — no sensitive HR fields — safe to expose unauthenticated in this sandbox. */
export async function GET() {
  const rows = await db.select({ id: actors.id, name: actors.name, globalRole: actors.globalRole }).from(actors);
  return Response.json({ actors: rows });
}
