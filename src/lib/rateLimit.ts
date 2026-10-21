// Login rate limiting + account lockout (Part 17-A).
//
// Two layers, both DB-backed so they work correctly across multiple app
// instances (an in-memory map would not):
//   1. Per-account lockout: `users.failed_login_count` / `locked_until`.
//      After MAX_FAILED_ATTEMPTS consecutive failures the account is locked
//      for LOCKOUT_MS, independent of source IP (protects against
//      distributed / botnet credential stuffing of one account).
//   2. Per-IP + per-email sliding-window throttle over `login_attempts`,
//      independent of whether the account exists, so the endpoint cannot be
//      used to enumerate valid emails at high speed or hammer a single IP
//      across many accounts.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts, users } from "@/db/schema";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export async function checkLoginRateLimit(email: string, ip: string | null): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS);

  const [{ count: byEmail }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), gt(loginAttempts.createdAt, since)));

  if (byEmail >= MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  if (ip) {
    const [{ count: byIp }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, since)));
    if (byIp >= MAX_ATTEMPTS_PER_WINDOW * 3) {
      return { allowed: false, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
    }
  }

  const [user] = await db
    .select({ lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { allowed: false, retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000) };
  }

  return { allowed: true };
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean): Promise<void> {
  await db.insert(loginAttempts).values({ email, ip, success });

  if (success) {
    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.email, email));
    return;
  }

  const [user] = await db
    .select({ id: users.id, failedLoginCount: users.failedLoginCount })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return; // do not reveal account existence via side effects

  const nextCount = user.failedLoginCount + 1;
  const lockedUntil = nextCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
  await db
    .update(users)
    .set({ failedLoginCount: lockedUntil ? 0 : nextCount, lockedUntil })
    .where(eq(users.id, user.id));
}
