import { beforeEach, describe, expect, it } from "vitest";
import { GET as peopleList, POST as peopleCreate } from "@/app/api/people/route";
import { GET as personGet, PATCH as personPatch, DELETE as personDelete } from "@/app/api/people/[id]/route";
import { GET as peopleExport } from "@/app/api/people/export/route";
import { GET as auditList } from "@/app/api/audit/route";
import { buildRequest, createTestActor, resetDb } from "../helpers";

describe("authorization matrix + cross-tenant isolation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects unauthenticated requests with 401, never leaking data", async () => {
    const res = await peopleList(buildRequest("/api/people", null));
    expect(res.status).toBe(401);
  });

  it("enforces role-based permission for writes: member cannot create a person", async () => {
    const member = await createTestActor("Acme", "member@acme.test", "member");
    const res = await peopleCreate(
      buildRequest("/api/people", member, {
        method: "POST",
        body: { firstName: "A", lastName: "B" },
      }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("allows admin to create and read a person in their own org", async () => {
    const admin = await createTestActor("Acme", "admin@acme.test", "admin");
    const createRes = await peopleCreate(
      buildRequest("/api/people", admin, {
        method: "POST",
        body: { firstName: "Alice", lastName: "Anderson", email: "alice@acme.test" },
      }),
    );
    expect(createRes.status).toBe(201);
    const { person } = await createRes.json();

    const getRes = await personGet(buildRequest(`/api/people/${person.id}`, admin), {
      params: Promise.resolve({ id: person.id }),
    });
    expect(getRes.status).toBe(200);
  });

  it("makes cross-tenant access impossible: org B gets 404, not the data, not 403", async () => {
    const adminA = await createTestActor("Acme", "admin-a@acme.test", "admin");
    const adminB = await createTestActor("Globex", "admin-b@globex.test", "admin");

    const createRes = await peopleCreate(
      buildRequest("/api/people", adminA, {
        method: "POST",
        body: { firstName: "Carol", lastName: "Corp" },
      }),
    );
    const { person } = await createRes.json();

    const crossRead = await personGet(buildRequest(`/api/people/${person.id}`, adminB), {
      params: Promise.resolve({ id: person.id }),
    });
    expect(crossRead.status).toBe(404);

    const crossPatch = await personPatch(
      buildRequest(`/api/people/${person.id}`, adminB, { method: "PATCH", body: { firstName: "Hacked" } }),
      { params: Promise.resolve({ id: person.id }) },
    );
    expect(crossPatch.status).toBe(404);

    const crossDelete = await personDelete(buildRequest(`/api/people/${person.id}`, adminB, { method: "DELETE" }), {
      params: Promise.resolve({ id: person.id }),
    });
    expect(crossDelete.status).toBe(404);

    // Org A can still read its own record untouched.
    const stillThere = await personGet(buildRequest(`/api/people/${person.id}`, adminA), {
      params: Promise.resolve({ id: person.id }),
    });
    expect(stillThere.status).toBe(200);
    const { person: untouched } = await stillThere.json();
    expect(untouched.firstName).toBe("Carol");
  });

  it("org B's /api/people list never contains org A's records", async () => {
    const adminA = await createTestActor("Acme", "admin-a2@acme.test", "admin");
    const adminB = await createTestActor("Globex", "admin-b2@globex.test", "admin");

    await peopleCreate(
      buildRequest("/api/people", adminA, { method: "POST", body: { firstName: "Dana", lastName: "A" } }),
    );

    const listB = await peopleList(buildRequest("/api/people", adminB));
    const { people } = await listB.json();
    expect(people).toHaveLength(0);
  });

  it("export requires people:export — member is forbidden, manager allowed", async () => {
    const member = await createTestActor("Acme", "member2@acme.test", "member");
    const forbidden = await peopleExport(buildRequest("/api/people/export", member));
    expect(forbidden.status).toBe(403);

    const manager = await createTestActor("Acme", "manager@acme.test", "manager");
    const ok = await peopleExport(buildRequest("/api/people/export", manager));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/csv");
  });

  it("audit log is admin-only: manager is forbidden", async () => {
    const manager = await createTestActor("Acme", "manager2@acme.test", "manager");
    const res = await auditList(buildRequest("/api/audit", manager));
    expect(res.status).toBe(403);
  });

  it("audit log read is itself scoped per-org for admins", async () => {
    const adminA = await createTestActor("Acme", "admin-a3@acme.test", "admin");
    const adminB = await createTestActor("Globex", "admin-b3@globex.test", "admin");

    await peopleCreate(
      buildRequest("/api/people", adminA, { method: "POST", body: { firstName: "Eve", lastName: "A" } }),
    );

    const auditB = await auditList(buildRequest("/api/audit", adminB));
    const { events } = await auditB.json();
    expect(events.every((e: { orgId: string | null }) => e.orgId === adminB.org.id)).toBe(true);
  });
});
