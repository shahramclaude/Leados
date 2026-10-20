import { requireSession } from "@/lib/platform/session";
import { requirePermission, errorToResponse } from "@/lib/platform/authz";
import { ALL_PERMISSIONS, ROLES, permissionsFor } from "@/lib/domain/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    requirePermission(session, "permissions:view");
    const matrix = ROLES.map((role) => ({ role, permissions: permissionsFor(role) }));
    return Response.json({ roles: ROLES, permissions: ALL_PERMISSIONS, matrix });
  } catch (err) {
    return errorToResponse(err);
  }
}
