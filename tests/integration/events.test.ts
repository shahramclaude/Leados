import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/events/route";
import { resetDatabase } from "../setup/db";

const AUTH = { authorization: "Bearer leados-dev-token" };

function postRequest(body: unknown, headers: Record<string, string> = AUTH) {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function getRequest(qs = "") {
  return new Request(`http://localhost/api/events${qs}`);
}

describe("/api/events", () => {
  beforeEach(resetDatabase);

  it("happy path: POST records a valid event, GET lists it", async () => {
    const postRes = await POST(postRequest({ type: "system.ping", version: 1, payload: { message: "hi" } }));
    expect(postRes.status).toBe(201);
    const created = await postRes.json();
    expect(created.type).toBe("system.ping");

    const getRes = await GET(getRequest());
    const page = await getRes.json();
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(created.id);
  });

  it("auth failure: POST without Authorization header is rejected with 401", async () => {
    const res = await POST(postRequest({ type: "system.ping", version: 1, payload: { message: "hi" } }, {}));
    expect(res.status).toBe(401);
  });

  it("auth failure: POST with wrong token is rejected with 403", async () => {
    const res = await POST(
      postRequest(
        { type: "system.ping", version: 1, payload: { message: "hi" } },
        { authorization: "Bearer wrong" },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("validation failure: unknown event type is rejected with 400", async () => {
    const res = await POST(postRequest({ type: "not.real", version: 1, payload: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown event type/);
  });

  it("validation failure: payload missing required fields is rejected with 400", async () => {
    const res = await POST(postRequest({ type: "system.ping", version: 1, payload: {} }));
    expect(res.status).toBe(400);
  });

  it("validation failure: malformed JSON body is rejected with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json", ...AUTH },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("pagination: limit caps and cursor walks through all items in descending id order", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(postRequest({ type: "system.ping", version: 1, payload: { message: `${i}` } }));
    }

    const firstPage = await (await GET(getRequest("?limit=2"))).json();
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPage.total).toBe(5);

    const secondPage = await (
      await GET(getRequest(`?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`))
    ).json();
    expect(secondPage.items).toHaveLength(2);

    const ids = [...firstPage.items, ...secondPage.items].map((e: { id: number }) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it("pagination: invalid cursor is ignored gracefully (falls back to first page)", async () => {
    await POST(postRequest({ type: "system.ping", version: 1, payload: { message: "x" } }));
    const res = await GET(getRequest("?cursor=not-a-real-cursor"));
    expect(res.status).toBe(200);
    const page = await res.json();
    expect(page.items).toHaveLength(1);
  });
});
