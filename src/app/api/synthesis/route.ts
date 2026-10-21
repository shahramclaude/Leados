import { generateWeeklySynthesis } from "@/lib/synthesis";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const periodDays = Number(searchParams.get("days") ?? "7");
  try {
    const synthesis = await generateWeeklySynthesis(Number.isFinite(periodDays) ? periodDays : 7);
    return Response.json({ ok: true, synthesis });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
