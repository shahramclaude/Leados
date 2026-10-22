// Local-credentials auth provider (see src/lib/auth/provider.ts for the
// OIDC-ready seam this will sit alongside, not be replaced by, if/when SSO
// is added). Owns: org+admin bootstrap, login with lockout, logout.
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import type { Role } from "@/lib/authz/permissions";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function createOrgAndAdmin(orgName: string, email: string, password: string) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    throw new Error("EMAIL_ALREADY_REGISTERED");
  }

  const [org] = await db.insert(organizations).values({ name: orgName }).returning();
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ orgId: org.id, email, passwordHash, role: "admin" })
    .returning();

  return { org, user: { ...user, role: user.role as Role } };
}

export async function createSessionForUser(
  user: { id: string; orgId: string; role: string; email: string },
  ip: string | null,
  userAgent: string | null,
) {
  return createSession({
    userId: user.id,
    orgId: user.orgId,
    role: user.role as Role,
    email: user.email,
    ip,
    userAgent,
  });
}

export type LoginResult =
  | { outcome: "success"; user: { id: string; orgId: string; role: Role; email: string }; token: string }
  | { outcome: "invalid_credentials" }
  | { outcome: "locked"; retryAfterMs: number };

/** Account lockout is independent of (and in addition to) the IP-based rate
 * limit applied in the route handler — an attacker rotating source IPs still
 * cannot brute-force a single account past MAX_FAILED_LOGIN_ATTEMPTS. */
export async function authenticateWithPassword(
  email: string,
  password: string,
  ip: string | null,
  userAgent: string | null,
): Promise<LoginResult> {
  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    // Constant-shape response: don't reveal whether the email exists.
    await hashPassword(password).catch(() => {}); // keep timing roughly similar to the real path
    return { outcome: "invalid_credentials" };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { outcome: "locked", retryAfterMs: user.lockedUntil.getTime() - Date.now() };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failedCount = user.failedLoginCount + 1;
    const lockedUntil = failedCount >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
    await db
      .update(users)
      .set({ failedLoginCount: failedCount, lockedUntil })
      .where(eq(users.id, user.id));
    if (lockedUntil) {
      return { outcome: "locked", retryAfterMs: LOCKOUT_DURATION_MS };
    }
    return { outcome: "invalid_credentials" };
  }

  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));

  const { token } = await createSessionForUser(user, ip, userAgent);
  return { outcome: "success", user: { id: user.id, orgId: user.orgId, role: user.role as Role, email: user.email }, token };
}
