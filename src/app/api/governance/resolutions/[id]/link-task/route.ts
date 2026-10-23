import { linkImplementationTask, createImplementationTask } from "@/lib/governance/resolutions";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "resolution_register", "write");
    const { id } = await params;
    const body = await request.json();

    let taskId = body.taskId as number | undefined;
    if (!taskId && body.newTask) {
      const task = await createImplementationTask({
        title: body.newTask.title,
        owner: body.newTask.owner,
        dueDate: body.newTask.dueDate ? new Date(body.newTask.dueDate) : undefined,
      });
      taskId = task.id;
    }
    if (!taskId) {
      return Response.json({ ok: false, error: "taskId or newTask required" }, { status: 400 });
    }

    const link = await linkImplementationTask({
      resolutionId: Number(id),
      taskId,
      linkedBy: actor.id,
    });
    return Response.json({ ok: true, link, taskId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
