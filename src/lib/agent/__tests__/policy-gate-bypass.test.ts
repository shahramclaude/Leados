import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as tools from "../tools";
import { invokeTool } from "../tools";
import * as policy from "../policy";
import { buildProhibitedCorpus } from "../prohibited";

describe("PolicyGate cannot be bypassed", () => {
  it("does not export any raw tool execute function from tools.ts", () => {
    const exported = Object.keys(tools);
    // Only metadata accessors + the single gated entrypoint may be exported.
    expect(exported.sort()).toEqual(["getToolMeta", "invokeTool", "listToolMeta"].sort());
  });

  it("invokeTool throws POLICY_GATE_VIOLATION when authorized.allow is not true", async () => {
    const runId = randomUUID();
    await expect(
      invokeTool("metrics.read", { goal: "x" }, { runId, nodeId: "n1" }, { allow: false })
    ).rejects.toThrow(/POLICY_GATE_VIOLATION/);

    await expect(
      // @ts-expect-error — intentionally passing a malformed/missing decision to prove runtime enforcement
      invokeTool("metrics.read", { goal: "x" }, { runId, nodeId: "n1" }, undefined)
    ).rejects.toThrow(/POLICY_GATE_VIOLATION/);
  });

  it("invokeTool succeeds (and only then) when authorized.allow is true", async () => {
    const runId = randomUUID();
    const result = await invokeTool("metrics.read", { goal: "x" }, { runId, nodeId: "n1" }, { allow: true });
    expect(result.outputSummary).toContain("x");
  });

  it("denies all 30 seeded prohibited-action scenarios regardless of any approval", () => {
    const corpus = buildProhibitedCorpus();
    expect(corpus).toHaveLength(30);
    const results = corpus.map((scenario) =>
      policy.evaluate({ tool: scenario.tool, riskTier: 4 }, scenario.input, { approvedApprovalId: 999999 })
    );
    const denials = results.filter((r) => !r.allow && r.reasons.some((reason) => reason.startsWith("PROHIBITED")));
    expect(denials).toHaveLength(30);
  });

  it("gates T3/T4 nodes pending approval, and allows T0/T1/T2 autonomously", () => {
    const pending = policy.evaluate({ tool: "budget.reallocate", riskTier: 3 }, { goal: "reallocate" }, { approvedApprovalId: null });
    expect(pending.allow).toBe(false);
    expect(pending.requiresApprovalFrom).toContain("finance-lead");

    const approved = policy.evaluate({ tool: "budget.reallocate", riskTier: 3 }, { goal: "reallocate" }, { approvedApprovalId: 1 });
    expect(approved.allow).toBe(true);

    const readOnly = policy.evaluate({ tool: "metrics.read", riskTier: 0 }, { goal: "read" }, { approvedApprovalId: null });
    expect(readOnly.allow).toBe(true);
  });
});
