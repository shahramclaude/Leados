// Bearer token authentication + scopes + per-token/org rate limiting for the
// public API. Tokens are stored hashed (sha256); the raw token is only ever
// shown once, at creation time.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { ApiError } from "./envelope";

export type ApiScope = "read" | "write" | "webhooks" | "realtime" | "automation";

export interface AuthContext {
  tokenId: string;
  orgId: string;
  scopes: ApiScope[];
  rateLimitPerMinute: number;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): { raw: string; prefix: string; hash: string } {
  const raw = `lead_sk_${randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashToken(raw) };
}

export async function authenticate(req: Request): Promise<AuthContext> {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, raw] = header.split(" ");
  if (scheme !== "Bearer" || !raw) {
    throw new ApiError("UNAUTHORIZED", "Missing or malformed Authorization header. Use: Authorization: Bearer <token>");
  }

  const hash = hashToken(raw);
  const [token] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)))
    .limit(1);

  if (!token) {
    throw new ApiError("UNAUTHORIZED", "Invalid or revoked API token");
  }

  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, token.id))
    .catch(() => undefined);

  return {
    tokenId: token.id,
    orgId: token.orgId,
    scopes: token.scopes as ApiScope[],
    rateLimitPerMinute: token.rateLimitPerMinute,
  };
}

export function requireScope(ctx: AuthContext, scope: ApiScope) {
  if (!ctx.scopes.includes(scope)) {
    throw new ApiError("FORBIDDEN", `Token is missing required scope: ${scope}`, {
      requiredScope: scope,
      grantedScopes: ctx.scopes,
    });
  }
}

// --- Rate limiting -----------------------------------------------------
// Simple fixed-window token bucket, in-process. Good enough for a single
// instance / demo deployment; swap for a shared store (Redis) at scale.
const windows = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(ctx: AuthContext): RateLimitResult {
  const now = Date.now();
  const windowMs = 60_000;
  const key = ctx.tokenId;
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, limit: ctx.rateLimitPerMinute, remaining: ctx.rateLimitPerMinute - 1, resetAt: now + windowMs };
  }

  existing.count += 1;
  const remaining = ctx.rateLimitPerMinute - existing.count;
  return {
    limited: remaining < 0,
    limit: ctx.rateLimitPerMinute,
    remaining: Math.max(remaining, 0),
    resetAt: existing.resetAt,
  };
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}

export async function authenticateAndAuthorize(req: Request, scope: ApiScope): Promise<{ ctx: AuthContext; rate: RateLimitResult }> {
  const ctx = await authenticate(req);
  requireScope(ctx, scope);
  const rate = checkRateLimit(ctx);
  if (rate.limited) {
    throw new ApiError("RATE_LIMITED", "Rate limit exceeded", { retryAfterSeconds: Math.ceil((rate.resetAt - Date.now()) / 1000) });
  }
  return { ctx, rate };
}
