import { NextRequest, NextResponse } from "next/server";
import { getDelphiWorkspace, startDelphiRound } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getDelphiWorkspace(id);
  return NextResponse.json(workspace);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const anonymityMode = body.anonymityMode === "open" ? "open" : "anonymous_delayed";
  const round = await startDelphiRound(id, anonymityMode);
  return NextResponse.json({ round }, { status: 201 });
}
