import { resolveViewer } from "@/lib/platform/auth";
import { getTeamHealth } from "@/lib/app/people/teamHealth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const id = Number(teamId);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid team id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await getTeamHealth(viewer, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });

  return Response.json(result);
}
