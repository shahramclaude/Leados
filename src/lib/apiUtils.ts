import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/session";
import { CSRF_COOKIE, CSRF_HEADER, SAFE_METHODS, verifyCsrf } from "@/lib/csrf";
import { consumeRateLimit } from "@/lib/rateLimit";
import { type Permission, roleHasPermission } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";

export const MAX_JSON_BODY_BYTES = 256 * 1024; // 256KB — generous for forms, hostile to abuse

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getCorrelationId(req: NextRequest): string {
  return req.headers.get("x-correlation-id") ?? randomUUID();
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function jsonError(status: number, code: string, message: string, correlationId?: string) {
  return NextResponse.json(
    { error: { code, message }, correlationId },
    { status, headers: correlationId ? { "x-correlation-id": correlationId } : undefined },
  );
}

/**
 * Resolves the authenticated session for a request by verifying the signed
 * JWT cookie AND cross-checking it against the live, revocable `sessions`
 * row. A session can be valid by signature but revoked (logout-everywhere,
 * incident response) or expired server-side — both are rejected here.
 */
export async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, payload.sid), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  // Defense in depth: re-check the user is still active and the role on the
  // token matches current DB state (role changes take effect immediately,
  // not just at next login).
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || !user.isActive) return null;
  if (user.role !== payload.role || user.orgId !== payload.orgId) {
    return { ...payload, role: user.role, orgId: user.orgId };
  }
  return payload;
}

export interface AuthContext {
  session: SessionPayload;
  correlationId: string;
  ip: string;
  userAgent: string | null;
}

/**
 * Standard guard for every authenticated API route:
 *  1. CSRF check on all non-safe methods (double-submit cookie).
 *  2. Session resolution (signed cookie + live DB session row).
 *  3. Optional permission check against the RBAC registry.
 * Every denial is itself an audited `security.*` event so authz failures are
 * forensically visible, not just silently 403'd.
 */
export async function requireAuth(
  req: NextRequest,
  options?: { permission?: Permission },
): Promise<AuthContext | NextResponse> {
  const correlationId = getCorrelationId(req);
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  if (!SAFE_METHODS.has(req.method)) {
    const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
    const headerToken = req.headers.get(CSRF_HEADER);
    if (!verifyCsrf(cookieToken, headerToken)) {
      await recordAuditEvent({
        correlationId,
        orgId: null,
        actorUserId: null,
        actorEmail: null,
        action: "security.csrf_rejected",
        resourceType: "http_request",
        reason: `${req.method} ${new URL(req.url).pathname}`,
        ip,
        userAgent,
      });
      return jsonError(403, "CSRF_REJECTED", "Missing or invalid CSRF token.", correlationId);
    }
  }

  const session = await getSession(req);
  if (!session) {
    return jsonError(401, "UNAUTHENTICATED", "Authentication required.", correlationId);
  }

  if (options?.permission && !roleHasPermission(session.role, options.permission)) {
    await recordAuditEvent({
      correlationId,
      orgId: session.orgId,
      actorUserId: session.sub,
      actorEmail: session.email,
      action: "security.authz_denied",
      resourceType: "http_request",
      reason: `${req.method} ${new URL(req.url).pathname} requires ${options.permission}`,
      ip,
      userAgent,
    });
    return jsonError(403, "FORBIDDEN", "You do not have permission to perform this action.", correlationId);
  }

  return { session, correlationId, ip, userAgent };
}

export function isAuthContext(value: AuthContext | NextResponse): value is AuthContext {
  return !(value instanceof NextResponse);
}

/** Applies a named rate-limit bucket and returns a 429 response when exceeded. */
export function enforceRateLimit(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const ip = getClientIp(req);
  const result = consumeRateLimit(`${bucket}:${ip}`, limit, windowMs);
  if (!result.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((result.resetAt - Date.now()) / 1000).toString() },
      },
    );
  }
  return null;
}

/** Parses and validates a JSON body against a zod schema with a strict size cap. */
export async function parseJsonBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  const text = await req.text();
  if (text.length > MAX_JSON_BODY_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the maximum allowed size.");
  }
  let json: unknown;
  try {
    json = text.length ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    );
  }
  return parsed.data;
}

/** Escapes a string for safe interpolation into HTML/JSX text nodes. Defense in depth
 * alongside React's default output encoding, used for any server-rendered strings that
 * bypass JSX (e.g. CSV/plaintext/export views rendered as HTML). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
