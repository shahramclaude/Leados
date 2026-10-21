import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentActions, agentRuns } from "@/db/schema";
import { can } from "@/lib/permissions";
import { recordEvent } from "@/lib/envelope";
import { requiresApproval, type RiskLevel } from "@/lib/interrupt-policy";
import { chargeCompute } from "@/lib/budget";
import { ValidationError, ForbiddenServiceError, NotFoundServiceError, ConflictServiceError } from "@/lib/errors";
import type { SessionContext } from "@/lib/demo-auth";

export { NotFoundServiceError, ConflictServiceError } from "@/lib/errors";

export type CreateAgentRunInput = {
  agentName: string;
  goal: string;
  actions: Array<{
    actionType: string;
    riskLevel: RiskLevel;
    payload: Record<string, unknown>;
    computeUnits: number;
  }>;
};


export async function listAgentRuns(session: SessionContext) {
  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.orgId, session.orgId))
    .orderBy(desc(agentRuns.createdAt));
  const actions = await db.select().from(agentActions).where(eq(agentActions.orgId, session.orgId));
  return { runs, actions };
}

export async function createAgentRun(session: SessionContext, input: CreateAgentRunInput) {
  if (!can(session.role, "agent_run:create")) {
    throw new ForbiddenServiceError("Role lacks agent_run:create");
  }
  if (input.actions.length === 0) throw new ValidationError("At least one action is required");

  const totalCompute = input.actions.reduce((sum, a) => sum + a.computeUnits, 0);

  // Part 16 budget seam: charged BEFORE any row is created — a rejected
  // charge leaves zero partial state behind.
  await chargeCompute(session.orgId, totalCompute);

  const [run] = await db
    .insert(agentRuns)
    .values({
      orgId: session.orgId,
      agentName: input.agentName,
      goal: input.goal,
      status: "running",
      computeUnitsCharged: totalCompute,
      createdBy: session.userId,
    })
    .returning();

  await recordEvent({
    orgId: session.orgId,
    actorType: "agent",
    actorId: input.agentName,
    action: "agent_run.created",
    entityType: "agent_run",
    entityId: run.id,
    payload: { goal: run.goal, computeUnitsCharged: totalCompute },
  });

  let anyPending = false;
  const createdActions = [];
  for (const action of input.actions) {
    const needsApproval = requiresApproval(action.riskLevel);
    if (needsApproval) anyPending = true;

    const [row] = await db
      .insert(agentActions)
      .values({
        agentRunId: run.id,
        orgId: session.orgId,
        actionType: action.actionType,
        riskLevel: action.riskLevel,
        payload: action.payload,
        requiresApproval: needsApproval,
        status: needsApproval ? "awaiting_approval" : "executed",
      })
      .returning();

    await recordEvent({
      orgId: session.orgId,
      actorType: "agent",
      actorId: input.agentName,
      action: needsApproval ? "agent_action.awaiting_approval" : "agent_action.executed",
      entityType: "agent_action",
      entityId: row.id,
      payload: { actionType: row.actionType, riskLevel: row.riskLevel },
    });

    createdActions.push(row);
  }

  const [finalRun] = await db
    .update(agentRuns)
    .set({ status: anyPending ? "awaiting_approval" : "completed", completedAt: anyPending ? null : new Date() })
    .where(eq(agentRuns.id, run.id))
    .returning();

  return { run: finalRun, actions: createdActions };
}

export async function decideAgentAction(
  session: SessionContext,
  runId: string,
  actionId: string,
  decision: "approve" | "reject",
) {
  if (!can(session.role, "agent_action:approve")) {
    throw new ForbiddenServiceError("Role lacks agent_action:approve");
  }

  const [action] = await db
    .select()
    .from(agentActions)
    .where(
      and(eq(agentActions.id, actionId), eq(agentActions.agentRunId, runId), eq(agentActions.orgId, session.orgId)),
    );

  if (!action) throw new NotFoundServiceError("Agent action not found in this org");
  if (action.status !== "awaiting_approval") {
    throw new ConflictServiceError(`Action is already ${action.status}`);
  }

  const newStatus = decision === "approve" ? "executed" : "rejected";

  const [updated] = await db
    .update(agentActions)
    .set({ status: newStatus, approvedBy: session.userId, approvedAt: new Date() })
    .where(eq(agentActions.id, actionId))
    .returning();

  await recordEvent({
    orgId: session.orgId,
    actorType: "human",
    actorId: session.userId,
    action: newStatus === "executed" ? "agent_action.approved" : "agent_action.rejected",
    entityType: "agent_action",
    entityId: actionId,
    payload: { decision },
  });

  const remaining = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.agentRunId, runId), eq(agentActions.status, "awaiting_approval")));

  if (remaining.length === 0) {
    await db
      .update(agentRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(agentRuns.id, runId));
  }

  return updated;
}
