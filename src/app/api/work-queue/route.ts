// GET  /api/work-queue — list work items (?status=proposed to filter).
// POST /api/work-queue — propose a new work item (humans can propose too).
import { listWorkItems, proposeWorkItem, type WorkItemStatus } from "@/lib/kernel/workQueue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as WorkItemStatus | null;
  const items = await listWorkItems(status ?? undefined);
  return Response.json({ ok: true, items });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, description, domain, proposedBy, riskClass, slaHours, evidence } = body ?? {};
    if (!title || !description || !domain) {
      return Response.json({ ok: false, error: "title, description, domain are required" }, { status: 400 });
    }
    const item = await proposeWorkItem({
      title,
      description,
      domain,
      proposedBy: proposedBy ?? "human:unknown",
      riskClass,
      slaHours,
      evidence,
    });
    return Response.json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
