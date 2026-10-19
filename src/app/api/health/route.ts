import { db } from "@/db";
import { sql } from "drizzle-orm";
import { jsonError, logDuration } from "@/lib/apiUtils";

export const dynamic = "force-dynamic";

const ROUTE = "api/health";

export async function GET() {
  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    logDuration(ROUTE, start);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[${ROUTE}] error`, err);
    logDuration(ROUTE, start);
    return jsonError(503, "DB_UNAVAILABLE", "Database health check failed.");
  }
}
