import { db } from "@/db";
import { clauses, contracts, documents, parties } from "@/db/schema";
import { ingestDocument, runExtractionForDocument } from "@/lib/legal/ingestion";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      sourceType: documents.sourceType,
      connectorSource: documents.connectorSource,
      quarantineStatus: documents.quarantineStatus,
      ocrStatus: documents.ocrStatus,
      uploadedAt: documents.uploadedAt,
      contractId: contracts.id,
      contractTitle: contracts.title,
      counterpartyName: parties.name,
      clauseCount: sql<number>`count(${clauses.id})`.mapWith(Number),
      confirmedClauseCount: sql<number>`count(${clauses.id}) filter (where ${clauses.status} = 'confirmed')`.mapWith(
        Number,
      ),
    })
    .from(documents)
    .leftJoin(contracts, eq(contracts.documentId, documents.id))
    .leftJoin(parties, eq(parties.id, contracts.counterpartyPartyId))
    .leftJoin(clauses, eq(clauses.documentId, documents.id))
    .groupBy(documents.id, contracts.id, parties.name)
    .orderBy(documents.uploadedAt);

  return Response.json({ documents: rows });
}

// Ingests a new document through the quarantine seam (Part 34) and immediately runs the grounded
// extraction pipeline, producing DRAFT clauses only — nothing here is auto-confirmed.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, rawText, quarantineOutcome } = body as {
    title?: string;
    rawText?: string;
    quarantineOutcome?: "clean" | "quarantined";
  };

  if (!title || !rawText) {
    return Response.json({ error: "title and rawText are required" }, { status: 400 });
  }

  const doc = await ingestDocument({
    title,
    sourceType: "upload",
    rawText,
    quarantineOutcome: quarantineOutcome ?? "clean",
  });

  if (doc.quarantineStatus !== "clean") {
    return Response.json({
      document: doc,
      clauses: [],
      note: "Document is quarantined (Part 34 seam); extraction withheld until cleared.",
    });
  }

  const draftClauses = await runExtractionForDocument(doc.id);
  return Response.json({ document: doc, clauses: draftClauses });
}
