import { describe, expect, it } from "vitest";
import { withTestTransaction } from "@/db";
import { POST as createLead } from "@/app/api/leads/route";
import { POST as createFinding } from "@/app/api/findings/route";
import { GET as listDecisions, POST as createDecision } from "@/app/api/decisions/route";
import { GET as listApprovals, POST as createApproval } from "@/app/api/approvals/route";
import { POST as runAutomation } from "@/app/api/automation/run/route";
import { GET as boardPack } from "@/app/api/board-pack/route";
import { jsonRequest, seedTenant } from "./helpers";

async function seedPipeline(apiKey: string) {
  const lead = await (
    await createLead(jsonRequest("http://test/api/leads", { method: "POST", apiKey, body: { name: "L", source: "web" } }))
  ).json();
  const finding = await (
    await createFinding(
      jsonRequest("http://test/api/findings", { method: "POST", apiKey, body: { leadId: lead.id, summary: "s", outcome: 1 } }),
    )
  ).json();
  return { lead, finding };
}

describe("Decisions -> Approvals -> Automation -> Board pack", () => {
  it("happy path end to end", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const { finding } = await seedPipeline(tenant.apiKey);

      const decisionRes = await createDecision(
        jsonRequest("http://test/api/decisions", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { findingId: finding.id, action: "pursue", rationale: "good fit" },
        }),
      );
      expect(decisionRes.status).toBe(201);
      const decision = await decisionRes.json();

      const approvalRes = await createApproval(
        jsonRequest("http://test/api/approvals", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { decisionId: decision.id, approver: "VP Sales", outcome: "approved" },
        }),
      );
      expect(approvalRes.status).toBe(201);
      const approval = await approvalRes.json();

      const runRes = await runAutomation(
        jsonRequest("http://test/api/automation/run", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { approvalId: approval.id, trials: 500, seed: 42 },
        }),
      );
      expect(runRes.status).toBe(201);
      const run = await runRes.json();
      expect(run.trials).toBe(500);
      expect(run.p05).toBeLessThanOrEqual(run.p95);

      const packRes = await boardPack(jsonRequest("http://test/api/board-pack", { apiKey: tenant.apiKey }));
      expect(packRes.status).toBe(200);
      const pack = await packRes.json();
      expect(pack.totals.decisions).toBe(1);
      expect(pack.totals.approvals).toBe(1);
      expect(pack.totals.automationRuns).toBe(1);
    });
  });

  it("validation failure: decision action must be one of the enum values", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const { finding } = await seedPipeline(tenant.apiKey);
      const res = await createDecision(
        jsonRequest("http://test/api/decisions", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { findingId: finding.id, action: "nonsense", rationale: "x" },
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  it("business rule failure: automation run rejected (422) when the decision was not approved", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const { finding } = await seedPipeline(tenant.apiKey);
      const decision = await (
        await createDecision(
          jsonRequest("http://test/api/decisions", {
            method: "POST",
            apiKey: tenant.apiKey,
            body: { findingId: finding.id, action: "watch", rationale: "x" },
          }),
        )
      ).json();
      const approval = await (
        await createApproval(
          jsonRequest("http://test/api/approvals", {
            method: "POST",
            apiKey: tenant.apiKey,
            body: { decisionId: decision.id, approver: "VP", outcome: "rejected" },
          }),
        )
      ).json();
      const res = await runAutomation(
        jsonRequest("http://test/api/automation/run", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { approvalId: approval.id },
        }),
      );
      expect(res.status).toBe(422);
    });
  });

  it("automation run reproducibility: identical seed across two runs on independent approvals yields identical forecast stats", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const pipelineA = await seedPipeline(tenant.apiKey);
      const pipelineB = await seedPipeline(tenant.apiKey);

      async function approve(findingId: string) {
        const decision = await (
          await createDecision(
            jsonRequest("http://test/api/decisions", {
              method: "POST",
              apiKey: tenant.apiKey,
              body: { findingId, action: "pursue", rationale: "x" },
            }),
          )
        ).json();
        return (
          await createApproval(
            jsonRequest("http://test/api/approvals", {
              method: "POST",
              apiKey: tenant.apiKey,
              body: { decisionId: decision.id, approver: "VP", outcome: "approved" },
            }),
          )
        ).json();
      }

      const approvalA = await approve(pipelineA.finding.id);
      const approvalB = await approve(pipelineB.finding.id);

      const runA = await (
        await runAutomation(
          jsonRequest("http://test/api/automation/run", { method: "POST", apiKey: tenant.apiKey, body: { approvalId: approvalA.id, seed: 7, trials: 1000 } }),
        )
      ).json();
      const runB = await (
        await runAutomation(
          jsonRequest("http://test/api/automation/run", { method: "POST", apiKey: tenant.apiKey, body: { approvalId: approvalB.id, seed: 7, trials: 1000 } }),
        )
      ).json();

      expect(runA.meanOutcome).toBe(runB.meanOutcome);
      expect(runA.p05).toBe(runB.p05);
      expect(runA.p95).toBe(runB.p95);
    });
  });

  it("tenancy isolation: decisions list for tenant B stays empty after tenant A acts", async () => {
    await withTestTransaction(async (tx) => {
      const tenantA = await seedTenant(tx, "A");
      const tenantB = await seedTenant(tx, "B");
      const { finding } = await seedPipeline(tenantA.apiKey);
      await createDecision(
        jsonRequest("http://test/api/decisions", { method: "POST", apiKey: tenantA.apiKey, body: { findingId: finding.id, action: "pursue", rationale: "x" } }),
      );
      const res = await listDecisions(jsonRequest("http://test/api/decisions", { apiKey: tenantB.apiKey }));
      const body = await res.json();
      expect(body.total).toBe(0);
    });
  });

  it("auth failure on approvals list", async () => {
    await withTestTransaction(async () => {
      const res = await listApprovals(jsonRequest("http://test/api/approvals"));
      expect(res.status).toBe(401);
    });
  });
});
