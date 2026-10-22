import { NextRequest, NextResponse } from "next/server";
import { replayDeferredWrites } from "@/lib/maintenance";
import { requireAdmin } from "@/lib/adminAuth";
import { withRoute } from "@/lib/withRoute";
import { appendAuditEvent } from "@/lib/auditChain";

export const dynamic = "force-dynamic";

// Replays every queued write recorded while maintenance mode was on. Intended
// to be called once maintenance has been turned off (see docs/RUNBOOKS.md).
export const POST = withRoute(async (req: NextRequest) => {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const baseUrl = new URL(req.url).origin;
  const result = await replayDeferredWrites(baseUrl);
  await appendAuditEvent("ops", "maintenance.flush", result);
  return NextResponse.json(result);
});
