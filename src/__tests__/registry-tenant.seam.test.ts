// Seam: Part 19's registry must cover Part 16's routes, and Part 15's
// tenant scoping must hold on the public API — an org can never read
// another org's data even with a structurally valid request.
import { describe, expect, it } from "vitest";
import { assertRouteRegistered, RegistryError, API_REGISTRY } from "@/lib/registry";
import { createTestLead, createTestOrg, createTestApiKey, publicRequest } from "./helpers";
import { GET as listLeadsPublic } from "@/app/api/public/v1/leads/route";
import { POST as ingestSignalPublic } from "@/app/api/public/v1/signals/route";

describe("registry + tenant scoping seam", () => {
  it("every exported public route handler has a matching registry entry", () => {
    expect(assertRouteRegistered("/api/public/v1/leads")).toBeTruthy();
    expect(assertRouteRegistered("/api/public/v1/signals")).toBeTruthy();
  });

  it("an unregistered path is refused even though no route currently implements it", () => {
    expect(() => assertRouteRegistered("/api/public/v1/decisions")).toThrow(RegistryError);
  });

  it("the registry itself only lists public-scoped entries for /api/public/v1/*", () => {
    for (const entry of API_REGISTRY) {
      if (entry.path.startsWith("/api/public/")) {
        expect(entry.scope).toBe("public");
      }
    }
  });

  it("org B's API key cannot read org A's leads through the public API", async () => {
    const orgA = await createTestOrg();
    const orgB = await createTestOrg();
    await createTestLead(orgA.id);
    const keyB = await createTestApiKey(orgB.id);

    const res = await listLeadsPublic(publicRequest("http://test/api/public/v1/leads", keyB));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.leads.length).toBe(0); // org B sees none of org A's leads
  });

  it("org B's API key cannot inject a signal onto org A's lead by guessing its id", async () => {
    const orgA = await createTestOrg();
    const orgB = await createTestOrg();
    const leadA = await createTestLead(orgA.id);
    const keyB = await createTestApiKey(orgB.id);

    const res = await ingestSignalPublic(
      publicRequest("http://test/api/public/v1/signals", keyB, {
        method: "POST",
        body: JSON.stringify({ leadId: leadA.id, type: "webhook_import", payload: {} }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("an invalid API key is rejected before any tenant lookup happens", async () => {
    const res = await listLeadsPublic(publicRequest("http://test/api/public/v1/leads", "not-a-real-key"));
    expect(res.status).toBe(401);
  });
});
