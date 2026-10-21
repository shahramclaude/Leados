// Dev-auth seam: a real deployment plugs in session/JWT auth here. For this
// part, identity is resolved from an `x-user-id` header (used by tests and
// the storm/reconnect scripts) or a `leados_uid` cookie (used by the browser
// client), falling back to the first seeded admin so the app is usable
// immediately in a fresh sandbox. This is intentionally isolated to one
// module so swapping in real auth later touches nothing else.

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  timezone: string;
}

let fallbackCache: CurrentUser | null = null;

export async function resolveCurrentUser(req: Request): Promise<CurrentUser | null> {
  const headerId = req.headers.get("x-user-id");
  const cookieId = readCookie(req.headers.get("cookie"), "leados_uid");
  const id = headerId ?? cookieId;

  if (id) {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (row) return row;
  }

  if (fallbackCache) return fallbackCache;
  const [first] = await db.select().from(users).limit(1);
  if (first) {
    fallbackCache = first;
    return first;
  }
  return null;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Server Component variant (no Request object available there) — reads the
// same `leados_uid` cookie via next/headers.
export async function resolveServerUser(): Promise<CurrentUser | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const id = store.get("leados_uid")?.value;

  if (id) {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (row) return row;
  }

  if (fallbackCache) return fallbackCache;
  const [first] = await db.select().from(users).limit(1);
  if (first) {
    fallbackCache = first;
    return first;
  }
  return null;
}
