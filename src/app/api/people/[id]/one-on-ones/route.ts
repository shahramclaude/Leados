import { resolveViewer } from "@/lib/platform/auth";
import { listOneOnOnes, scheduleOneOnOne } from "@/lib/app/people/oneOnOnes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await listOneOnOnes(viewer, personId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });

  return Response.json(result);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const body = await request.json().catch(() => null);
  if (!body?.scheduledAt) return Response.json({ error: "scheduledAt is required." }, { status: 400 });

  const managerId = body.managerId ?? viewer.id;
  const result = await scheduleOneOnOne(viewer, personId, managerId, body.scheduledAt);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 404;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ oneOnOne: result.oneOnOne }, { status: 201 });
}
