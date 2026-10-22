import { NextRequest } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { createOrgAndAdmin, createSessionForUser } from "@/lib/authService";
import { generateCsrfToken } from "@/lib/csrf";
import { users } from "@/db/schema";
import { __resetRateLimitsForTests } from "@/lib/rateLimit";
import type { Role } from "@/lib/authz/permissions";

export async function resetDb() {
  await db.execute(
    sql`TRUNCATE TABLE audit_log, export_consents, import_batches, sessions, people, users, organizations, settings, security_event_log RESTART IDENTITY CASCADE`,
  );
  __resetRateLimitsForTests();
}

export interface TestActor {
  org: { id: string; name: string };
  user: { id: string; email: string; role: Role; orgId: string };
  token: string;
  csrfToken: string;
}

export async function createTestActor(orgName: string, email: string, role: Role = "admin"): Promise<TestActor> {
  const { org, user } = await createOrgAndAdmin(orgName, email, "Str0ng!Passw0rd-123");
  let finalRole: Role = "admin";
  if (role !== "admin") {
    await db.update(users).set({ role }).where(eq(users.id, user.id));
    finalRole = role;
  }
  const { token } = await createSessionForUser({ ...user, role: finalRole }, "203.0.113.5", "vitest");
  const csrfToken = generateCsrfToken();
  return { org, user: { id: user.id, email: user.email, role: finalRole, orgId: org.id }, token, csrfToken };
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  omitCsrfHeader?: boolean;
  rawBody?: string;
}

export function buildRequest(url: string, actor: TestActor | null, options: RequestOptions = {}): NextRequest {
  const headers = new Headers(options.headers);
  const cookieParts: string[] = [];

  if (actor) {
    cookieParts.push(`leados_session=${actor.token}`);
    cookieParts.push(`leados_csrf=${actor.csrfToken}`);
    if (!options.omitCsrfHeader && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", actor.csrfToken);
    }
  }
  for (const [k, v] of Object.entries(options.cookies ?? {})) cookieParts.push(`${k}=${v}`);
  if (cookieParts.length) headers.set("cookie", cookieParts.join("; "));

  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  headers.set("x-forwarded-for", "203.0.113.5");

  const body = options.rawBody !== undefined ? options.rawBody : options.body !== undefined ? JSON.stringify(options.body) : undefined;

  return new NextRequest(`http://localhost${url}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
}
