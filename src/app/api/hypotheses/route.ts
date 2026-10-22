import { NextRequest } from "next/server";
import { createEntity, listEntities, createRelation } from "@/lib/knowledgeGraph";
import { db } from "@/db";
import { evidenceLinks } from "@/db/schema";

export const dynamic = "force-dynamic";

// Hypotheses are modeled as entities of type "hypothesis" so they share the
// same graph machinery (relations, authority, retrieval) as every other
// entity. This route is a thin, hypothesis-specific convenience layer over
// knowledgeGraph.ts.

export async function GET() {
  const hypotheses = await listEntities({ type: "hypothesis" });
  return Response.json({ ok: true, hypotheses });
}

export interface EvidenceInput {
  evidenceType: "memory" | "doc";
  evidenceId: string;
  strength?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return Response.json({ ok: false, error: "name is required" }, { status: 400 });

    const hypothesis = await createEntity({
      type: "hypothesis",
      name: body.name,
      summary: body.summary,
      attributes: body.attributes ?? {},
    });

    const evidence: EvidenceInput[] = body.evidence ?? [];
    const links = await Promise.all(
      evidence.map((e) =>
        db
          .insert(evidenceLinks)
          .values({
            entityId: hypothesis.id,
            evidenceType: e.evidenceType,
            evidenceId: e.evidenceId,
            strength: (e.strength ?? 0.5).toString(),
          })
          .returning(),
      ),
    );

    if (body.relatedEntityId && body.relationType) {
      await createRelation({
        fromEntityId: hypothesis.id,
        toEntityId: body.relatedEntityId,
        relationType: body.relationType,
        provenanceSource: body.provenanceSource ?? "api:hypotheses",
        extractedBy: body.extractedBy ?? "human",
      });
    }

    return Response.json({ ok: true, hypothesis, evidenceLinks: links.flat() }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
