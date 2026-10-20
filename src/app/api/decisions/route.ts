import { createDecision, listDecisions } from "@/lib/app/decisions";
import { ValidationError } from "@/lib/app/findings";
import { checkAuth } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = await listDecisions(searchParams);
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

  const { title, context, priorAlpha, priorBeta } = (body ?? {}) as Record<string, unknown>;
  try {
    const decision = await createDecision({
      title: String(title ?? ""),
      context: typeof context === "string" ? context : undefined,
      priorAlpha: priorAlpha !== undefined ? Number(priorAlpha) : undefined,
      priorBeta: priorBeta !== undefined ? Number(priorBeta) : undefined,
    });
    return Response.json(decision, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
