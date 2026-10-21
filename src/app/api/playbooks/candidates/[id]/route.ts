import { NextResponse } from "next/server";
import { acceptCandidate, rejectCandidate } from "@/lib/playbooksIntelligence";

export const dynamic = "force-dynamic";

// PATCH { action: "accept"|"reject", key? } — key required when accepting (becomes the new playbook's unique key).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { action?: "accept" | "reject"; key?: string };
  try {
    if (body.action === "accept") {
      if (!body.key) return NextResponse.json({ error: "key is required to accept a candidate" }, { status: 400 });
      const row = await acceptCandidate(Number(id), body.key);
      return NextResponse.json(row, { status: 201 });
    }
    if (body.action === "reject") {
      const row = await rejectCandidate(Number(id));
      return NextResponse.json(row);
    }
    return NextResponse.json({ error: `unknown action "${String(body.action)}"` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
