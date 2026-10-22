import { db } from "@/db";
import { legacyHealthScores } from "@/db/schema";
import { LEGACY_HEALTH_SCORES } from "@/lib/fitness/legacy";

export const dynamic = "force-dynamic";

/**
 * GET /api/fitness/legacy — Phase 0 audit findings: every pre-existing
 * health/score concept, what it measured, how it could be gamed, whether it
 * was actionable, and how it has been consolidated/deprecated into the
 * Part 39 fitness model. Falls back to the in-code catalog if the DB has not
 * been seeded yet, so the audit is always visible.
 */
export async function GET() {
  try {
    const rows = await db.select().from(legacyHealthScores);
    if (rows.length > 0) return Response.json({ ok: true, legacy: rows, source: "db" });
  } catch {
    // fall through to static catalog
  }
  return Response.json({ ok: true, legacy: LEGACY_HEALTH_SCORES, source: "static-catalog" });
}
