import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { getSubjectInOrg, updateSubjectInOrg } from "@/db/repositories/subjects";
import { recordAuditEvent } from "@/db/repositories/orgs";
import { canActOnSubjectTeam } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("subjects.read");
    const { id } = await params;
    // Scoped lookup: a subject belonging to another org returns undefined
    // here, which we turn into 404 — never a 500, never a leaked row.
    const subject = await getSubjectInOrg(user.orgId, id);
    if (!subject) {
      return NextResponse.json({ error: "not_found", messageKey: "errors.notFound" }, { status: 404 });
    }
    return NextResponse.json({ subject });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("subjects.write");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { name, roleTitle, riskScore, teamId, expectedVersion } = body as {
      name?: string;
      roleTitle?: string;
      riskScore?: number;
      teamId?: string | null;
      expectedVersion?: number;
    };
    if (typeof expectedVersion !== "number") {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const existing = await getSubjectInOrg(user.orgId, id);
    if (!existing) {
      return NextResponse.json({ error: "not_found", messageKey: "errors.notFound" }, { status: 404 });
    }
    if (!canActOnSubjectTeam(user.role, { managerOfTeamId: user.managerOfTeamId }, existing.teamId)) {
      return NextResponse.json({ error: "forbidden", messageKey: "permission.denied.team.manage" }, { status: 403 });
    }
    const result = await updateSubjectInOrg(
      user.orgId,
      id,
      { name, roleTitle, riskScore, teamId },
      expectedVersion,
    );
    if (result.conflict) {
      return NextResponse.json({ conflict: true, server: result.server }, { status: 409 });
    }
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      action: "subject.update",
      entityType: "subject",
      entityId: id,
      before: existing,
      after: result.server,
    });
    return NextResponse.json({ subject: result.server });
  } catch (err) {
    return handleApiError(err);
  }
}
