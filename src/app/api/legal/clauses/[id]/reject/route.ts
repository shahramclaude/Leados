import { rejectClause } from "@/lib/legal/obligationGate";
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

  const row = await rejectClause(clauseId, confirmedBy);
  if (!row) return Response.json({ error: "Clause not found" }, { status: 404 });
  return Response.json({ clause: row });
}
