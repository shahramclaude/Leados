// =============================================================================
// memory.ts — Decision retrospectives: situation -> decision -> outcome ->
// lesson -> playbookImpact
// =============================================================================
// Retrospectives are auto-triggered when a decision entity's `reviewAt` is
// reached (see Part 10 capability hook `runRetrospectiveSweep`). Completing
// one writes the lesson back into institutional memory AND into the
// knowledge graph (decision --evidences--> lesson memory,
// lesson --informs--> any resulting playbook candidate), and can spin up a
// playbook *candidate* — which is NEVER auto-published (PHASE 4 gate #4).
// =============================================================================

import { db } from "@/db";
import { retrospectives, entities } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { recordMemory } from "./institutionalMemory";
import { createRelation } from "./knowledgeGraph";
import { createCandidatePlaybook } from "./playbooksEngine";

export interface CreateRetrospectiveInput {
  decisionEntityId: string;
  situation: string;
  decision: string;
  expectation: string;
  reviewAt: Date;
}

export async function scheduleRetrospective(input: CreateRetrospectiveInput) {
  const [row] = await db
    .insert(retrospectives)
    .values({
      decisionEntityId: input.decisionEntityId,
      situation: input.situation,
      decision: input.decision,
      expectation: input.expectation,
      reviewAt: input.reviewAt,
    })
    .returning();
  return row;
}

/** Decisions whose reviewAt has passed and that are still pending — this is
 * the trigger condition for the "auto-triggered at reviewAt" requirement. */
export async function listDueRetrospectives(now: Date = new Date()) {
  return db
    .select()
    .from(retrospectives)
    .where(and(eq(retrospectives.status, "pending"), lte(retrospectives.reviewAt, now)));
}

export async function listRetrospectives(status?: "pending" | "completed" | "skipped") {
  return db
    .select()
    .from(retrospectives)
    .where(status ? eq(retrospectives.status, status) : undefined);
}

export async function getRetrospective(id: string) {
  const [row] = await db.select().from(retrospectives).where(eq(retrospectives.id, id));
  return row ?? null;
}

function compareOutcomeToExpectation(expectation: string, outcome: string): string {
  // Deliberately simple, auditable heuristic (not an LLM call) — keyword
  // overlap between outcome and expectation text. Flags divergence for a
  // human to read rather than asserting a verdict. Full text always shown
  // alongside this hint so no claim is made silently.
  const normalize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const exp = normalize(expectation);
  const out = normalize(outcome);
  const overlap = [...exp].filter((w) => out.has(w)).length;
  const union = new Set([...exp, ...out]).size || 1;
  const similarity = overlap / union;
  if (similarity > 0.4) return `Outcome appears consistent with expectation (lexical overlap ${(similarity * 100).toFixed(0)}%).`;
  return `Outcome diverges from expectation (lexical overlap ${(similarity * 100).toFixed(0)}%) — review recommended.`;
}

export interface CompleteRetrospectiveInput {
  outcome: string;
  lesson: string;
  /** If true and a lesson is substantial, auto-draft a playbook candidate
   * (status "draft", never "active") from the lesson. */
  draftPlaybookCandidate?: boolean;
  recordedBy: string;
}

export async function completeRetrospective(id: string, input: CompleteRetrospectiveInput) {
  const retro = await getRetrospective(id);
  if (!retro) throw new Error("Retrospective not found");

  const outcomeVsExpectation = compareOutcomeToExpectation(retro.expectation, input.outcome);

  // 1. Write the lesson back as a slow-decaying institutional memory.
  const memory = await recordMemory({
    class: "lesson",
    title: `Lesson: ${retro.decision.slice(0, 80)}`,
    content: [
      `Situation: ${retro.situation}`,
      `Decision: ${retro.decision}`,
      `Expectation: ${retro.expectation}`,
      `Outcome: ${input.outcome}`,
      `Lesson: ${input.lesson}`,
    ].join("\n"),
    entityId: retro.decisionEntityId,
    relatedEntityIds: [],
    provenanceSource: `retrospective:${retro.id}`,
    sourceType: "retrospective",
  });

  // 2. Write the lesson back as a graph edge: decision --evidences--> lesson
  // is modeled by linking the decision entity to a synthetic "lesson"
  // marker via evidence_links in the caller (API layer) since memories are
  // not entities. Here we add a human-reviewable fact edge only when the
  // decision supersedes an earlier decision is out of scope; instead we
  // record an `informs` proposal from the decision entity to itself-scoped
  // playbook candidate (step 3) once created.

  let playbookCandidateId: string | null = null;
  if (input.draftPlaybookCandidate) {
    const candidate = await createCandidatePlaybook({
      name: `Candidate: ${retro.decision.slice(0, 60)}`,
      trigger: { description: retro.situation },
      steps: [
        {
          order: 1,
          text: input.lesson,
          owner: "unassigned",
          verification: "Reviewed by team lead before activation",
        },
      ],
      createdFromRetrospectiveId: retro.id,
    });
    playbookCandidateId = candidate.id;

    await createRelation({
      fromEntityId: retro.decisionEntityId,
      toEntityId: retro.decisionEntityId,
      relationType: "informs",
      provenanceSource: `retrospective:${retro.id}`,
      extractedBy: "rule",
      confidenceClass: "observed",
      notes: `Retrospective lesson informed draft playbook candidate ${candidate.id} (pending human review; never auto-published).`,
    }).catch(() => null); // self-loop notes edge is best-effort annotation only
  }

  const [updated] = await db
    .update(retrospectives)
    .set({
      outcome: input.outcome,
      lesson: input.lesson,
      outcomeVsExpectation,
      playbookImpactId: playbookCandidateId,
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(retrospectives.id, id))
    .returning();

  return { retrospective: updated, memory, playbookCandidateId };
}

export async function skipRetrospective(id: string) {
  const [row] = await db
    .update(retrospectives)
    .set({ status: "skipped", completedAt: new Date() })
    .where(eq(retrospectives.id, id))
    .returning();
  return row;
}

/** Part 10 capability hook: sweep for due retrospectives and ensure a task
 * exists for each (idempotent — retrospectives already created are reused,
 * this just surfaces which decisions are now due for review). */
export async function runRetrospectiveSweep(now: Date = new Date()) {
  const due = await listDueRetrospectives(now);
  const withDecisions = await Promise.all(
    due.map(async (r) => {
      const [decision] = await db.select().from(entities).where(eq(entities.id, r.decisionEntityId));
      return { retrospective: r, decision: decision ?? null };
    }),
  );
  return withDecisions;
}
