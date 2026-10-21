import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/demo-auth";
import { ok, fail, withApiResult, ValidationError } from "@/lib/api-result";
import { createAgentRun, listAgentRuns } from "@/services/agent-runs";

export const dynamic = "force-dynamic";

const createRunSchema = z.object({
  agentName: z.string().min(2),
  goal: z.string().min(3),
  actions: z
    .array(
      z.object({
        actionType: z.string().min(2),
        riskLevel: z.enum(["low", "medium", "high"]),
        payload: z.record(z.string(), z.unknown()).default({}),
        computeUnits: z.number().int().min(1).max(50).default(1),
      }),
    )
    .min(1),
});

export async function GET() {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);
    return ok(await listAgentRuns(session));
  });
}

export async function POST(request: NextRequest) {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);

    const json = await request.json().catch(() => null);
    const parsed = createRunSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const result = await createAgentRun(session, parsed.data);
    return ok(result, 201);
  });
}
