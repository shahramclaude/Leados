// Seam: Part 04's interrupt policy is honored by Part 12's agent action
// executor. Low-risk actions auto-execute; medium/high-risk actions must
// stop in "awaiting_approval" until a human decides.
import { describe, expect, it } from "vitest";
import { createAgentRun, decideAgentAction } from "@/services/agent-runs";
import { createOrg, createMember } from "../helpers/fixtures";

describe("seam: interrupt policy honored by agent action execution", () => {
  it("auto-executes low-risk actions and pauses high-risk ones for approval", async () => {
    const org = await createOrg();
    const analyst = await createMember(org.id, "analyst");
    const owner = await createMember(org.id, "owner");
    const session = { userId: analyst.id, orgId: org.id, role: "analyst" as const, userEmail: analyst.email };
    const ownerSession = { userId: owner.id, orgId: org.id, role: "owner" as const, userEmail: owner.email };

    const { run, actions } = await createAgentRun(session, {
      agentName: "interrupt-test-agent",
      goal: "test interrupt policy",
      actions: [
        { actionType: "refresh-dashboard", riskLevel: "low", payload: {}, computeUnits: 1 },
        { actionType: "change-pricing-rule", riskLevel: "high", payload: {}, computeUnits: 2 },
      ],
    });

    const lowAction = actions.find((a) => a.riskLevel === "low")!;
    const highAction = actions.find((a) => a.riskLevel === "high")!;

    expect(lowAction.status).toBe("executed");
    expect(highAction.status).toBe("awaiting_approval");
    expect(run.status).toBe("awaiting_approval");

    const decided = await decideAgentAction(ownerSession, run.id, highAction.id, "approve");
    expect(decided.status).toBe("executed");
  });

  it("never lets a non-privileged role bypass approval", async () => {
    const org = await createOrg();
    const viewer = await createMember(org.id, "viewer");
    const viewerSession = { userId: viewer.id, orgId: org.id, role: "viewer" as const, userEmail: viewer.email };

    await expect(
      decideAgentAction(viewerSession, "00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000", "approve"),
    ).rejects.toThrow(/agent_action:approve/);
  });
});
