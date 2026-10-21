import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requirePermission, UnauthenticatedError } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { listPermissionOverrides, recordAuditEvent, setPermissionOverride } from "@/db/repositories/orgs";
import { BASE_ROLE_PERMISSIONS, effectivePermissionMatrix, PERMISSIONS, ROLES } from "@/lib/permissions";
import { ROUTE_PERMISSIONS } from "@/lib/routePermissions";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const overrides = await listPermissionOverrides(user.orgId);
    const matrix = effectivePermissionMatrix(overrides);
    return NextResponse.json({
      roles: ROLES,
      permissions: PERMISSIONS,
      basePermissions: BASE_ROLE_PERMISSIONS,
      matrix,
      overrides,
      // Exposed so the admin page can render — and a consistency test can
      // assert — that every enforced API route maps back to a permission in
      // this exact matrix (acceptance gate 5).
      routeRegistry: ROUTE_PERMISSIONS,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requirePermission("permissions.manage");
    const body = await request.json().catch(() => ({}));
    const { role, permission, allowed } = body as { role?: string; permission?: string; allowed?: boolean };
    if (!role || !permission || typeof allowed !== "boolean") {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    if (!(ROLES as readonly string[]).includes(role) || !(PERMISSIONS as readonly string[]).includes(permission)) {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const { row, before } = await setPermissionOverride(user.orgId, role, permission, allowed, user.id);
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      action: "permission.override",
      entityType: "role_permission_override",
      entityId: row.id,
      before,
      after: row,
    });
    return NextResponse.json({ override: row });
  } catch (err) {
    return handleApiError(err);
  }
}
