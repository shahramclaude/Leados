import { NextResponse } from "next/server";
import { getPlaybook, listPlaybookVersions, updatePlaybook, type UpdatePlaybookInput } from "@/lib/playbooks";
import { computeEffectiveness, listRuns } from "@/lib/playbooksEngine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playbookId = Number(id);
  const playbook = await getPlaybook(playbookId);
  if (!playbook) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [versions, runs, effectiveness] = await Promise.all([
    listPlaybookVersions(playbookId),
    listRuns(playbookId),
    computeEffectiveness(playbookId),
  ]);
  return NextResponse.json({ playbook, versions, runs, effectiveness });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdatePlaybookInput;
  if (!body.changeNote) return NextResponse.json({ error: "changeNote is required" }, { status: 400 });
  try {
    const row = await updatePlaybook(Number(id), body);
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
