import { NextResponse } from "next/server";
import { createPlaybook, listPlaybooks, type CreatePlaybookInput } from "@/lib/playbooks";
import { computeEffectiveness } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as "draft" | "active" | "deprecated" | null;
  const rows = await listPlaybooks(status ?? undefined);
  const withEffectiveness = await Promise.all(rows.map(async (p) => ({ ...p, effectiveness: await computeEffectiveness(p.id) })));
  return NextResponse.json({ playbooks: withEffectiveness });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreatePlaybookInput;
  if (!body.key || !body.title || !body.steps?.length) {
    return NextResponse.json({ error: "key, title and at least one step are required" }, { status: 400 });
  }
  const row = await createPlaybook(body);
  return NextResponse.json(row, { status: 201 });
}
