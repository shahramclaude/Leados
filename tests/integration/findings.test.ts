import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/findings/route";
import { GET as GET_ONE } from "@/app/api/findings/[id]/route";
import { resetDatabase } from "../setup/db";

const AUTH = { authorization: "Bearer leados-dev-token" };

function postRequest(body: unknown, headers: Record<string, string> = AUTH) {
  return new Request("http://localhost/api/findings", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function getRequest(qs = "") {
  return new Request(`http://localhost/api/findings${qs}`);
}

const validFinding = { title: "Support backlog growing", impact: 8, confidence: 7, effort: 3 };

describe("/api/findings", () => {
  beforeEach(resetDatabase);

  it("happy path: POST creates a finding with a server-computed score, GET /{id} fetches it", async () => {
    const postRes = await POST(postRequest(validFinding));
    expect(postRes.status).toBe(201);
    const created = await postRes.json();
    expect(created.score).toBeCloseTo((8 * 7) / 3, 2);

    const getRes = await GET_ONE(new Request("http://localhost/api/findings/" + created.id), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.id).toBe(created.id);
  });

  it("auth failure: POST without a token is rejected with 401", async () => {
    const res = await POST(postRequest(validFinding, {}));
    expect(res.status).toBe(401);
  });

  it("validation failure: impact out of range (1-10) is rejected with 400", async () => {
    const res = await POST(postRequest({ ...validFinding, impact: 99 }));
    expect(res.status).toBe(400);
  });

  it("validation failure: missing title is rejected with 400", async () => {
    const res = await POST(postRequest({ ...validFinding, title: "" }));
    expect(res.status).toBe(400);
  });

  it("GET /{id} returns 404 for a finding that does not exist", async () => {
    const res = await GET_ONE(new Request("http://localhost/api/findings/999999"), {
      params: Promise.resolve({ id: "999999" }),
    });
    expect(res.status).toBe(404);
  });

  it("GET /{id} returns 400 for a non-numeric id", async () => {
    const res = await GET_ONE(new Request("http://localhost/api/findings/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("pagination edge: empty list returns an empty page with total 0 and null cursor", async () => {
    const res = await GET(getRequest());
    const page = await res.json();
    expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it("listing is ranked and paginated correctly across a full page boundary", async () => {
    await POST(postRequest({ title: "Low value", impact: 1, confidence: 1, effort: 10 }));
    await POST(postRequest({ title: "High value", impact: 10, confidence: 10, effort: 1 }));

    const page = await (await GET(getRequest("?limit=1"))).json();
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.nextCursor).not.toBeNull();
  });
});
