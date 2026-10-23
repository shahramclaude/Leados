import { db } from "@/db";
import { safeChannelReports } from "@/db/schema";
import { desc } from "drizzle-orm";
import { actorFromHeaders, SAFE_CHANNEL_CASE_ROLES } from "@/lib/roles";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Lists case metadata ONLY (no identity, no body) for case-handling roles.
// This endpoint deliberately never returns reporterIdentity* columns.
export async function GET(req: Request) {
  const actor = actorFromHeaders(req.headers);
  const allowed = actor.role != null && SAFE_CHANNEL_CASE_ROLES.includes(actor.role);

  await recordAudit({
    actorId: actor.personId,
    actorRole: actor.role,
    action: allowed ? "safe_channel.list_access_granted" : "safe_channel.list_access_denied",
    resourceType: "safe_channel_case",
    metadata: {},
  });

  if (!allowed) {
    return Response.json({ error: "Not authorized to list safe-channel cases." }, { status: 403 });
  }

  const rows = await db
    .select({
      id: safeChannelReports.id,
      caseRef: safeChannelReports.caseRef,
      category: safeChannelReports.category,
      isAnonymous: safeChannelReports.isAnonymous,
      status: safeChannelReports.status,
      createdAt: safeChannelReports.createdAt,
    })
    .from(safeChannelReports)
    .orderBy(desc(safeChannelReports.createdAt));

  return Response.json({ cases: rows });
}
