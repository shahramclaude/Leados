import { db } from "@/db";
import * as s from "@/db/schema";
import { Card, Badge } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AdoptionPage() {
  const missions = await db.select().from(s.onboardingMissions);
  const funnel = await db.select().from(s.adoptionFunnel);

  const roles = Array.from(new Set(funnel.map((f) => f.role)));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 99</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Adoption &amp; Organizational Learning Flywheel</h1>
        <p className="mt-1 text-sm text-slate-600">
          Role-based onboarding missions where every step must demonstrate value in the user&rsquo;s own data, and
          per-role adoption funnels with honest conversion numbers.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          const stages = funnel.filter((f) => f.role === role);
          return (
            <Card key={role} title={`Funnel — ${role}`}>
              <ul className="space-y-1 text-sm">
                {stages.map((st) => (
                  <li key={st.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5">
                    <span>{st.stage}</span>
                    <span>
                      {st.n} <span className="text-slate-400">({Number(st.conversionPct).toFixed(1)}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Card title={`Onboarding missions (${missions.length})`}>
        <ul className="space-y-3 text-sm">
          {missions.map((m) => (
            <li key={m.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{m.role}: {m.objective}</p>
                <Badge tone={Number(m.completionRatePct) >= 70 ? "green" : "amber"}>{Number(m.completionRatePct).toFixed(0)}% complete</Badge>
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">
                {m.steps.map((st, i) => (
                  <li key={i}>{st.action} (~{st.timeMin} min)</li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
