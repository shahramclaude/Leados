import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/boardpack/route";
import { POST as CREATE_FINDING } from "@/app/api/findings/route";
import { resetDatabase } from "../setup/db";

const AUTH = { authorization: "Bearer leados-dev-token" };

describe("/api/boardpack", () => {
  beforeEach(resetDatabase);

  it("happy path: GET auto-generates a board pack when none exists yet", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const pack = await res.json();
    expect(pack.summary.totals.findings).toBe(0);
  });

  it("happy path: reflects current totals after creating a finding, and POST force-regenerates", async () => {
    await CREATE_FINDING(
      new Request("http://localhost/api/findings", {
        method: "POST",
        headers: { "content-type": "application/json", ...AUTH },
        body: JSON.stringify({ title: "T", impact: 5, confidence: 5, effort: 5 }),
      }),
    );

    const postRes = await POST(new Request("http://localhost/api/boardpack", { method: "POST", headers: AUTH }));
    expect(postRes.status).toBe(201);
    const pack = await postRes.json();
    expect(pack.summary.totals.findings).toBe(1);
    expect(pack.summary.topFindings).toHaveLength(1);
  });

  it("auth failure: POST without a token is rejected with 401", async () => {
    const res = await POST(new Request("http://localhost/api/boardpack", { method: "POST" }));
    expect(res.status).toBe(401);
  });
});
