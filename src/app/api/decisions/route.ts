import { createDecision, listDecisions, ValidationError } from "@/lib/decisions";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listDecisions();
  return Response.json({ items });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const { title, context } = (body ?? {}) as Record<string, unknown>;
  try {
    const decision = await createDecision({ title: String(title ?? ""), context: typeof context === "string" ? context : undefined });
    return Response.json(decision, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
