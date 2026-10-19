import type { PersonState } from '../../lib/types';
import type { NineBoxAxis, PersonIntelligenceReport } from '../../lib/peopleIntelligence';
import { initials } from './shared';

interface Props {
  people: PersonState[];
  reports: Record<string, PersonIntelligenceReport>;
  onSelect: (id: string) => void;
}

const AXES: NineBoxAxis[] = ['low', 'mid', 'high'];
const SIZE = 300;
const CELL = SIZE / 3;

function cellFill(perfIdx: number, potIdx: number) {
  const score = perfIdx + potIdx; // 0..4
  if (score >= 4) return '#10b981'; // green — high/high
  if (score <= 0) return '#ef4444'; // red — low/low
  if (score >= 3) return '#34d399';
  if (score <= 1) return '#f87171';
  return '#f59e0b';
}

const CELL_LABELS: Record<string, string> = {
  '0-0': 'Critical Attention',
  '1-0': 'Reliable Specialist',
  '2-0': 'On Track',
  '0-1': 'Needs Improvement',
  '1-1': 'Solid Performer',
  '2-1': 'Core Contributor',
  '0-2': 'Underperforming Talent',
  '1-2': 'Emerging Talent',
  '2-2': 'Star',
};

export function NineBoxTab({ people, reports, onSelect }: Props) {
  const byCell = new Map<string, { person: PersonState; report: PersonIntelligenceReport }[]>();
  people.forEach((p) => {
    const r = reports[p.id];
    const key = `${r.performanceAxis}-${r.potentialAxis}`;
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push({ person: p, report: r });
  });

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="absolute inset-0 rounded-lg overflow-hidden">
          {AXES.map((pot, potIdx) =>
            AXES.map((perf, perfIdx) => {
              const row = 2 - potIdx; // high potential at top
              const col = perfIdx; // low performance at left
              return (
                <rect
                  key={`${perf}-${pot}`}
                  x={col * CELL}
                  y={row * CELL}
                  width={CELL}
                  height={CELL}
                  fill={cellFill(perfIdx, potIdx)}
                  fillOpacity={0.25}
                  stroke="#1e293b"
                  strokeWidth={1}
                />
              );
            }),
          )}
        </svg>

        {/* Dots overlay */}
        {AXES.map((pot, potIdx) =>
          AXES.map((perf, perfIdx) => {
            const key = `${perf}-${pot}`;
            const members = byCell.get(key) ?? [];
            const row = 2 - potIdx;
            const col = perfIdx;
            return (
              <div
                key={key}
                className="absolute flex flex-wrap content-start gap-1 p-1.5"
                style={{ left: col * CELL, top: row * CELL, width: CELL, height: CELL }}
              >
                <span className="absolute bottom-0.5 right-1 text-[8px] text-white/50 pointer-events-none">
                  {CELL_LABELS[`${perfIdx}-${potIdx}`]}
                </span>
                {members.map(({ person, report }) => {
                  const borderClass =
                    report.flightRiskLevel === 'critical'
                      ? 'border-[3px] border-rose-500'
                      : report.flightRiskLevel === 'high'
                      ? 'border-2 border-amber-400'
                      : 'border border-slate-900/40';
                  return (
                    <button
                      key={person.id}
                      onClick={() => onSelect(person.id)}
                      title={`${person.name} — ${person.title}`}
                      className={`h-6 w-6 rounded-full bg-slate-800 text-white text-[9px] font-semibold flex items-center justify-center shadow ${borderClass} hover:scale-110 transition-transform`}
                    >
                      {initials(person.name)}
                    </button>
                  );
                })}
              </div>
            );
          }),
        )}

        <div className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] uppercase tracking-wide text-slate-500">
          Potential →
        </div>
        <div className="absolute left-1/2 -bottom-6 -translate-x-1/2 text-[10px] uppercase tracking-wide text-slate-500">
          Performance →
        </div>
      </div>

      <div className="flex-1 space-y-2">
        <h3 className="text-sm font-semibold text-white mb-2">Legend</h3>
        <p className="text-xs text-slate-400">
          Dot border indicates flight risk: <span className="text-rose-400 font-semibold">thick red</span> = critical,{' '}
          <span className="text-amber-400 font-semibold">amber</span> = high.
        </p>
        <div className="grid grid-cols-3 gap-2 mt-4 text-[11px] text-slate-400">
          {Object.entries(CELL_LABELS)
            .sort((a, b) => Number(b[0].split('-')[1]) - Number(a[0].split('-')[1]) || Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]))
            .map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-800 px-2 py-1.5 bg-slate-900/60">
                {label}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
