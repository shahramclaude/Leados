import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/decisions/route";
import { GET as GET_ONE, PATCH } from "@/app/api/decisions/[id]/route";
import { resetDatabase } from "../setup/db";

const AUTH = { authorization: "Bearer leados-dev-token" };

function postRequest(path: string, body: unknown, headers: Record<string, string> = AUTH) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function patchRequest(path: string, body: unknown, headers: Record<string, string> = AUTH) {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/api/decisions", () => {
  beforeEach(resetDatabase);

  it("happy path: create a decision, then update its belief with evidence", async () => {
    const created = await (await POST(postRequest("/api/decisions", { title: "Ship feature X" }))).json();
    expect(created.beliefMean).toBeCloseTo(0.5, 5);

    const patchRes = await PATCH(patchRequest(`/api/decisions/${created.id}`, { successes: 8, failures: 2 }), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.beliefMean).toBeGreaterThan(created.beliefMean);

    const getRes = await GET_ONE(new Request(`http://localhost/api/decisions/${created.id}`), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect((await getRes.json()).beliefMean).toBeCloseTo(updated.beliefMean, 10);
  });

  it("auth failure: PATCH without a token is rejected with 401", async () => {
    const created = await (await POST(postRequest("/api/decisions", { title: "X" }))).json();
    const res = await PATCH(patchRequest(`/api/decisions/${created.id}`, { successes: 1, failures: 0 }, {}), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(res.status).toBe(401);
  });

  it("validation failure: negative evidence counts are rejected with 400", async () => {
    const created = await (await POST(postRequest("/api/decisions", { title: "X" }))).json();
    const res = await PATCH(patchRequest(`/api/decisions/${created.id}`, { successes: -1, failures: 0 }), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(res.status).toBe(400);
  });

  it("not found: updating a non-existent decision returns 404", async () => {
    const res = await PATCH(patchRequest("/api/decisions/999999", { successes: 1, failures: 0 }), {
      params: Promise.resolve({ id: "999999" }),
    });
    expect(res.status).toBe(404);
  });

  it("validation failure: missing title on create is rejected with 400", async () => {
    const res = await POST(postRequest("/api/decisions", { title: "" }));
    expect(res.status).toBe(400);
  });

  it("pagination edge: listing respects limit and reports total", async () => {
    await POST(postRequest("/api/decisions", { title: "A" }));
    await POST(postRequest("/api/decisions", { title: "B" }));
    await POST(postRequest("/api/decisions", { title: "C" }));

    const page = await (await GET(new Request("http://localhost/api/decisions?limit=2"))).json();
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.nextCursor).not.toBeNull();
  });
});
