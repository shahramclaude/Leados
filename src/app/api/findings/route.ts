import { createFinding, listFindings, ValidationError } from "@/lib/app/findings";
import { checkAuth } from "@/lib/platform/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = await listFindings(searchParams);
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

  const { title, summary, impact, confidence, effort } = (body ?? {}) as Record<string, unknown>;
  try {
    const finding = await createFinding({
      title: String(title ?? ""),
      summary: typeof summary === "string" ? summary : undefined,
      impact: Number(impact),
      confidence: Number(confidence),
      effort: Number(effort),
    });
    return Response.json(finding, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
