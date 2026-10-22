import { db } from "@/db";
import { policies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { attestPolicyVersion } from "@/lib/policies";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let attestant = "employee@example.com";
  try {
    const body = await req.json();
    if (typeof body?.attestant === "string") attestant = body.attestant;
  } catch {
    // default attestant
  }

  const [policy] = await db.select().from(policies).where(eq(policies.id, Number(id)));
  if (!policy || !policy.currentVersionId) {
    return Response.json({ error: "policy or current version not found" }, { status: 404 });
  }

  const attestation = await attestPolicyVersion(policy.currentVersionId, attestant);
  return Response.json({ attestation });
}
