import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { createBriefing, listBriefings } from "@/db/repositories/engineContent";
import { recordAuditEvent } from "@/db/repositories/orgs";

export async function GET() {
  try {
    const user = await requirePermission("briefings.read");
    const briefings = await listBriefings(user.orgId);
    return NextResponse.json({ briefings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("briefings.write");
    const body = await request.json().catch(() => ({}));
    const { templateKey, params, severity, subjectId } = body as {
      templateKey?: string;
      params?: Record<string, unknown>;
      severity?: string;
      subjectId?: string;
    };
    if (!templateKey || !params) {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const briefing = await createBriefing(user.orgId, { templateKey, params, severity, subjectId });
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      action: "briefing.create",
      entityType: "briefing",
      entityId: briefing.id,
      after: briefing,
    });
    return NextResponse.json({ briefing }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
