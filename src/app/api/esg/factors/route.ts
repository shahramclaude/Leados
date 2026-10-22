import { loadFactors } from "@/lib/esgData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const factors = await loadFactors();
    return Response.json({ ok: true, data: factors });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
