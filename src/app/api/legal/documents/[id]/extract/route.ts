import { db } from "@/db";
import { contracts } from "@/db/schema";
import { runExtractionForDocument, DocumentNotClearedError } from "@/lib/legal/ingestion";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isFinite(documentId)) {
    return Response.json({ error: "Invalid document id" }, { status: 400 });
  }

  const [contract] = await db.select().from(contracts).where(eq(contracts.documentId, documentId));

  try {
    const inserted = await runExtractionForDocument(documentId, contract?.id);
    return Response.json({ clauses: inserted });
  } catch (err) {
    if (err instanceof DocumentNotClearedError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
