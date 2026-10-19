import type { PersonState } from '../../lib/types';
import type { PersonIntelligenceReport, NineBoxAxis } from '../../lib/peopleIntelligence';
import { analyzeOneOne, formatTenure } from '../../lib/peopleIntelligence';
import { BeliefGauge } from './BeliefGauge';
import { RiskBadge, RiskBar, daysAgoLabel, levelFromScore } from './shared';

interface Props {
  person: PersonState;
  report: PersonIntelligenceReport;
  teamName: string;
  now: Date;
  onClose: () => void;
  onSelectPerson?: (id: string) => void;
}

const AXES: NineBoxAxis[] = ['low', 'mid', 'high'];

function cellColor(perf: NineBoxAxis, pot: NineBoxAxis, active: boolean) {
  const score = AXES.indexOf(perf) + AXES.indexOf(pot);
  const base =
    score >= 4
      ? 'bg-emerald-500/30'
      : score >= 2
      ? 'bg-amber-500/25'
      : 'bg-rose-500/25';
  return active ? `${base} ring-2 ring-white` : base;
}

export function PersonDetailPanel({ person, report, teamName, now, onClose }: Props) {
  const last3 = [...person.oneOnes].slice(-3).reverse();

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] max-w-[94vw] bg-slate-900 border-l border-slate-700 z-50 overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">{person.name}</h2>
            <p className="text-sm text-slate-400">{person.title}</p>
            <p className="text-xs text-slate-500 mt-1">
              Team: {teamName} · Tenure: {formatTenure(person.tenureDays)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none px-2 py-1">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div className="grid grid-cols-4 gap-2 bg-slate-800/40 rounded-xl p-4 border border-slate-800">
            <BeliefGauge label="Flight Risk" value={report.flightRiskScore * 100} size={78} />
            <BeliefGauge label="Burnout" value={report.burnoutRiskScore * 100} size={78} />
            <BeliefGauge label="1:1 Quality" value={report.oneOneQuality.score} size={78} />
            <BeliefGauge label="Performance" value={(report.latestPerformanceScore ?? 0) * 10} size={78} />
          </div>

          {/* 9-box */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-2">9-Box Placement</h3>
            <div className="flex gap-4 items-start">
              <div className="grid grid-cols-3 grid-rows-3 gap-1" style={{ width: 150, height: 150 }}>
                {AXES.slice().reverse().map((pot) =>
                  AXES.map((perf) => {
                    const active = perf === report.performanceAxis && pot === report.potentialAxis;
                    return (
                      <div
                        key={`${perf}-${pot}`}
                        className={`rounded-sm flex items-center justify-center text-[9px] text-white/70 ${cellColor(perf, pot, active)}`}
                      >
                        {active ? '●' : ''}
                      </div>
                    );
                  }),
                )}
              </div>
              <div className="text-xs text-slate-400 flex-1">
                <p className="text-white font-medium mb-1">
                  {report.performanceAxis.toUpperCase()} performance / {report.potentialAxis.toUpperCase()} potential
                </p>
                <p>{report.suggestedAction}</p>
              </div>
            </div>
          </section>

          {/* Flight risk drivers */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Flight Risk Drivers</h3>
              <RiskBadge level={report.flightRiskLevel} />
            </div>
            <div className="space-y-2">
              {report.flightRiskDrivers.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-300 flex-1">{d.label}</span>
                  <RiskBar score={d.weight} />
                </div>
              ))}
            </div>
          </section>

          {/* Burnout drivers */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-2">Burnout Drivers</h3>
            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
              {report.burnoutDrivers.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </section>

          {/* Conversation intelligence */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-2">Conversation Intelligence (last 3 one:ones)</h3>
            <div className="space-y-3">
              {last3.length === 0 && <p className="text-xs text-slate-500">No 1:1s logged yet.</p>}
              {last3.map((o) => {
                const a = analyzeOneOne(o);
                return (
                  <div key={o.id} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{new Date(o.date).toLocaleDateString()}</span>
                      <span>{a.wordCount} words</span>
                      <span
                        className={
                          o.sentiment === 1
                            ? 'text-emerald-400'
                            : o.sentiment === -1
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }
                      >
                        {o.sentiment === 1 ? 'Positive' : o.sentiment === -1 ? 'Negative' : 'Neutral'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{o.notes}</p>
                    <div className="flex flex-wrap gap-1">
                      {o.topics.map((t) => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {a.exitSignal && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          ⚠ Exit signal
                        </span>
                      )}
                      {a.compSignal && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚠ Comp signal
                        </span>
                      )}
                      {a.burnoutSignal && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40">
                          ⚠ Burnout signal
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Next topics */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-2">Next 1:1 Topics</h3>
            <ul className="space-y-1.5">
              {report.nextOneOneTopics.map((t, i) => (
                <li key={i} className="text-xs text-slate-300 bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2">
                  {t}
                </li>
              ))}
            </ul>
          </section>

          {/* Succession */}
          <section>
            <h3 className="text-sm font-semibold text-white mb-2">Succession Risk</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              {report.successionRisk.isKeyPerson && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40">
                  Key Person
                </span>
              )}
              {report.successionRisk.hasSuccessor ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Successor identified
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  No successor
                </span>
              )}
            </div>
            {report.successionRisk.warning && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 mb-2">
                {report.successionRisk.warning}
              </p>
            )}
            <p className="text-xs text-slate-400">Time to readiness: {report.successionRisk.timeToReadiness}</p>
          </section>

          <section className="text-xs text-slate-500 border-t border-slate-800 pt-3">
            Last 1:1: {daysAgoLabel(person.lastOneOneAt, now)} · Network centrality:{' '}
            {Math.round(report.networkCentrality * 100)}% {report.isBottleneck && '· Bottleneck ⚠'}
          </section>
        </div>
      </div>
    </>
  );
}

export { levelFromScore };
