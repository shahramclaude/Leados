import { NextRequest } from "next/server";
import { createRelation, listPendingProposals } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("status") === "proposed") {
    const rows = await listPendingProposals();
    return Response.json({ ok: true, proposals: rows });
  }
  return Response.json({ ok: false, error: "Specify ?status=proposed, or use /api/knowledge/entities/[id] for an entity's relations" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const required = ["fromEntityId", "toEntityId", "relationType", "provenanceSource"];
    for (const field of required) {
      if (!body[field]) {
        return Response.json({ ok: false, error: `${field} is required` }, { status: 400 });
      }
    }
    const relation = await createRelation({
      fromEntityId: body.fromEntityId,
      toEntityId: body.toEntityId,
      relationType: body.relationType,
      provenanceSource: body.provenanceSource,
      confidenceClass: body.confidenceClass,
      extractedBy: body.extractedBy,
      confidence: body.confidence,
      notes: body.notes,
      supersedesRelationId: body.supersedesRelationId,
    });
    return Response.json({ ok: true, relation }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
