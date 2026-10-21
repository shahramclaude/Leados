import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { createPlaybook, listPlaybooks } from "@/db/repositories/engineContent";

export async function GET() {
  try {
    const user = await requirePermission("playbooks.read");
    const playbooks = await listPlaybooks(user.orgId);
    return NextResponse.json({ playbooks });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("playbooks.write");
    const body = await request.json().catch(() => ({}));
    const { templateKey, params } = body as { templateKey?: string; params?: Record<string, unknown> };
    if (!templateKey || !params) {
      return NextResponse.json({ error: "validation", messageKey: "errors.validation" }, { status: 400 });
    }
    const playbook = await createPlaybook(user.orgId, { templateKey, params });
    return NextResponse.json({ playbook }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
