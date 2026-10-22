import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VERSION = "0.1.0";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, service: "leados", version: VERSION });
  } catch {
    return Response.json({ ok: false, service: "leados", version: VERSION }, { status: 500 });
  }
}
