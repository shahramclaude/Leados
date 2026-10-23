// LEADOS Agent Kernel — Planner.
//
// ALGORITHM: "HTN-lite template decomposition". This is a bounded form of
// Hierarchical Task Network planning: (1) classify the objective into a
// taxonomy category (taxonomy.ts), (2) look up a fixed abstract subtask
// template for that category, (3) instantiate each abstract subtask into a
// concrete `PlanNode` bound to a registered tool, cost/time estimate and
// risk tier, (4) attach a `compensation` node to every node whose tool has
// `sideEffects !== 'read'` so the saga executor can undo it on abort.
//
// Determinism: the planner takes no wall-clock reads (Clock is accepted only
// to timestamp `createdAt`, never to branch control flow) and draws no
// randomness outside the supplied seed. Temperature-0 equivalent: given the
// same (objective, budgetUsd, budgetMin, seed) tuple, buildPlanGraph always
// returns a structurally identical PlanGraph (same node ids, same order,
// same tool bindings). This is what the replay-determinism eval gate
// measures.
import type { Clock } from "./clock";
import { hashOf } from "./hash";
import { classifyObjective, type ObjectiveCategory } from "./taxonomy";
import type { Criterion, PlanGraph, PlanNode, RiskTier, ToolId } from "./types";

interface AbstractSubtask {
  kind: PlanNode["kind"];
  goal: string;
  tool: ToolId;
  riskTier: RiskTier;
  costUsd: number;
  min: number;
  criteria: Criterion[];
  dependsOnPrev: number[]; // indices (0-based, relative to this template) of parents
  needsCompensation: boolean;
}

