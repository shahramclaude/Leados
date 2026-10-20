import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, service: "leados", database: "connected" });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        service: "leados",
        database: "unreachable",
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
