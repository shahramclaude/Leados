import { db } from "@/db";
import { agentRuns, agents, decisions, leads, signals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireInternalOrgId } from "@/lib/tenant";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { writeWithEnvelope } from "@/lib/envelope";
import { canUseTool, TOOL_CATALOG, type AgentTier } from "@/lib/tiers";
import { checkAndConsumeBudget } from "@/lib/budget";
import { enforceLanguagePolicy } from "@/lib/language-policy";
import { makeExplain } from "@/lib/explain";
import { scoreLead } from "@/lib/scoring";
import { quoteUntrustedData, scanForInjectionAttempt } from "@/lib/injection-guard";

export const dynamic = "force-dynamic";

// Every agent tool invocation (Part 10/11) flows through exactly this
// pipeline: tier gate -> budget gate -> tool execution -> language policy ->
// write envelope. No tool is allowed to skip a stage, including the
// "autonomous" tier-3 tool.
export async function POST(req: Request) {
  try {
    const orgId = requireInternalOrgId(req);
    const body = await req.json();
    const agentId = Number(body.agentId);
    const tool = typeof body.tool === "string" ? body.tool : "";
    const leadId = Number(body.leadId);
    if (!Number.isInteger(agentId) || !tool || !Number.isInteger(leadId)) {
      return jsonError('"agentId", "tool" and "leadId" are required', 400);
    }

    const [agent] = await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)));
    if (!agent) return jsonError("agent not found in this org", 404);

    const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)));
    if (!lead) return jsonError("lead not found in this org", 404);

    const tierGate = canUseTool(agent.tier as AgentTier, tool);
    if (!tierGate.allowed) {
      await logRun(orgId, agentId, tool, agent.tier, "denied_tier", body, { reason: tierGate.reason });
      return jsonError(tierGate.reason, 403);
    }

    const costUnits = TOOL_CATALOG[tool].costUnits;
    const budget = await checkAndConsumeBudget(orgId, costUnits);
    if (!budget.allowed) {
      await logRun(orgId, agentId, tool, agent.tier, "denied_budget", body, budget);
      return jsonError(`compute budget exhausted for this period (used ${budget.used}/${budget.limit})`, 429);
    }

    const leadSignals = await db
      .select()
      .from(signals)
      .where(and(eq(signals.orgId, orgId), eq(signals.leadId, leadId)));

    const result = await runTool(tool, { orgId, lead, signals: leadSignals });

    await logRun(orgId, agentId, tool, agent.tier, "ok", body, result.explain);

    let decisionRow = null;
    if (result.decisionKind) {
      decisionRow = await writeWithEnvelope({
        orgId,
        actorType: "agent",
        actorId: `agent:${agentId}`,
        entityType: "decision",
        entityId: (r) => String((r as { id: number }).id),
        action: `decision.${result.decisionKind}`,
        reason: result.explain.basis.join("; "),
        mutate: async () => {
          const [row] = await db
            .insert(decisions)
            .values({
              orgId,
              leadId,
              kind: result.decisionKind!,
              value: result.explain.value as object,
              confidence: String(result.explain.confidence),
              basis: result.explain.basis,
              rationale: typeof result.explain.value === "string" ? result.explain.value : JSON.stringify(result.explain.value),
              actorType: "agent",
              actorId: `agent:${agentId}`,
              languagePolicyViolations: result.explain.policyViolations,
            })
            .returning();
          return row;
        },
        after: (row) => row,
      });
    }

    return Response.json({
      ok: true,
      explain: result.explain,
      decision: decisionRow,
      budget,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

async function logRun(
  orgId: number,
  agentId: number,
  tool: string,
  tier: number,
  status: "ok" | "denied_tier" | "denied_budget" | "denied_policy" | "error",
  input: unknown,
  output: unknown,
) {
  await writeWithEnvelope({
    orgId,
    actorType: "agent",
    actorId: `agent:${agentId}`,
    entityType: "agent_run",
    entityId: (r) => String((r as { id: number }).id),
    action: `agent_run.${tool}`,
    reason: `tool "${tool}" invoked at tier ${tier} -> ${status}`,
    mutate: async () => {
      const [row] = await db
        .insert(agentRuns)
        .values({
          orgId,
          agentId,
          tool,
          tierAtRun: tier,
          status,
          costUnits: String(TOOL_CATALOG[tool]?.costUnits ?? 0),
          input,
          output,
        })
        .returning();
      return row;
    },
    after: (row) => row,
  });
}

interface ToolContext {
  orgId: number;
  lead: typeof leads.$inferSelect;
  signals: (typeof signals.$inferSelect)[];
}

interface ToolResult {
  explain: ReturnType<typeof makeExplain>;
  decisionKind: string | null;
}

async function runTool(tool: string, ctx: ToolContext): Promise<ToolResult> {
  switch (tool) {
    case "lead.read": {
      return {
        decisionKind: null,
        explain: makeExplain({
          value: { lead: ctx.lead, signalCount: ctx.signals.length },
          confidence: 1,
          basis: ["read-only tool, no inference performed"],
          generatedBy: "agent",
        }),
      };
    }
    case "lead.auto_score": {
      const explain = scoreLead(
        ctx.signals.map((s) => ({ type: s.type, confidence: Number(s.confidence), createdAt: s.createdAt })),
      );
      await db
        .update(leads)
        .set({ score: String(explain.value), scoreConfidence: String(explain.confidence), updatedAt: new Date() })
        .where(eq(leads.id, ctx.lead.id));
      return { decisionKind: "auto_score", explain };
    }
    case "lead.draft_outreach": {
      // Untrusted inputs (company name, signal payloads) are quoted as inert
      // data, never concatenated as if they were instructions to the drafter.
      const scan = scanForInjectionAttempt(ctx.lead.company + " " + ctx.lead.name);
      const draftRaw = `Hi ${ctx.lead.name}, noticed ${quoteUntrustedData(ctx.lead.company)} will definitely benefit from LEADOS. We guarantee results.`;
      const confidence = 0.55;
      const policy = enforceLanguagePolicy(draftRaw, confidence);
      return {
        decisionKind: "draft_outreach",
        explain: makeExplain({
          value: policy.text,
          confidence,
          basis: [
            `drafted from ${ctx.signals.length} known signal(s)`,
            scan.suspicious ? "input flagged by injection guard and rendered as inert data" : "no injection risk detected in inputs",
          ],
          generatedBy: "llm",
          policyViolations: policy.violations,
        }),
      };
    }
    case "lead.propose_stage_change": {
      const nextStage = ctx.lead.stage === "new" ? "qualified" : "new";
      return {
        decisionKind: "propose_stage_change",
        explain: makeExplain({
          value: { from: ctx.lead.stage, to: nextStage, requiresApproval: true },
          confidence: 0.6,
          basis: [`${ctx.signals.length} signal(s) considered`, "proposal only — awaiting human approval"],
          generatedBy: "agent",
        }),
      };
    }
    case "lead.auto_send_outreach": {
      // Tier-3 tool. Still goes through the same policy + envelope pipeline;
      // "autonomous" means no human approval gate, not "no governance".
      const draftRaw = `Outreach to ${ctx.lead.name} at ${quoteUntrustedData(ctx.lead.company)} sent automatically. This will close.`;
      const confidence = 0.4;
      const policy = enforceLanguagePolicy(draftRaw, confidence);
      return {
        decisionKind: "auto_send_outreach",
        explain: makeExplain({
          value: policy.text,
          confidence,
          basis: ["autonomous send — highest-risk tool, see docs/RED-TEAM-2026.md AUTO-01"],
          generatedBy: "llm",
          policyViolations: policy.violations,
        }),
      };
    }
    default:
      throw new Error(`tool "${tool}" has no execution handler`);
  }
}
