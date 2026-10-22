import { buildPreMeetingBrief } from "@/lib/meeting/pipeline";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const brief = await buildPreMeetingBrief(id);
    return Response.json(brief);
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
