import "@/lib/kernel/bootstrap";
import { createWorkItem, getInbox, listWorkItems } from "@/lib/kernel/workQueue";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("view") === "inbox") {
    return Response.json({ inbox: await getInbox() });
  }
  return Response.json({ workItems: await listWorkItems() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    kind?: string;
    assigneeKind?: "human" | "agent";
    assigneeId?: string;
    slaMs?: number;
  };
  if (!body.title || !body.kind) return Response.json({ error: "title and kind are required" }, { status: 400 });
  const item = await createWorkItem(body as { title: string; kind: string; assigneeKind?: "human" | "agent"; assigneeId?: string; slaMs?: number });
  return Response.json({ workItem: item }, { status: 201 });
}
