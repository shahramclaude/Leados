import { buildMaccData } from "@/lib/esgSurfaces";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await buildMaccData();
    return Response.json({ ok: true, data });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
