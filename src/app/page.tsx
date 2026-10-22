import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions, leadScores, leads, tenants } from "@/db/schema";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function bandColor(band: string) {
  if (band === "hot") return "bg-red-100 text-red-700";
  if (band === "warm") return "bg-amber-100 text-amber-700";
  return "bg-slate-200 text-slate-600";
}

export default async function HomePage() {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEFAULT_TENANT_SLUG))
    .limit(1);

  if (!tenant) {
    return (
      <main className="grid min-h-screen place-items-center px-6 py-12">
        <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS</p>
          <h1 className="mt-4 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.05] text-slate-950">
            No demo tenant found yet
          </h1>
          <p className="mt-4 text-base text-slate-700">
            Run <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run seed</code> to create the
            demo tenant, sample reps, scoring rules, and leads described in{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">docs/tutorials/first-hour.md</code>.
          </p>
        </section>
      </main>
    );
  }

  const tenantLeads = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenant.id))
    .orderBy(desc(leads.createdAt));

  const scores = await db
    .select()
    .from(leadScores)
    .where(eq(leadScores.tenantId, tenant.id))
    .orderBy(desc(leadScores.computedAt));

  const latestScoreByLead = new Map<number, (typeof scores)[number]>();
  for (const score of scores) {
    if (!latestScoreByLead.has(score.leadId)) latestScoreByLead.set(score.leadId, score);
  }

  const recentDecisions = await db
    .select()
    .from(decisions)
    .where(eq(decisions.tenantId, tenant.id))
    .orderBy(desc(decisions.createdAt))
    .limit(10);

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · {tenant.name}</p>
          <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
            Leads &amp; decisions
          </h1>
          <p className="mt-4 text-base text-slate-700">
            Deterministic, rules-based scoring and round-robin rotation, with every automated action
            recorded in the evidence ledger below. See{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">docs/explanations/intelligence-methodology.md</code>{" "}
            for what this is (and is not).
          </p>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
          <h2 className="text-xl font-semibold text-slate-950">Leads</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Company</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  <th className="py-2 pr-4 font-medium">Band</th>
                </tr>
              </thead>
              <tbody>
                {tenantLeads.map((lead) => {
                  const latest = latestScoreByLead.get(lead.id);
                  return (
                    <tr key={lead.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-slate-900">{lead.name}</td>
                      <td className="py-2 pr-4 text-slate-700">{lead.company}</td>
                      <td className="py-2 pr-4 text-slate-700">{latest ? latest.score : "—"}</td>
                      <td className="py-2 pr-4">
                        {latest ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${bandColor(latest.band)}`}>
                            {latest.band}
                          </span>
                        ) : (
                          <span className="text-slate-400">not scored</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {tenantLeads.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-slate-500">
                      No leads yet — run the seed script.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-8 shadow-[0_24px_60px_rgba(16,24,40,0.08)]">
          <h2 className="text-xl font-semibold text-slate-950">Evidence ledger (latest decisions)</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {recentDecisions.map((decision) => (
              <li key={decision.id} className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <span className="font-mono text-xs uppercase tracking-wide text-slate-500">
                  {decision.type}
                </span>
                <p className="mt-1 text-slate-900">{decision.summary}</p>
              </li>
            ))}
            {recentDecisions.length === 0 && (
              <li className="text-sm text-slate-500">
                No decisions recorded yet — score or rotate a lead via the API to populate this ledger.
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
