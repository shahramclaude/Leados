// Hardened session management.
//
// Design choice (documented OIDC-ready seam): a signed, httpOnly cookie (JWS
// HS256 via `jose`) carrying an opaque session id, backed by a server-side
// `sessions` row. Rationale:
//   - A DB-backed row is required regardless, to satisfy "rotate sessions on
//     privilege change" and "revoke a session during incident response" — a
//     pure stateless JWT can do neither.
//   - `src/lib/auth/provider.ts` defines the seam an OIDC/SSO login would
//     plug into: it only needs to call `createSession()` with a verified
//     user id, exactly like the local-password path in
//     `src/lib/authService.ts` does. No route, repository, or CSRF code
//     needs to change to add an OIDC provider later.
//
// Timeouts: idle (sliding, refreshed on every authenticated request) AND
// absolute (fixed at session creation, never extended) are both enforced —
// see IDLE_TIMEOUT_MS / ABSOLUTE_TIMEOUT_MS below.
import "server-only";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { getSessionSecrets, isProduction } from "@/lib/env";
import type { Role } from "@/lib/authz/permissions";

export const SESSION_COOKIE = "leados_session";
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours no matter what

export interface SessionUser {
  sessionId: string;
  userId: string;
  orgId: string;
  role: Role;
  email: string;
}

interface TokenPayload {
  sid: string;
  sub: string;
  org: string;
  role: string;
  sv: number;
}

function secretKeys(): Uint8Array[] {
  return getSessionSecrets().map((s) => new TextEncoder().encode(s));
}

async function signToken(payload: TokenPayload): Promise<string> {
  const [key] = secretKeys();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + IDLE_TIMEOUT_MS) / 1000))
    .sign(key);
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  for (const key of secretKeys()) {
    try {
      const { payload } = await jwtVerify(token, key);
      return payload as unknown as TokenPayload;
    } catch {
      // try next key (secret rotation window) before giving up
    }
  }
  return null;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export interface CreateSessionInput {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
  ip?: string | null;
  userAgent?: string | null;
}

/** Always creates a brand-new session row + token — used on login (fresh
 * session id, never reuses a pre-auth session id: mitigates session fixation)
 * and whenever we need to force a specific actor onto a new session. */
export async function createSession(input: CreateSessionInput): Promise<{ token: string; sessionId: string }> {
  const [user] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, input.userId));
  const sessionVersion = user?.sessionVersion ?? 0;

  const [row] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      orgId: input.orgId,
      absoluteExpiresAt: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning({ id: sessions.id });

  const token = await signToken({ sid: row.id, sub: input.userId, org: input.orgId, role: input.role, sv: sessionVersion });
  return { token, sessionId: row.id };
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(IDLE_TIMEOUT_MS / 1000));
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Reads the session cookie, validates signature + idle expiry (JWT `exp`),
 * absolute expiry and revocation (DB row), and session-version match (so a
 * role/privilege change invalidates every outstanding token for that user
 * immediately, not just at next natural expiry). Returns `null` on any
 * failure — callers must treat `null` as "not authenticated", never throw
 * raw errors that could leak which check failed to the client. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      orgId: sessions.orgId,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.id, payload.sid), isNull(sessions.revokedAt)));

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.absoluteExpiresAt.getTime() < Date.now()) return null;

  const [user] = await db
    .select({ role: users.role, email: users.email, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, row.userId));
  if (!user) return null;
  if (user.sessionVersion !== payload.sv) return null; // invalidated by role/privilege change

  // Sliding idle timeout: touch lastSeenAt. Best-effort; failure to update
  // must never block the request.
  db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id)).catch(() => {});

  return { sessionId: row.id, userId: row.userId, orgId: row.orgId, role: user.role as Role, email: user.email };
}

/** Called after any authenticated request so the idle window keeps sliding.
 * Re-signs the token with a fresh `exp`; the DB absolute expiry is untouched. */
export async function refreshSessionCookie(session: SessionUser) {
  const [user] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, session.userId));
  const token = await signToken({
    sid: session.sessionId,
    sub: session.userId,
    org: session.orgId,
    role: session.role,
    sv: user?.sessionVersion ?? 0,
  });
  await setSessionCookie(token);
}

export async function revokeSession(sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Bumps the user's session_version, instantly invalidating every token
 * minted before the bump (used on role change / "sign out everywhere"),
 * independent of each session row's own `revokedAt`. */
export async function invalidateAllSessionsForUser(userId: string) {
  await db
    .update(users)
    .set({ sessionVersion: (await currentSessionVersion(userId)) + 1 })
    .where(eq(users.id, userId));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

async function currentSessionVersion(userId: string): Promise<number> {
  const [row] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, userId));
  return row?.sessionVersion ?? 0;
}
