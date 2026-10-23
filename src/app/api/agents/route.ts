import { listAgentRuns, runAgentPlaybook } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = await listAgentRuns();
  return Response.json({ runs });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const run = await runAgentPlaybook(body.name, body.input ?? {});
  return Response.json({ run }, { status: 201 });
}
