import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, service: "leados-api", apiVersion: "v1", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
