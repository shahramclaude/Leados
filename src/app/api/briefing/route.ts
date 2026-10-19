// GET  /api/briefing — latest stored briefing (or ?date=YYYY-MM-DD).
// POST /api/briefing — generate + store a fresh briefing now.
import { generateAndStoreBriefing, getBriefingForDate, getLatestBriefing } from "@/lib/kernel/briefing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const row = date ? await getBriefingForDate(date) : await getLatestBriefing();
  if (!row) return Response.json({ ok: true, briefing: null });
  return Response.json({ ok: true, briefing: row });
}

export async function POST() {
  const briefing = await generateAndStoreBriefing();
  return Response.json({ ok: true, briefing });
}
