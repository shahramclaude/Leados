import { beforeEach, describe, expect, it } from "vitest";
import { GET as peopleList, POST as peopleCreate } from "@/app/api/people/route";
import { GET as personGet, PATCH as personPatch, DELETE as personDelete } from "@/app/api/people/[id]/route";
import { GET as auditList } from "@/app/api/audit/route";
import { PATCH as changeRole } from "@/app/api/admin/users/[id]/role/route";
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
    const res = await peopleCreate(buildRequest("/api/people", member, { method: "POST", body: { firstName: "A", lastName: "B" } }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("enforces role-based permission for writes: viewer cannot create a person", async () => {
    const viewer = await createTestActor("Acme", "viewer@acme.test", "viewer");
    const res = await peopleCreate(buildRequest("/api/people", viewer, { method: "POST", body: { firstName: "A", lastName: "B" } }));
    expect(res.status).toBe(403);
  });

  it("allows manager to create and read a person in their own org", async () => {
    const manager = await createTestActor("Acme", "manager@acme.test", "manager");
    const createRes = await peopleCreate(
      buildRequest("/api/people", manager, { method: "POST", body: { firstName: "Alice", lastName: "Anderson", email: "alice@acme.test" } }),
    );
    expect(createRes.status).toBe(201);
    const { person } = await createRes.json();

    const getRes = await personGet(buildRequest(`/api/people/${person.id}`, manager), { params: Promise.resolve({ id: person.id }) });
    expect(getRes.status).toBe(200);
  });

  it("vertical escalation attempt: manager cannot change roles (admin-only)", async () => {
    const manager = await createTestActor("Acme", "manager2@acme.test", "manager");
    const res = await changeRole(
      buildRequest(`/api/admin/users/${manager.user.id}/role`, manager, { method: "PATCH", body: { role: "admin", reason: "self escalation attempt" } }),
      { params: Promise.resolve({ id: manager.user.id }) },
    );
    expect(res.status).toBe(403);
  });

  it("makes cross-tenant access impossible: org B gets 404, not the data, not 403", async () => {
    const adminA = await createTestActor("Acme", "admin-a@acme.test", "admin");
    const adminB = await createTestActor("Globex", "admin-b@globex.test", "admin");

    const createRes = await peopleCreate(buildRequest("/api/people", adminA, { method: "POST", body: { firstName: "Carol", lastName: "Corp" } }));
    const { person } = await createRes.json();

    const crossRead = await personGet(buildRequest(`/api/people/${person.id}`, adminB), { params: Promise.resolve({ id: person.id }) });
    expect(crossRead.status).toBe(404);

    const crossWrite = await personPatch(
      buildRequest(`/api/people/${person.id}`, adminB, { method: "PATCH", body: { firstName: "Hacked" } }),
      { params: Promise.resolve({ id: person.id }) },
    );
    expect(crossWrite.status).toBe(404);

    const crossDelete = await personDelete(buildRequest(`/api/people/${person.id}`, adminB), { params: Promise.resolve({ id: person.id }) });
    expect(crossDelete.status).toBe(404);

    // Prove the record is genuinely untouched in org A.
    const ownRead = await personGet(buildRequest(`/api/people/${person.id}`, adminA), { params: Promise.resolve({ id: person.id }) });
    const { person: stillThere } = await ownRead.json();
    expect(stillThere.firstName).toBe("Carol");
  });

  it("org B's audit log never contains org A's events", async () => {
    const adminA = await createTestActor("Acme", "audit-a@acme.test", "admin");
    const adminB = await createTestActor("Globex", "audit-b@globex.test", "admin");
    await peopleCreate(buildRequest("/api/people", adminA, { method: "POST", body: { firstName: "Secret", lastName: "PersonA" } }));

    const auditB = await auditList(buildRequest("/api/audit", adminB));
    const { events } = await auditB.json();
    expect(events.some((e: { resourceType: string }) => e.resourceType === "people")).toBe(false);
  });

  it("role change rotates sessions: the demoted user's old token stops working immediately", async () => {
    const admin = await createTestActor("Acme", "admin-rotate@acme.test", "admin");
    const member = await createTestActor("Acme", "member-rotate@acme.test", "member");

    // member can read before the change
    const before = await peopleList(buildRequest("/api/people", member));
    expect(before.status).toBe(200);

    const roleRes = await changeRole(
      buildRequest(`/api/admin/users/${member.user.id}/role`, admin, { method: "PATCH", body: { role: "viewer", reason: "scope reduction per policy" } }),
      { params: Promise.resolve({ id: member.user.id }) },
    );
    expect(roleRes.status).toBe(200);

    // old token (still claims role=member) must now be rejected because
    // the user's sessionVersion was bumped and the session row revoked.
    const after = await peopleList(buildRequest("/api/people", member));
    expect(after.status).toBe(401);
  });
});
