import { confirmCandidate, rejectCandidate, undoMerge, DedupActionError } from "@/lib/platform/mdm/dedupActions";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; actor?: string };
  const actor = body.actor ?? "user:dedup-review";

  try {
    if (body.action === "confirm") {
      const result = await confirmCandidate(id, actor);
      return Response.json({ ok: true, action: "confirm", result });
    }
    if (body.action === "reject") {
      const result = await rejectCandidate(id, actor);
      return Response.json({ ok: true, action: "reject", result });
    }
    if (body.action === "undo") {
      const result = await undoMerge(id, actor);
      return Response.json({ ok: true, action: "undo", result });
    }
    return Response.json({ error: "action must be one of: confirm, reject, undo" }, { status: 400 });
  } catch (err) {
    const status = err instanceof DedupActionError ? 409 : 500;
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}
