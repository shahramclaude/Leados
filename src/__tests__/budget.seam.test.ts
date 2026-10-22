// Seam: Part 18's compute budgets must cover Part 06's compute (here: every
// agent tool invocation). Proves budget exhaustion denies a run even when
// the tier gate would otherwise allow it.
import { describe, expect, it } from "vitest";
import { checkAndConsumeBudget, currentPeriod } from "@/lib/budget";
import { createTestAgent, createTestLead, createTestOrg, internalRequest } from "./helpers";
import { POST as runAgentTool } from "@/app/api/agent/run/route";

describe("compute budget seam", () => {
  it("consumes budget up to the limit and then denies further reservations", async () => {
    const org = await createTestOrg();
    const period = currentPeriod();
    const first = await checkAndConsumeBudget(org.id, 60, period);
    expect(first.allowed).toBe(true);
    const second = await checkAndConsumeBudget(org.id, 60, period);
    expect(second.allowed).toBe(false);
    expect(second.reason).toMatch(/exhausted/);
  });

  it("an otherwise-permitted agent tool call is denied once the org budget is exhausted", async () => {
    const org = await createTestOrg();
    const agent = await createTestAgent(org.id, 3);
    const lead = await createTestLead(org.id);
    const exhaust = await checkAndConsumeBudget(org.id, 100); // consume the full default monthly limit
    expect(exhaust.allowed).toBe(true);

    const req = internalRequest("http://test/api/agent/run", org.id, {
      method: "POST",
      body: JSON.stringify({ agentId: agent.id, tool: "lead.read", leadId: lead.id }),
    });
    const res = await runAgentTool(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/budget exhausted/i);
  });
});
