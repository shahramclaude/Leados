import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { kernelSteps } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import "@/lib/kernel/bootstrap";
import { createPlan, runCycle } from "@/lib/kernel/orchestrator";
import { engageKillSwitch, disengageKillSwitch, isKillSwitchEngaged } from "@/lib/kernel/killSwitch";
import { tick, registerJob, getRegisteredJobs } from "@/lib/kernel/scheduler";
import { resetKernelTables } from "./testDb";

const ACTOR = { kind: "human" as const, id: "operator" };

describe("global kill switch", () => {
  beforeEach(async () => {
    await resetKernelTables();
    await disengageKillSwitch(ACTOR);
  });

  it("halts a running cycle within one loop tick: engaging mid-run stops remaining steps from executing", async () => {
    const plan = await createPlan({
      goal: "five step read-only plan",
      domain: "org",
      dryRun: true,
      actor: ACTOR,
      steps: Array.from({ length: 5 }, () => ({ kind: "observe" as const, capability: "metrics.read", input: { metricKey: "demo_metric" }, risk: "read" as const })),
    });

    // Engage the kill switch BEFORE the run has started at all — the
    // strongest version of "halts within one tick": it never even begins.
    await engageKillSwitch("test: emergency stop", ACTOR);
    expect(await isKillSwitchEngaged()).toBe(true);

    const result = await runCycle(plan.planId, { actor: ACTOR });
    expect(result.status).toBe("halted");
    expect(result.haltedReason).toBe("kill_switch_engaged");

    const steps = await db.select().from(kernelSteps).where(eq(kernelSteps.runId, plan.planId));
    expect(steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("engaging mid-run (during step 0's execution) prevents step 1 and step 2 from ever starting", async () => {
    const { registerCapability } = await import("@/lib/kernel/registry");
    registerCapability({
      name: "test.engage_kill_switch_mid_run",
      riskClass: "read",
      requiredScope: "test",
      costEstimate: () => 0,
      dryRun: async () => ({ summary: "would engage the kill switch (test only)", changes: [] }),
      execute: async () => {
        await engageKillSwitch("engaged from within step 0", ACTOR);
        return { engaged: true };
      },
    });

    const plan = await createPlan({
      goal: "three step plan, kill switch engaged during step 0",
      domain: "org",
      dryRun: false,
      actor: ACTOR,
      steps: [
        { kind: "observe", capability: "test.engage_kill_switch_mid_run", input: {}, risk: "read" },
        { kind: "observe", capability: "metrics.read", input: { metricKey: "demo_metric" }, risk: "read" },
        { kind: "observe", capability: "metrics.read", input: { metricKey: "demo_metric" }, risk: "read" },
      ],
    });
    const { recordDryRunForPlan } = await import("@/lib/kernel/orchestrator");
    await recordDryRunForPlan(plan.planId, ACTOR);

    const result = await runCycle(plan.planId, { actor: ACTOR });
    expect(result.status).toBe("halted");
    expect(result.haltedReason).toBe("kill_switch_engaged");

    const steps = await db.select().from(kernelSteps).where(eq(kernelSteps.runId, plan.planId)).orderBy(asc(kernelSteps.idx));
    expect(steps[0].status).toBe("done"); // step 0 itself completed...
    expect(steps[1].status).toBe("pending"); // ...but the loop halted before step 1 started
    expect(steps[2].status).toBe("pending");
  });

  it("a scheduler tick runs nothing at all while the kill switch is engaged", async () => {
    let handlerCalls = 0;
    registerJob({
      name: "test-job-should-not-run",
      trigger: { type: "deadline" },
      handler: async () => {
        handlerCalls += 1;
        return { note: "ran" };
      },
    });

    await engageKillSwitch("tick test", ACTOR);
    const results = await tick();
    expect(results).toEqual([{ job: "*", ran: false, note: "kill switch engaged; tick skipped entirely" }]);
    expect(handlerCalls).toBe(0);
    expect(getRegisteredJobs().some((j) => j.name === "test-job-should-not-run")).toBe(true);
  });

  it("disengaging allows runs to proceed again", async () => {
    const plan = await createPlan({
      goal: "resume after disengage",
      domain: "org",
      dryRun: true,
      actor: ACTOR,
      steps: [{ kind: "observe", capability: "metrics.read", input: { metricKey: "demo_metric" }, risk: "read" }],
    });
    await engageKillSwitch("x", ACTOR);
    let result = await runCycle(plan.planId, { actor: ACTOR });
    expect(result.status).toBe("halted");

    await disengageKillSwitch(ACTOR);
    result = await runCycle(plan.planId, { actor: ACTOR });
    expect(result.status).toBe("done");
  });
});
