// src/lib/platform/authz.ts — server-side enforcement wiring the pure RBAC
// matrix (src/lib/domain/rbac.ts) to a resolved session. Every API route
// that touches tenant data calls `requirePermission` before touching the
// repository layer; repositories themselves refuse to run without an
// explicit `orgId` argument, so isolation is enforced twice (belt + braces).

import { can, ForbiddenError } from "@/lib/domain/rbac";
import type { Permission, SessionContext } from "@/lib/domain/types";

export { ForbiddenError };

export function requirePermission(session: SessionContext, permission: Permission): void {
  if (!can(session.role, permission)) {
    throw new ForbiddenError(permission);
  }
}

export function errorToResponse(err: unknown): Response {
  if (err instanceof ForbiddenError) {
    return Response.json({ error: "forbidden", permission: err.permission }, { status: 403 });
  }
  if (err && typeof err === "object" && "name" in err && err.name === "UnauthorizedError") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return Response.json({ error: message }, { status: 400 });
}
