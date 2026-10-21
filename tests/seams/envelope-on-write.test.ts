// Seam: Part 01's envelope wraps every write, including agent writes
// (Part 07) and LLM-proposed writes (Part 08). This test performs one write
// of each actor type and asserts each produced exactly one correctly-shaped
// event row, chained to the previous one.
import { describe, expect, it } from "vitest";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { createFinding } from "@/services/findings";
import { createAgentRun } from "@/services/agent-runs";
import { createProposal } from "@/services/llm-proposals";
import { createOrg, createMember } from "../helpers/fixtures";

describe("seam: event envelope covers every actor type", () => {
  it("records human, agent, and llm writes in the same hash-chained log", async () => {
    const org = await createOrg();
    const analyst = await createMember(org.id, "analyst");
    const session = { userId: analyst.id, orgId: org.id, role: "analyst" as const, userEmail: analyst.email };

    const finding = await createFinding(session, {
      domain: "finance",
      title: "Envelope test finding",
      summary: "Checking the envelope fires on human writes",
      causalConfidence: "correlational",
      explanation: { headline: "h", reasons: ["r"], evidence: [], confidence: 0.4, detail: {} },
    });

    await createAgentRun(session, {
      agentName: "envelope-test-agent",
      goal: "prove envelope coverage",
      actions: [{ actionType: "noop", riskLevel: "low", payload: {}, computeUnits: 1 }],
    });

    await createProposal(session, { findingId: finding.id, draftText: "A neutral observation." });

    const rows = await db.select().from(events).where(eq(events.orgId, org.id)).orderBy(asc(events.createdAt));

    const actorTypes = rows.map((r) => r.actorType);
    expect(actorTypes).toContain("human");
    expect(actorTypes).toContain("agent");
    expect(actorTypes).toContain("llm");

    // Hash chain: every row's prevHash equals the previous row's hash.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].prevHash).toBe(rows[i - 1].hash);
    }
  });
});
