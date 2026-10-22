import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { evaluateTriggersForOrg, listReviewTasks } from "@/lib/decision/triggers";

export const dynamic = "force-dynamic";

// POST /api/decisions/triggers/evaluate -> evaluate all watched triggers for
// an org against latest signal readings; auto-opens a review task (Part 10
// stub seam) for any committed decision whose trigger just breached.
export async function POST(req: NextRequest) {
  await ensureDecisionInvariants();
  const body = await req.json();
  if (!body.orgId) return Response.json({ error: "orgId is required" }, { status: 400 });

  const results = await evaluateTriggersForOrg(body.orgId);
  const reviewTasks = await listReviewTasks(body.orgId);
  return Response.json({ results, reviewTasks });
}

export async function GET(req: NextRequest) {
  await ensureDecisionInvariants();
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return Response.json({ error: "orgId is required" }, { status: 400 });
  const reviewTasks = await listReviewTasks(orgId);
  return Response.json({ reviewTasks });
}
