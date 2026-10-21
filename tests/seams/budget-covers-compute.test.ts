// Seam: Part 16's budgets cover Part 06's compute. An agent run that would
// exceed the org's remaining compute budget is rejected before any row is
// written, and one that fits is charged exactly its declared cost.
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { budgets, agentRuns } from "@/db/schema";
import { createAgentRun } from "@/services/agent-runs";
import { BudgetExceededError, currentPeriod } from "@/lib/budget";
import { createOrg, createMember } from "../helpers/fixtures";

describe("seam: compute budgets cover agent runs", () => {
  it("charges the budget for a run that fits, and rejects one that does not", async () => {
    const org = await createOrg();
    const analyst = await createMember(org.id, "analyst");
    const session = { userId: analyst.id, orgId: org.id, role: "analyst" as const, userEmail: analyst.email };

    // Shrink the default budget so the test is fast and deterministic.
    await db.insert(budgets).values({ orgId: org.id, period: currentPeriod(), computeUnitsLimit: 5, computeUnitsUsed: 0 });

    const { run } = await createAgentRun(session, {
      agentName: "budget-test-agent",
      goal: "fits the budget",
      actions: [{ actionType: "noop", riskLevel: "low", payload: {}, computeUnits: 4 }],
    });
    expect(run.computeUnitsCharged).toBe(4);

    const [budgetRow] = await db.select().from(budgets).where(eq(budgets.orgId, org.id));
    expect(budgetRow.computeUnitsUsed).toBe(4);

    const runsBefore = await db.select().from(agentRuns).where(eq(agentRuns.orgId, org.id));

    await expect(
      createAgentRun(session, {
        agentName: "budget-test-agent",
        goal: "exceeds the remaining budget",
        actions: [{ actionType: "noop", riskLevel: "low", payload: {}, computeUnits: 5 }],
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    const runsAfter = await db.select().from(agentRuns).where(eq(agentRuns.orgId, org.id));
    expect(runsAfter.length).toBe(runsBefore.length); // no partial state left behind
  });
});
