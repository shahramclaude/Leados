import { useMemo, useState } from 'react';
import { loadEvents } from '../../lib/eventStore';
import { project } from '../../lib/eventBrain';
import { computePersonIntelligence } from '../../lib/peopleIntelligence';
import { buildOrgNetwork } from '../../lib/orgNetworkIntelligence';
import { RosterView } from './RosterView';
import { NineBoxTab } from './NineBoxTab';
import { Network } from './Network';
import { ChemistryTab } from './ChemistryTab';
import { PersonDetailPanel } from './PersonDetailPanel';
import { levelFromScore } from './shared';

type Tab = 'roster' | 'ninebox' | 'network' | 'chemistry';

const TABS: { key: Tab; label: string }[] = [
  { key: 'roster', label: 'Roster' },
  { key: 'ninebox', label: '9-Box' },
  { key: 'network', label: 'Network' },
  { key: 'chemistry', label: 'Chemistry' },
];

export function PeopleDashboard() {
  const now = useMemo(() => new Date(), []);
  const events = useMemo(() => loadEvents(), []);
  const projection = useMemo(() => project(events, now), [events, now]);
  const graph = useMemo(() => buildOrgNetwork(projection.people), [projection]);

  const reports = useMemo(() => {
    const map: Record<string, ReturnType<typeof computePersonIntelligence>> = {};
    const network = {
      pageRankScores: graph.pageRankScores,
      maxPageRank: graph.maxPageRank,
      bridges: graph.bridges,
      clusterOf: graph.clusterOf,
      neighborClusters: graph.neighborClusters,
    };
    projection.people.forEach((p) => {
      map[p.id] = computePersonIntelligence(p, projection.people, events, now, network);
    });
    return map;
  }, [projection, graph, events, now]);

  const [tab, setTab] = useState<Tab>('roster');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(projection.people.map((p) => [p.id, p])), [projection]);
  const selectedPerson = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedReport = selectedId ? reports[selectedId] : null;

  const kpis = useMemo(() => {
    const teamSize = projection.people.length;
    const flightRisks = Object.values(reports).filter((r) => r.flightRiskLevel === 'high' || r.flightRiskLevel === 'critical').length;
    const burnoutRisks = Object.values(reports).filter((r) => {
      const lvl = levelFromScore(r.burnoutRiskScore);
      return lvl === 'high' || lvl === 'critical';
    }).length;
    const avgQuality = teamSize
      ? Math.round(Object.values(reports).reduce((a, r) => a + r.oneOneQuality.score, 0) / teamSize)
      : 0;
    return { teamSize, flightRisks, burnoutRisks, avgQuality };
  }, [projection, reports]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
              L
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">People Intelligence Engine</h1>
              <p className="text-xs text-slate-500">Flight risk, burnout, 1:1 quality, succession &amp; org network — computed live from the event log.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Team Size" value={kpis.teamSize.toString()} accent="from-indigo-500 to-violet-600" />
          <KpiCard label="Flight Risks (High+Critical)" value={kpis.flightRisks.toString()} accent="from-rose-500 to-orange-500" />
          <KpiCard label="Burnout Risks (High+Critical)" value={kpis.burnoutRisks.toString()} accent="from-amber-500 to-orange-600" />
          <KpiCard label="Avg 1:1 Quality Score" value={kpis.avgQuality.toString()} accent="from-emerald-500 to-teal-600" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'roster' && (
          <RosterView people={projection.people} reports={reports} now={now} onSelect={setSelectedId} />
        )}
        {tab === 'ninebox' && <NineBoxTab people={projection.people} reports={reports} onSelect={setSelectedId} />}
        {tab === 'network' && <Network graph={graph} onSelect={setSelectedId} />}
        {tab === 'chemistry' && <ChemistryTab people={projection.people} reports={reports} graph={graph} now={now} />}
      </main>

      {selectedPerson && selectedReport && (
        <PersonDetailPanel
          person={selectedPerson}
          report={selectedReport}
          teamName={selectedPerson.reportsTo ? byId.get(selectedPerson.reportsTo)?.name ?? '—' : 'Executive'}
          now={now}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
