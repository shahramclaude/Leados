import type { PersonState } from '../../lib/types';
import type { PersonIntelligenceReport } from '../../lib/peopleIntelligence';
import type { OrgNetworkGraph } from '../../lib/orgNetworkIntelligence';
import { levelFromScore } from './shared';

interface Props {
  people: PersonState[];
  reports: Record<string, PersonIntelligenceReport>;
  graph: OrgNetworkGraph;
  now: Date;
}

function moraleTrend(members: PersonState[], now: Date): { label: string; icon: string; color: string } {
  const recent: number[] = [];
  const prior: number[] = [];
  members.forEach((m) => {
    m.pulses.forEach((p) => {
      const days = Math.round((now.getTime() - new Date(p.date).getTime()) / 86400000);
      if (days <= 14) recent.push(p.mood);
      else if (days <= 28) prior.push(p.mood);
    });
  });
  if (recent.length === 0) return { label: 'No data', icon: '·', color: 'text-slate-500' };
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (prior.length === 0) return { label: avgRecent.toFixed(1), icon: '→', color: 'text-slate-400' };
  const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
  const delta = avgRecent - avgPrior;
  if (delta > 0.3) return { label: `Improving (${avgRecent.toFixed(1)})`, icon: '↑', color: 'text-emerald-400' };
  if (delta < -0.3) return { label: `Declining (${avgRecent.toFixed(1)})`, icon: '↓', color: 'text-rose-400' };
  return { label: `Stable (${avgRecent.toFixed(1)})`, icon: '→', color: 'text-slate-300' };
}

export function ChemistryTab({ people, reports, graph, now }: Props) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const managers = people.filter((p) => p.directReports.length > 0);

  return (
    <div className="space-y-4">
      {managers.length === 0 && <p className="text-sm text-slate-400">No teams with direct reports.</p>}
      {managers.map((manager) => {
        const members = manager.directReports.map((id) => byId.get(id)!).filter(Boolean);
        const memberReports = members.map((m) => reports[m.id]);

        const possiblePairs = (members.length * (members.length - 1)) / 2;
        const collabEdges = graph.edges.filter(
          (e) => e.type === 'collaboration' && manager.directReports.includes(e.from) && manager.directReports.includes(e.to),
        );
        const cohesion = possiblePairs > 0 ? Math.min(1, collabEdges.length / possiblePairs) : 0;

        const exitRiskCount = memberReports.filter((r) => r.flightRiskLevel === 'high' || r.flightRiskLevel === 'critical').length;
        const burnoutRiskCount = memberReports.filter((r) => {
          const lvl = levelFromScore(r.burnoutRiskScore);
          return lvl === 'high' || lvl === 'critical';
        }).length;
        const avgQuality = memberReports.length
          ? Math.round(memberReports.reduce((a, r) => a + r.oneOneQuality.score, 0) / memberReports.length)
          : 0;
        const morale = moraleTrend(members, now);

        return (
          <div key={manager.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-white">{manager.name}'s Team</h3>
                <p className="text-xs text-slate-500">{members.length} members · {manager.title}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Cohesion</p>
                <p className="text-xl font-bold text-white">{Math.round(cohesion * 100)}%</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="rounded-lg bg-slate-800/50 p-3">
                <p className="text-[11px] text-slate-500">Avg 1:1 Quality</p>
                <p className="text-lg font-semibold text-white">{avgQuality}</p>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3">
                <p className="text-[11px] text-slate-500">Morale Trend</p>
                <p className={`text-lg font-semibold ${morale.color}`}>
                  {morale.icon} {morale.label}
                </p>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3">
                <p className="text-[11px] text-slate-500">High+ Flight Risks</p>
                <p className="text-lg font-semibold text-white">{exitRiskCount}</p>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3">
                <p className="text-[11px] text-slate-500">High+ Burnout Risks</p>
                <p className="text-lg font-semibold text-white">{burnoutRiskCount}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {exitRiskCount >= 3 && (
                <div className="text-xs rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 px-3 py-2">
                  ⚠ Exit cluster warning: {exitRiskCount} people on this team show high/critical flight risk simultaneously.
                </div>
              )}
              {burnoutRiskCount >= 3 && (
                <div className="text-xs rounded-lg border border-orange-500/40 bg-orange-500/10 text-orange-300 px-3 py-2">
                  ⚠ Burnout cluster warning: {burnoutRiskCount} people on this team show high/critical burnout risk simultaneously.
                </div>
              )}
              {exitRiskCount < 3 && burnoutRiskCount < 3 && (
                <div className="text-xs rounded-lg border border-slate-700 bg-slate-800/40 text-slate-400 px-3 py-2">
                  No cluster-level warnings for this team right now.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
