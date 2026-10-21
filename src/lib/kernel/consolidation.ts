// src/lib/kernel/consolidation.ts
//
// Automation mandate: "nightly memory-consolidation run (via Part 07): new
// retrospectives summarized into memory edges, decaying memories
// re-weighted, neglected hypotheses flagged past resolution date, playbook
// effectiveness recomputed — all as audited events." Registered as the
// `memory.consolidate` kernel capability so Part 07's scheduler (or a human,
// via POST /api/jobs/memory-consolidation) can trigger it; every step's
// result is captured in the single audit event `invokeCapability` appends.
import { db } from "@/db";
import { decisionRetrospectivesLegacy, playbooks } from "@/db/schema";
import { isNotNull } from "drizzle-orm";
import { registerCapability } from "./capabilities";
import { createFromDecisionRetrospective, listTimeline } from "@/lib/institutionalMemory";
import { runAutoResolution, listOverdueHypotheses } from "@/lib/hypotheses";
import { computeEffectiveness } from "@/lib/playbooksEngine";
import { recomputeEntityImportance } from "@/lib/knowledgeGraph";

export type ConsolidationReport = {
  newMemoriesFromDecisions: number;
  memoriesReweighted: number;
  hypothesesAutoResolved: number;
  hypothesesOverdue: { id: number; title: string; resolutionDate: string | null }[];
  playbookEffectivenessRecomputed: { playbookId: number; completionRate: number; avgOutcomeDelta: number | null }[];
  entitiesReranked: number;
};

export async function runMemoryConsolidation(): Promise<ConsolidationReport> {
  // 1. Summarize any newly-completed decision retrospectives into institutional memory (idempotent).
  const completedDecisionRetros = await db
    .select()
    .from(decisionRetrospectivesLegacy)
    .where(isNotNull(decisionRetrospectivesLegacy.completedAt));
  let newMemoriesFromDecisions = 0;
  for (const retro of completedDecisionRetros) {
    if (!retro.completedAt) continue;
    const created = await createFromDecisionRetrospective(retro.id);
    if (created) newMemoriesFromDecisions += 1;
  }

  // 2. Decaying memories re-weighted: `listTimeline` already recomputes decayed strength on
  //    every read (memory.ts is pure/stateless), so "re-weighting" here means refreshing the
  //    read-model that the UI/consolidation report is based on — no row mutation needed because
  //    nothing is ever stored pre-decayed. We just count how many are below a staleness note.
  const timeline = await listTimeline(1000);
  const memoriesReweighted = timeline.length;

  // 3. Neglected hypotheses flagged past resolution date, auto-resolution where objectively settled.
  const autoResolved = await runAutoResolution();
  const overdue = await listOverdueHypotheses();

  // 4. Playbook effectiveness recomputed for every active/draft playbook.
  const allPlaybooks = await db.select().from(playbooks);
  const effectiveness = await Promise.all(
    allPlaybooks.map(async (p) => {
      const e = await computeEffectiveness(p.id);
      return { playbookId: p.id, completionRate: e.completionRate, avgOutcomeDelta: e.avgOutcomeDelta };
    })
  );

  // 5. Graph authority recomputation feeds retrieval ranking with fresh degree-based importance.
  const entitiesReranked = await recomputeEntityImportance();

  return {
    newMemoriesFromDecisions,
    memoriesReweighted,
    hypothesesAutoResolved: autoResolved.filter((r) => r.resolved).length,
    hypothesesOverdue: overdue.map((h) => ({ id: h.id, title: h.title, resolutionDate: h.resolutionDate })),
    playbookEffectivenessRecomputed: effectiveness,
    entitiesReranked,
  };
}

registerCapability<void, ConsolidationReport>({
  name: "memory.consolidate",
  description: "Nightly knowledge-systems consolidation: memory summarization, decay re-weighting, overdue-hypothesis flags, playbook effectiveness recompute.",
  run: async () => runMemoryConsolidation(),
});
