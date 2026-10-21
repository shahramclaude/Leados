import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tenants } from "@/db/schema";

export type AuthenticatedTenant = {
  id: string;
  name: string;
};

export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Minimal tenancy auth: callers present `Authorization: Bearer <apiKey>`.
 * Every resource row carries a `tenantId`; every query MUST be scoped to the
 * authenticated tenant so cross-tenant leakage is structurally impossible,
 * not just policy. Exercised by the tenancy-isolation integration tests.
 */
export async function requireTenant(request: Request): Promise<AuthenticatedTenant> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new ApiAuthError("Missing Authorization: Bearer <apiKey> header", 401);
  }
  const apiKey = match[1].trim();
  if (!apiKey) {
    throw new ApiAuthError("Empty API key", 401);
  }
  const db = getDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.apiKey, apiKey)).limit(1);
  if (!tenant) {
    throw new ApiAuthError("Invalid API key", 401);
  }
  return { id: tenant.id, name: tenant.name };
}
