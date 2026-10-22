// Tenant scoping (Part 15), enforced on the public API (Part 16). Internal
// routes trust an `x-org-id` header (there is no human login system in this
// build — see docs/FEATURES.md "Auth" row, marked stub). The public API
// additionally requires a bearer API key that is hashed and looked up
// per-org, so a leaked internal org id header alone cannot read another
// tenant's data through the public surface.
import { createHash } from "node:crypto";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export class TenantError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function requireInternalOrgId(req: Request): number {
  const header = req.headers.get("x-org-id");
  const orgId = header ? Number(header) : NaN;
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new TenantError('missing/invalid "x-org-id" header', 400);
  }
  return orgId;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Resolves the org that a public-API bearer key belongs to. Throws if the
 * key is missing, unknown, or revoked — this is the only legal way the
 * public API surface learns which tenant it is serving.
 */
export async function requirePublicOrgId(req: Request): Promise<number> {
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) {
    throw new TenantError('missing "Authorization: Bearer <key>" header', 401);
  }
  const hash = hashApiKey(match[1]);
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.revoked, false)));
  if (!row) {
    throw new TenantError("invalid or revoked API key", 401);
  }
  return row.orgId;
}
