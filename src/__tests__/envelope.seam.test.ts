// Seam: Part 01's write envelope on ALL writes, including agent (Part 10)
// and LLM-proposed (Part 11) writes. Proves every actor type produces an
// `events` row, by driving the real route handlers end-to-end against the
// test database.
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createTestAgent, createTestLead, createTestOrg, internalRequest } from "./helpers";
import { POST as createLead } from "@/app/api/leads/route";
import { POST as runAgentTool } from "@/app/api/agent/run/route";

describe("write envelope seam", () => {
  it("a human write (lead.create) produces an events row with actorType=human", async () => {
    const org = await createTestOrg();
    const req = internalRequest("http://test/api/leads", org.id, {
      method: "POST",
      body: JSON.stringify({ name: "Casey", company: "Globex" }),
    });
    const res = await createLead(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.orgId, org.id), eq(events.entityType, "lead"), eq(events.entityId, String(body.lead.id))));
    expect(rows.length).toBe(1);
    expect(rows[0].actorType).toBe("human");
  });

  it("an agent-tool write (lead.auto_score, tier 2) produces an agent_run AND decision envelope row", async () => {
    const org = await createTestOrg();
    const agent = await createTestAgent(org.id, 2);
    const lead = await createTestLead(org.id);

    const req = internalRequest("http://test/api/agent/run", org.id, {
      method: "POST",
      body: JSON.stringify({ agentId: agent.id, tool: "lead.auto_score", leadId: lead.id }),
    });
    const res = await runAgentTool(req);
    expect(res.status).toBe(200);

    const runRows = await db.select().from(events).where(and(eq(events.orgId, org.id), eq(events.entityType, "agent_run")));
    expect(runRows.length).toBeGreaterThanOrEqual(1);
    expect(runRows[0].actorType).toBe("agent");

    const decisionRows = await db
      .select()
      .from(events)
      .where(and(eq(events.orgId, org.id), eq(events.entityType, "decision")));
    expect(decisionRows.length).toBe(1);
    expect(decisionRows[0].actorType).toBe("agent");
  });

  it("an LLM-proposed write (lead.draft_outreach, tier 1 tool) still produces an envelope row with generatedBy=llm", async () => {
    const org = await createTestOrg();
    const agent = await createTestAgent(org.id, 1);
    const lead = await createTestLead(org.id);

    const req = internalRequest("http://test/api/agent/run", org.id, {
      method: "POST",
      body: JSON.stringify({ agentId: agent.id, tool: "lead.draft_outreach", leadId: lead.id }),
    });
    const res = await runAgentTool(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.explain.generatedBy).toBe("llm");

    const decisionRows = await db
      .select()
      .from(events)
      .where(and(eq(events.orgId, org.id), eq(events.entityType, "decision")));
    expect(decisionRows.length).toBe(1);
  });
});
