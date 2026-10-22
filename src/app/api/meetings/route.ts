import { createMeeting, listMeetings } from "@/lib/meeting/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const meetings = await listMeetings();
  return Response.json({ meetings });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body.title) return Response.json({ error: "title is required" }, { status: 400 });

  const meeting = await createMeeting({
    title: body.title,
    scheduledAt: body.scheduledAt,
    participants: body.participants ?? [],
    agenda: body.agenda ?? [],
  });
  return Response.json({ meeting }, { status: 201 });
}
