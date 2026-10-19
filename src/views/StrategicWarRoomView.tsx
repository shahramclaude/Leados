import { useEffect, useMemo, useState } from 'react';
import { fetchStrategicReport, triggerWargame } from '../app/api/strategic/route';
import type {
  ActivatedScenario,
  BoardIntelligencePack,
  MetricSurveillanceEntry,
  StrategicIntelligenceReport,
  WargameAutoResult,
} from '../lib/types';
import { METRIC_DEFINITIONS, defaultBaselineState, projectScenario } from '../lib/scenarioEngine';
import type { MoveAxis, RoundScore } from '../lib/wargameEngine';
import { getActiveHypotheses } from '../lib/hypothesis';
import { mulberry32, sampleNormal } from '../lib/monteCarlo';

const URGENCY_COLOR: Record<string, string> = {
  watch: '#16a34a',
  plan: '#d97706',
  act: '#dc2626',
};

function formatCompact(v: number, unit: string): string {
  if (unit === '$') {
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  }
  if (unit === '%') return `${v.toFixed(1)}%`;
  return `${v.toFixed(1)}${unit ? ' ' + unit : ''}`;
}

function daysUntil(dateStr: string, now: Date): number {
  return Math.round((new Date(dateStr).getTime() - now.getTime()) / 86400000);
}

export default function StrategicWarRoomView() {
  const [report, setReport] = useState<StrategicIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [wargame, setWargame] = useState<WargameAutoResult | null>(null);
  const [wargameLoading, setWargameLoading] = useState(false);
  const [createdRisks, setCreatedRisks] = useState<Set<string>>(new Set());
  const [showHypotheses, setShowHypotheses] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let mounted = true;
    fetchStrategicReport().then((payload) => {
      if (!mounted) return;
      setReport(payload.report);
      setWargame(payload.report.wargameAutoResult);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleManualWargame() {
    setWargameLoading(true);
    try {
      const result = await triggerWargame({ context: 'Manual war-game trigger from the Strategic War Room.' });
      setWargame(result);
    } finally {
      setWargameLoading(false);
    }
  }

  if (loading || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <div className="animate-pulse text-sm tracking-widest uppercase">Synthesizing strategic intelligence…</div>
      </div>
    );
  }

  const pack = report.boardPack;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Strategic War Room</h1>
            <p className="text-xs text-slate-500">Scenario surveillance · competitive war-gaming · board intelligence</p>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <ScoreBadge score={pack ? scoreFromSummary(report) : 0} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <LeftPanel
          surveillance={report.metricSurveillance}
          activated={report.activatedScenarios}
          expandedMetric={expandedMetric}
          onToggle={(k) => setExpandedMetric((cur) => (cur === k ? null : k))}
        />

        <CenterPanel pack={pack} createdRisks={createdRisks} setCreatedRisks={setCreatedRisks} now={now} />

        <RightPanel wargame={wargame} loading={wargameLoading} onRunManual={handleManualWargame} />
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Last updated: {now.toLocaleString()}. {pack.confidenceStatement} Decisions should account for model uncertainty.{' '}
            <button className="font-semibold text-indigo-600 underline underline-offset-2" onClick={() => setShowHypotheses((v) => !v)}>
              View hypotheses →
            </button>
          </p>
        </div>
        {showHypotheses && (
          <div className="mx-auto mt-2 max-w-[1500px] rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Open hypotheses informing current confidence</p>
            <ul className="space-y-1">
              {getActiveHypotheses().map((h) => (
                <li key={h.id} className="text-xs text-indigo-900">
                  <span className="font-semibold">{h.statement}</span> — {Math.round(h.confidence * 100)}% confidence. Needs: {h.evidenceNeeded}.
                </li>
              ))}
            </ul>
          </div>
        )}
      </footer>
    </div>
  );
}

function scoreFromSummary(report: StrategicIntelligenceReport): number {
  // orgHealthScore isn't directly exposed on the report; approximate from
  // the number / severity of activated scenarios so the header badge still
  // reflects live state without re-threading belief fabric through props.
  const penalty = report.activatedScenarios.reduce((sum, a) => sum + (a.urgency === 'act' ? 20 : a.urgency === 'plan' ? 10 : 3), 0);
  return Math.max(5, Math.min(98, 92 - penalty));
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-100 text-emerald-700' : score >= 45 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return (
    <div className={`rounded-full px-3 py-1 text-xs font-bold ${color}`}>Org Health ~{score}/100</div>
  );
}

// ---------------------------------------------------------------------------
// LEFT — Scenario Surveillance
// ---------------------------------------------------------------------------

