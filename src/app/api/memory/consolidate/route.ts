import { runNightlyConsolidation, listConsolidationRuns } from "@/lib/selfImprove";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listConsolidationRuns();
  return Response.json({ ok: true, runs });
}

export async function POST() {
  try {
    const result = await runNightlyConsolidation();
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
