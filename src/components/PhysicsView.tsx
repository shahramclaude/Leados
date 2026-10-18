import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { orgODE } from "../lib/orgODE";
import { Badge, Card, Label, Stat } from "./ui";

const SERIES: { key: "E" | "V" | "T" | "C" | "M"; color: string; name: string }[] = [
  { key: "E", color: "#4f46e5", name: "Engagement" },
  { key: "V", color: "#0ea5e9", name: "Velocity" },
  { key: "T", color: "#10b981", name: "Trust" },
  { key: "C", color: "#f59e0b", name: "Capacity" },
  { key: "M", color: "#64748b", name: "Momentum" },
];

function LineChart({ trajectory }: { trajectory: any[] }) {
  const w = 640, h = 220, pad = 24;
  const n = trajectory.length;
  const x = (i: number) => pad + (i / (n - 1 || 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / 10) * (h - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {[0, 2.5, 5, 7.5, 10].map((g) => (
        <g key={g}>
          <line x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={2} y={y(g) + 3} fontSize={9} fill="#94a3b8">{g}</text>
        </g>
      ))}
      {SERIES.map((s) => (
        <polyline
          key={s.key}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          points={trajectory.map((t, i) => `${x(i)},${y(t[s.key])}`).join(" ")}
        />
      ))}
    </svg>
  );
}

export function PhysicsView({ state }: { state: AppState }) {
  const today = useMemo(() => new Date(), []);
  const [horizon, setHorizon] = useState(16);
  const [oneOnOne, setOneOnOne] = useState(0);
  const [debt, setDebt] = useState(0);
  const [conflict, setConflict] = useState(0);

  const result = useMemo(
    () => orgODE.integrate(state, today, horizon, { oneOnOneImproved: oneOnOne, debtResolved: debt, conflictResolved: conflict }),
    [state, today, horizon, oneOnOne, debt, conflict]
  );

  return (
    <div className="space-y-6">
      <Card title="Organizational physics — RK4 integration">
        <div className="mb-4">
          <LineChart trajectory={result.trajectory} />
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.name}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-slate-500">Horizon (weeks): {horizon}</label>
            <input type="range" min={1} max={30} value={horizon} onChange={(e) => setHorizon(+e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">1:1 quality intervention: {oneOnOne}</label>
            <input type="range" min={0} max={3} step={0.5} value={oneOnOne} onChange={(e) => setOneOnOne(+e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Tech-debt resolved: {debt}</label>
            <input type="range" min={0} max={3} step={0.5} value={debt} onChange={(e) => setDebt(+e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Conflict resolved: {conflict}</label>
            <input type="range" min={0} max={3} step={0.5} value={conflict} onChange={(e) => setConflict(+e.target.value)} className="w-full" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SERIES.map((s) => (
            <Stat key={s.key} label={s.name} value={(result.finalState as any)[s.key].toFixed(1)} />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3">
          <Badge tone={result.attractorPrediction.type === "DECLINE" ? "red" : result.attractorPrediction.type === "HIGH_PERFORMANCE" ? "green" : "slate"}>
            {result.attractorPrediction.type}
          </Badge>
          <span className="text-sm text-slate-600">{result.attractorPrediction.description}</span>
        </div>
        <Label>{result.label}</Label>
      </Card>
    </div>
  );
}
