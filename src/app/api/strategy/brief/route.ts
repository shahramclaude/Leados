import { db } from "@/db";
import { strategyBriefs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { generateWeeklyBrief, type StrategySnapshot } from "@/lib/strategy/briefGenerator";
import { listEvidenceRefs, listKeyResults, listObjectiveLinks, listObjectives } from "@/lib/strategy/objectives";
import { listInitiatives, listMilestones } from "@/lib/strategy/initiatives";
import { newId } from "@/lib/strategy/ids";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(strategyBriefs).orderBy(desc(strategyBriefs.generatedAt)).limit(12);
  return Response.json({ briefs: rows });
}

/**
 * Generates and persists a new weekly strategy brief, diffing against the
 * most recently stored snapshot. Real deltas only — see briefGenerator.ts.
 */
export async function POST() {
  const [objectives, links, keyResults, initiatives] = await Promise.all([
    listObjectives(),
    listObjectiveLinks(),
    listKeyResults(),
    listInitiatives(),
  ]);
  const evidence = await listEvidenceRefs();
  const milestones = await listMilestones();

  const [previousRow] = await db.select().from(strategyBriefs).orderBy(desc(strategyBriefs.generatedAt)).limit(1);
  const prevSnapshot = previousRow ? (previousRow.snapshotJson as StrategySnapshot) : null;

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setUTCDate(periodStart.getUTCDate() - 7);

  const result = generateWeeklyBrief({
    prevSnapshot,
    initiatives,
    milestones,
    objectives,
    keyResults,
    evidence,
    links,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    defaultStartDate: now.toISOString(),
  });

  if (!result.lint.ok) {
    // Citation lint failed: refuse to persist a brief with uncited numbers.
    // This is the enforcement point for Phase 4 Gate 4.
    return Response.json(
      { error: "citation_lint_failed", uncitedNumbers: result.lint.uncitedNumbers, narrativeText: result.narrativeText },
      { status: 422 },
    );
  }

  const [row] = await db
    .insert(strategyBriefs)
    .values({
      id: newId("brief"),
      periodStart,
      periodEnd: now,
      snapshotJson: result.snapshot,
      narrativeText: result.narrativeText,
      citationCount: result.citations.length,
    })
    .returning();

  return Response.json({ brief: row, delta: result.delta, citations: result.citations, lint: result.lint });
}
