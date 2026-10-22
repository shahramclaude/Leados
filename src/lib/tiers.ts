// Agent tiers (Part 10) and the tool catalogue they gate (Part 11). The tier
// check happens server-side on every tool invocation — an LLM "deciding" to
// call a tool is never sufficient authorization by itself.
export const AGENT_TIERS = {
  0: "read_only",
  1: "draft_only",
  2: "propose_with_approval",
  3: "autonomous_execute",
} as const;

export type AgentTier = keyof typeof AGENT_TIERS;

export interface ToolDefinition {
  name: string;
  minTier: AgentTier;
  description: string;
  /** Rough compute cost in budget units (Part 18) per invocation. */
  costUnits: number;
}

export const TOOL_CATALOG: Record<string, ToolDefinition> = {
  "lead.read": {
    name: "lead.read",
    minTier: 0,
    description: "Read lead + signal data.",
    costUnits: 0.1,
  },
  "lead.draft_outreach": {
    name: "lead.draft_outreach",
    minTier: 1,
    description: "Draft (but not send) an outreach message.",
    costUnits: 1,
  },
  "lead.propose_stage_change": {
    name: "lead.propose_stage_change",
    minTier: 2,
    description: "Propose a pipeline stage change for human approval.",
    costUnits: 1.5,
  },
  "lead.auto_score": {
    name: "lead.auto_score",
    minTier: 2,
    description: "Autonomously recompute and commit a lead score.",
    costUnits: 2,
  },
  "lead.auto_send_outreach": {
    name: "lead.auto_send_outreach",
    minTier: 3,
    description: "Autonomously send outreach without human approval (highest risk tool).",
    costUnits: 3,
  },
};

export function canUseTool(agentTier: AgentTier, toolName: string): { allowed: boolean; reason: string } {
  const tool = TOOL_CATALOG[toolName];
  if (!tool) {
    return { allowed: false, reason: `unknown tool "${toolName}"` };
  }
  if (agentTier < tool.minTier) {
    return {
      allowed: false,
      reason: `tool "${toolName}" requires tier >= ${tool.minTier} (${AGENT_TIERS[tool.minTier]}), agent is tier ${agentTier} (${AGENT_TIERS[agentTier]})`,
    };
  }
  return { allowed: true, reason: "tier sufficient" };
}
