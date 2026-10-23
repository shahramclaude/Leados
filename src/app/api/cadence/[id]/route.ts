import { updateCadenceMeeting } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meetingId = Number(id);
  if (!Number.isInteger(meetingId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const patch: Parameters<typeof updateCadenceMeeting>[1] = {};
  if (body.status) patch.status = body.status;
  if (body.effectivenessScore !== undefined) patch.effectivenessScore = body.effectivenessScore;
  if (body.nextOccurrence) patch.nextOccurrence = new Date(body.nextOccurrence);

  const meeting = await updateCadenceMeeting(meetingId, patch);
  if (!meeting) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ meeting });
}
