import { resolveViewer } from "@/lib/platform/auth";
import { getPersonCollaborationLoad } from "@/lib/app/people/orgNetwork";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await getPersonCollaborationLoad(viewer, personId);
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });

  return Response.json(result);
}
