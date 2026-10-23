import { decayStaleBeliefs } from "@/lib/recommender/beliefUpdate";

export const dynamic = "force-dynamic";

/**
 * POST /api/recommender/decay — stand-in for a scheduled cron job that
 * persists belief decay for stale, unverified evidence (Gate 5). Safe to
 * call repeatedly; only rows whose decay would materially change their
 * posterior get written + logged.
 */
export async function POST() {
  const changed = await decayStaleBeliefs(7);
  return Response.json({ ok: true, changed });
}
