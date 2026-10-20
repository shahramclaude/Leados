import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { systemMeta } from "@/db/schema";
import { withObservability } from "@/lib/observability/apiHandler";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

// Honest limitation: this build has no auth/session system (see
// FEATURES.md), so this route is unauthenticated. docs/RUNBOOKS.md and
// docs/DEPLOYMENT.md both call this out explicitly: put it behind network
// controls (VPN/allowlist at the reverse proxy) before exposing this
// deployment publicly, or gate it with a shared secret header read from
// process.env before relying on it in production.
export const GET = withObservability("GET /api/admin/maintenance", async () => {
  const rows = await db.select().from(systemMeta).where(sql`${systemMeta.key} = 'maintenance_mode'`).limit(1);
  return NextResponse.json({ enabled: rows[0]?.value === "true" });
});

export const POST = withObservability("POST /api/admin/maintenance", async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const enabled = body?.enabled === true;

  await db
    .insert(systemMeta)
    .values({ key: "maintenance_mode", value: String(enabled) })
    .onConflictDoUpdate({
      target: systemMeta.key,
      set: { value: String(enabled), updatedAt: new Date() },
    });

  logger.warn("maintenance_mode_changed", { enabled });
  return NextResponse.json({ enabled });
});
