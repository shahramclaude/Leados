import { listSignals, createSignal } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const signals = await listSignals();
  return Response.json({ signals });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const signal = await createSignal({
    title: body.title,
    description: body.description ?? "",
    severity: body.severity ?? "medium",
    source: body.source ?? "api",
  });
  return Response.json({ signal }, { status: 201 });
}
