import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { createSubject, listSubjects } from "@/db/repositories/subjects";
import { recordAuditEvent } from "@/db/repositories/orgs";
import { canActOnSubjectTeam } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requirePermission("subjects.read");
    const subjects = await listSubjects(user.orgId);
    return NextResponse.json({ subjects });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("subjects.write");
    const body = await request.json().catch(() => ({}));
    const { name, roleTitle, teamId } = body as { name?: string; roleTitle?: string; teamId?: string | null };
    if (!name || !roleTitle) {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    if (!canActOnSubjectTeam(user.role, { managerOfTeamId: user.managerOfTeamId }, teamId ?? null)) {
      return NextResponse.json(
        { error: "forbidden", messageKey: "permission.denied.team.manage" },
        { status: 403 },
      );
    }
    const subject = await createSubject(user.orgId, { name, roleTitle, teamId: teamId ?? null });
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      action: "subject.create",
      entityType: "subject",
      entityId: subject.id,
      after: subject,
    });
    return NextResponse.json({ subject }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
