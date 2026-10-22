import { completeRetrospective } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await req.json();
    if (!body.outcome || !body.lesson || !body.recordedBy) {
      return Response.json({ ok: false, error: "outcome, lesson, and recordedBy are required" }, { status: 400 });
    }
    const result = await completeRetrospective(id, {
      outcome: body.outcome,
      lesson: body.lesson,
      draftPlaybookCandidate: body.draftPlaybookCandidate ?? false,
      recordedBy: body.recordedBy,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
