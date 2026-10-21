import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { getBriefingInOrg, updateBriefingInOrg } from "@/db/repositories/engineContent";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("briefings.read");
    const { id } = await params;
    const briefing = await getBriefingInOrg(user.orgId, id);
    if (!briefing) {
      return NextResponse.json({ error: "not_found", messageKey: "errors.notFound" }, { status: 404 });
    }
    return NextResponse.json({ briefing });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission("briefings.write");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { params: newParams, expectedVersion } = body as { params?: Record<string, unknown>; expectedVersion?: number };
    if (!newParams || typeof expectedVersion !== "number") {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const result = await updateBriefingInOrg(user.orgId, id, { params: newParams }, expectedVersion);
    if (result.conflict) {
      return NextResponse.json({ conflict: true, server: result.server }, { status: 409 });
    }
    return NextResponse.json({ briefing: result.server });
  } catch (err) {
    return handleApiError(err);
  }
}
