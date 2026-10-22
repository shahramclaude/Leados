// Seam: Part 05's language policy must apply to Part 11's generated text.
// Proves that the "draft_outreach" and "auto_send_outreach" LLM-style tools
// cannot ship absolute-certainty language at low confidence.
import { describe, expect, it } from "vitest";
import { enforceLanguagePolicy } from "@/lib/language-policy";
import { createTestAgent, createTestLead, createTestOrg, internalRequest } from "./helpers";
import { POST as runAgentTool } from "@/app/api/agent/run/route";

describe("language policy seam", () => {
  it("rewrites absolute language at low confidence", () => {
    const r = enforceLanguagePolicy("We guarantee this will definitely close.", 0.4);
    expect(r.rewritten).toBe(true);
    expect(r.text).not.toMatch(/guarantee/i);
    expect(r.violations.length).toBeGreaterThan(0);
  });

  it("leaves hedged language alone and reports no violations", () => {
    const r = enforceLanguagePolicy("This is likely to convert based on past behavior.", 0.9);
    expect(r.rewritten).toBe(false);
    expect(r.violations.length).toBe(0);
  });

  it("the draft_outreach agent tool output is policy-clean even though its template uses absolute language", async () => {
    const org = await createTestOrg();
    const agent = await createTestAgent(org.id, 1);
    const lead = await createTestLead(org.id);
    const req = internalRequest("http://test/api/agent/run", org.id, {
      method: "POST",
      body: JSON.stringify({ agentId: agent.id, tool: "lead.draft_outreach", leadId: lead.id }),
    });
    const res = await runAgentTool(req);
    const body = await res.json();
    expect(body.explain.value).not.toMatch(/will definitely|guarantee/i);
    expect(body.explain.policyViolations.length).toBeGreaterThan(0);
  });
});
