import { NextRequest, NextResponse } from "next/server";
import { closeDelphiRoundAndSummarize } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  try {
    const result = await closeDelphiRoundAndSummarize(roundId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
