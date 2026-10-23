import { upsertCadence } from "@/lib/governance/boardCycle";
import { toErrorResponse } from "@/lib/governance/httpErrors";
import { db } from "@/db";
import { boardCalendar } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(boardCalendar);
  return Response.json({ ok: true, calendar: rows });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const row = await upsertCadence({
      tier: body.tier,
      cadenceDays: body.cadenceDays,
      materialsLeadDays: body.materialsLeadDays,
      firstMeetingDate: new Date(body.firstMeetingDate),
    });
    return Response.json({ ok: true, cadence: row });
  } catch (err) {
    return toErrorResponse(err);
  }
}
