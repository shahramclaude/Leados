// src/lib/auth.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. Leados's real
// identity/session module (Part 14) is not present in this sandbox
// checkout. This file reconstructs the minimal surface Part 52 needs: a way
// to read "who is making this request" from headers. In the real app this
// would come from a verified session; here it is intentionally explicit and
// header-based so the self-scope tests can exercise every role without a
// full auth stack, and so the contract is obvious when this is swapped for
// the real session reader.

import type { ActorContext, ActorRole } from "@/lib/privacy";

const VALID_ROLES: ActorRole[] = ["member", "admin", "manager", "system"];

export function getActorFromRequest(req: Request): ActorContext | null {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;
  const roleHeader = req.headers.get("x-user-role");
  const role: ActorRole = VALID_ROLES.includes(roleHeader as ActorRole) ? (roleHeader as ActorRole) : "member";
  return { userId, role };
}
