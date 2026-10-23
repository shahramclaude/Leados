import { db } from "@/db";
import { decisions, forecasts, leads } from "@/db/schema";
import { getOrCreateDemoTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmtMoney(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function HomePage() {
  const tenant = await getOrCreateDemoTenant();

  const [allLeads, recentDecisions, allForecasts] = await Promise.all([
    db.select().from(leads).where(eq(leads.tenantId, tenant.id)),
    db
      .select()
      .from(decisions)
      .where(eq(decisions.tenantId, tenant.id))
      .orderBy(desc(decisions.sequence))
      .limit(6),
    db.select().from(forecasts).where(eq(forecasts.tenantId, tenant.id)),
  ]);

  const totalLeads = allLeads.length;
  const avgScore = totalLeads
    ? Math.round(allLeads.reduce((sum, l) => sum + l.score, 0) / totalLeads)
    : 0;

  const latestForecastByLead = new Map<string, (typeof allForecasts)[number]>();
  for (const f of allForecasts) {
    const existing = latestForecastByLead.get(f.leadId);
    if (!existing || f.createdAt > existing.createdAt) {
      latestForecastByLead.set(f.leadId, f);
    }
  }
  const weightedPipeline = Array.from(latestForecastByLead.values()).reduce(
    (sum, f) => sum + Number(f.weightedValue),
    0,
  );

  const topLeads = allLeads
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-500">Executive overview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Decision operations at a glance
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Tenant <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">{tenant.slug}</code> ·
          deterministic scoring, a hash-chained evidence ledger, and pipeline forecasting — every number
          below traces back to an explainable rule, not a black box.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total leads" value={String(totalLeads)} />
        <KpiCard label="Average score" value={`${avgScore}/100`} />
        <KpiCard label="Weighted pipeline" value={fmtMoney(weightedPipeline)} accent />
        <KpiCard label="Ledger entries" value={String(recentDecisions.length ? "view ledger" : 0)} href="/decisions" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Top leads by score</h2>
            <Link href="/leads" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              View all →
            </Link>
          </div>
          {topLeads.length === 0 ? (
            <EmptyState text="No leads yet. Add one from the Leads tab." />
          ) : (
            <ul className="space-y-3">
              {topLeads.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-950">{lead.name}</p>
                    <p className="text-sm text-slate-600">
                      {lead.company} · <span className="capitalize">{lead.stage}</span>
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
                    {lead.score}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Recent ledger activity</h2>
            <Link href="/decisions" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              Open ledger →
            </Link>
          </div>
          {recentDecisions.length === 0 ? (
            <EmptyState text="No decisions recorded yet." />
          ) : (
            <ul className="space-y-3">
              {recentDecisions.map((d) => (
                <li key={d.id} className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-medium text-slate-950">
                    #{d.sequence} · {d.action}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{d.rationale}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">Pipeline forecast (Part 59)</h2>
          <Link href="/forecast" className="text-sm font-medium text-slate-600 hover:text-slate-950">
            Open forecast →
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          {latestForecastByLead.size} lead{latestForecastByLead.size === 1 ? "" : "s"} forecast · weighted
          pipeline value {fmtMoney(weightedPipeline)}.
        </p>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string;
  accent?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        accent ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-950"
      }`}
    >
      <p className={`text-xs uppercase tracking-wide ${accent ? "text-slate-300" : "text-slate-500"}`}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{text}</p>;
}
