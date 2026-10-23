// Human-confirmation workflow endpoint (Phase 3a). This is the ONLY way a clause moves from `draft`
// to `confirmed`. No automated process in this codebase is permitted to call this on a clause's behalf.
import { confirmClause } from "@/lib/legal/obligationGate";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clauseId = Number(id);
  if (!Number.isFinite(clauseId)) {
    return Response.json({ error: "Invalid clause id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const confirmedBy = typeof body.confirmedBy === "string" && body.confirmedBy.trim() ? body.confirmedBy : "unspecified-reviewer";

  const row = await confirmClause(clauseId, confirmedBy);
  if (!row) return Response.json({ error: "Clause not found" }, { status: 404 });
  return Response.json({ clause: row });
}