const TEMPLATES: Record<ObjectiveCategory, AbstractSubtask[]> = {
  forecast: [
    {
      kind: "ask",
      goal: "Confirm forecast scope and historicals window with requester",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 1,
      criteria: [{ id: "scope-confirmed", description: "Scope and window confirmed", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Pull trailing eight-quarter revenue and pipeline metrics",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "data-pulled", description: "Historical metrics retrieved", check: "automatic" }],
      dependsOnPrev: [0],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Draft quarter forecast narrative with scenario bands",
      tool: "report.draft",
      riskTier: 1,
      costUsd: 0.08,
      min: 3,
      criteria: [
        { id: "narrative-complete", description: "Forecast narrative covers base/bull/bear scenarios", check: "rubric", threshold: 3 },
      ],
      dependsOnPrev: [1],
      needsCompensation: true,
    },
    {
      kind: "verify",
      goal: "Verify forecast is internally consistent with budget guardrails",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 1,
      criteria: [{ id: "internally-consistent", description: "No scenario violates budget guardrail", check: "automatic" }],
      dependsOnPrev: [2],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Create follow-up task to review forecast with FP&A",
      tool: "task.create",
      riskTier: 2,
      costUsd: 0.02,
      min: 1,
      criteria: [{ id: "followup-created", description: "FP&A review task exists", check: "automatic" }],
      dependsOnPrev: [3],
      needsCompensation: true,
    },
  ],
  "churn-diagnosis": [
    {
      kind: "act",
      goal: "Pull cohort retention and cancellation metrics",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "cohorts-pulled", description: "Cohort data retrieved", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Segment churn by plan tier and tenure",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "segmented", description: "Churn segmented by tier and tenure", check: "automatic" }],
      dependsOnPrev: [0],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Draft root-cause diagnosis memo",
      tool: "report.draft",
      riskTier: 1,
      costUsd: 0.08,
      min: 3,
      criteria: [{ id: "memo-grounded", description: "Memo cites at least two independent signals", check: "rubric", threshold: 3 }],
      dependsOnPrev: [1],
      needsCompensation: true,
    },
    {
      kind: "verify",
      goal: "Verify diagnosis cites at least two independent signals",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 1,
      criteria: [{ id: "signals-checked", description: "Two or more signals present", check: "automatic" }],
      dependsOnPrev: [2],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Create task to ship a retention experiment",
      tool: "task.create",
      riskTier: 2,
      costUsd: 0.02,
      min: 1,
      criteria: [{ id: "experiment-task", description: "Retention experiment task exists", check: "automatic" }],
      dependsOnPrev: [3],
      needsCompensation: true,
    },
  ],
  "board-pack": [
    {
      kind: "act",
      goal: "Pull KPI scorecard for the reporting period",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "kpis-pulled", description: "KPI scorecard retrieved", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Pull OKR status for the reporting period",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "okrs-pulled", description: "OKR status retrieved", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Draft board pack narrative from KPI and OKR inputs",
      tool: "report.draft",
      riskTier: 1,
      costUsd: 0.1,
      min: 4,
      criteria: [{ id: "narrative-covers-both", description: "Narrative synthesizes KPI and OKR inputs", check: "rubric", threshold: 3 }],
      dependsOnPrev: [0, 1],
      needsCompensation: true,
    },
    {
      kind: "ask",
      goal: "Request executive sponsor sign-off on board pack tone",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 2,
      criteria: [{ id: "sponsor-signoff", description: "Sponsor sign-off requested", check: "automatic" }],
      dependsOnPrev: [2],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Distribute board pack to the board distribution list",
      tool: "email.send",
      riskTier: 4,
      costUsd: 0.03,
      min: 1,
      criteria: [{ id: "distributed", description: "Board pack distributed to approved list only", check: "automatic" }],
      dependsOnPrev: [3],
      needsCompensation: true,
    },
    {
      kind: "verify",
      goal: "Verify distribution confirmed and archived",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 1,
      criteria: [{ id: "archived", description: "Distribution receipt archived", check: "automatic" }],
      dependsOnPrev: [4],
      needsCompensation: false,
    },
  ],
  "budget-reallocation": [
    {
      kind: "act",
      goal: "Pull current budget allocation by cost center",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "allocation-pulled", description: "Current allocation retrieved", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Pull variance versus plan by cost center",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "variance-pulled", description: "Variance retrieved", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Draft reallocation rationale memo",
      tool: "report.draft",
      riskTier: 1,
      costUsd: 0.08,
      min: 3,
      criteria: [{ id: "rationale-grounded", description: "Rationale ties to variance data", check: "rubric", threshold: 3 }],
      dependsOnPrev: [0, 1],
      needsCompensation: true,
    },
    {
      kind: "act",
      goal: "Reallocate budget across cost centers",
      tool: "budget.reallocate",
      riskTier: 3,
      costUsd: 0.05,
      min: 2,
      criteria: [{ id: "net-zero", description: "Reallocation sums to zero net change", check: "automatic" }],
      dependsOnPrev: [2],
      needsCompensation: true,
    },
    {
      kind: "verify",
      goal: "Verify reallocation sums to zero net change",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 1,
      criteria: [{ id: "post-check", description: "Post-reallocation totals reconcile", check: "automatic" }],
      dependsOnPrev: [3],
      needsCompensation: false,
    },
  ],
  "policy-draft": [
    {
      kind: "act",
      goal: "Pull relevant precedent policies and incident history",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "precedent-pulled", description: "Precedent policies retrieved", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Draft updated policy text",
      tool: "policy.draft",
      riskTier: 1,
      costUsd: 0.1,
      min: 4,
      criteria: [{ id: "clauses-covered", description: "Draft covers required clauses", check: "rubric", threshold: 3 }],
      dependsOnPrev: [0],
      needsCompensation: true,
    },
    {
      kind: "ask",
      goal: "Request compliance review of the draft policy",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 2,
      criteria: [{ id: "compliance-requested", description: "Compliance review requested", check: "automatic" }],
      dependsOnPrev: [1],
      needsCompensation: false,
    },
    {
      kind: "verify",
      goal: "Verify policy draft covers all required clauses",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 1,
      criteria: [{ id: "clauses-verified", description: "Required clauses present", check: "automatic" }],
      dependsOnPrev: [2],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Create task to schedule policy rollout training",
      tool: "task.create",
      riskTier: 2,
      costUsd: 0.02,
      min: 1,
      criteria: [{ id: "training-task", description: "Rollout training task exists", check: "automatic" }],
      dependsOnPrev: [3],
      needsCompensation: true,
    },
  ],
  generic: [
    {
      kind: "act",
      goal: "Gather relevant context metrics for the stated objective",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.015,
      min: 1.5,
      criteria: [{ id: "context-gathered", description: "Relevant context metrics retrieved", check: "automatic" }],
      dependsOnPrev: [],
      needsCompensation: false,
    },
    {
      kind: "act",
      goal: "Draft a recommendation addressing the objective",
      tool: "report.draft",
      riskTier: 1,
      costUsd: 0.08,
      min: 3,
      criteria: [{ id: "recommendation-addresses-objective", description: "Recommendation addresses the stated objective", check: "rubric", threshold: 3 }],
      dependsOnPrev: [0],
      needsCompensation: true,
    },
    {
      kind: "verify",
      goal: "Verify the recommendation addresses the stated objective",
      tool: "metrics.read",
      riskTier: 0,
      costUsd: 0.01,
      min: 1,
      criteria: [{ id: "objective-addressed", description: "Objective is addressed", check: "automatic" }],
      dependsOnPrev: [1],
      needsCompensation: false,
    },
  ],
};

function buildNodes(category: ObjectiveCategory, idPrefix: string): PlanNode[] {
  const template = TEMPLATES[category];
  const ids = template.map((_, i) => `${idPrefix}${i + 1}`);
  return template.map((t, i) => {
    const node: PlanNode = {
      id: ids[i],
      kind: t.kind,
      goal: t.goal,
      tool: t.tool,
      inputSchema: `${t.tool}.input.v1`,
      input: { goal: t.goal, category },
      estCostUsd: t.costUsd,
      estMin: t.min,
      riskTier: t.riskTier,
      dependsOn: t.dependsOnPrev.map((p) => ids[p]),
      successCriteria: t.criteria,
    };
    if (t.needsCompensation) {
      node.compensation = {
        id: `${node.id}-comp`,
        kind: "compensate",
        goal: `Compensate: undo "${t.goal}"`,
        tool: t.tool,
        inputSchema: `${t.tool}.input.v1`,
        input: { goal: t.goal, category, action: "retract", originalNodeId: node.id },
        estCostUsd: Math.max(0.005, t.costUsd * 0.5),
        estMin: Math.max(0.5, t.min * 0.3),
        riskTier: t.riskTier,
        dependsOn: [],
        successCriteria: [{ id: "compensated", description: "Original effect undone", check: "automatic" }],
      };
    }
    return node;
  });
}

export function buildPlanGraph(args: {
  objective: string;
  budgetUsd: number;
  budgetMin: number;
  seed: string;
  clock: Clock;
  planIdSuffix?: string;
}): PlanGraph {
  const category = classifyObjective(args.objective);
  const idPrefix = "n";
  const root = buildNodes(category, idPrefix);
  const planId = `plan-${hashOf({ o: args.objective, s: args.seed }).slice(0, 16)}${
    args.planIdSuffix ?? ""
  }`;
  const promptHash = hashOf({
    objective: args.objective,
    seed: args.seed,
    budgetUsd: args.budgetUsd,
    budgetMin: args.budgetMin,
    createdBy: "planner-v1",
  });
  return {
    id: planId,
    objective: args.objective,
    root,
    budgetUsd: args.budgetUsd,
    budgetMin: args.budgetMin,
    createdBy: "planner-v1",
    createdAt: args.clock.nowIso(),
    seed: args.seed,
    promptHash,
  };
}

// Bounded refinement used by the Critic loop (see critic.ts). Appends one
// extra `verify` node addressing the critic's lowest-scoring dimension.
// Called at most twice per run (enforced by orchestrator/worker, not here).
export function refinePlanGraph(args: {
  previous: PlanGraph;
  feedbackDimension: string;
  seed: string;
  clock: Clock;
}): PlanGraph {
  const extraId = `${args.previous.root[args.previous.root.length - 1].id}-r${args.previous.root.length + 1}`;
  const extraNode: PlanNode = {
    id: extraId,
    kind: "verify",
    goal: `Address critic feedback: strengthen "${args.feedbackDimension}"`,
    tool: "metrics.read",
    inputSchema: "metrics.read.input.v1",
    input: { goal: `remediate:${args.feedbackDimension}` },
    estCostUsd: 0.02,
    estMin: 1,
    riskTier: 0,
    dependsOn: [args.previous.root[args.previous.root.length - 1].id],
    successCriteria: [
      { id: `remediated-${args.feedbackDimension}`, description: `Remediates ${args.feedbackDimension}`, check: "rubric", threshold: 3 },
    ],
  };
  const promptHash = hashOf({
    objective: args.previous.objective,
    seed: args.seed,
    budgetUsd: args.previous.budgetUsd,
    budgetMin: args.previous.budgetMin,
    createdBy: "planner-v1",
    refinementOf: args.previous.id,
  });
  return {
    ...args.previous,
    id: `${args.previous.id}-refined`,
    root: [...args.previous.root, extraNode],
    createdAt: args.clock.nowIso(),
    seed: args.seed,
    promptHash,
  };
}
