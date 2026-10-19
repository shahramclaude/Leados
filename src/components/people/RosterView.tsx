import { useMemo, useState } from 'react';
import type { PersonState } from '../../lib/types';
import type { PersonIntelligenceReport } from '../../lib/peopleIntelligence';
import { MiniRing } from './BeliefGauge';
import { RiskBadge, RiskBar, TrendArrow, daysAgoLabel, levelFromScore } from './shared';

interface Props {
  people: PersonState[];
  reports: Record<string, PersonIntelligenceReport>;
  now: Date;
  onSelect: (id: string) => void;
}

type SortKey = 'name' | 'title' | 'reportsTo' | 'flight' | 'burnout' | 'quality' | 'lastOneOne' | 'trend';

export function RosterView({ people, reports, now, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('flight');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const sorted = useMemo(() => {
    const copy = [...people];
    copy.sort((a, b) => {
      const ra = reports[a.id];
      const rb = reports[b.id];
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'name':
          va = a.name;
          vb = b.name;
          break;
        case 'title':
          va = a.title;
          vb = b.title;
          break;
        case 'reportsTo':
          va = a.reportsTo ? byId.get(a.reportsTo)?.name ?? '' : '';
          vb = b.reportsTo ? byId.get(b.reportsTo)?.name ?? '' : '';
          break;
        case 'flight':
          va = ra.flightRiskScore;
          vb = rb.flightRiskScore;
          break;
        case 'burnout':
          va = ra.burnoutRiskScore;
          vb = rb.burnoutRiskScore;
          break;
        case 'quality':
          va = ra.oneOneQuality.score;
          vb = rb.oneOneQuality.score;
          break;
        case 'lastOneOne':
          va = a.lastOneOneAt ?? '';
          vb = b.lastOneOneAt ?? '';
          break;
        case 'trend': {
          const order = { declining: 0, unknown: 1, stable: 2, accelerating: 3 };
          va = order[ra.performanceTrend];
          vb = order[rb.performanceTrend];
          break;
        }
      }
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
    return copy;
  }, [people, reports, sortKey, sortDir, byId]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      onClick={() => toggleSort(k)}
      className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 cursor-pointer hover:text-white select-none"
    >
      {label} {sortKey === k && (sortDir === 1 ? '▲' : '▼')}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800">
        <thead className="bg-slate-900">
          <tr>
            <Th label="Name" k="name" />
            <Th label="Title" k="title" />
            <Th label="Reports To" k="reportsTo" />
            <Th label="Flight Risk" k="flight" />
            <Th label="Burnout" k="burnout" />
            <Th label="1:1 Quality" k="quality" />
            <Th label="Last 1:1" k="lastOneOne" />
            <Th label="Perf Trend" k="trend" />
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {sorted.map((p) => {
            const r = reports[p.id];
            const manager = p.reportsTo ? byId.get(p.reportsTo)?.name : '—';
            const daysSince = p.lastOneOneAt ? Math.round((now.getTime() - new Date(p.lastOneOneAt).getTime()) / 86400000) : null;
            return (
              <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-3 py-2.5 text-sm font-medium text-white whitespace-nowrap">{p.name}</td>
                <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{p.title}</td>
                <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{manager}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <RiskBar score={r.flightRiskScore} />
                    <RiskBadge level={r.flightRiskLevel} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <RiskBar score={r.burnoutRiskScore} />
                    <RiskBadge level={levelFromScore(r.burnoutRiskScore)} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <MiniRing value={r.oneOneQuality.score} />
                </td>
                <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${daysSince !== null && daysSince > 21 ? 'text-rose-400 font-semibold' : 'text-slate-400'}`}>
                  {daysAgoLabel(p.lastOneOneAt, now)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <TrendArrow trend={r.performanceTrend} />
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onSelect(p.id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors"
                  >
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
