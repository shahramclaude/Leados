import { db } from "@/db";
import { sql } from "drizzle-orm";
import { withErrorHandling, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("health", async (_req, requestId) => {
  await db.execute(sql`select 1`);
  return jsonOk({ ok: true }, requestId);
});
