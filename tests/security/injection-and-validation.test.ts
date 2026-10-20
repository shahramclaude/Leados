import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { POST as peopleCreate, GET as peopleList } from "@/app/api/people/route";
import { registerSchema, personCreateSchema } from "@/lib/validation";
import { toCsv } from "@/lib/audit";
import { buildRequest, createTestActor, resetDb } from "../helpers";

const SQLI_PAYLOADS = [
  "'; DROP TABLE people; --",
  "' OR '1'='1",
  "Robert'); DROP TABLE students;--",
  "\" OR \"\"=\"",
  "1; SELECT pg_sleep(0)",
];

const XSS_PAYLOADS = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "javascript:alert(document.cookie)",
  "<svg/onload=alert(1)>",
];

describe("injection fuzzing against the people API (Drizzle parameterized queries)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores and returns SQLi-shaped payloads as inert data — the table always survives", async () => {
    const admin = await createTestActor("Acme", "fuzz-sqli@acme.test", "admin");
    for (const payload of SQLI_PAYLOADS) {
      const res = await peopleCreate(
        buildRequest("/api/people", admin, {
          method: "POST",
          body: { firstName: payload, lastName: "Fuzz" },
        }),
      );
      expect(res.status).toBe(201);
      const { person } = await res.json();
      expect(person.firstName).toBe(payload); // stored verbatim, not executed
    }

    // The table must still exist and be queryable — if a payload had been
    // concatenated into raw SQL, this would throw or return wrong data.
    const rows = await db.select().from(people).where(and(eq(people.orgId, admin.org.id), isNull(people.deletedAt)));
    expect(rows).toHaveLength(SQLI_PAYLOADS.length);
  });

  it("stores XSS-shaped payloads as inert text (output encoding is React's job on render, never string concatenation)", async () => {
    const admin = await createTestActor("Acme", "fuzz-xss@acme.test", "admin");
    for (const payload of XSS_PAYLOADS) {
      const res = await peopleCreate(
        buildRequest("/api/people", admin, { method: "POST", body: { firstName: "X", lastName: payload } }),
      );
      expect(res.status).toBe(201);
      const { person } = await res.json();
      expect(person.lastName).toBe(payload);
    }
    const listRes = await peopleList(buildRequest("/api/people", admin));
    expect(listRes.headers.get("content-type")).toContain("application/json");
    const { people: rows } = await listRes.json();
    // JSON responses are never HTML-interpreted; payload travels as a string literal.
    expect(rows.some((r: { lastName: string }) => r.lastName === XSS_PAYLOADS[0])).toBe(true);
  });

  it("neutralizes CSV formula injection on export (CWE-1236)", () => {
    const csv = toCsv([{ firstName: "=cmd|'/c calc'!A1", lastName: "Normal" }]);
    expect(csv).toContain("\"'=cmd|'/c calc'!A1\"");
  });

  it("rejects mass-assignment via unknown fields (strict schemas)", () => {
    const result = personCreateSchema.safeParse({
      firstName: "A",
      lastName: "B",
      role: "admin", // not a real field on people; must be rejected
      orgId: "11111111-1111-1111-1111-111111111111", // attempted tenant override
    });
    expect(result.success).toBe(false);
  });

  it("rejects registration payloads with unexpected fields or weak types", () => {
    const result = registerSchema.safeParse({
      orgName: "Acme",
      email: "a@b.com",
      password: "Str0ng!Passw0rd-123",
      isAdmin: true,
    });
    expect(result.success).toBe(false);
  });

  it("caps field lengths to bound memory/storage abuse", () => {
    const result = personCreateSchema.safeParse({
      firstName: "A".repeat(1000),
      lastName: "B",
    });
    expect(result.success).toBe(false);
  });

  it("enforces a strict request body size limit at the HTTP boundary", async () => {
    const admin = await createTestActor("Acme", "fuzz-size@acme.test", "admin");
    const hugeNotes = "x".repeat(300 * 1024);
    const res = await peopleCreate(
      buildRequest("/api/people", admin, {
        method: "POST",
        body: { firstName: "A", lastName: "B", notes: hugeNotes },
      }),
    );
    expect(res.status).toBe(413);
  });
});
