import { buildCarbonLedgerData } from "@/lib/esgSurfaces";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? undefined;
    const data = await buildCarbonLedgerData(period);
    return Response.json({ ok: true, data });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
