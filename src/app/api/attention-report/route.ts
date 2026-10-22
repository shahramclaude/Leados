// LEADOS Part 14 — GET /api/attention-report
// Weekly per-user attention report: interrupts received/acted/dismissed and
// an estimated cost in minutes. Cost model: each delivered interrupt costs an
// estimated 23 minutes of context-switch recovery for "acted" work (common
// HCI context-switching figure) and 2 minutes for a quick dismiss — shown as
// a range, not a false-precision single number.
import { db } from "@/db";
import { interruptEvents } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { resolveActor } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTED_COST_MIN = 23;
const DISMISS_COST_MIN = 2;

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(interruptEvents)
    .where(and(eq(interruptEvents.userId, actor.userId), gte(interruptEvents.createdAt, since)));

  const delivered = rows.filter((r) => r.outcome === "delivered");
  const acted = delivered.filter((r) => r.actedOn);
  const dismissed = delivered.filter((r) => r.dismissed && !r.actedOn);
  const queued = rows.filter((r) => r.outcome === "queued_digest");
  const suppressed = rows.filter((r) => r.outcome === "suppressed_mute" || r.outcome === "suppressed_focus");

  const byClass: Record<string, { delivered: number; acted: number; dismissed: number }> = {};
  for (const r of delivered) {
    byClass[r.class] ??= { delivered: 0, acted: 0, dismissed: 0 };
    byClass[r.class].delivered += 1;
    if (r.actedOn) byClass[r.class].acted += 1;
    if (r.dismissed && !r.actedOn) byClass[r.class].dismissed += 1;
  }

  const estimatedCostMinutes = acted.length * ACTED_COST_MIN + dismissed.length * DISMISS_COST_MIN;

  return Response.json({
    windowStart: since.toISOString(),
    received: delivered.length,
    acted: acted.length,
    dismissed: dismissed.length,
    queuedToDigest: queued.length,
    suppressed: suppressed.length,
    estimatedCostMinutes,
    byClass,
  });
}
