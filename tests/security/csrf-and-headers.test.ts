import { beforeEach, describe, expect, it } from "vitest";
import { POST as peopleCreate } from "@/app/api/people/route";
import { POST as login } from "@/app/api/auth/login/route";
import { createOrgAndAdmin } from "@/lib/authService";
import { generateCsrfToken } from "@/lib/csrf";
import { buildRequest, createTestActor, resetDb } from "../helpers";

describe("CSRF protection on mutating requests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rejects a mutating request with no CSRF header even with a valid session", async () => {
    const admin = await createTestActor("Acme", "csrf1@acme.test", "admin");
    const res = await peopleCreate(
      buildRequest("/api/people", admin, {
        method: "POST",
        body: { firstName: "A", lastName: "B" },
        omitCsrfHeader: true,
      }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("CSRF_REJECTED");
  });

  it("rejects a mutating request where the header token does not match the cookie", async () => {
    const admin = await createTestActor("Acme", "csrf2@acme.test", "admin");
    const res = await peopleCreate(
      buildRequest("/api/people", admin, {
        method: "POST",
        body: { firstName: "A", lastName: "B" },
        headers: { "x-csrf-token": "attacker-supplied-value-does-not-match-cookie" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts a mutating request when the double-submit token matches", async () => {
    const admin = await createTestActor("Acme", "csrf3@acme.test", "admin");
    const res = await peopleCreate(
      buildRequest("/api/people", admin, { method: "POST", body: { firstName: "A", lastName: "B" } }),
    );
    expect(res.status).toBe(201);
  });

  it("login itself requires a CSRF token (defense against login CSRF)", async () => {
    const res = await login(
      buildRequest("/api/auth/login", null, {
        method: "POST",
        body: { email: "nobody@acme.test", password: "whatever12345" },
        omitCsrfHeader: true,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("login succeeds when the double-submit CSRF token matches", async () => {
    await createOrgAndAdmin("Acme", "realuser@acme.test", "Str0ng!Passw0rd-123");
    const csrfToken = generateCsrfToken();
    const res = await login(
      buildRequest("/api/auth/login", null, {
        method: "POST",
        body: { email: "realuser@acme.test", password: "Str0ng!Passw0rd-123" },
        cookies: { leados_csrf: csrfToken },
        headers: { "x-csrf-token": csrfToken },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });
});
