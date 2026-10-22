import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, INCIDENT_KEY, DEFAULT_INCIDENT } from "@/lib/settings";
import type { IncidentState } from "@/lib/settings";
import { requireAdmin } from "@/lib/adminAuth";
import { withRoute } from "@/lib/withRoute";
import { appendAuditEvent } from "@/lib/auditChain";

export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const state = await getSetting<IncidentState>(INCIDENT_KEY, DEFAULT_INCIDENT);
  return NextResponse.json(state);
});

export const POST = withRoute(async (req: NextRequest) => {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({}));
  const state: IncidentState = {
    active: Boolean(body.active),
    severity: ["minor", "major", "critical"].includes(body.severity) ? body.severity : "minor",
    message: typeof body.message === "string" ? body.message : "",
    runbookUrl: typeof body.runbookUrl === "string" ? body.runbookUrl : null,
    since: body.active ? new Date().toISOString() : null,
  };
  await setSetting(INCIDENT_KEY, state);
  await appendAuditEvent("ops", state.active ? "incident.opened" : "incident.closed", state);
  return NextResponse.json(state);
});
