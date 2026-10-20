import { listEvents, recordEvent } from "@/lib/app/events";
import { checkAuth } from "@/lib/platform/auth";
import { UnknownEventTypeError, EventPayloadValidationError } from "@/lib/domain/eventSchema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = await listEvents(searchParams);
  return Response.json(page);
}

export async function POST(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { type, version, payload } = (body ?? {}) as Record<string, unknown>;
  if (typeof type !== "string" || typeof version !== "number") {
    return Response.json({ error: "type (string) and version (number) are required" }, { status: 400 });
  }

  try {
    const record = await recordEvent({ type, version, payload });
    return Response.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof UnknownEventTypeError || error instanceof EventPayloadValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
