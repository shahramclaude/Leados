import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { createTeam, listTeamsByOrg } from "@/db/repositories/orgs";

export async function GET() {
  try {
    const user = await requirePermission("subjects.read");
    const teams = await listTeamsByOrg(user.orgId);
    return NextResponse.json({ teams });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("team.manage");
    const body = await request.json().catch(() => ({}));
    const { name } = body as { name?: string };
    if (!name) {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const team = await createTeam(user.orgId, name);
    return NextResponse.json({ team }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
