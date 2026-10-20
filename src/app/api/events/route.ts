import { listEvents, recordEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = performance.now();
  const page = await listEvents(searchParams);
  const queryMs = +(performance.now() - start).toFixed(2);
  return Response.json(page, { headers: { "Server-Timing": `db;dur=${queryMs}` } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const { type, version, payload } = (body ?? {}) as Record<string, unknown>;
  if (typeof type !== "string" || !type.trim()) {
    return Response.json({ error: "type (string) is required" }, { status: 400 });
  }
  const record = await recordEvent({ type, version: typeof version === "number" ? version : 1, payload });
  return Response.json(record, { status: 201 });
}
