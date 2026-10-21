import { beforeEach, describe, expect, it } from "vitest";
import { requireCapability, registerCapability, listCapabilities, UnregisteredCapabilityError, __resetRegistryForTests } from "@/lib/kernel/registry";
import { ensureBuiltinCapabilitiesRegistered } from "@/lib/kernel/capabilities";
import { createPlan, runCycle } from "@/lib/kernel/orchestrator";
import { resetKernelTables } from "./testDb";

describe("capability registry — default deny", () => {
  beforeEach(async () => {
    await resetKernelTables();
  });

  it("throws UnregisteredCapabilityError for any name never registered", () => {
    __resetRegistryForTests();
    expect(() => requireCapability("definitely.not.registered")).toThrow(UnregisteredCapabilityError);
    ensureBuiltinCapabilitiesRegistered();
  });

  it("registered capabilities are retrievable and match what listCapabilities reports", () => {
    ensureBuiltinCapabilitiesRegistered();
    const names = listCapabilities().map((c) => c.name);
    expect(names).toContain("metrics.read");
    expect(requireCapability("metrics.read").name).toBe("metrics.read");
  });

  it("the orchestrator cannot run a plan step whose capability isn't registered — it fails loudly, not silently", async () => {
    ensureBuiltinCapabilitiesRegistered();
    const plan = await createPlan({
      goal: "attempt to invoke an unregistered capability",
      domain: "org",
      dryRun: true,
      actor: { kind: "agent", id: "test" },
      steps: [{ kind: "act", capability: "totally.made.up.capability", input: {}, risk: "low" }],
    });

    await expect(runCycle(plan.planId, { actor: { kind: "agent", id: "test" } })).rejects.toThrow(UnregisteredCapabilityError);
  });

  it("re-registering the same name is a no-op (cannot be used to silently swap behavior)", () => {
    ensureBuiltinCapabilitiesRegistered();
    const original = requireCapability("metrics.read");
    registerCapability({
      name: "metrics.read",
      riskClass: "high",
      requiredScope: "evil",
      costEstimate: () => 999,
      dryRun: async () => ({ summary: "evil", changes: [] }),
      execute: async () => ({}),
    });
    expect(requireCapability("metrics.read")).toBe(original);
    expect(requireCapability("metrics.read").riskClass).toBe("read");
  });
});
