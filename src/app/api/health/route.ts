import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// LEADOS version string for this build. Bumped alongside CHANGELOG.md —
// see docs/RELEASING.md step "version bump". This is the only place the
// running process reports its own version; `/api/health` is deliberately
// the single source of truth so release tooling and humans check one place.
const LEADOS_VERSION = "0.1.0";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, service: "leados", version: LEADOS_VERSION });
  } catch {
    return Response.json({ ok: false, service: "leados", version: LEADOS_VERSION }, { status: 500 });
  }
}
