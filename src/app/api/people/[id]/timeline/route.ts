import { resolveViewer } from "@/lib/platform/auth";
import { getPersonTimeline } from "@/lib/app/people/profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const url = new URL(request.url);
  const asOf = url.searchParams.get("asOf") ?? undefined;

  const viewer = resolveViewer(request);
  const result = await getPersonTimeline(viewer, personId, asOf);
  if (!result) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json(result);
}
