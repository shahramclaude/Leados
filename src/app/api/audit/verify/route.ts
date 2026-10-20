import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth } from "@/lib/apiUtils";
import { PERMISSIONS } from "@/lib/permissions";
import { verifyAuditChain } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Recomputes the hash chain for the caller's org and reports tamper evidence. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.AUDIT_READ });
  if (!isAuthContext(auth)) return auth;

  const result = await verifyAuditChain(auth.session.orgId);
  return NextResponse.json(result);
}
