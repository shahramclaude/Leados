import { useMemo, useState } from "react";
import { SEED_HORIZON_SIGNALS, type HorizonSignal } from "../../lib/signals/horizonSignal";
import { classifyQuadrant, clusterSignals, toRadarPoints } from "../../lib/horizon/radar";
import { PossibilityBanner } from "./PossibilityBanner";
import { Card, Pill, SectionHeading } from "./ui";

const CATEGORY_COLOR: Record<HorizonSignal["category"], string> = {
  market: "#6366f1",
  regulation: "#dc2626",
  competition: "#d97706",
  technology: "#059669",
  talent: "#0ea5e9",
};

const QUADRANT_LABEL: Record<string, string> = {
  "act-now": "Act now",
  prepare: "Prepare (high impact, lower likelihood)",
  watch: "Watch (likely, lower impact)",
  "monitor-lightly": "Monitor lightly",
};

export function HorizonRadar() {
  const [selectedId, setSelectedId] = useState<string | null>(SEED_HORIZON_SIGNALS[0]?.id ?? null);
  const points = useMemo(() => toRadarPoints(SEED_HORIZON_SIGNALS), []);
  const clusters = useMemo(() => clusterSignals(SEED_HORIZON_SIGNALS), []);
  const selected = SEED_HORIZON_SIGNALS.find((s) => s.id === selectedId) ?? null;

  const chartSize = 360;
  const padding = 30;
  const scale = (v: number) => padding + ((v - 1) / 4) * (chartSize - padding * 2);

  return (
    <div className="space-y-6">
      <PossibilityBanner authoredAt="2026-03-07T09:00:00.000Z" authoredBy="horizon-radar" extra="Impact/likelihood/uncertainty bands are coarse judgment calls, not precise probabilities." />

      <Card>
        <SectionHeading title="Horizon radar" subtitle="Impact (y) × likelihood (x); bubble size = uncertainty. Click a signal for details." />
        <div className="flex flex-col gap-6 lg:flex-row">
          <svg width={chartSize} height={chartSize} className="shrink-0 rounded-lg border border-slate-200 bg-slate-50">
            {/* quadrant guide lines */}
            <line x1={scale(3)} y1={padding} x2={scale(3)} y2={chartSize - padding} stroke="#e2e8f0" strokeDasharray="4 4" />
            <line x1={padding} y1={chartSize - scale(3)} x2={chartSize - padding} y2={chartSize - scale(3)} stroke="#e2e8f0" strokeDasharray="4 4" />
            {[1, 2, 3, 4, 5].map((v) => (
              <text key={`x${v}`} x={scale(v)} y={chartSize - padding + 16} fontSize={9} textAnchor="middle" fill="#94a3b8">
                {v}
              </text>
            ))}
            {[1, 2, 3, 4, 5].map((v) => (
              <text key={`y${v}`} x={padding - 14} y={chartSize - scale(v) + 3} fontSize={9} textAnchor="middle" fill="#94a3b8">
                {v}
              </text>
            ))}
            <text x={chartSize / 2} y={chartSize - 4} fontSize={10} textAnchor="middle" fill="#64748b">
              Likelihood (band, not a probability) →
            </text>
            <text x={10} y={chartSize / 2} fontSize={10} textAnchor="middle" fill="#64748b" transform={`rotate(-90 10 ${chartSize / 2})`}>
              Impact →
            </text>

            {points.map((p) => {
              const cx = scale(p.signal.likelihood);
              const cy = chartSize - scale(p.signal.impact);
              const r = 6 + p.signal.uncertainty * 2.2;
              const isSelected = p.signal.id === selectedId;
              return (
                <g key={p.signal.id} onClick={() => setSelectedId(p.signal.id)} className="cursor-pointer">
                  <circle cx={cx} cy={cy} r={r} fill={CATEGORY_COLOR[p.signal.category]} fillOpacity={isSelected ? 0.85 : 0.45} stroke={isSelected ? "#1e293b" : "none"} strokeWidth={2} />
                </g>
              );
            })}
          </svg>

          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
                <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  {cat}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-slate-100">
              {SEED_HORIZON_SIGNALS.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded-lg px-2 py-2 text-left text-sm transition ${s.id === selectedId ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.title}</span>
                      <Pill tone="slate">{QUADRANT_LABEL[classifyQuadrant(s)]}</Pill>
                    </div>
                    <div className="text-xs text-slate-500">First observed {new Date(s.firstObservedAt).toLocaleDateString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {selected ? (
        <Card>
          <SectionHeading title={selected.title} subtitle={`Category: ${selected.category} · Impact ${selected.impact}/5 · Likelihood ${selected.likelihood}/5 · Uncertainty ${selected.uncertainty}/5`} />
          <p className="text-sm text-slate-700">{selected.description}</p>
          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
            <strong>What would change our mind:</strong> {selected.whatWouldChangeOurMind}
          </div>
          <div className="mt-2 text-xs text-slate-400">Source refs: {selected.sourceRefs.join(", ")}</div>
        </Card>
      ) : null}

      <Card>
        <SectionHeading title="Novelty clusters" subtitle="Near-duplicate signals are grouped so the radar doesn't get cluttered with restatements." />
        <div className="grid gap-3 sm:grid-cols-2">
          {clusters.map((c) => (
            <div key={c.clusterId} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <Pill>{c.category}</Pill>
                <span className="text-xs text-slate-400">{c.signals.length} signal(s)</span>
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                {c.signals.map((s) => (
                  <li key={s.id}>{s.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
