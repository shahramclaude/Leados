import { resolveViewer } from "@/lib/platform/auth";
import { getPersonProfile, updatePersonProfile } from "@/lib/app/people/profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await getPersonProfile(viewer, personId);
  if (!result) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json(result);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return Response.json({ error: "Invalid person id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const patch = await request.json().catch(() => null);
  if (!patch) return Response.json({ error: "Request body must be JSON." }, { status: 400 });

  const result = await updatePersonProfile(viewer, personId, patch);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 404;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ person: result.person });
}
