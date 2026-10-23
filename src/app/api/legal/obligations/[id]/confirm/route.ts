import { confirmObligation, ConfirmationRequiredError } from "@/lib/legal/obligationGate";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const obligationId = Number(id);
  if (!Number.isFinite(obligationId)) {
    return Response.json({ error: "Invalid obligation id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const confirmedBy = typeof body.confirmedBy === "string" && body.confirmedBy.trim() ? body.confirmedBy : "unspecified-reviewer";

  try {
    const row = await confirmObligation(obligationId, confirmedBy);
    return Response.json({ obligation: row });
  } catch (err) {
    if (err instanceof ConfirmationRequiredError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
