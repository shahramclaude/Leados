import { db } from "@/db";
import { fitnessWeightPolicies } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/fitness/policies/:id/activate
 *
 * Human action: archives the currently active policy (if any) and activates
 * the given draft policy. This is intentionally a separate, explicit step
 * from policy creation and simulation — no policy takes effect silently.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const policyId = Number(id);
    if (!Number.isFinite(policyId)) {
      return Response.json({ ok: false, error: "Invalid policy id." }, { status: 400 });
    }

    const [target] = await db.select().from(fitnessWeightPolicies).where(eq(fitnessWeightPolicies.id, policyId));
    if (!target) {
      return Response.json({ ok: false, error: "Policy not found." }, { status: 404 });
    }

    await db
      .update(fitnessWeightPolicies)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(fitnessWeightPolicies.status, "active"));

    const [activated] = await db
      .update(fitnessWeightPolicies)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(fitnessWeightPolicies.id, policyId))
      .returning();

    return Response.json({ ok: true, policy: activated });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "activation failed" }, { status: 500 });
  }
}
