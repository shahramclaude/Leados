import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/demo-auth";
import { ok, fail, withApiResult, ValidationError } from "@/lib/api-result";
import { createProposal, listProposals } from "@/services/llm-proposals";

export const dynamic = "force-dynamic";

const createProposalSchema = z.object({
  findingId: z.string().uuid(),
  draftText: z.string().min(3),
});

export async function GET() {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);
    return ok(await listProposals(session));
  });
}

export async function POST(request: NextRequest) {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);

    const json = await request.json().catch(() => null);
    const parsed = createProposalSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const proposal = await createProposal(session, parsed.data);
    return ok(proposal, 201);
  });
}
