// GET /api/time-economics/privacy/audit-log
//
// Transparency surface for the privacy enforcement matrix itself: shows
// every attempt (allowed or denied) to read someone's individual time
// data. Restricted to admins (auditing the auditors), and this endpoint
// itself never returns the underlying time data — only who tried to
// access what, when, and whether it was allowed.
import { getActorFromRequest, listPrivacyAuditLog } from "@/lib/time-economics/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });
  if (actor.role !== "admin") {
    return Response.json({ error: "Only admin role may view the privacy audit log." }, { status: 403 });
  }
  const log = await listPrivacyAuditLog(100);
  return Response.json({ log });
}
