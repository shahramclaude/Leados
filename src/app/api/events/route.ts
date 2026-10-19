import { eventsRepository } from "@/lib/platform/db/eventsRepository";
import { validatePayload } from "@/lib/domain/eventSchema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitParam) ? limitParam : 20));

  const [recent, total] = await Promise.all([eventsRepository.listRecent(limit), eventsRepository.count()]);
  return Response.json({ total, recent });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { type, version, payload, actorId, subjectId } = body as Record<string, unknown>;
  if (typeof type !== "string" || typeof version !== "number") {
    return Response.json({ error: "`type` (string) and `version` (number) are required." }, { status: 400 });
  }

  const result = validatePayload(type, version, payload);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const record = await eventsRepository.record({
    type,
    version,
    payload: result.data,
    actorId: typeof actorId === "number" ? actorId : null,
    subjectId: typeof subjectId === "number" ? subjectId : null,
  });

  return Response.json(record, { status: 201 });
}
