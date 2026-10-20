import { NextResponse } from "next/server";
import { listCandidates, refreshPlaybookCandidates } from "@/lib/playbooksIntelligence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as "suggested" | "accepted" | "rejected" | null;
  const rows = await listCandidates(status ?? undefined);
  return NextResponse.json({ candidates: rows });
}

/** Re-mine retrospectives for new playbook candidates. Always suggest-only — never auto-publishes. */
export async function POST() {
  const created = await refreshPlaybookCandidates();
  return NextResponse.json({ created });
}
