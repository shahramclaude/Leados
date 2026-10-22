import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { createJournalEntry, listJournalEntries } from "@/lib/decision/journal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureDecisionInvariants();
  const orgId = req.nextUrl.searchParams.get("orgId");
  const userId = req.nextUrl.searchParams.get("userId") ?? undefined;
  if (!orgId) return Response.json({ error: "orgId is required" }, { status: 400 });
  const rows = await listJournalEntries(orgId, userId);
  return Response.json({ entries: rows });
}

export async function POST(req: NextRequest) {
  await ensureDecisionInvariants();
  const body = await req.json();
  if (!body.orgId || !body.whatIDecided || !body.whatIExpected) {
    return Response.json({ error: "orgId, whatIDecided, whatIExpected are required" }, { status: 400 });
  }
  const row = await createJournalEntry({
    orgId: body.orgId,
    decisionId: body.decisionId ?? null,
    userId: body.userId ?? null,
    whatIDecided: body.whatIDecided,
    whatIExpected: body.whatIExpected,
    whatHappened: body.whatHappened ?? null,
    whatILearned: body.whatILearned ?? null,
  });
  return Response.json({ entry: row }, { status: 201 });
}
