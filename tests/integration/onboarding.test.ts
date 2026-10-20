import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/onboarding/route";
import { resetDatabase } from "../setup/db";

const AUTH = { authorization: "Bearer leados-dev-token" };

function postRequest(body: unknown, headers: Record<string, string> = AUTH) {
  return new Request("http://localhost/api/onboarding", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/api/onboarding", () => {
  beforeEach(resetDatabase);

  it("happy path: starts incomplete, POST completes it, GET reflects completion", async () => {
    const before = await (await GET()).json();
    expect(before).toEqual({ completed: false, orgName: null });

    const postRes = await POST(postRequest({ orgName: "Acme" }));
    expect(postRes.status).toBe(201);

    const after = await (await GET()).json();
    expect(after).toEqual({ completed: true, orgName: "Acme" });
  });

  it("auth failure: POST without a token is rejected with 401", async () => {
    const res = await POST(postRequest({ orgName: "Acme" }, {}));
    expect(res.status).toBe(401);
  });

  it("validation failure: empty orgName is rejected with 400", async () => {
    const res = await POST(postRequest({ orgName: "" }));
    expect(res.status).toBe(400);
  });
});
