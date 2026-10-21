// Tenancy boundary helpers (Part 13 lineage), enforced by the public API
// (Part 14 lineage) in src/app/api/public/v1/**.
//
// Rule: every query in LEADOS is scoped by orgId. There is no code path that
// selects rows across orgs. The public API resolves orgId exclusively from
// the API key (never from a client-supplied body/query field), so a caller
// cannot "ask" for another tenant's data by changing a parameter.

import { createHash } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export type ApiKeyContext = {
  orgId: string;
  apiKeyId: string;
  scopes: string[];
};

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/** Resolves the tenant context for a public-API request from its bearer
 * token. Never trust an orgId that arrives in the request body/query. */
export async function resolveApiKeyContext(authorizationHeader: string | null): Promise<ApiKeyContext> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }
  const rawKey = authorizationHeader.slice("Bearer ".length).trim();
  const keyHash = hashApiKey(rawKey);

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));

  if (!row) {
    throw new UnauthorizedError("Invalid or revoked API key");
  }

  return { orgId: row.orgId, apiKeyId: row.id, scopes: row.scopes ?? [] };
}
