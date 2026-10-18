"use client";

import type { IntelligenceData, ScenarioResult } from "@/lib/intelligence";

const SCENARIO_LABEL: Record<string, string> = {
  STATUS_QUO: "Status Quo",
  IMPROVE_CADENCE: "Improve Cadence",
  ADD_GROWTH_PLAN: "Add Growth Plan",
  REDUCE_LOAD: "Reduce Load",
};

const SCENARIO_COLOR: Record<string, string> = {
  STATUS_QUO: "#f87171",
  IMPROVE_CADENCE: "#60a5fa",
  ADD_GROWTH_PLAN: "#4ade80",
  REDUCE_LOAD: "#fb923c",
};

function attritionColor(p: number) {
  if (p > 0.4) return "text-red-500";
  if (p > 0.2) return "text-amber-500";
  return "text-green-500";
}

function ScenarioCard({
  name,
  result,
  statusQuo,
}: {
  name: string;
  result: ScenarioResult;
  statusQuo?: ScenarioResult;
}) {
  const delta = statusQuo ? Math.round((statusQuo.attritionProbability - result.attritionProbability) * 100) : null;
  const isStatusQuo = name === "STATUS_QUO";
  return (
    <div
      className={`rounded-xl border bg-slate-900/60 p-4 ${
        isStatusQuo && result.attritionProbability > 0.3 ? "border-red-600" : "border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-100">{SCENARIO_LABEL[name]}</div>
        {delta !== null && delta > 0 && <span className="text-xs text-green-400">▼{delta}pp</span>}
      </div>
      <div className={`mt-2 text-3xl font-bold ${attritionColor(result.attritionProbability)}`}>
        {Math.round(result.attritionProbability * 100)}%
      </div>
      <div className="text-xs text-slate-500">attrition probability</div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Mean engagement</span>
          <span>{result.finalMeanEngagement}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${result.finalMeanEngagement}%` }} />
        </div>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Range: P10 {result.p10}% – P90 {result.p90}%
      </div>
    </div>
  );
}

function ProjectionChart({ scenarios, current }: { scenarios: IntelligenceData["simulation"]["scenarios"]; current: number }) {
  const w = 600;
  const h = 200;
  const padding = 24;
  const weeks = 12;

  function points(final: number) {
    const pts: [number, number][] = [];
    for (let week = 0; week <= weeks; week++) {
      const t = week / weeks;
      const value = current + (final - current) * t;
      const x = padding + (t * (w - padding * 2));
      const y = h - padding - (value / 100) * (h - padding * 2);
      pts.push([x, y]);
    }
    return pts;
  }

  const lines = (Object.keys(scenarios) as (keyof typeof scenarios)[]).map((key) => ({
    key,
    color: SCENARIO_COLOR[key],
    pts: points(scenarios[key].finalMeanEngagement),
  }));

  return (
    <svg width={w} height={h + 30} viewBox={`0 0 ${w} ${h + 30}`} className="rounded-xl bg-slate-950/50">
      {[0, 25, 50, 75, 100].map((v) => {
        const y = h - padding - (v / 100) * (h - padding * 2);
        return (
          <g key={v}>
            <line x1={padding} x2={w - padding} y1={y} y2={y} stroke="#1e293b" strokeWidth={1} />
            <text x={2} y={y + 3} fontSize="9" fill="#64748b">
              {v}
            </text>
          </g>
        );
      })}
      {lines.map((line) => (
        <polyline
          key={line.key}
          points={line.pts.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={line.color}
          strokeWidth={2}
        />
      ))}
      <text x={padding} y={h + 20} fontSize="9" fill="#64748b">
        Week 1
      </text>
      <text x={w - padding - 30} y={h + 20} fontSize="9" fill="#64748b">
        Week 12
      </text>
    </svg>
  );
}

export function SimulationView({ data }: { data: IntelligenceData }) {
  const { simulation } = data;
  const current = mean(Object.values(data.pulseByPerson).map((p) => ((p.moodMean - 1) / 4) * 100));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Simulation</h2>
        <p className="mt-1 text-xs text-slate-500">
          Multi-agent simulation · {simulation.seeds} Monte Carlo seeds · Heuristic agent model. Coefficients not empirically
          validated. Use as directional guidance only.
        </p>
      </div>

      <div className="rounded-xl border border-indigo-700/50 bg-indigo-950/30 p-4">
        <div className="text-sm text-indigo-400">Recommended intervention: {SCENARIO_LABEL[simulation.bestIntervention.name]}</div>
        <div className="mt-1 text-lg font-semibold text-slate-100">
          Reduces attrition probability by {Math.round(simulation.bestIntervention.delta * 100)}pp vs status quo
        </div>
        <div className="mt-1 text-xs text-slate-500">{simulation.seeds} seeds. Refreshes daily.</div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(Object.keys(simulation.scenarios) as (keyof typeof simulation.scenarios)[]).map((key) => (
          <ScenarioCard key={key} name={key} result={simulation.scenarios[key]} statusQuo={key !== "STATUS_QUO" ? simulation.scenarios.STATUS_QUO : undefined} />
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-300">12-week projection</h3>
        <ProjectionChart scenarios={simulation.scenarios} current={current} />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
          {(Object.keys(simulation.scenarios) as (keyof typeof simulation.scenarios)[]).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: SCENARIO_COLOR[key] }} />
              {SCENARIO_LABEL[key]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 50;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
