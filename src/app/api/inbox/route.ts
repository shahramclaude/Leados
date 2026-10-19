// GET /api/inbox — unified inbox: open work items + unread notifications + pending approvals.
import { getUnifiedInbox } from "@/lib/kernel/workQueue";

export const dynamic = "force-dynamic";

export async function GET() {
  const inbox = await getUnifiedInbox();
  return Response.json({ ok: true, ...inbox });
}
