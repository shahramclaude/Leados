import { db } from "@/db";
import { clauses, contracts, documents, parties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ClauseOverlayViewer } from "@/components/legal/ClauseOverlayViewer";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function VaultDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isFinite(documentId)) notFound();

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) notFound();

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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{doc.title}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Counterparty: {counterpartyName ?? "—"} · uploaded {doc.uploadedAt.toISOString().slice(0, 10)} ·
              source {doc.sourceType}
            </p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={doc.quarantineStatus} />
            <StatusBadge status={doc.ocrStatus} />
          </div>
        </div>
      </section>

      <ClauseOverlayViewer rawText={doc.rawText} initialClauses={docClauses} />
    </div>
  );
}
