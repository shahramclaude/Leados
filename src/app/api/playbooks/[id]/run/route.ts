import { invokePlaybook } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await req.json().catch(() => ({}));
    const run = await invokePlaybook({
      playbookId: id,
      triggeredBy: body.triggeredBy ?? "manual",
      linkedDecisionEntityId: body.linkedDecisionEntityId,
    });
    return Response.json({ ok: true, run }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}
