import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/kernel/bootstrap";
import { db } from "@/db";
import { kernelFindings } from "@/db/schema";
import { setDailyBudget, tryConsumeBudget, peekBudget, recordCircuitOutcome, CIRCUIT_BREAKER_THRESHOLD } from "@/lib/kernel/budget";
import { createPlan, runCycle } from "@/lib/kernel/orchestrator";
import { checkAnomalyTripwire, isDomainPaused } from "@/lib/kernel/severity";
import { resetKernelTables } from "./testDb";

const ACTOR = { kind: "agent" as const, id: "test" };

describe("daily action budgets", () => {
  beforeEach(async () => {
    await resetKernelTables();
  });

  it("denies consumption once the daily limit is reached", async () => {
    await setDailyBudget("org", "finding.acknowledge", 2);
    const first = await tryConsumeBudget("org", "finding.acknowledge", 1);
    const second = await tryConsumeBudget("org", "finding.acknowledge", 1);
    const third = await tryConsumeBudget("org", "finding.acknowledge", 1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(false);
    const peek = await peekBudget("org", "finding.acknowledge");
    expect(peek.remaining).toBe(0);
  });

  it("a step whose capability has an exhausted budget is denied by the policy engine and fails the run", async () => {
    await setDailyBudget("org", "finding.acknowledge", 0);
    const [finding] = await db
      .insert(kernelFindings)
      .values({ id: "find_test1", severity: 2, title: "t", description: "d", domain: "org" })
      .returning();

    const plan = await createPlan({
      goal: "ack a finding with zero budget",
      domain: "org",
      dryRun: false,
      actor: ACTOR,
      steps: [{ kind: "act", capability: "finding.acknowledge", input: { findingId: finding.id }, risk: "medium" }],
    });
    const { recordDryRunForPlan } = await import("@/lib/kernel/orchestrator");
    await recordDryRunForPlan(plan.planId, ACTOR);

    const result = await runCycle(plan.planId, { actor: ACTOR });
    expect(result.status).toBe("failed");
    expect(result.haltedReason).toMatch(/budget/i);
  });

  it("circuit breaker trips after N consecutive failures", async () => {
    let last;
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
      last = await recordCircuitOutcome("some.capability", false);
    }
    expect(last!.tripped).toBe(true);
    expect(last!.consecutiveFailures).toBe(CIRCUIT_BREAKER_THRESHOLD);
  });

  it("circuit breaker resets on success", async () => {
    await recordCircuitOutcome("other.capability", false);
    await recordCircuitOutcome("other.capability", false);
    const reset = await recordCircuitOutcome("other.capability", true);
    expect(reset.consecutiveFailures).toBe(0);
    expect(reset.tripped).toBe(false);
  });
});

describe("anomaly tripwire -> severity-5 finding -> domain auto-pause", () => {
  beforeEach(async () => {
    await resetKernelTables();
  });

  it("small drift does not open a finding or pause the domain", async () => {
    const result = await checkAnomalyTripwire({ metricKey: "demo_metric", value: 101, baseline: 100, domain: "org", actor: ACTOR });
    expect(result.severity).toBeLessThan(5);
    expect(result.findingId).toBeUndefined();
    expect(await isDomainPaused("org")).toBe(false);
  });

  it("drift beyond the threshold opens a severity-5 finding and auto-pauses the domain", async () => {
    const result = await checkAnomalyTripwire({ metricKey: "demo_metric", value: 200, baseline: 100, domain: "org", actor: ACTOR });
    expect(result.severity).toBe(5);
    expect(result.findingId).toBeDefined();
    expect(await isDomainPaused("org")).toBe(true);
  });

  it("once paused, the domain denies new non-read actuating steps even with budget remaining", async () => {
    await checkAnomalyTripwire({ metricKey: "demo_metric", value: 500, baseline: 100, domain: "paused-domain", actor: ACTOR });
    expect(await isDomainPaused("paused-domain")).toBe(true);

    const [finding] = await db
      .insert(kernelFindings)
      .values({ id: "find_paused", severity: 2, title: "t", description: "d", domain: "paused-domain" })
      .returning();

    const plan = await createPlan({
      goal: "try to act in a paused domain",
      domain: "paused-domain",
      dryRun: false,
      actor: ACTOR,
      steps: [{ kind: "act", capability: "finding.acknowledge", input: { findingId: finding.id }, risk: "medium" }],
    });
    const { recordDryRunForPlan } = await import("@/lib/kernel/orchestrator");
    await recordDryRunForPlan(plan.planId, ACTOR);
    const result = await runCycle(plan.planId, { actor: ACTOR });
    expect(result.status).toBe("failed");
    expect(result.haltedReason).toMatch(/paused/i);
  });
});
