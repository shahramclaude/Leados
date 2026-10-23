import { db } from "@/db";
import { clauses, contracts, documents, parties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isFinite(documentId)) {
    return Response.json({ error: "Invalid document id" }, { status: 400 });
  }

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });

  const [contract] = await db.select().from(contracts).where(eq(contracts.documentId, documentId));
  let counterpartyName: string | null = null;
  if (contract) {
    const [party] = await db.select().from(parties).where(eq(parties.id, contract.counterpartyPartyId));
    counterpartyName = party?.name ?? null;
  }

  const docClauses = await db
    .select()
    .from(clauses)
    .where(eq(clauses.documentId, documentId))
    .orderBy(clauses.spanStart);

  return Response.json({ document: doc, contract: contract ?? null, counterpartyName, clauses: docClauses });
}
