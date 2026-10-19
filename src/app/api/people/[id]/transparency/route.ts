import { resolveViewer } from "@/lib/platform/auth";
import { getTransparencyReport } from "@/lib/app/people/transparency";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await getTransparencyReport(viewer, personId);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 404;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json(result);
}
