// Document ingestion seam (Phase 1: "document ingestion (Part 34's quarantine + OCR seam where
// needed)"). Extraction is only allowed to run once a document's quarantine status is 'clean' — this
// module is the single gate that enforces that, mirroring Part 34's connector/quarantine contract
// without re-implementing Part 34's scanning engine itself.

import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { extractClauses } from "./extraction";
import { clauses as clausesTable } from "@/db/schema";

export class DocumentNotClearedError extends Error {
  constructor(status: string) {
    super(`Document cannot be processed: quarantine status is '${status}', not 'clean'.`);
    this.name = "DocumentNotClearedError";
  }
}

export function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface IngestDocumentInput {
  title: string;
  sourceType: "upload" | "connector" | "import_seam";
  connectorSource?: string;
  rawText: string;
  /** Simulates Part 34's quarantine scan outcome. In a fully wired system this would be async/webhook-driven. */
  quarantineOutcome?: "clean" | "quarantined";
  needsOcr?: boolean;
}

export async function ingestDocument(input: IngestDocumentInput) {
  const [row] = await db
    .insert(documents)
    .values({
      title: input.title,
      sourceType: input.sourceType,
      connectorSource: input.connectorSource,
      quarantineStatus: input.quarantineOutcome ?? "clean",
      ocrStatus: input.needsOcr ? "done" : "not_needed",
      rawText: input.rawText,
      checksum: checksumOf(input.rawText),
    })
    .returning();
  return row;
}

/** Runs the grounded extraction pipeline against a document, gated on quarantine clearance, and
 * writes the resulting candidates as DRAFT clauses (never auto-confirmed). */
export async function runExtractionForDocument(documentId: number, contractId?: number) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new Error("Document not found");
  if (doc.quarantineStatus !== "clean") {
    throw new DocumentNotClearedError(doc.quarantineStatus);
  }

  const candidates = extractClauses(doc.rawText);
  const inserted = [];
  for (const c of candidates) {
    const [row] = await db
      .insert(clausesTable)
      .values({
        documentId: doc.id,
        contractId: contractId ?? null,
        clauseType: c.clauseType,
        spanStart: c.spanStart,
        spanEnd: c.spanEnd,
        excerptText: c.excerptText,
        confidence: c.confidence,
        extractionMethod: c.extractionMethod,
        status: "draft",
      })
      .returning();
    inserted.push(row);
  }
  return inserted;
}
