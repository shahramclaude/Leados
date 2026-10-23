import { getSimulationRun } from "@/lib/org-design/dbHelpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return Response.json({ ok: false, error: "Invalid simulation id" }, { status: 400 });
  }
  const result = await getSimulationRun(numericId);
  if (!result) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, ...result });
}
