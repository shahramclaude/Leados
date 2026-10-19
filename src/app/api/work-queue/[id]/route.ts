// PATCH /api/work-queue/[id] — transition a work item's status machine.
// Body: { status: WorkItemStatus, actor, assignee?, reason? }
import { transitionWorkItem, type WorkItemStatus } from "@/lib/kernel/workQueue";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, actor, assignee, reason } = body ?? {};
    if (!status || !actor) {
      return Response.json({ ok: false, error: "status and actor are required" }, { status: 400 });
    }
    const updated = await transitionWorkItem(Number(id), status as WorkItemStatus, actor, { assignee, reason });
    return Response.json({ ok: true, item: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
