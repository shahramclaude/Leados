// src/app/api/autonomous/run/route.ts
//
// Triggers one autonomous intelligence cycle (agentCore.runAgentCycle).
// Replaces the previous evaluateRules-only call. Auth is unchanged from
// the prior implementation:
//
//   // QUOTED (previous implementation, before this change):
//   // const secret = req.headers.get("x-cron-secret");
//   // if (secret !== process.env.CRON_SECRET) {
//   //   return Response.json({ error: "unauthorized" }, { status: 401 });
//   // }
//
// — same header + env var, now gating the full agent cycle instead of a
// bare rule evaluation.

import { db } from "@/db";
import { loadPreviousCycleFromDb, persistCycleResult, runAgentCycle } from "@/lib/agentCore";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // no secret configured: allow (local/dev convenience)
  const secret = req.headers.get("x-cron-secret");
  return secret === expected;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const previousCycle = await loadPreviousCycleFromDb(db);
    const result = await runAgentCycle({ db, now, previousCycle });
    await persistCycleResult(db, result);

    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("[api/autonomous/run] cycle failed", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
