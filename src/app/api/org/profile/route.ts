import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { getOrgById, recordAuditEvent, updateOrgProfile } from "@/db/repositories/orgs";
import { UnauthenticatedError } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    const org = await getOrgById(user.orgId);
    return NextResponse.json({ org });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requirePermission("org.profile.manage");
    const body = await request.json().catch(() => ({}));
    const { name, logoUrl, accentColor, defaultLocale, teamTermKey, domains } = body as Record<string, unknown>;
    const before = await getOrgById(user.orgId);
    const org = await updateOrgProfile(user.orgId, {
      name: name as string | undefined,
      logoUrl: logoUrl as string | undefined,
      accentColor: accentColor as string | undefined,
      defaultLocale: defaultLocale as string | undefined,
      teamTermKey: teamTermKey as string | undefined,
      domains: domains as string[] | undefined,
    });
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      action: "org.profile.update",
      entityType: "org",
      entityId: user.orgId,
      before,
      after: org,
    });
    return NextResponse.json({ org });
  } catch (err) {
    return handleApiError(err);
  }
}
