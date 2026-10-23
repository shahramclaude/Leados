import { listAgentRuns } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const runs = await listAgentRuns();
  const run = runs.find((r) => r.id === runId);
  if (!run) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ run });
}
