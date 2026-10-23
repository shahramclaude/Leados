import { db } from "@/db";
import { parties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DossierPanel } from "@/components/legal/DossierPanel";

export const dynamic = "force-dynamic";

export default async function CounterpartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const counterpartyId = Number(id);
  if (!Number.isFinite(counterpartyId)) notFound();

  const [party] = await db.select().from(parties).where(eq(parties.id, counterpartyId));
  if (!party) notFound();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">{party.name}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Jurisdiction: {party.jurisdiction ?? "unknown"} · ecosystem node: {party.ecosystemNodeId ?? "unlinked"}
        </p>
      </section>

      <DossierPanel counterpartyId={counterpartyId} />
    </div>
  );
}
