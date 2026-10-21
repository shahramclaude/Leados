import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/demo-auth";
import { ok, fail, withApiResult, ValidationError } from "@/lib/api-result";
import { createFinding, listFindings } from "@/services/findings";

export const dynamic = "force-dynamic";

const createFindingSchema = z.object({
  domain: z.enum(["intelligence", "people", "finance"]),
  title: z.string().min(3),
  summary: z.string().min(3),
  causalConfidence: z.enum(["correlational", "causal", "experimental"]).default("correlational"),
  explanation: z.object({
    headline: z.string(),
    reasons: z.array(z.string()),
    evidence: z.array(z.object({ label: z.string(), ref: z.string() })),
    confidence: z.number().min(0).max(1),
    detail: z.record(z.string(), z.unknown()),
  }),
});

export async function GET() {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);
    return ok(await listFindings(session));
  });
}

export async function POST(request: NextRequest) {
  return withApiResult(async () => {
    const session = await getSessionContext();
    if (!session) return fail("UNAUTHORIZED", "No demo session cookie set", 401);

    const json = await request.json().catch(() => null);
    const parsed = createFindingSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join("; "));
    }

    const created = await createFinding(session, parsed.data);
    return ok(created, 201);
  });
}
