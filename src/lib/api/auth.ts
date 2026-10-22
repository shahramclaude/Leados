import { createHash, randomBytes } from "crypto";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ApiError } from "./errors";

export type Scope =
  | "leads:read"
  | "leads:write"
  | "contacts:read"
  | "contacts:write"
  | "deals:read"
  | "deals:write"
  | "webhooks:read"
  | "webhooks:write"
  | "automation:read"
  | "automation:write"
  | "admin";

export type AuthedKey = {
  id: string;
  name: string;
  scopes: Scope[];
  isAdmin: boolean;
};

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateApiKey(): { raw: string; prefix: string; hashed: string } {
  const raw = "leados_" + randomBytes(24).toString("base64url");
  const prefix = raw.slice(0, 12);
  return { raw, prefix, hashed: hashKey(raw) };
}

/** Resolves the caller's API key from the Authorization: Bearer <key> header. Throws ApiError on failure. */
export async function authenticate(req: Request): Promise<AuthedKey> {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiError("UNAUTHORIZED", "Missing Authorization: Bearer <api key> header.");
  }
  const raw = match[1].trim();
  const hashed = hashKey(raw);
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashed)).limit(1);
  if (!row || row.revokedAt) {
    throw new ApiError("UNAUTHORIZED", "The provided API key is invalid or has been revoked.");
  }
  return { id: row.id, name: row.name, scopes: row.scopes as Scope[], isAdmin: row.isAdmin };
}

export function requireScope(key: AuthedKey, scope: Scope) {
  if (key.isAdmin || key.scopes.includes(scope) || key.scopes.includes("admin")) return;
  throw new ApiError("FORBIDDEN", `This operation requires the '${scope}' scope.`);
}

export function requireAdmin(key: AuthedKey) {
  if (!key.isAdmin) {
    throw new ApiError("FORBIDDEN", "This operation is admin-only.");
  }
}

/** Rate-limit bucket key: per authenticated key id, falling back to a shared anonymous bucket. */
export function rateLimitKeyFor(key: AuthedKey | null): string {
  return key ? `key:${key.id}` : "anonymous";
}
