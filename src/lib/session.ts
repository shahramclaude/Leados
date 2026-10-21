// Hardened, stack-consistent session management.
//
// CHOICE & JUSTIFICATION (Part 17-A): we use *signed, httpOnly cookies*
// carrying an opaque session id (JWT/JWS via `jose`, HS256) backed by a
// server-side `sessions` table, rather than Auth.js/NextAuth. Rationale:
//   - LEADOS has no social-login requirement today and a single local
//     credential store, so Auth.js's adapter/provider machinery would add
//     surface area without buying anything yet.
//   - A DB-backed session row is required regardless (to satisfy "session
//     rotation on privilege change" and "revoke sessions during incident
//     response" — a pure stateless JWT cannot do either), so we are not
//     saving complexity by going stateless.
//   - The OIDC seam (`src/lib/auth/provider.ts`) keeps enterprise SSO a
///     drop-in: an OIDC callback only needs to call `createSession()` with a
//      verified subject, exactly like the local-password path does.
// If/when SAML/OIDC SSO is prioritised, swapping to Auth.js is a contained
// change because *every route* already goes through `getSession()` /
// `requireSession()` below rather than reading cookies directly.
import "server-only";
import { cookies, headers } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { getSessionSecrets, isProduction } from "@/lib/env";

export const SESSION_COOKIE = "leados_session";
export const CSRF_COOKIE = "leados_csrf";

// Idle timeout: session dies after this much inactivity.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
// Absolute timeout: session dies this long after login no matter what.
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours

export type SessionUser = {
  sessionId: string;
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  email: string;
};

type TokenPayload = {
  sid: string;
  sub: string;
  org: string;
  role: string;
  sstamp: string;
};

function secretKeys(): Uint8Array[] {
  return getSessionSecrets().map((s) => new TextEncoder().encode(s));
}

async function signToken(payload: TokenPayload): Promise<string> {
  const [key] = secretKeys();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + IDLE_TIMEOUT_MS) / 1000))
    .sign(key);
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  for (const key of secretKeys()) {
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
      return payload as unknown as TokenPayload;
    } catch {
      // try next key (rotation window), otherwise fall through to null
    }
  }
  return null;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    // Lax (not Strict) so a normal top-level navigation link into the app
    // still carries the cookie (Strict breaks "open in new tab" / email
    // links), while still blocking the cookie on cross-site POST/script
    // requests that CSRF relies on. Combined with the double-submit CSRF
    // token on every mutation, this is the standard OWASP-recommended
    // pairing for session cookies that are not purely API-token based.
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Create a brand-new server-side session row + signed cookie for a user. */
export async function createSession(params: {
  userId: string;
  orgId: string;
  role: string;
  securityStamp: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<SessionUser> {
  const now = new Date();
  const [row] = await db
    .insert(sessions)
    .values({
      userId: params.userId,
      orgId: params.orgId,
      securityStamp: params.securityStamp,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS),
      idleExpiresAt: new Date(now.getTime() + IDLE_TIMEOUT_MS),
    })
    .returning();

  const token = await signToken({
    sid: row.id,
    sub: params.userId,
    org: params.orgId,
    role: params.role,
    sstamp: params.securityStamp,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(ABSOLUTE_TIMEOUT_MS / 1000));

  return {
    sessionId: row.id,
    userId: params.userId,
    orgId: params.orgId,
    role: params.role as SessionUser["role"],
    email: "",
  };
}

/**
 * Resolve the current request's session, enforcing idle + absolute timeout
 * and the security stamp (so a password/role change invalidates every other
 * active session immediately — "session rotation on privilege change").
 * Slides the idle window forward on each successful check.
 */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const now = new Date();
  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      orgId: sessions.orgId,
      securityStamp: sessions.securityStamp,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      idleExpiresAt: sessions.idleExpiresAt,
      revokedAt: sessions.revokedAt,
      role: users.role,
      email: users.email,
      status: users.status,
      userSecurityStamp: users.securityStamp,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, payload.sid), isNull(sessions.revokedAt)))
    .limit(1);

  if (!row) return null;
  if (row.status !== "active") return null;
  if (row.absoluteExpiresAt.getTime() <= now.getTime()) return null;
  if (row.idleExpiresAt.getTime() <= now.getTime()) return null;
  // Security stamp mismatch => a privilege/password change happened after
  // this session was issued. Treat as revoked without needing a DB write on
  // every request to find it.
  if (row.securityStamp !== row.userSecurityStamp) return null;
  if (payload.sstamp !== row.userSecurityStamp) return null;

  // Slide the idle window forward. Best-effort: failure to extend should
  // not break the request.
  try {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, idleExpiresAt: new Date(now.getTime() + IDLE_TIMEOUT_MS) })
      .where(eq(sessions.id, row.id));
  } catch {
    // non-fatal
  }

  return {
    sessionId: row.id,
    userId: row.userId,
    orgId: row.orgId,
    role: row.role as SessionUser["role"],
    email: row.email,
  };
}

export async function destroySession(sessionId?: string): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const sid = sessionId ?? (token ? (await verifyToken(token))?.sid : undefined);
  if (sid) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: "logout" })
      .where(eq(sessions.id, sid));
  }
  store.delete(SESSION_COOKIE);
}

/** Revoke every active session for a user (incident response / role change). */
export async function revokeAllSessionsForUser(userId: string, reason: string): Promise<number> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.absoluteExpiresAt, new Date())))
    .returning({ id: sessions.id });
  return result.length;
}

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip");
}
