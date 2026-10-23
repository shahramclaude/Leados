import { db } from "@/db";
import { contracts, parties } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getCounterparties() {
  return db
    .select({
      id: parties.id,
      name: parties.name,
      jurisdiction: parties.jurisdiction,
      ecosystemNodeId: parties.ecosystemNodeId,
      contractCount: sql<number>`count(${contracts.id})`.mapWith(Number),
    })
    .from(parties)
    .leftJoin(contracts, eq(contracts.counterpartyPartyId, parties.id))
    .where(eq(parties.partyType, "counterparty"))
    .groupBy(parties.id);
}

export default async function CounterpartiesPage() {
  const counterparties = await getCounterparties();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Counterparty Dossiers</h2>
        <p className="mt-1 text-sm text-slate-600">
          Negotiation-prep dossiers concentrate sensitive leverage information. Access is restricted to
          the deal team / legal ops roles — see <code>src/lib/legal/access.ts</code>.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {counterparties.map((c) => (
          <Link
            key={c.id}
            href={`/legal/counterparties/${c.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400"
          >
            <p className="font-semibold text-slate-900">{c.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {c.jurisdiction ?? "jurisdiction unknown"} · {c.contractCount} contract(s)
            </p>
            <p className="mt-1 text-xs text-slate-400">ecosystem node: {c.ecosystemNodeId ?? "unlinked"}</p>
          </Link>
        ))}
        {counterparties.length === 0 && (
          <p className="text-sm text-slate-500">No counterparties yet. Run `npm run seed:legal`.</p>
        )}
      </section>
    </div>
  );
}
