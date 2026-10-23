import { listCadenceMeetings, createCadenceMeeting } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const meetings = await listCadenceMeetings();
  return Response.json({ meetings });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const meeting = await createCadenceMeeting({
    title: body.title,
    type: body.type ?? "weekly",
    ownerId: body.ownerId ?? null,
    nextOccurrence: body.nextOccurrence ? new Date(body.nextOccurrence) : new Date(),
    notes: body.notes ?? "",
  });
  return Response.json({ meeting }, { status: 201 });
}
