import { resolveViewer } from "@/lib/platform/auth";
import { resolveCommitment } from "@/lib/app/people/oneOnOnes";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; oneOnOneId: string; commitmentId: string }> },
) {
  const { oneOnOneId, commitmentId } = await params;
  const id = Number(oneOnOneId);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid 1:1 id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== "done" && status !== "missed") {
    return Response.json({ error: "status must be 'done' or 'missed'." }, { status: 400 });
  }

  const result = await resolveCommitment(viewer, id, commitmentId, status);
  if (!result.ok) {
    const httpStatus = result.error === "forbidden" ? 403 : 404;
    return Response.json({ error: result.error }, { status: httpStatus });
  }

  return Response.json({ oneOnOne: result.oneOnOne });
}
