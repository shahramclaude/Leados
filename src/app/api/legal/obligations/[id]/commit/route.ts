// Commits a confirmed obligation into the 'active' lifecycle state — the only path onto the live
// Obligation Board. Enforced by assertObligationCommittable (human-confirmation gate, Phase 4 gate #3).
import { commitObligation, ConfirmationRequiredError } from "@/lib/legal/obligationGate";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const obligationId = Number(id);
  if (!Number.isFinite(obligationId)) {
    return Response.json({ error: "Invalid obligation id" }, { status: 400 });
  }

  try {
    const row = await commitObligation(obligationId);
    return Response.json({ obligation: row });
  } catch (err) {
    if (err instanceof ConfirmationRequiredError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
