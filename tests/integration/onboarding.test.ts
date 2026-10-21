import { describe, expect, it } from "vitest";
import { withTestTransaction } from "@/db";
import { POST } from "@/app/api/onboarding/route";
import { jsonRequest } from "./helpers";

describe("POST /api/onboarding", () => {
  it("happy path: creates a tenant and returns an api key", async () => {
    await withTestTransaction(async () => {
      const res = await POST(jsonRequest("http://test/api/onboarding", { method: "POST", body: { name: "Acme Co" } }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Acme Co");
      expect(typeof body.apiKey).toBe("string");
      expect(body.apiKey.length).toBeGreaterThan(10);
    });
  });

  it("validation failure: rejects a name that is too short", async () => {
    await withTestTransaction(async () => {
      const res = await POST(jsonRequest("http://test/api/onboarding", { method: "POST", body: { name: "A" } }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });
  });

  it("validation failure: rejects a missing body field", async () => {
    await withTestTransaction(async () => {
      const res = await POST(jsonRequest("http://test/api/onboarding", { method: "POST", body: {} }));
      expect(res.status).toBe(400);
    });
  });
});
