import { completeRun } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await context.params;
  try {
    const body = await req.json();
    if (!body.outcome) return Response.json({ ok: false, error: "outcome is required" }, { status: 400 });
    const run = await completeRun(runId, body.outcome, body.notes);
    return Response.json({ ok: true, run });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
