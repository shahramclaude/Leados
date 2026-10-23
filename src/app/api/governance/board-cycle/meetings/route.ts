import { scheduleNextMeeting } from "@/lib/governance/boardCycle";
import { toErrorResponse } from "@/lib/governance/httpErrors";
import { db } from "@/db";
import { boardMeetings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(boardMeetings);
  return Response.json({ ok: true, meetings: rows });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meeting = await scheduleNextMeeting(body.tier);
    return Response.json({ ok: true, meeting });
  } catch (err) {
    return toErrorResponse(err);
  }
}
