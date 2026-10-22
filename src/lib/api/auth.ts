import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface AuthContext {
  readonly userId: number;
  readonly tenantId: number;
  readonly role: "member" | "admin";
}

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Resolves the caller from the `x-api-key` header. Intentionally simple
 * (header-based, DB-backed lookup) — real SSO/OIDC is out of scope for this
 * sandbox reconstruction (see docs/TESTING.md Phase 5, "deliberately not
 * done"). The important contract for tests is: missing/invalid key => throws
 * AuthError, and the returned tenantId MUST be used to scope every query
 * (tenancy isolation).
 */
export async function requireAuth(request: Request): Promise<AuthContext> {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    throw new AuthError("Missing x-api-key header");
  }
  const rows = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      role: users.role,
    })
    .from(users)
    .where(eq(users.apiKey, apiKey))
    .limit(1);

  const user = rows[0];
  if (!user) {
    throw new AuthError("Invalid API key");
  }
  return { userId: user.id, tenantId: user.tenantId, role: user.role };
}

export function requireAdmin(ctx: AuthContext): void {
  if (ctx.role !== "admin") {
    throw new ForbiddenError("Admin role required");
  }
}
