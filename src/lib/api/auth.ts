import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { ApiError } from "./errors";

export type Scope =
  | "leads:read"
  | "leads:write"
  | "accounts:read"
  | "accounts:write"
  | "events:read"
  | "stream:read"
  | "webhooks:read"
  | "webhooks:write"
  | "automations:read"
  | "automations:write"
  | "extensions:read"
  | "extensions:write"
  | "audit:read"
  | "tokens:admin";

export interface AuthContext {
  tokenId: string;
  orgId: string;
  scopes: Scope[];
  isAdmin: boolean;
  rateLimitPerMinute: number;
}

const TOKEN_PREFIX = "leados_live_";

export function generateToken(): { raw: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("hex");
  const raw = `${TOKEN_PREFIX}${secret}`;
  return { raw, prefix: raw.slice(0, TOKEN_PREFIX.length + 6), hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function authenticate(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiError("UNAUTHORIZED", "Missing or malformed Authorization header. Use: Authorization: Bearer <token>.");
  }
  const raw = match[1].trim();
  const hash = hashToken(raw);
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).limit(1);
  if (!row || row.revokedAt) {
    throw new ApiError("UNAUTHORIZED", "Invalid or revoked API token.");
  }
  // Best-effort last-used stamp; never block the request on this write.
  void db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id)).catch(() => {});
  return {
    tokenId: row.id,
    orgId: row.orgId,
    scopes: (row.scopes ?? []) as Scope[],
    isAdmin: row.isAdmin,
    rateLimitPerMinute: row.rateLimitPerMinute,
  };
}

export function requireScope(ctx: AuthContext, scope: Scope) {
  if (ctx.isAdmin) return;
  if (!ctx.scopes.includes(scope)) {
    throw new ApiError("FORBIDDEN", `Token is missing required scope "${scope}".`, { requiredScope: scope });
  }
}

export function requireAdmin(ctx: AuthContext) {
  if (!ctx.isAdmin) {
    throw new ApiError("FORBIDDEN", "This endpoint is restricted to admin tokens.");
  }
}
