// POST /api/autonomous/undo — { toolCallId, actor } — compensates an executed action.
import { undoToolCall } from "@/lib/kernel/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { toolCallId, actor } = body ?? {};
    if (!toolCallId || !actor) {
      return Response.json({ ok: false, error: "toolCallId and actor are required" }, { status: 400 });
    }
    await undoToolCall(Number(toolCallId), actor);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
