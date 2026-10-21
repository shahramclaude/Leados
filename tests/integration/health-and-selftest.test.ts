import { describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as selfTest } from "@/app/api/self-test/route";

describe("GET /api/health", () => {
  it("reports ok:true when the database is reachable", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("GET /api/self-test", () => {
  it("runs the smoke subset and reports pass:true with all checks green", async () => {
    const res = await selfTest();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pass).toBe(true);
    expect(body.checks.length).toBeGreaterThanOrEqual(4);
    for (const check of body.checks) {
      expect(check.pass).toBe(true);
    }
    expect(body.note).toMatch(/npm test/);
  });
});
