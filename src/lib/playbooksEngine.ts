// =============================================================================
// playbooksEngine.ts — Playbook execution engine
// =============================================================================
// Invocable as a Part 10 capability: `invokePlaybook(playbookId, trigger)`.
// Runs are recorded with per-step results and a final outcome, which feeds
// playbooksIntelligence.ts effectiveness scoring.
// =============================================================================

import { db } from "@/db";
import { playbookRuns, playbooks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createPlaybook, type PlaybookStep } from "./playbooks";

export interface CreateCandidateInput {
  name: string;
  trigger: Record<string, unknown>;
  steps: PlaybookStep[];
  createdFromRetrospectiveId: string;
}

/** A retrospective can auto-draft a playbook candidate, but it is ALWAYS
 * created with status "draft" — auto-publish is not possible through this
 * function (PHASE 4 gate #4: retrospective -> candidate, never published). */
export async function createCandidatePlaybook(input: CreateCandidateInput) {
  const slug = `candidate-${input.createdFromRetrospectiveId.slice(0, 8)}-${Date.now()}`;
  return createPlaybook({
    slug,
    name: input.name,
    trigger: input.trigger,
    steps: input.steps,
    status: "draft",
    createdFromRetrospectiveId: input.createdFromRetrospectiveId,
  });
}

export interface StepResult {
  order: number;
  completed: boolean;
  note?: string;
}

/** Invoke (start) a playbook run. This is the Part 10 capability entrypoint:
 * capability name `playbook.invoke`, args `{ playbookId, triggeredBy,
 * linkedDecisionEntityId? }`. */
export async function invokePlaybook(input: {
  playbookId: string;
  triggeredBy: string;
  linkedDecisionEntityId?: string;
}) {
  const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, input.playbookId));
  if (!playbook) throw new Error("Playbook not found");
  if (playbook.status !== "active") {
    throw new Error(`Playbook ${playbook.slug} is not active (status=${playbook.status}); cannot invoke`);
  }

  const [run] = await db
    .insert(playbookRuns)
    .values({
      playbookId: input.playbookId,
      triggeredBy: input.triggeredBy,
      linkedDecisionEntityId: input.linkedDecisionEntityId ?? null,
      stepResults: (playbook.steps as PlaybookStep[]).map((s) => ({
        order: s.order,
        completed: false,
      })),
    })
    .returning();
  return run;
}

export async function recordStepResult(runId: string, stepOrder: number, completed: boolean, note?: string) {
  const [run] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, runId));
  if (!run) throw new Error("Run not found");

  const stepResults = (run.stepResults as StepResult[]).map((s) =>
    s.order === stepOrder ? { ...s, completed, note } : s,
  );

  const [updated] = await db
    .update(playbookRuns)
    .set({ stepResults })
    .where(eq(playbookRuns.id, runId))
    .returning();
  return updated;
}

export async function completeRun(
  runId: string,
  outcome: "success" | "partial" | "failure",
  notes?: string,
) {
  const [row] = await db
    .update(playbookRuns)
    .set({ outcome, notes, completedAt: new Date() })
    .where(eq(playbookRuns.id, runId))
    .returning();
  return row;
}

export async function getRun(runId: string) {
  const [row] = await db.select().from(playbookRuns).where(eq(playbookRuns.id, runId));
  return row ?? null;
}
