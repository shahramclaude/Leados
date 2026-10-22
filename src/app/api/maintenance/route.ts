import { NextRequest, NextResponse } from "next/server";
import { getMaintenanceState, setMaintenanceState } from "@/lib/maintenance";
import { requireAdmin } from "@/lib/adminAuth";
import { withRoute } from "@/lib/withRoute";
import { appendAuditEvent } from "@/lib/auditChain";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const state = await getMaintenanceState();
  return NextResponse.json(state);
});

export const POST = withRoute(async (req: NextRequest) => {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  const state = await setMaintenanceState(enabled, reason);
  await appendAuditEvent("ops", enabled ? "maintenance.enabled" : "maintenance.disabled", { reason });
  return NextResponse.json(state);
});
