import { db } from "@/db";
import { clauses, contracts, documents, obligations } from "@/db/schema";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [docCount] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(documents);
  const [contractCount] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(contracts);
  const [clauseStats] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      draft: sql<number>`count(*) filter (where ${clauses.status} = 'draft')`.mapWith(Number),
      confirmed: sql<number>`count(*) filter (where ${clauses.status} = 'confirmed')`.mapWith(Number),
    })
    .from(clauses);
  const [obligationStats] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${obligations.status} = 'active')`.mapWith(Number),
      draft: sql<number>`count(*) filter (where ${obligations.status} = 'draft')`.mapWith(Number),
    })
    .from(obligations);

  return { docCount: docCount?.n ?? 0, contractCount: contractCount?.n ?? 0, clauseStats, obligationStats };
}

export default async function LegalOverviewPage() {
  const { docCount, contractCount, clauseStats, obligationStats } = await getCounts();

  const cards = [
    { label: "Documents in vault", value: docCount },
    { label: "Contracts tracked", value: contractCount },
    {
      label: "Clauses (draft / confirmed)",
      value: `${clauseStats?.draft ?? 0} / ${clauseStats?.confirmed ?? 0}`,
    },
    {
      label: "Obligations (draft / active)",
      value: `${obligationStats?.draft ?? 0} / ${obligationStats?.active ?? 0}`,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">What this part delivers</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>
            <strong>Contract Vault</strong> — documents with extracted-clause overlays; every highlight
            cites an exact character span in the source text.{" "}
            <Link className="text-blue-700 underline" href="/legal/vault">
              Open vault →
            </Link>
          </li>
          <li>
            <strong>Obligation Board</strong> — owner-facing, deadline-driven obligations that drill back
            to the confirming clause. Nothing reaches &quot;active&quot; without human confirmation.{" "}
            <Link className="text-blue-700 underline" href="/legal/obligations">
              Open board →
            </Link>
          </li>
          <li>
            <strong>Counterparty Dossiers</strong> — negotiation-prep packets with evidence-cited
            leverage points, access-restricted to the deal team.{" "}
            <Link className="text-blue-700 underline" href="/legal/counterparties">
              Open dossiers →
            </Link>
          </li>
          <li>
            <strong>Renewal Calendar</strong> — upcoming renewal/termination windows with impact
            analysis run before each window opens.{" "}
            <Link className="text-blue-700 underline" href="/legal/calendar">
              Open calendar →
            </Link>
          </li>
          <li>
            <strong>Compliance Mapping</strong> — clause type → regulatory obligation table, with
            documented, revisable provenance.{" "}
            <Link className="text-blue-700 underline" href="/legal/compliance">
              Open mapping →
            </Link>
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Honesty rules enforced in code, not just copy</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>This is decision support, not legal advice — stated on every surface (disclaimer banner above).</li>
          <li>
            Extracted clauses are <em>draft</em> until a human confirms them (see <code>obligationGate.ts</code>);
            obligations cannot be generated from unconfirmed clauses, and cannot be committed to &quot;active&quot;
            without a second, separate human confirmation.
          </li>
          <li>
            Every extraction carries a span citation back to the literal source text; span-citation
            integrity is enforced structurally (slices are always taken from the source) and tested.
          </li>
        </ul>
      </section>
    </div>
  );
}
