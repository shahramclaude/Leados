import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/self-test/route";

describe("/api/self-test", () => {
  it("returns ok:true with every smoke check passing against a healthy environment", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks.length).toBeGreaterThan(0);
    expect(body.checks.every((c: { pass: boolean }) => c.pass)).toBe(true);
  });
});
