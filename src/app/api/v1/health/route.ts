import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCorrelationId } from "@/lib/api/context";
import { jsonOk, toErrorResponse } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const SERVICE_VERSION = "1.0.0";

// Public, unauthenticated liveness + dependency check for the documented v1
// API (distinct from the bare infra probe at /api/health).
export async function GET(req: Request) {
  const correlationId = getCorrelationId(req);
  try {
    await db.execute(sql`select 1`);
    return jsonOk(
      { ok: true, service: "leados-api", version: SERVICE_VERSION, timestamp: new Date().toISOString() },
      correlationId,
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
