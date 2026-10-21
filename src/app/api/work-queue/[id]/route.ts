import "@/lib/kernel/bootstrap";
import { assignWorkItem, transitionWorkItem } from "@/lib/kernel/workQueue";
import type { Actor } from "@/lib/kernel/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    assigneeKind?: "human" | "agent";
    assigneeId?: string;
    actorId?: string;
    actorKind?: "human" | "agent";
  };
  const actor: Actor = { kind: body.actorKind ?? "human", id: body.actorId ?? "unknown" };

  try {
    if (body.status) {
      const updated = await transitionWorkItem(id, body.status as never, actor);
      return Response.json({ workItem: updated });
    }
    if (body.assigneeKind && body.assigneeId) {
      const updated = await assignWorkItem(id, body.assigneeKind, body.assigneeId, actor);
      return Response.json({ workItem: updated });
    }
    return Response.json({ error: "Provide status or assigneeKind+assigneeId" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 409 });
  }
}
