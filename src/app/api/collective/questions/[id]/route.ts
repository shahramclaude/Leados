import { NextRequest, NextResponse } from "next/server";
import { getCollectiveView, resolveQuestion } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getCollectiveView(id);
  if (!view) return NextResponse.json({ error: "question not found" }, { status: 404 });
  return NextResponse.json(view);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.action === "resolve") {
    const outcome = body.outcome === 1 || body.outcome === true ? 1 : 0;
    const wisdom = await resolveQuestion(id, outcome);
    return NextResponse.json({ resolved: true, wisdom });
  }
  return NextResponse.json({ error: "unsupported action" }, { status: 400 });
}
