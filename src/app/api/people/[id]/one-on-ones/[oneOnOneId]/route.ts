import { resolveViewer } from "@/lib/platform/auth";
import { oneOnOneRepository } from "@/lib/platform/db/oneOnOneRepository";
import { completeOneOnOne, getPrivateNotes } from "@/lib/app/people/oneOnOnes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; oneOnOneId: string }> }) {
  const { oneOnOneId } = await params;
  const id = Number(oneOnOneId);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid 1:1 id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const oneOnOne = await oneOnOneRepository.getById(id);
  if (!oneOnOne) return Response.json({ error: "not_found" }, { status: 404 });

  const notesResult = await getPrivateNotes(viewer, id);

  return Response.json({
    oneOnOne,
    privateManagerNotes: notesResult.ok ? notesResult.notes : null,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; oneOnOneId: string }> }) {
  const { oneOnOneId } = await params;
  const id = Number(oneOnOneId);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid 1:1 id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const patch = await request.json().catch(() => null);
  if (!patch) return Response.json({ error: "Request body must be JSON." }, { status: 400 });

  const result = await completeOneOnOne(viewer, id, patch);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 404;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ oneOnOne: result.oneOnOne });
}
