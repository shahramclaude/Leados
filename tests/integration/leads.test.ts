import { describe, expect, it } from "vitest";
import { withTestTransaction } from "@/db";
import { GET, POST } from "@/app/api/leads/route";
import { jsonRequest, seedTenant } from "./helpers";

describe("GET/POST /api/leads", () => {
  it("happy path: captures a lead and lists it back", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const createRes = await POST(
        jsonRequest("http://test/api/leads", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { name: "Jane Prospect", source: "referral" },
        }),
      );
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.name).toBe("Jane Prospect");

      const listRes = await GET(jsonRequest(`http://test/api/leads?page=1&pageSize=10`, { apiKey: tenant.apiKey }));
      expect(listRes.status).toBe(200);
      const list = await listRes.json();
      expect(list.total).toBe(1);
      expect(list.data[0].id).toBe(created.id);
    });
  });

  it("auth failure: missing Authorization header returns 401", async () => {
    await withTestTransaction(async () => {
      const res = await GET(jsonRequest("http://test/api/leads"));
      expect(res.status).toBe(401);
    });
  });

  it("auth failure: invalid api key returns 401", async () => {
    await withTestTransaction(async () => {
      const res = await GET(jsonRequest("http://test/api/leads", { apiKey: "not-a-real-key" }));
      expect(res.status).toBe(401);
    });
  });

  it("validation failure: empty name is rejected with 400", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const res = await POST(
        jsonRequest("http://test/api/leads", {
          method: "POST",
          apiKey: tenant.apiKey,
          body: { name: "", source: "referral" },
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  it("pagination edges: page beyond range returns an empty data array but correct total", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      for (let i = 0; i < 3; i += 1) {
        await POST(
          jsonRequest("http://test/api/leads", {
            method: "POST",
            apiKey: tenant.apiKey,
            body: { name: `Lead ${i}`, source: "web" },
          }),
        );
      }
      const res = await GET(jsonRequest("http://test/api/leads?page=5&pageSize=2", { apiKey: tenant.apiKey }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.total).toBe(3);
    });
  });

  it("pagination edges: pageSize above the max (100) is rejected with 400", async () => {
    await withTestTransaction(async (tx) => {
      const tenant = await seedTenant(tx);
      const res = await GET(jsonRequest("http://test/api/leads?pageSize=500", { apiKey: tenant.apiKey }));
      expect(res.status).toBe(400);
    });
  });

  it("tenancy isolation: tenant A never sees tenant B's leads", async () => {
    await withTestTransaction(async (tx) => {
      const tenantA = await seedTenant(tx, "Tenant A");
      const tenantB = await seedTenant(tx, "Tenant B");
      await POST(
        jsonRequest("http://test/api/leads", { method: "POST", apiKey: tenantA.apiKey, body: { name: "A-lead", source: "x" } }),
      );
      await POST(
        jsonRequest("http://test/api/leads", { method: "POST", apiKey: tenantB.apiKey, body: { name: "B-lead", source: "x" } }),
      );

      const resA = await GET(jsonRequest("http://test/api/leads", { apiKey: tenantA.apiKey }));
      const bodyA = await resA.json();
      expect(bodyA.total).toBe(1);
      expect(bodyA.data[0].name).toBe("A-lead");

      const resB = await GET(jsonRequest("http://test/api/leads", { apiKey: tenantB.apiKey }));
      const bodyB = await resB.json();
      expect(bodyB.total).toBe(1);
      expect(bodyB.data[0].name).toBe("B-lead");
    });
  });
});
