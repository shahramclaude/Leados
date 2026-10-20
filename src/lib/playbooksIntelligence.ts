// src/lib/playbooksIntelligence.ts
//
// Mines institutional memory (retrospectives) for new playbook candidates.
// This module only ever SUGGESTS — candidates land in `playbook_candidates`
// with status "suggested" and a human must explicitly accept one (which
// calls `createPlaybook` in playbooks.ts) before it becomes a real,
// invocable playbook. Nothing here auto-publishes.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { playbookCandidates, retrospectives } from "@/db/schema";
import { jaccard } from "@/lib/knowledgeGraph";
import { createPlaybook, type PlaybookStep } from "@/lib/playbooks";

export interface MinedCandidate {
  clusterTags: string[];
  retrospectiveIds: number[];
  suggestedTitle: string;
  suggestedSteps: PlaybookStep[];
  rationale: string;
}

const MIN_CLUSTER_SIZE = 2;
const SIMILARITY_THRESHOLD = 0.5;

/**
 * Greedy tag-similarity clustering over retrospectives with a lesson that
 * implies a repeatable action (`playbookUpdate` populated and outcome not
 * neutral). Clusters of >= MIN_CLUSTER_SIZE sharing >= SIMILARITY_THRESHOLD
 * Jaccard tag overlap become playbook candidates.
 */
export async function mineCandidatesFromRetrospectives(): Promise<MinedCandidate[]> {
  const rows = await db
    .select()
    .from(retrospectives)
    .where(eq(retrospectives.outcomeValence, "negative")); // lessons from negative outcomes are the richest playbook source
  const withPlaybookHint = rows.filter((r) => Boolean(r.playbookUpdate));
  const positiveRows = await db.select().from(retrospectives).where(eq(retrospectives.outcomeValence, "positive"));
  const candidates = [...withPlaybookHint, ...positiveRows.filter((r) => Boolean(r.playbookUpdate))];

  const used = new Set<number>();
  const clusters: MinedCandidate[] = [];

  for (let i = 0; i < candidates.length; i++) {
    if (used.has(candidates[i].id)) continue;
    const base = candidates[i];
    const baseTags = new Set((base.tags as string[]) ?? []);
    const cluster = [base];
    used.add(base.id);
    for (let j = i + 1; j < candidates.length; j++) {
      if (used.has(candidates[j].id)) continue;
      const other = candidates[j];
      const sim = jaccard(baseTags, new Set((other.tags as string[]) ?? []));
      if (sim >= SIMILARITY_THRESHOLD) {
        cluster.push(other);
        used.add(other.id);
      }
    }
    if (cluster.length >= MIN_CLUSTER_SIZE) {
      const tags = [...new Set(cluster.flatMap((r) => (r.tags as string[]) ?? []))];
      const steps: PlaybookStep[] = cluster.map((r, idx) => ({
        order: idx + 1,
        title: r.playbookUpdate ?? r.lesson,
        description: `From retrospective "${r.title}" (${r.occurredAt}): ${r.lesson}`,
      }));
      clusters.push({
        clusterTags: tags,
        retrospectiveIds: cluster.map((r) => r.id),
        suggestedTitle: `Playbook: ${base.title.replace(/^Retro:\s*/i, "")}`,
        suggestedSteps: steps,
        rationale: `${cluster.length} retrospectives tagged [${tags.join(", ")}] independently arrived at the same corrective action — strong signal this should be a standing playbook.`,
      });
    }
  }
  return clusters;
}

/** Run mining and persist any newly-found clusters as suggested candidates (idempotent per retrospective-id set). */
export async function refreshPlaybookCandidates(): Promise<typeof playbookCandidates.$inferSelect[]> {
  const mined = await mineCandidatesFromRetrospectives();
  const existing = await db.select().from(playbookCandidates);
  const existingKeys = new Set(existing.map((c) => c.sourceRetrospectiveId));
  const created: typeof playbookCandidates.$inferSelect[] = [];
  for (const candidate of mined) {
    const primaryRetroId = candidate.retrospectiveIds[0];
    if (existingKeys.has(primaryRetroId)) continue;
    const [row] = await db
      .insert(playbookCandidates)
      .values({
        sourceRetrospectiveId: primaryRetroId,
        suggestedTitle: candidate.suggestedTitle,
        suggestedSteps: candidate.suggestedSteps,
        rationale: candidate.rationale,
        status: "suggested",
      })
      .returning();
    created.push(row);
  }
  return created;
}

export async function listCandidates(status?: "suggested" | "accepted" | "rejected") {
  return status
    ? db.select().from(playbookCandidates).where(eq(playbookCandidates.status, status)).orderBy(desc(playbookCandidates.createdAt))
    : db.select().from(playbookCandidates).orderBy(desc(playbookCandidates.createdAt));
}

export async function rejectCandidate(id: number) {
  const [row] = await db
    .update(playbookCandidates)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(eq(playbookCandidates.id, id))
    .returning();
  return row;
}

/** Human explicitly accepts a mined candidate -> becomes a real, invocable playbook (draft status). */
export async function acceptCandidate(id: number, key: string) {
  const [candidate] = await db.select().from(playbookCandidates).where(eq(playbookCandidates.id, id)).limit(1);
  if (!candidate) throw new Error(`Playbook candidate ${id} not found`);
  const playbook = await createPlaybook({
    key,
    title: candidate.suggestedTitle,
    description: candidate.rationale,
    steps: candidate.suggestedSteps as PlaybookStep[],
    originRetrospectiveId: candidate.sourceRetrospectiveId,
    status: "draft",
  });
  await db
    .update(playbookCandidates)
    .set({ status: "accepted", decidedAt: new Date() })
    .where(eq(playbookCandidates.id, id));
  return playbook;
}
