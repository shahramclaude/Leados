import { ensureSeedData, getSeriesDetail } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSeedData();
  const { id } = await context.params;
  const seriesId = Number(id);
  if (!Number.isFinite(seriesId)) {
    return Response.json({ error: "invalid series id" }, { status: 400 });
  }
  const detail = await getSeriesDetail(seriesId);
  if (!detail) {
    return Response.json({ error: "series not found" }, { status: 404 });
  }
  return Response.json(detail);
}
