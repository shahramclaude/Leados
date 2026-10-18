import { useMemo, useState } from 'react';
import type { AppState } from '../lib/types';
import { Panel, Label, Stat } from './Shell';

export function EventLogView({ state, onReset }: { state: AppState; onReset: () => void }) {
  const [filter, setFilter] = useState('');
  const events = state.events;

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => (counts[e.type] = (counts[e.type] || 0) + 1));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const filtered = useMemo(() => {
    const rows = filter ? events.filter((e) => e.type.includes(filter)) : events;
    return [...rows].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 60);
  }, [events, filter]);

  return (
    <div className="space-y-6">
      <Panel title="Event log" subtitle={`${events.length} total events across ${state.roster.length} people. This is the only substrate every view computes from.`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total events" value={events.length} />
          <Stat label="Distinct types" value={typeCounts.length} />
          <Stat label="Roster size" value={state.roster.length} />
          <Stat
            label="Span"
            value={
              events.length
                ? `${Math.round(
                    (new Date(events[events.length - 1].ts).getTime() - new Date(events[0].ts).getTime()) / 86400000
                  )}d`
                : '—'
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {typeCounts.map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? '' : type)}
              className={`rounded-full border px-3 py-1 text-xs font-mono ${
                filter === type ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {type} · {count}
            </button>
          ))}
        </div>
        <button
          onClick={onReset}
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
        >
          Reset synthetic data
        </button>
        <Label>Resetting regenerates the deterministic seed log for "today" and clears all logged hypotheses/agent audit entries.</Label>
      </Panel>

      <Panel title={filter ? `Events: ${filter}` : 'Most recent events'} subtitle="Showing up to 60 rows, newest first">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4">Timestamp</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap py-2 pr-4 text-xs text-slate-500">{new Date(e.ts).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-indigo-600">{e.type}</td>
                  <td className="py-2 font-mono text-xs text-slate-600">{JSON.stringify(e.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
