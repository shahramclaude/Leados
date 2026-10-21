import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requirePermission, UnauthenticatedError } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { listFeatureFlags, recordAuditEvent, upsertFeatureFlag } from "@/db/repositories/orgs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const flags = await listFeatureFlags(user.orgId);
    return NextResponse.json({ flags });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requirePermission("featureFlags.manage");
    const body = await request.json().catch(() => ({}));
    const { key, enabled } = body as { key?: string; enabled?: boolean };
    if (!key || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const { row, before } = await upsertFeatureFlag(user.orgId, key, enabled, user.id);
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      action: "featureFlag.update",
      entityType: "feature_flag",
      entityId: row.id,
      before,
      after: row,
    });
    return NextResponse.json({ flag: row });
  } catch (err) {
    return handleApiError(err);
  }
}
