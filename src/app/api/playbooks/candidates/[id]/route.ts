import { NextResponse } from "next/server";
import { acceptCandidate, rejectCandidate } from "@/lib/playbooksIntelligence";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidateId = Number(id);
  const body = (await request.json()) as { action: "accept"; key: string } | { action: "reject" };
  try {
    if (body.action === "accept") {
      if (!body.key) return NextResponse.json({ error: "key is required to accept a candidate" }, { status: 400 });
      const playbook = await acceptCandidate(candidateId, body.key);
      return NextResponse.json(playbook, { status: 201 });
    }
    if (body.action === "reject") {
      const row = await rejectCandidate(candidateId);
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
