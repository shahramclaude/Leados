import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { listAuditEvents } from "@/db/repositories/orgs";

export async function GET() {
  try {
    const user = await requirePermission("audit.read");
    const events = await listAuditEvents(user.orgId);
    return NextResponse.json({ events });
  } catch (err) {
    return handleApiError(err);
  }
}
