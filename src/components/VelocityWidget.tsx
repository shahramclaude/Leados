import { useState } from "react";
import type { DomainKey, Projection } from "../lib/types";
import { DOMAIN_LABELS } from "../lib/types";
import { measureVelocity, domainMath } from "../lib/velocity";
import { Badge, directionBadge, scoreBandLabel } from "./ui";
import { Sparkline } from "./Sparkline";

/**
 * VelocityWidget — compact mode for list/table contexts, full mode for the
 * Intelligence narrative. Logic (measureVelocity + domainMath + score-math
 * drilldown) is unchanged from the original; only the styling is dark-themed
 * here, plus an explicit low-data confidence warning.
 */
export function VelocityWidget({ domain, P, today, mode }: { domain: DomainKey; P: Projection; today: Date; mode: "compact" | "full" }) {
  const [open, setOpen] = useState(false);
  const v = measureVelocity(domain, P, today, 30);
  const band = scoreBandLabel(v.current);
  const lowData = v.eventCount90d < 5;

  if (mode === "compact") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)", background: "var(--panel2)" }}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>
            {DOMAIN_LABELS[domain]}
          </div>
          <div className="font-mono-ui text-xs" style={{ color: "var(--text-muted)" }}>
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
  const sparkPoints = [v.historical, (v.historical + v.current) / 2, v.current];
  const forecast = [(v.current + v.projectedClamped30) / 2, v.projectedClamped30];

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {DOMAIN_LABELS[domain]}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono-ui text-3xl font-bold" style={{ color: "var(--text)" }}>
              {v.current.toFixed(1)}
            </span>
            <Badge color={band.color}>{band.text}</Badge>
          </div>
        </div>
        <div className="text-right">
          {directionBadge(v.direction)}
          <div className="mt-1 font-mono-ui text-sm font-medium" style={{ color: "var(--text)" }}>
            {v.velocity >= 0 ? "+" : ""}
            {v.velocity.toFixed(3)}/d
          </div>
        </div>
      </div>

      {lowData && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono-ui text-[11px]" style={{ background: "rgba(251,191,36,.08)", color: "var(--warn)" }}>
          ⚠ LOW DATA — velocity estimate unreliable ({v.eventCount90d} events / 90d)
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <div>
          <div className="font-medium" style={{ color: "var(--text-dim)" }}>
            30d ago
          </div>
          <div className="font-mono-ui text-sm" style={{ color: "var(--text)" }}>
            {v.historical.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="font-medium" style={{ color: "var(--text-dim)" }}>
            Now
          </div>
          <div className="font-mono-ui text-sm" style={{ color: "var(--text)" }}>
            {v.current.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="font-medium" style={{ color: "var(--text-dim)" }}>
            Projected +30d
          </div>
          <div className="font-mono-ui text-sm" style={{ color: "var(--text)" }}>
            {v.projectedIn30d.toFixed(2)}
            {v.projectedIn30d !== v.projectedClamped30 && <span style={{ color: "var(--text-dim)" }}> (clamped {v.projectedClamped30.toFixed(1)})</span>}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Sparkline
          points={sparkPoints}
          showForecast={forecast}
          showCurrentDot
          color={v.direction === "WORSENING" ? "var(--bad)" : v.direction === "IMPROVING" ? "var(--ok)" : "var(--text-muted)"}
          label={`${domain} score`}
          width={220}
          height={40}
        />
      </div>

      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>
        {open ? "Hide score math" : "Show score math"}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--line)" }}>
          <table className="w-full text-left text-xs">
            <thead style={{ background: "var(--panel2)", color: "var(--text-muted)" }}>
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
                  <td colSpan={5} className="px-2 py-2" style={{ color: "var(--text-dim)" }}>
                    No events in window.
                  </td>
                </tr>
              )}
              {math.rows.map((r) => (
                <tr key={r.key} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-2 py-1" style={{ color: "var(--text)" }}>
                    {r.title}
                  </td>
                  <td className="px-2 py-1 font-mono-ui" style={{ color: "var(--text)" }}>
                    {r.sev}
                  </td>
                  <td className="px-2 py-1 font-mono-ui" style={{ color: "var(--text-muted)" }}>
                    {r.ageDays}
                  </td>
                  <td className="px-2 py-1 font-mono-ui" style={{ color: "var(--text-muted)" }}>
                    {Math.pow(0.85, r.ageDays).toFixed(3)}
                  </td>
                  <td className="px-2 py-1 font-mono-ui font-medium" style={{ color: "var(--text)" }}>
                    {r.weight}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1 font-mono-ui text-[11px]" style={{ color: "var(--text-dim)" }}>
            raw sum = {math.rawScore.toFixed(3)}, clamped to [0,10] → {math.score}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
        {v.label}
      </p>
    </div>
  );
}
