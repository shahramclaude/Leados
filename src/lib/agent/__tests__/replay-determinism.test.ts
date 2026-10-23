import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { SystemClock } from "../clock";
import { buildPlanGraph } from "../planner";
import { createAndEnqueueRun } from "../orchestrator";
import { reviewAndMaybeReplan } from "../critic";
import { computeAndStoreReplayHash, runOrResumeRun } from "../executor";
import { hashOf } from "../hash";

describe("Determinism", () => {
  it("buildPlanGraph is a pure function of (objective, budget, seed): identical structure every call", () => {
    const seed = "fixed-seed-123";
    const clock = new SystemClock();
    const a = buildPlanGraph({ objective: "Forecast next quarter revenue", budgetUsd: 1.5, budgetMin: 12, seed, clock });
    const b = buildPlanGraph({ objective: "Forecast next quarter revenue", budgetUsd: 1.5, budgetMin: 12, seed, clock });
    const strip = (p: typeof a) => ({ ...p, createdAt: "" });
    expect(hashOf(strip(a))).toBe(hashOf(strip(b)));
  });

  it("two full runs of the same objective+seed produce byte-identical replayHash", async () => {
    const objective = "Gather relevant context metrics for the stated objective and recommend next steps";
    const seed = `det-${randomUUID()}`;

    const runA = await createAndEnqueueRun({ objective, budgetUsd: 1.5, budgetMin: 12, requestedBy: "test", seedOverride: seed });
    const runB = await createAndEnqueueRun({ objective, budgetUsd: 1.5, budgetMin: 12, requestedBy: "test", seedOverride: seed });
    expect(runA.ok).toBe(true);
    expect(runB.ok).toBe(true);
    if (!runA.ok || !runB.ok) return;

    for (const runId of [runA.runId, runB.runId]) {
      const clock = new SystemClock();
      let guard = 0;
      // Drive to a stable terminal state.
      // eslint-disable-next-line no-constant-condition
      while (guard++ < 5) {
        const result = await runOrResumeRun(runId, clock);
        if (result.verdict === "success") {
          const outcome = await reviewAndMaybeReplan(runId, clock);
          if (outcome.kind === "replanning") continue;
        }
        break;
      }
      await computeAndStoreReplayHash(runId);
    }

    const [rowA] = await db.select().from(agentRuns).where(eq(agentRuns.id, runA.runId));
    const [rowB] = await db.select().from(agentRuns).where(eq(agentRuns.id, runB.runId));
    expect(rowA.replayHash).toBeTruthy();
    expect(rowA.replayHash).toBe(rowB.replayHash);
  });
});
