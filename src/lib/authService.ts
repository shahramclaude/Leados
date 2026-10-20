import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizations, sessions, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  type SessionPayload,
} from "@/lib/session";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export class AuthServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function createOrgAndAdmin(orgName: string, email: string, password: string) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new AuthServiceError("EMAIL_TAKEN", "An account with that email already exists.");
  }

  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: orgName }).returning();
    const [user] = await tx
      .insert(users)
      .values({
        orgId: org.id,
        email,
        passwordHash,
        role: "admin",
      })
      .returning();
    return { org, user };
  });
}

/**
 * Verifies credentials with account lockout. Always takes a comparable
 * amount of time whether the email exists or not (bcrypt against a dummy
 * hash) to reduce user-enumeration via timing.
 */
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8G8G8G8G8G8G8G8G8G8G8G8G8G8G8G";

export async function authenticateUser(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    await verifyPassword(password, DUMMY_HASH).catch(() => undefined);
    throw new AuthServiceError("INVALID_CREDENTIALS", "Invalid email or password.");
  }

  if (!user.isActive) {
    throw new AuthServiceError("ACCOUNT_DISABLED", "This account has been disabled.");
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AuthServiceError(
      "ACCOUNT_LOCKED",
      `Account temporarily locked. Try again after ${user.lockedUntil.toISOString()}.`,
    );
  }

  if (user.ssoSubject) {
    throw new AuthServiceError("SSO_REQUIRED", "This account must sign in via SSO.");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: locked ? 0 : attempts,
        lockedUntil: locked ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    throw new AuthServiceError(
      locked ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
      locked
        ? `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MS / 60000} minutes.`
        : "Invalid email or password.",
    );
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  return user;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSessionForUser(
  user: { id: string; orgId: string; email: string; role: "admin" | "manager" | "member" },
  ip: string,
  userAgent: string | null,
) {
  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000);

  const payload: SessionPayload = {
    sid: sessionId,
    sub: user.id,
    orgId: user.orgId,
    email: user.email,
    role: user.role,
  };
  const token = await signSessionToken(payload);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    tokenHash: hashToken(token),
    ip,
    userAgent,
    expiresAt,
  });

  return { token, sessionId, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
}

export async function revokeSession(sessionId: string, reason: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllSessionsForUser(userId: string, reason: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
