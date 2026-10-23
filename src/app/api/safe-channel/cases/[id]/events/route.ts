import { transitionCase } from "@/lib/safeChannel/workflow";
import { listCaseEvents } from "@/lib/safeChannel/store";
import { SafeChannelAccessDenied } from "@/lib/safeChannel/store";
import { actorFromHeaders } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const events = await listCaseEvents(Number(id));
  return Response.json({ events });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = actorFromHeaders(req.headers);
  const body = await req.json();
  if (!body.toStatus) return Response.json({ error: '"toStatus" is required' }, { status: 400 });

  try {
    const event = await transitionCase({ caseId: Number(id), toStatus: body.toStatus, notes: body.notes, actor });
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    if (err instanceof SafeChannelAccessDenied) {
      return Response.json({ error: err.message }, { status: 403 });
    }
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
