import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = performance.now();
  await db.execute(sql`select 1`);
  const dbMs = +(performance.now() - start).toFixed(2);
  return Response.json({ status: "ok", dbMs, timestamp: new Date().toISOString() });
}
