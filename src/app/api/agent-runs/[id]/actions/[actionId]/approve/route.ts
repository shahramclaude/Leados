import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/demo-auth";
import { ok, fail, withApiResult, ValidationError } from "@/lib/api-result";
import { decideAgentAction } from "@/services/agent-runs";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; actionId: string }> },
) {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);

    const { id: runId, actionId } = await context.params;
    const json = await request.json().catch(() => null);
    const parsed = decisionSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError("decision must be 'approve' or 'reject'");
    }

    const updated = await decideAgentAction(session, runId, actionId, parsed.data.decision);
    return ok(updated);
  });
}
