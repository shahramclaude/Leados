import { resolveViewer } from "@/lib/platform/auth";
import { getSuccessionBoard } from "@/lib/app/people/succession";
import { successionRepository } from "@/lib/platform/db/successionRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const id = Number(roleId);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid role id." }, { status: 400 });

  const viewer = resolveViewer(request);
  const result = await getSuccessionBoard(viewer, id);
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : 404;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json(result);
}

export async function POST(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const id = Number(roleId);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid role id." }, { status: 400 });

  const viewer = resolveViewer(request);
  if (viewer.role !== "hr" && viewer.role !== "manager") {
    return Response.json({ error: "Only HR or a manager may propose a succession candidate." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.personId || !body?.readiness) {
    return Response.json({ error: "personId and readiness are required." }, { status: 400 });
  }

  const candidate = await successionRepository.upsertCandidate({
    roleId: id,
    personId: body.personId,
    readiness: body.readiness,
    confidence: body.confidence ?? 0.5,
    evidence: body.evidence ?? [],
    gapPlan: body.gapPlan ?? null,
  });

  return Response.json({ candidate }, { status: 201 });
}
