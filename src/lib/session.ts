import { jwtVerify, SignJWT } from "jose";
import { getEnv, isProduction } from "@/lib/env";
import type { UserRole } from "@/lib/permissions";

export const SESSION_COOKIE = "leados_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h sliding token lifetime
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7d hard ceiling (DB-enforced)

export interface SessionPayload {
  /** session row id (used for server-side revocation lookups) */
  sid: string;
  /** user id */
  sub: string;
  orgId: string;
  email: string;
  role: UserRole;
}

function getSecretKey() {
  const { AUTH_SECRET } = getEnv();
  return new TextEncoder().encode(AUTH_SECRET);
}

/**
 * Why Auth.js / NextAuth was NOT used here (documented per standing order #1):
 * LEADOS needs (a) a server-authoritative, revocable session row for
 * instant "log out everywhere" during incident response, (b) strict control
 * over cookie flags/rotation cadence for the audit trail, and (c) zero extra
 * OAuth-provider surface area for a product that is currently single-tenant
 * credential + future OIDC federation. A small, fully-audited
 * jose-based signed session (JWT carries only non-sensitive claims; the
 * authoritative state lives in the `sessions` table) gives full control with
 * a minimal, reviewable dependency footprint. The `ssoSubject`/`ssoProvider`
 * columns on `users` and the `AuthProvider` interface in this file are the
 * documented seam for swapping in Auth.js + an OIDC provider later without
 * changing any API route — see docs/SECURITY.md "SSO readiness".
 */
export interface AuthProvider {
  name: string;
  /** Exchange a verified external identity assertion for a LEADOS session. */
  resolve(subject: string, email: string): Promise<SessionPayload>;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.sid === "string" &&
      typeof payload.sub === "string" &&
      typeof payload.orgId === "string" &&
      typeof payload.email === "string" &&
      typeof payload.role === "string"
    ) {
      return {
        sid: payload.sid,
        sub: payload.sub,
        orgId: payload.orgId,
        email: payload.email,
        role: payload.role as UserRole,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
