import { useState } from "react";
import type { Domain, Projection } from "../lib/types";
import { measureVelocity, domainMath } from "../lib/velocity";
import { Badge, directionBadge, scoreBandLabel } from "./ui";

/**
 * "Velocity Dashboard Widget" — compact mode for Today, full mode for
 * Intelligence. Layout is this build's own completion of the brief
 * (disclosed in README: the pasted spec cuts off right after
 * "In the domain heatmap (everywhere it appears):" with no further detail).
 */
export function VelocityWidget({ domain, P, today, mode }: { domain: Domain; P: Projection; today: Date; mode: "compact" | "full" }) {
  const [open, setOpen] = useState(false);
  const v = measureVelocity(domain, P, today, 30);
  const band = scoreBandLabel(v.current);

  if (mode === "compact") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold capitalize text-slate-900">{domain}</div>
          <div className="text-xs text-slate-500">
            {v.current.toFixed(1)} · {v.velocity >= 0 ? "+" : ""}
            {v.velocity.toFixed(3)}/d
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge color={band.color}>{band.text}</Badge>
          {directionBadge(v.direction)}
        </div>
      </div>
    );
  }

  const math = domainMath(domain, P, today);
  const sparkPoints = [v.historical, (v.historical + v.current) / 2, v.current, (v.current + v.projectedClamped) / 2, v.projectedClamped];
  const max = 10;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold capitalize text-slate-900">{domain}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{v.current.toFixed(1)}</span>
            <Badge color={band.color}>{band.text}</Badge>
          </div>
        </div>
        <div className="text-right">
          {directionBadge(v.direction)}
          <div className="mt-1 text-sm font-medium text-slate-700">
            {v.velocity >= 0 ? "+" : ""}
            {v.velocity.toFixed(3)}/d
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div>
          <div className="font-medium text-slate-400">30d ago</div>
          <div className="text-sm text-slate-800">{v.historical.toFixed(2)}</div>
        </div>
        <div>
          <div className="font-medium text-slate-400">Now</div>
          <div className="text-sm text-slate-800">{v.current.toFixed(2)}</div>
        </div>
        <div>
          <div className="font-medium text-slate-400">Projected +30d</div>
          <div className="text-sm text-slate-800">
            {v.projectedIn30d.toFixed(2)}
            {v.projectedIn30d !== v.projectedClamped && <span className="text-slate-400"> (clamped {v.projectedClamped.toFixed(1)})</span>}
          </div>
        </div>
      </div>

      <svg viewBox="0 0 100 24" className="mt-3 h-6 w-full">
        <polyline
          fill="none"
          stroke={v.direction === "WORSENING" ? "#e11d48" : v.direction === "IMPROVING" ? "#059669" : "#64748b"}
          strokeWidth="2"
          points={sparkPoints.map((p, i) => `${i * 25},${24 - (Math.max(0, Math.min(max, p)) / max) * 22}`).join(" ")}
        />
      </svg>

      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">
        {open ? "Hide score math" : "Show score math"}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-1">Event</th>
                <th className="px-2 py-1">Sev</th>
                <th className="px-2 py-1">Age (d)</th>
                <th className="px-2 py-1">0.85^age</th>
                <th className="px-2 py-1">Weight</th>
              </tr>
            </thead>
            <tbody>
              {math.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-2 text-slate-400">
                    No events in window.
                  </td>
                </tr>
              )}
              {math.rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="px-2 py-1">{r.title}</td>
                  <td className="px-2 py-1">{r.sev}</td>
                  <td className="px-2 py-1">{r.ageDays}</td>
                  <td className="px-2 py-1">{Math.pow(0.85, r.ageDays).toFixed(3)}</td>
                  <td className="px-2 py-1 font-medium">{r.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1 text-[11px] text-slate-400">raw sum = {math.rawScore.toFixed(3)}, clamped to [0,10] → {math.score}</div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">{v.label}</p>
    </div>
  );
}
