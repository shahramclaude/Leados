import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { createUser, listUsersByOrg, recordAuditEvent } from "@/db/repositories/orgs";
import { ROLES } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requirePermission("users.manage");
    const users = await listUsersByOrg(user.orgId);
    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("users.manage");
    const body = await request.json().catch(() => ({}));
    const { email, name, role, managerOfTeamId } = body as {
      email?: string;
      name?: string;
      role?: string;
      managerOfTeamId?: string | null;
    };
    if (!email || !name || !role || !(ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const created = await createUser({ orgId: user.orgId, email, name, role, managerOfTeamId });
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      action: "user.create",
      entityType: "user",
      entityId: created.id,
      after: { id: created.id, email: created.email, role: created.role },
    });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
