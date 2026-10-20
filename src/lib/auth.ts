// Minimal auth stub for Part 8. Earlier parts of LEADOS own real
// authentication; this sandbox only needs a stable way to resolve "the
// current user" so realtime channels, notifications and attention state can
// be scoped per-user. Resolution order:
//   1. `x-user-id` header (used by tests / server-to-server calls)
//   2. `leados_uid` cookie (used by the browser once seeded)
//   3. Fall back to (and create, if missing) a demo user.
//
// Replace this module wholesale once real auth lands — nothing else in this
// part should need to change, since everything downstream depends only on
// `getCurrentUserId(request)`.

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEMO_USER_EMAIL = "demo@leados.app";
export const DEMO_USER_NAME = "Demo Operator";

let demoUserPromise: Promise<string> | null = null;

async function getOrCreateDemoUser(): Promise<string> {
  const existing = await db.select().from(users).where(eq(users.email, DEMO_USER_EMAIL)).limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(users)
    .values({ name: DEMO_USER_NAME, email: DEMO_USER_EMAIL, timezone: "UTC" })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return inserted[0].id;

  const retry = await db.select().from(users).where(eq(users.email, DEMO_USER_EMAIL)).limit(1);
  if (retry[0]) return retry[0].id;
  throw new Error("Failed to resolve demo user");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const match = header.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function getCurrentUserId(request: Request): Promise<string> {
  const headerUser = request.headers.get("x-user-id");
  if (headerUser) return headerUser;

  const cookieUser = readCookie(request, "leados_uid");
  if (cookieUser) return cookieUser;

  if (!demoUserPromise) demoUserPromise = getOrCreateDemoUser();
  return demoUserPromise;
}

export async function getDemoUserId(): Promise<string> {
  if (!demoUserPromise) demoUserPromise = getOrCreateDemoUser();
  return demoUserPromise;
}

/** Server Component variant — reads the same cookie via `next/headers`. */
export async function getCurrentUserIdServer(): Promise<string> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const cookieUser = store.get("leados_uid")?.value;
  if (cookieUser) return cookieUser;

  if (!demoUserPromise) demoUserPromise = getOrCreateDemoUser();
  return demoUserPromise;
}
