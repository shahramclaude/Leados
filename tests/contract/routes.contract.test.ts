import { describe, expect, it } from "vitest";
import { withTestTransaction } from "@/db";
import { POST as onboarding } from "@/app/api/onboarding/route";
import { POST as createLead } from "@/app/api/leads/route";
import { POST as createFinding } from "@/app/api/findings/route";
import { POST as createDecision } from "@/app/api/decisions/route";
import { POST as createApproval } from "@/app/api/approvals/route";
import { POST as runAutomation } from "@/app/api/automation/run/route";
import { jsonRequest, seedTenant } from "../integration/helpers";
import { compileSchema, getResponseStatuses } from "./openapi-helpers";

describe("Routes conform to docs/openapi.yaml", () => {
  it("every path+method+status used by the integration suite is declared in the spec", () => {
    expect(getResponseStatuses("/onboarding", "post")).toEqual(expect.arrayContaining(["201", "400"]));
    expect(getResponseStatuses("/leads", "get")).toEqual(expect.arrayContaining(["200", "401"]));
    expect(getResponseStatuses("/leads", "post")).toEqual(expect.arrayContaining(["201", "400", "401"]));
    expect(getResponseStatuses("/findings", "post")).toEqual(expect.arrayContaining(["201", "404"]));
    expect(getResponseStatuses("/automation/run", "post")).toEqual(expect.arrayContaining(["201", "422"]));
  });

  it("POST /onboarding 201 body matches the Tenant schema", async () => {
    await withTestTransaction(async () => {
      const res = await onboarding(jsonRequest("http://test/api/onboarding", { method: "POST", body: { name: "Contract Co" } }));
      const validate = compileSchema("Tenant");
      const body = await res.json();
      const ok = validate(body);
      expect(ok, JSON.stringify(validate.errors)).toBe(true);
    });
  });

  it("POST /onboarding 400 body matches the Error schema", async () => {
    await withTestTransaction(async () => {
      const res = await onboarding(jsonRequest("http://test/api/onboarding", { method: "POST", body: { name: "x" } }));
      const validate = compileSchema("Error");
      const body = await res.json();
      expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    });
  });

  it("full pipeline bodies match their declared schemas end to end", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const lead = await (
        await createLead(jsonRequest("http://test/api/leads", { method: "POST", apiKey: tenant.apiKey, body: { name: "L", source: "web" } }))
      ).json();
      expect(compileSchema("Lead")(lead)).toBe(true);

      const finding = await (
        await createFinding(
          jsonRequest("http://test/api/findings", { method: "POST", apiKey: tenant.apiKey, body: { leadId: lead.id, summary: "s" } }),
        )
      ).json();
      expect(compileSchema("Finding")(finding)).toBe(true);

      const decision = await (
        await createDecision(
          jsonRequest("http://test/api/decisions", { method: "POST", apiKey: tenant.apiKey, body: { findingId: finding.id, action: "pursue", rationale: "r" } }),
        )
      ).json();
      expect(compileSchema("Decision")(decision)).toBe(true);

      const approval = await (
        await createApproval(
          jsonRequest("http://test/api/approvals", { method: "POST", apiKey: tenant.apiKey, body: { decisionId: decision.id, approver: "VP", outcome: "approved" } }),
        )
      ).json();
      expect(compileSchema("Approval")(approval)).toBe(true);

      const run = await (
        await runAutomation(
          jsonRequest("http://test/api/automation/run", { method: "POST", apiKey: tenant.apiKey, body: { approvalId: approval.id, trials: 200, seed: 1 } }),
        )
      ).json();
      const validateRun = compileSchema("AutomationRun");
      expect(validateRun(run), JSON.stringify(validateRun.errors)).toBe(true);
    });
  });
});
