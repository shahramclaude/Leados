import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/apiErrors";
import { listFindings } from "@/db/repositories/engineContent";

export async function GET() {
  try {
    const user = await requirePermission("findings.read");
    const findings = await listFindings(user.orgId);
    return NextResponse.json({ findings });
  } catch (err) {
    return handleApiError(err);
  }
}
