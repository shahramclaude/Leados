import { listOrgs } from "@/lib/decision/orgs";
import { computeDQTrendForOrg } from "@/lib/decision/decisionQualityStore";
import { DecisionsNav, Card } from "../components";

export const dynamic = "force-dynamic";

export default async function QualityTrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const orgs = await listOrgs();
  const sp = await searchParams;
  const orgId = sp.org ?? orgs[0]?.id ?? "";
  const trend = orgId ? await computeDQTrendForOrg(orgId) : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <DecisionsNav orgId={orgId} orgs={orgs} active="quality" />
      <h1 className="text-3xl font-semibold text-slate-950">Decision Quality Trends</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        DQ dimensions aggregated by week, at the team/process level only. This view is never broken down by
        individual — DQ scores are a diagnostic aid for improving how decisions are made, never a verdict on
        who made them.
      </p>

      <Card className="mt-8">
        {trend.length === 0 ? (
          <p className="text-sm text-slate-500">No scored decisions yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Week of</th>
                <th className="py-2">Avg DQ (0-12)</th>
                <th className="py-2"># Scored decisions</th>
                <th className="py-2">Trend bar</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.weekStart} className="border-b border-slate-100">
                  <td className="py-2">{t.weekStart}</td>
                  <td className="py-2 font-medium">{t.avgDq}</td>
                  <td className="py-2">{t.count}</td>
                  <td className="py-2">
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${(t.avgDq / 12) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
