import { getMeetingDetail } from "@/lib/meeting/pipeline";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMeetingDetail(id);
  if (!detail) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(detail);
}
