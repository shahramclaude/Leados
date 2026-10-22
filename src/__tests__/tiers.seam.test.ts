// Seam: Part 10's tiers gate Part 11's tools, enforced server-side
// regardless of what the agent "asked" to do.
import { describe, expect, it } from "vitest";
import { canUseTool } from "@/lib/tiers";
import { createTestAgent, createTestLead, createTestOrg, internalRequest } from "./helpers";
import { POST as runAgentTool } from "@/app/api/agent/run/route";

describe("agent tier gate seam", () => {
  it("a tier-0 (read_only) agent cannot draft outreach (requires tier >= 1)", () => {
    const gate = canUseTool(0, "lead.draft_outreach");
    expect(gate.allowed).toBe(false);
  });

  it("a tier-2 agent cannot autonomously send outreach (requires tier >= 3)", () => {
    const gate = canUseTool(2, "lead.auto_send_outreach");
    expect(gate.allowed).toBe(false);
  });

  it("the agent/run route enforces the tier gate server-side, not just the catalogue function", async () => {
    const org = await createTestOrg();
    const agent = await createTestAgent(org.id, 0); // read_only
    const lead = await createTestLead(org.id);
    const req = internalRequest("http://test/api/agent/run", org.id, {
      method: "POST",
      body: JSON.stringify({ agentId: agent.id, tool: "lead.auto_send_outreach", leadId: lead.id }),
    });
    const res = await runAgentTool(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/requires tier/i);
  });

  it("a tier-3 agent is allowed to use the highest-risk autonomous-send tool", async () => {
    const org = await createTestOrg();
    const agent = await createTestAgent(org.id, 3);
    const lead = await createTestLead(org.id);
    const req = internalRequest("http://test/api/agent/run", org.id, {
      method: "POST",
      body: JSON.stringify({ agentId: agent.id, tool: "lead.auto_send_outreach", leadId: lead.id }),
    });
    const res = await runAgentTool(req);
    expect(res.status).toBe(200);
  });
});
