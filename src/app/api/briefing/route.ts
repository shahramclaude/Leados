import { getExecutiveBriefing } from "@/lib/briefing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const briefing = await getExecutiveBriefing();
    return Response.json({ ok: true, briefing });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
