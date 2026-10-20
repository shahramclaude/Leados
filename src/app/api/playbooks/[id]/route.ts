import { NextResponse } from "next/server";
import { getPlaybook, updatePlaybook, type UpdatePlaybookInput } from "@/lib/playbooks";
import { computeEffectiveness, listRuns } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playbookId = Number(id);
  const playbook = await getPlaybook(playbookId);
  if (!playbook) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [runs, effectiveness] = await Promise.all([listRuns(playbookId), computeEffectiveness(playbookId)]);
  return NextResponse.json({ playbook, runs, effectiveness });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playbookId = Number(id);
  const body = (await request.json()) as UpdatePlaybookInput;
  if (!body.changeNote) return NextResponse.json({ error: "changeNote is required for any edit" }, { status: 400 });
  try {
    const row = await updatePlaybook(playbookId, body);
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
