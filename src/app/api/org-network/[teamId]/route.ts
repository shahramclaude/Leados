import { resolveViewer } from "@/lib/platform/auth";
import { getTeamNetworkHealth } from "@/lib/app/people/orgNetwork";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const id = Number(teamId);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid team id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await getTeamNetworkHealth(viewer, id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });

  return Response.json(result);
}
