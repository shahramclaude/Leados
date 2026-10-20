import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { createOrgAndAdmin, createSessionForUser } from "@/lib/authService";
import { generateCsrfToken } from "@/lib/csrf";
import { hashPassword } from "@/lib/password";
import { users, type userRoleEnum } from "@/db/schema";
import { eq } from "drizzle-orm";
import { __resetRateLimitsForTests } from "@/lib/rateLimit";

export async function resetDb() {
  await db.execute(sql`TRUNCATE TABLE audit_log, sessions, people, users, organizations RESTART IDENTITY CASCADE`);
  __resetRateLimitsForTests();
}

type Role = (typeof userRoleEnum.enumValues)[number];

export async function createTestActor(orgName: string, email: string, role: Role = "admin") {
  const { org, user } = await createOrgAndAdmin(orgName, email, "Str0ng!Passw0rd-123");
  if (role !== "admin") {
    await db.update(users).set({ role }).where(eq(users.id, user.id));
    user.role = role;
  }
  const { token } = await createSessionForUser(user, "127.0.0.1", "vitest");
  const csrfToken = generateCsrfToken();
  return { org, user, token, csrfToken };
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  omitCsrfHeader?: boolean;
}

export function buildRequest(url: string, actor: { token: string; csrfToken: string } | null, options: RequestOptions = {}) {
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

  headers.set("content-type", "application/json");
  headers.set("x-forwarded-for", "203.0.113.5");

  return new NextRequest(`http://localhost${url}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export async function directHashPassword(password: string) {
  return hashPassword(password);
}
