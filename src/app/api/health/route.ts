import { db } from "@/db";
import { sql } from "drizzle-orm";
import { validateConfig, ConfigValidationError } from "@/lib/platform/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    validateConfig();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, service: "leados", checks: { config: "ok", database: "ok" } });
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return Response.json(
        { ok: false, service: "leados", checks: { config: "failed" }, error: error.message },
        { status: 500 },
      );
    }
    return Response.json(
      { ok: false, service: "leados", checks: { database: "failed" } },
      { status: 500 },
    );
  }
}
