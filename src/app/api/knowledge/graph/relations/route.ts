import { NextResponse } from "next/server";
import {
  confirmRelation,
  createRelation,
  listPendingProposals,
  proposeRelation,
  rejectRelation,
  type RelationType,
} from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

// GET /api/knowledge/graph/relations -> list pending (proposed, unconfirmed) edges
export async function GET() {
  const rows = await listPendingProposals();
  return NextResponse.json({ proposals: rows });
}

// POST { fromKey, toKey, type, mode: "observed"|"proposed", confidence?, provenance? }
export async function POST(request: Request) {
  const body = (await request.json()) as {
    fromKey?: string;
    toKey?: string;
    type?: RelationType;
    mode?: "observed" | "proposed";
    confidence?: number;
    provenance?: Record<string, unknown>;
    weight?: number;
  };
  if (!body.fromKey || !body.toKey || !body.type) {
    return NextResponse.json({ error: "fromKey, toKey and type are required" }, { status: 400 });
  }
  try {
    if ((body.mode ?? "observed") === "proposed") {
      if (body.confidence === undefined || !body.provenance) {
        return NextResponse.json({ error: "proposed relations require confidence and provenance" }, { status: 400 });
      }
      const row = await proposeRelation({ fromKey: body.fromKey, toKey: body.toKey, type: body.type, confidence: body.confidence, provenance: body.provenance });
      return NextResponse.json(row, { status: 201 });
    }
    const row = await createRelation({ fromKey: body.fromKey, toKey: body.toKey, type: body.type, weight: body.weight, provenance: body.provenance });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

// PATCH { id, action: "confirm"|"reject", confirmedBy? }
export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; action?: "confirm" | "reject"; confirmedBy?: string };
  if (!body.id || !body.action) return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  if (body.action === "confirm") {
    if (!body.confirmedBy) return NextResponse.json({ error: "confirmedBy is required to confirm a proposed relation" }, { status: 400 });
    const row = await confirmRelation(body.id, body.confirmedBy);
    return NextResponse.json(row);
  }
  await rejectRelation(body.id);
  return NextResponse.json({ ok: true });
}
