import { resolveViewer } from "@/lib/platform/auth";
import { getSuccessionBoards } from "@/lib/app/people/succession";
import { successionRepository } from "@/lib/platform/db/successionRepository";
import { eventsRepository } from "@/lib/platform/db/eventsRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const viewer = resolveViewer(request);
  const result = await getSuccessionBoards(viewer);
  if (!result.ok) return Response.json({ error: result.error }, { status: 403 });
  return Response.json(result);
}

export async function POST(request: Request) {
  const viewer = resolveViewer(request);
  if (viewer.role !== "hr" && viewer.role !== "exec") {
    return Response.json({ error: "Only HR or exec may define a succession role." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.title) return Response.json({ error: "title is required." }, { status: 400 });

  const role = await successionRepository.createRole({
    title: body.title,
    teamId: body.teamId ?? null,
    criticality: body.criticality ?? "high",
    incumbentId: body.incumbentId ?? null,
  });

  await eventsRepository.record({
    type: "system.annotation",
    version: 1,
    actorId: viewer.id,
    payload: { title: "Succession role created", body: role.title, tags: ["succession"] },
  });

  return Response.json({ role }, { status: 201 });
}
