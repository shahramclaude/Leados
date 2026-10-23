// LEADOS Agent Kernel — Critic.
//
// Scores a completed run's objective against:
//   (a) VISIBLE criteria — the `successCriteria` the Planner attached to each
//       node (the planner can see and "aim for" these, so they are useful
//       but gameable — classic Goodhart's law exposure).
//   (b) HIDDEN criteria — fixed dimensions defined only in this module,
//       never part of the `PlanNode` type and never shown to the Planner.
//       A plan that satisfies (a) perfectly while failing (b) is exactly the
//       "letter vs. intent" failure mode PHASE 5 calls out, and the bounded
//       replan loop (max 2 iterations) exists to correct it without
//       infinite refinement.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, planNodes, policyDecisions, stepRecords } from "@/db/schema";
import type { Clock } from "./clock";
import { refinePlanGraph } from "./planner";
import type { PlanGraph } from "./types";

export const MAX_REPLANS = 2;
export const PASS_THRESHOLD = 3; // out of 5
export const HIDDEN_FLOOR = 2; // out of 5 — no hidden dimension may fall below this

export interface RubricDimensionScore {
  id: string;
  visible: boolean;
  score: number; // 1..5
  rationale: string;
}

export interface CriticReview {
  overallScore: number;
  dimensions: RubricDimensionScore[];
  passed: boolean;
  lowestDimension: RubricDimensionScore;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export async function reviewRun(runId: string): Promise<CriticReview> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run) throw new Error(`agent run ${runId} not found`);
  const plan = run.planGraph as PlanGraph;
  const steps = await db.select().from(stepRecords).where(eq(stepRecords.runId, runId)).orderBy(asc(stepRecords.id));
  const decisions = await db.select().from(policyDecisions).where(eq(policyDecisions.runId, runId));

  const dimensions: RubricDimensionScore[] = [];

  // --- Visible dimensions: one per rubric-type success criterion. ---
  for (const node of plan.root) {
    for (const criterion of node.successCriteria) {
      if (criterion.check !== "rubric") continue;
      const step = steps.find((s) => s.nodeId === node.id);
      const outputText = step?.outputSummary ?? "";
      const overlap = jaccard(tokenize(plan.objective), tokenize(`${node.goal} ${outputText}`));
      const score = step?.outcome === "success" ? Math.max(1, Math.min(5, 1 + Math.round(overlap * 8))) : 1;
      dimensions.push({
        id: criterion.id,
        visible: true,
        score,
        rationale: `token overlap between objective and node "${node.id}" output = ${overlap.toFixed(2)}`,
      });
    }
  }
  if (dimensions.length === 0) {
    dimensions.push({ id: "no-rubric-criteria", visible: true, score: 3, rationale: "plan had no rubric-scored nodes" });
  }

  // --- Hidden dimensions: never exposed via PlanNode type. ---
  const allOutputs = steps.map((s) => s.outputSummary ?? "").join(" ");
  const intentFidelity = jaccard(tokenize(plan.objective), tokenize(allOutputs));
  dimensions.push({
    id: "intent-fidelity",
    visible: false,
    score: Math.max(1, Math.min(5, 1 + Math.round(intentFidelity * 8))),
    rationale: `objective<->full-trace token overlap = ${intentFidelity.toFixed(2)}`,
  });

  const hardDenials = decisions.filter((d) => !d.allow && (d.reasons as string[]).some((r) => r.startsWith("PROHIBITED"))).length;
  dimensions.push({
    id: "stakeholder-safety",
    visible: false,
    score: Math.max(1, 5 - hardDenials * 2),
    rationale: `${hardDenials} hard policy denial(s) encountered during the run`,
  });

  const hasVerify = plan.root.some((n) => n.kind === "verify");
  const verifySucceeded = plan.root
    .filter((n) => n.kind === "verify")
    .every((n) => steps.find((s) => s.nodeId === n.id)?.outcome === "success");
  dimensions.push({
    id: "process-integrity",
    visible: false,
    score: hasVerify && verifySucceeded ? 5 : hasVerify ? 2 : 1,
    rationale: hasVerify
      ? `verify node(s) present, succeeded=${verifySucceeded}`
      : "no verify node present in plan",
  });

  const overallScore =
    dimensions.reduce((sum, d) => sum + d.score, 0) / Math.max(1, dimensions.length);
  const hiddenFloorOk = dimensions.filter((d) => !d.visible).every((d) => d.score >= HIDDEN_FLOOR);
  const lowestDimension = dimensions.slice().sort((a, b) => a.score - b.score)[0];
  const passed = overallScore >= PASS_THRESHOLD && hiddenFloorOk;

  return { overallScore, dimensions, passed, lowestDimension };
}

export type CriticOutcome =
  | { kind: "success"; review: CriticReview }
  | { kind: "replanning"; review: CriticReview; newNodeId: string }
  | { kind: "partial"; review: CriticReview };

// Bounded loop: review -> if failing and replanCount < MAX_REPLANS, ask the
// Planner to refine once, otherwise accept the result as "partial" rather
// than refining forever.
export async function reviewAndMaybeReplan(runId: string, clock: Clock): Promise<CriticOutcome> {
  const review = await reviewRun(runId);
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run) throw new Error(`agent run ${runId} not found`);

  if (review.passed) {
    await db
      .update(agentRuns)
      .set({
        status: "success",
        verdict: "success",
        criticScore: review.overallScore.toFixed(2),
        criticFeedback: review.dimensions,
        updatedAt: new Date(clock.nowIso()),
      })
      .where(eq(agentRuns.id, runId));
    return { kind: "success", review };
  }

  if (run.replanCount >= MAX_REPLANS) {
    await db
      .update(agentRuns)
      .set({
        status: "partial",
        verdict: "partial",
        criticScore: review.overallScore.toFixed(2),
        criticFeedback: review.dimensions,
        updatedAt: new Date(clock.nowIso()),
      })
      .where(eq(agentRuns.id, runId));
    return { kind: "partial", review };
  }

  const plan = run.planGraph as PlanGraph;
  const refined = refinePlanGraph({
    previous: plan,
    feedbackDimension: review.lowestDimension.id,
    seed: plan.seed,
    clock,
  });
  const newNode = refined.root[refined.root.length - 1];
  await db.insert(planNodes).values({
    runId,
    nodeId: newNode.id,
    kind: newNode.kind,
    goal: newNode.goal,
    tool: newNode.tool,
    inputSchema: newNode.inputSchema,
    estCostUsd: newNode.estCostUsd.toFixed(4),
    estMin: newNode.estMin.toFixed(2),
    riskTier: newNode.riskTier,
    dependsOn: newNode.dependsOn,
    successCriteria: newNode.successCriteria,
    status: "pending",
  });
  await db
    .update(agentRuns)
    .set({
      status: "running",
      planGraph: refined,
      replanCount: run.replanCount + 1,
      criticScore: review.overallScore.toFixed(2),
      criticFeedback: review.dimensions,
      updatedAt: new Date(clock.nowIso()),
    })
    .where(eq(agentRuns.id, runId));
  return { kind: "replanning", review, newNodeId: newNode.id };
}
