import { describe, expect, it } from "vitest";
import { withTestTransaction } from "@/db";
import { POST as createLead } from "@/app/api/leads/route";
import { GET, POST } from "@/app/api/findings/route";
import { jsonRequest, seedTenant } from "./helpers";

async function seedLead(apiKey: string, name = "Lead X") {
  const res = await createLead(
    jsonRequest("http://test/api/leads", { method: "POST", apiKey, body: { name, source: "web" } }),
  );
  return res.json();
}

describe("GET/POST /api/findings", () => {
  it("happy path: creating a finding from a lead computes a beta-backed status", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const lead = await seedLead(tenant.apiKey);
      const res = await POST(
        jsonRequest("http://test/api/findings", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { leadId: lead.id, summary: "Strong fit", outcome: 1 },
        }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.alpha).toBe(2); // prior alpha=1 + 1 success
      expect(body.beta).toBe(1);
      expect(["cold", "hot"]).toContain(body.status);
    });
  });

  it("auth failure: no api key -> 401", async () => {
    await withTestTransaction(async () => {
      const res = await GET(jsonRequest("http://test/api/findings"));
      expect(res.status).toBe(401);
    });
  });

  it("validation failure: leadId must be a uuid", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const res = await POST(
        jsonRequest("http://test/api/findings", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { leadId: "not-a-uuid", summary: "x" },
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  it("references a lead belonging to another tenant -> 404 (tenancy isolation on writes)", async () => {
    await withTestTransaction(async (tx) => {
      const tenantA = await seedTenant(tx, "A");
      const tenantB = await seedTenant(tx, "B");
      const leadA = await seedLead(tenantA.apiKey);
      const res = await POST(
        jsonRequest("http://test/api/findings", {
          method: "POST",
          apiKey: tenantB.apiKey,
          body: { leadId: leadA.id, summary: "cross tenant" },
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  it("pagination edges: zero/negative page is rejected", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const res = await GET(jsonRequest("http://test/api/findings?page=0", { apiKey: tenant.apiKey }));
      expect(res.status).toBe(400);
    });
  });
});
