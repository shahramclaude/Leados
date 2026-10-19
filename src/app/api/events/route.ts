import { recordEvent } from "@/lib/app/events/recordEvent";
import { getEventsOverview } from "@/lib/app/events/listEvents";
import { EventPayloadValidationError, UnknownEventTypeError } from "@/lib/domain/eventSchema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 20, 1), 200) : 20;

  const overview = await getEventsOverview(limit);
  return Response.json(overview);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { type, version, payload } = body as Record<string, unknown>;

  if (typeof type !== "string" || typeof version !== "number") {
    return Response.json(
      { error: "Request body must include a string 'type' and a numeric 'version'." },
      { status: 400 },
    );
  }

  try {
    const event = await recordEvent({ type, version, payload });
    return Response.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof UnknownEventTypeError || error instanceof EventPayloadValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
