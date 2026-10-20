// src/lib/platform/session.ts — dev-grade session resolution.
//
// Disclosed limitation (same pattern as src/lib/a11y.ts's screen-reader
// self-report): this slice has no prior-part auth system to integrate with
// (no password hashing, no OAuth), so "sign in" is a transparent dev chooser
// (`/login`) that sets a plain cookie naming a seeded user + active org. The
// cookie is NOT a security boundary by itself — every API route still runs
// every read/write through `requireSession()` + `requirePermission()` so the
// *authorization* model (RBAC + org scoping) is real and tested, independent
// of how a production build would eventually authenticate the request.

import { cookies } from "next/headers";
import { getMembership } from "./db/membershipsRepository";
import { getUserById } from "./db/usersRepository";
import { normalizeLocale } from "@/lib/i18n";
import type { Role, SessionContext } from "@/lib/domain/types";

export const SESSION_USER_COOKIE = "leados_uid";
export const SESSION_ORG_COOKIE = "leados_org";

export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function readSessionCookies(): Promise<{ userId?: string; orgId?: string }> {
  const store = await cookies();
  return {
    userId: store.get(SESSION_USER_COOKIE)?.value,
    orgId: store.get(SESSION_ORG_COOKIE)?.value,
  };
}

/** Resolve the full session context (user, active org, role, locale) or throw. */
export async function requireSession(): Promise<SessionContext> {
  const { userId, orgId } = await readSessionCookies();
  if (!userId || !orgId) throw new UnauthorizedError();

  const [user, membership] = await Promise.all([getUserById(userId), getMembership(userId, orgId)]);
  if (!user || !membership) throw new UnauthorizedError();

  return {
    userId: user.id,
    orgId: membership.orgId,
    role: membership.role as Role,
    locale: normalizeLocale(user.locale),
  };
}

export async function getOptionalSession(): Promise<SessionContext | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}
