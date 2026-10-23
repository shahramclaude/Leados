import { db } from "@/db";
import { decisions, leads } from "@/db/schema";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { verifyChain } from "@/lib/ledger";
import { StatCard } from "@/components/StatCard";
import { ScoreBadge } from "@/components/ScoreBadge";
import Link from "next/link";
import { avg, count, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const tenant = await getOrCreateDefaultTenant();

  const [[leadAgg], topLeads, recentDecisions, chain] = tenant
    ? await Promise.all([
        db
          .select({ total: count(), avgScore: avg(leads.score) })
          .from(leads)
          .where(eq(leads.tenantId, tenant.id)),
        db
          .select()
          .from(leads)
          .where(eq(leads.tenantId, tenant.id))
          .orderBy(desc(leads.score))
          .limit(5),
        db
          .select()
          .from(decisions)
          .where(eq(decisions.tenantId, tenant.id))
          .orderBy(desc(decisions.createdAt))
          .limit(6),
        verifyChain(tenant.id),
      ])
    : [[{ total: 0, avgScore: null }], [], [], { valid: true, checkedCount: 0, brokenAt: null }];

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
          {tenant?.name ?? "LEADOS"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          Executive Overview
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          A founding build of the LEADOS decision operating system: an
          event-sourced ontology, a deterministic explainable scoring engine,
          and a hash-chained, tamper-evident evidence ledger for every
          decision made in the organization.
        </p>
      </header>

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads tracked" value={String(leadAgg?.total ?? 0)} />
        <StatCard
          label="Average lead score"
          value={leadAgg?.avgScore ? String(Math.round(Number(leadAgg.avgScore))) : "0"}
          hint="out of 100"
        />
        <StatCard
          label="Ledger entries"
          value={String(chain.checkedCount)}
          hint="append-only, hash-chained"
        />
        <StatCard
          label="Ledger integrity"
          value={chain.valid ? "Verified" : "BROKEN"}
          tone={chain.valid ? "good" : "bad"}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Top-scoring leads</h2>
            <Link href="/leads" className="text-xs font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {topLeads.length === 0 ? (
            <p className="text-sm text-slate-500">
              No leads yet. Create one from the Leads page to see the scoring
              engine in action.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {topLeads.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{lead.name}</p>
                    <p className="text-xs text-slate-500">{lead.company}</p>
                  </div>
                  <ScoreBadge
                    score={lead.score}
                    label={
                      lead.score >= 80
                        ? "critical"
                        : lead.score >= 60
                          ? "high"
                          : lead.score >= 35
                            ? "medium"
                            : "low"
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Recent evidence</h2>
            <Link href="/decisions" className="text-xs font-medium text-indigo-600 hover:underline">
              View ledger →
            </Link>
          </div>
          {recentDecisions.length === 0 ? (
            <p className="text-sm text-slate-500">
              No decisions recorded yet. Every lead score and stage change
              writes an entry here automatically.
            </p>
          ) : (
            <ul className="space-y-3">
              {recentDecisions.map((decision) => (
                <li key={decision.id} className="rounded-xl border border-slate-100 p-3">
                  <p className="text-sm font-medium text-slate-900">{decision.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{decision.rationale}</p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      {decision.confidenceLabel}
                    </span>
                    <span>{decision.createdAt.toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
