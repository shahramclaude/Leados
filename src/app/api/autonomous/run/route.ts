/**
 * POST/GET /api/autonomous/run — runs one autonomous intelligence cycle:
 * projects the current event log, derives findings, diffs against the
 * previous persisted run (BrainDelta), and persists a summary row so the
 * next cycle has something to diff against. This is the seed of the
 * autonomous loop later parts build on; Part 1 establishes that every
 * cycle is driven by the same eventBrain used everywhere else.
 */

import { desc } from "drizzle-orm";
import { db } from "@/db";
import { brainRuns } from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { load } from "@/lib/store";
import { project, run, delta } from "@/lib/eventBrain";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // no secret configured: allow (local/dev convenience)
  const secret = req.headers.get("x-cron-secret");
  return secret === expected;
}

async function runCycle() {
  await ensureBaselineData();
  const events = await load();
  const now = new Date();
  const P = project(events, now);
  const findings = run(P, now);

  const [previous] = await db.select().from(brainRuns).orderBy(desc(brainRuns.runAt)).limit(1);

  let brainDelta = null;
  if (previous) {
    const previousEvents = events.filter((e) => Date.parse(e.ts) <= new Date(previous.runAt).getTime());
    const previousP = project(previousEvents, new Date(previous.runAt));
    brainDelta = delta(previousP, P, now);
  }

  const [inserted] = await db
    .insert(brainRuns)
    .values({
      runAt: now,
      orgHealthScore: String(findings.orgHealthScore),
      riskProfile: findings.riskProfile,
      dominantDomain: findings.dominantDomain,
      findingCount: String(findings.findings.length),
      summary: {
        topFindings: findings.findings.slice(0, 10).map((f) => ({ key: f.key, sev: f.sev, title: f.title, domain: f.domain })),
        physicsSummary: findings.physicsSummary,
      },
    })
    .returning();

  return { ok: true, runId: inserted.id, now: now.toISOString(), findings, delta: brainDelta };
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runCycle();
    return Response.json(result);
  } catch (err) {
    console.error("[api/autonomous/run] cycle failed", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