function LeftPanel({
  surveillance,
  activated,
  expandedMetric,
  onToggle,
}: {
  surveillance: MetricSurveillanceEntry[];
  activated: ActivatedScenario[];
  expandedMetric: string | null;
  onToggle: (key: string) => void;
}) {
  const activatedMap = new Map(activated.map((a) => [a.metricKey, a]));
  return (
    <aside className="space-y-2">
      <PanelHeader title="Scenario Surveillance" subtitle="11 metrics vs. board baseline" />
      <div className="space-y-1.5">
        {surveillance.map((s) => {
          const def = METRIC_DEFINITIONS[s.metricKey];
          const act = activatedMap.get(s.metricKey);
          const isActivated = s.deviationSigmas >= 2;
          const isExpanded = expandedMetric === s.metricKey;
          const delta = s.actualValue - s.baselineValue;
          return (
            <div key={s.metricKey} className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => onToggle(s.metricKey)}>
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: URGENCY_COLOR[s.urgency] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{def.label}</span>
                  <span className="block text-[11px] text-slate-500">
                    {formatCompact(s.actualValue, def.unit)}{' '}
                    <span className={delta === 0 ? 'text-slate-400' : delta > 0 === (def.direction === 'higher_better') ? 'text-emerald-600' : 'text-red-600'}>
                      ({s.deviationSigmas.toFixed(1)}σ)
                    </span>
                  </span>
                </span>
                {isActivated && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">Activated</span>
                )}
                <span className="text-slate-400">{isExpanded ? '▲' : '▼'}</span>
              </button>
              {isExpanded && <MetricDetail metricKey={s.metricKey} actual={s.actualValue} implication={act?.implication} urgency={s.urgency} />}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function MetricDetail({ metricKey, actual, implication, urgency }: { metricKey: MetricSurveillanceEntry['metricKey']; actual: number; implication?: string; urgency: string }) {
  const def = METRIC_DEFINITIONS[metricKey];
  const projection = useMemo(() => projectScenario(defaultBaselineState, { [metricKey]: actual } as Partial<typeof defaultBaselineState>, metricKey, 12, 300), [metricKey, actual]);
  const p10 = projection.p10[projection.p10.length - 1];
  const p50 = projection.p50[projection.p50.length - 1];
  const p90 = projection.p90[projection.p90.length - 1];
  const std = Math.max(0.0001, (p90 - p10) / 2.5631);
  const rand = useMemo(() => mulberry32(Math.round(actual * 97 + 13)), [actual]);
  const samples = useMemo(() => Array.from({ length: 300 }, () => Math.max(0, p50 + std * sampleNormal(rand))), [p50, std, rand]);

  const bins = 10;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  samples.forEach((v) => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[idx]++;
  });
  const maxCount = Math.max(...counts, 1);
  const svgW = 240;
  const svgH = 80;
  const barW = svgW / bins;

  function xFor(v: number) {
    return ((v - min) / (max - min || 1)) * svgW;
  }

  return (
    <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
      {implication && <p className="mb-2 leading-snug text-slate-700">{implication}</p>}
      <p className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Month-12 Monte Carlo (n≈300), status: {urgency}</p>
      <svg width="100%" viewBox={`0 0 ${svgW} ${svgH + 18}`} className="overflow-visible">
        {counts.map((c, i) => {
          const h = (c / maxCount) * svgH;
          return <rect key={i} x={i * barW + 1} y={svgH - h} width={barW - 2} height={h} fill="#c7d2fe" />;
        })}
        {[{ v: p10, label: 'p10', color: '#dc2626' }, { v: p50, label: 'p50', color: '#1e293b' }, { v: p90, label: 'p90', color: '#16a34a' }].map((m) => (
          <g key={m.label}>
            <line x1={xFor(m.v)} x2={xFor(m.v)} y1={0} y2={svgH} stroke={m.color} strokeWidth={1.5} strokeDasharray="3,2" />
            <text x={xFor(m.v)} y={svgH + 12} fontSize={8} fill={m.color} textAnchor="middle">
              {m.label} {formatCompact(m.v, def.unit)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CENTER — Organizational Moment + Board Pack
// ---------------------------------------------------------------------------

function CenterPanel({
  pack,
  createdRisks,
  setCreatedRisks,
  now,
}: {
  pack: BoardIntelligencePack;
  createdRisks: Set<string>;
  setCreatedRisks: (fn: (prev: Set<string>) => Set<string>) => void;
  now: Date;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Organizational Moment — Strategic Memo</p>
        <p className="font-serif text-xl leading-relaxed text-slate-50">{pack.organizationalMoment}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Executive Summary</p>
        <p className="text-lg leading-relaxed text-slate-800">{pack.executiveSummary}</p>
        <p className="mt-3 text-sm italic text-slate-500">{pack.domainHealthNarrative}</p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Top 3 Strategic Risks</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {pack.top3StrategicRisks.map((risk) => {
            const created = createdRisks.has(risk.title);
            return (
              <div key={risk.title} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-slate-900">{risk.title}</p>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">{risk.domain}</p>
                <Bar label="Severity" value={risk.severity} color="#dc2626" />
                <Bar label="Confidence" value={Math.round(risk.confidence * 100)} color="#4f46e5" />
                <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-600">{risk.implication}</p>
                <button
                  onClick={() => setCreatedRisks((prev) => new Set(prev).add(risk.title))}
                  disabled={created}
                  className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold ${created ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
                >
                  {created ? 'Decision Created ✓' : 'Create Decision'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Decisions for the Board</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {pack.decisionsForBoard.length === 0 && (
            <p className="col-span-3 text-sm text-slate-500">No board-level decisions currently meet the impact/deadline threshold.</p>
          )}
          {pack.decisionsForBoard.map((d) => {
            const days = daysUntil(d.deadline, now);
            return (
              <div key={d.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-slate-900">{d.title}</p>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">{d.domain}</p>
                <p className="text-xs text-slate-600">{d.stakes}</p>
                <p className="mt-2 text-xs font-semibold text-indigo-700">Recommendation: {d.recommendation}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={`font-bold ${days <= 7 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {days >= 0 ? `${days}d to decide` : 'Overdue'}
                  </span>
                  {d.optionValue !== null && <span className="text-slate-500">Option value: ${Math.round(d.optionValue).toLocaleString()}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Key Metrics (Board View)</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm" dangerouslySetInnerHTML={{ __html: pack.keyMetricTableHTML }} />
      </div>
    </section>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-1">
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RIGHT — War Room
// ---------------------------------------------------------------------------

function RightPanel({ wargame, loading, onRunManual }: { wargame: WargameAutoResult | null; loading: boolean; onRunManual: () => void }) {
  return (
    <aside className="space-y-3">
      <PanelHeader title="War Room" subtitle="Competitive response modeling" />
      {!wargame && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center">
          <p className="mb-3 text-sm text-slate-500">No competitive signals detected in last 14 days.</p>
          <button
            onClick={onRunManual}
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? 'Running war game…' : 'Run Manual War Game'}
          </button>
        </div>
      )}
      {wargame && <WargamePanel wargame={wargame} />}
    </aside>
  );
}

function WargamePanel({ wargame }: { wargame: WargameAutoResult }) {
  const competitorNames = Object.keys(wargame.competitorCounters);
  const topName = competitorNames[0];
  const theirMove = topName ? wargame.competitorCounters[topName] : null;
  const score = topName ? wargame.roundScores[topName] : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <p className="font-semibold">{wargame.recommendation}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Our Move vs. Their Counter</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-emerald-50 p-2">
            <p className="font-bold text-emerald-800">Us</p>
            <p className="font-semibold text-slate-800">{wargame.ourBestMove.name}</p>
            <p className="mt-1 text-slate-600">{wargame.ourBestMove.description}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-2">
            <p className="font-bold text-red-800">{topName ?? 'Competitor'}</p>
            <p className="font-semibold text-slate-800">{theirMove?.name ?? '—'}</p>
            <p className="mt-1 text-slate-600">{theirMove?.description ?? 'No clear counter identified.'}</p>
          </div>
        </div>
      </div>

      {score && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Round Score — {topName}</p>
          <RadarChart score={score} />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Blindspots</p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
          {wargame.blindspots.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const RADAR_AXES: MoveAxis[] = ['market', 'talent', 'capital', 'momentum'];

function RadarChart({ score }: { score: RoundScore }) {
  const size = 160;
  const center = size / 2;
  const radius = size / 2 - 22;
  const points = RADAR_AXES.map((axis, i) => {
    const angle = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2;
    const value = score[axis] / 100;
    return {
      x: center + Math.cos(angle) * radius * value,
      y: center + Math.sin(angle) * radius * value,
      labelX: center + Math.cos(angle) * (radius + 14),
      labelY: center + Math.sin(angle) * (radius + 14),
      axis,
    };
  });
  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');
  const gridRings = [0.25, 0.5, 0.75, 1];

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`}>
      {gridRings.map((r) => (
        <polygon
          key={r}
          points={RADAR_AXES.map((_, i) => {
            const angle = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2;
            return `${center + Math.cos(angle) * radius * r},${center + Math.sin(angle) * radius * r}`;
          }).join(' ')}
          fill="none"
          stroke="#e5e7eb"
        />
      ))}
      <polygon points={polygon} fill="#4f46e533" stroke="#4f46e5" strokeWidth={1.5} />
      {points.map((p) => (
        <text key={p.axis} x={p.labelX} y={p.labelY} fontSize={9} textAnchor="middle" fill="#475569" className="capitalize">
          {p.axis} ({score[p.axis]})
        </text>
      ))}
    </svg>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h2>
      <p className="text-[11px] text-slate-400">{subtitle}</p>
    </div>
  );
}
