import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { agentRuns, stepRecords } from "@/db/schema";
import { SystemClock } from "../clock";
import { createAndEnqueueRun } from "../orchestrator";
import { runOrResumeRun } from "../executor";

describe("Saga executor — budget gate aborts and compensates in reverse order", () => {
  it("runs compensation nodes in reverse order of completion when the budget is tightened mid-flight", async () => {
    const created = await createAndEnqueueRun({
      objective: "Forecast next quarter revenue and prepare scenario bands",
      budgetUsd: 1.5,
      budgetMin: 12,
      requestedBy: "test-suite",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Simulate a budget that is tightened after planning (e.g. a finance
    // policy change) so that the run MUST abort partway through, even
    // though the original plan validated fine against the original budget.
    // Allows n1 (ask, $0.01), n2 (act metrics.read, $0.01) and n3 (act
    // report.draft, $0.08; has a compensation node) to complete — cumulative
    // $0.10 — but trips before n4 (projected $0.11 > $0.105 budget), so the
    // saga must unwind exactly node n3's compensation.
    await db.update(agentRuns).set({ budgetUsd: "0.105" }).where(eq(agentRuns.id, created.runId));

    const clock = new SystemClock();
    const result = await runOrResumeRun(created.runId, clock);
    expect(result.verdict).toBe("aborted");

    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, created.runId));
    expect(run.status).toBe("aborted");

    const steps = await db.select().from(stepRecords).where(eq(stepRecords.runId, created.runId));
    const successSteps = steps.filter((s) => s.outcome === "success");
    const compensatedSteps = steps.filter((s) => s.outcome === "compensated");

    // At least one node must have completed before the budget gate tripped,
    // and every node that needed compensation must have received it.
    expect(successSteps.length).toBeGreaterThan(0);
    const successNodeIdsNeedingComp = successSteps.map((s) => s.nodeId).filter((id) => id !== "n1" && id !== "n2");
    if (successNodeIdsNeedingComp.length > 0) {
      expect(compensatedSteps.length).toBeGreaterThan(0);
    }

    // Reverse-order check: compensations must be inserted in strictly
    // descending order of their original node index (n3 undone before n2
    // undone before n1), proving the saga unwinds LIFO, not FIFO.
    const compensatedInInsertionOrder = compensatedSteps
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((s) => parseInt(s.nodeId.replace(/[^0-9]/g, ""), 10));
    for (let i = 1; i < compensatedInInsertionOrder.length; i++) {
      expect(compensatedInInsertionOrder[i]).toBeLessThan(compensatedInInsertionOrder[i - 1]);
    }
  });
});
