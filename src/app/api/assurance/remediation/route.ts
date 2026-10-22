import { db } from "@/db";
import { remediationActions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { revertRemediation } from "@/lib/assurance/remediation";

export const dynamic = "force-dynamic";

export async function GET() {
  const actions = await db.select().from(remediationActions).orderBy(desc(remediationActions.createdAt)).limit(200);
  return Response.json({ actions });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.actionId) {
    return Response.json({ error: "actionId is required" }, { status: 400 });
  }
  try {
    const updated = await revertRemediation(Number(body.actionId), body.actor ?? "ops-user");
    return Response.json({ action: updated });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
