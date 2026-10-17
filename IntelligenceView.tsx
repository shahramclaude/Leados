import { useMemo, useState } from "react";
import type { Projection } from "../lib/types";
import { DOMAINS } from "../lib/types";
import { measureVelocity } from "../lib/velocity";
import { computeChangePhysics, measureOrgEntropy, computeLeadershipEnergyBudget, measureResonance, RESONANCE_WATCHLIST } from "../lib/orgPhysics";
import { VelocityWidget } from "./VelocityWidget";
import { Card, SectionTitle, Badge, directionBadge, scoreBandLabel, Stat } from "./ui";

export function IntelligenceView({ P, today }: { P: Projection; today: Date }) {
  const velocities = useMemo(() => DOMAINS.map((d) => measureVelocity(d, P, today, 30)), [P, today]);
  const alarm = useMemo(() => {
    // The real alarm: the fastest-accelerating domain, not the highest current score.
    return [...velocities].sort((a, b) => b.velocity - a.velocity)[0];
  }, [velocities]);

  return (
    <div className="space-y-10">
      <div>
        <SectionTitle
          eyebrow="Part 1 — Temporal Velocity Measurement"
          title="Domain velocity, not just domain state"
          desc="Direction and rate surfaced explicitly: score, velocity (points/day), and a labeled linear 30-day projection, per domain."
        />

        {alarm && alarm.velocity > 0.03 && (
          <Card className="mb-4 border-rose-200 bg-rose-50">
            <div className="flex flex-wrap items-center gap-2 text-sm text-rose-800">
              <Badge color="red">ALARM</Badge>
              <span>
                <strong className="capitalize">{alarm.domain}</strong> is the real signal: not the current score ({alarm.current.toFixed(1)},{" "}
                {scoreBandLabel(alarm.current).text.toLowerCase()}) but the velocity — {alarm.velocity >= 0 ? "+" : ""}
                {alarm.velocity.toFixed(3)}/d, accelerating toward a projected {alarm.projectedIn30d.toFixed(1)} in 30 days.
              </span>
            </div>
          </Card>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Domain</th>
                <th className="px-4 py-2">Score</th>
                <th className="px-4 py-2">Band</th>
                <th className="px-4 py-2">Velocity</th>
                <th className="px-4 py-2">Direction</th>
                <th className="px-4 py-2">Projected +30d</th>
              </tr>
            </thead>
            <tbody>
              {velocities.map((v) => {
                const band = scoreBandLabel(v.current);
                return (
                  <tr key={v.domain} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium capitalize">{v.domain}</td>
                    <td className="px-4 py-2">{v.current.toFixed(1)}</td>
                    <td className="px-4 py-2">
                      <Badge color={band.color}>{band.text}</Badge>
                    </td>
                    <td className={`px-4 py-2 font-mono ${v.velocity > 0.01 ? "text-rose-600" : v.velocity < -0.01 ? "text-emerald-600" : "text-slate-500"}`}>
                      {v.velocity >= 0 ? "+" : ""}
                      {v.velocity.toFixed(3)}/d
                    </td>
                    <td className="px-4 py-2">{directionBadge(v.direction)}</td>
                    <td className="px-4 py-2">{v.projectedClamped.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DOMAINS.map((d) => (
            <VelocityWidget key={d} domain={d} P={P} today={today} mode="full" />
          ))}
        </div>
      </div>

      <EntropySection P={P} today={today} />
      <EnergySection P={P} today={today} />
      <InertiaSection P={P} today={today} />
      <ResonanceSection P={P} />
    </div>
  );
}

function EntropySection({ P, today }: { P: Projection; today: Date }) {
  const entropy = measureOrgEntropy(P, today);
  return (
    <div>
      <SectionTitle eyebrow="Part 2 · Law 2" title="Organizational entropy" desc={entropy.label} />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Stat label="Composite entropy" value={`${entropy.compositeEntropy}%`} sub={entropy.interpretation} />
        </div>
        <div className="mt-4 space-y-2">
          {entropy.indicators.map((i) => (
            <div key={i.name} className="rounded-lg border border-slate-100 px-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{i.name}</span>
                <span className="font-mono text-slate-600">{(i.value * 100).toFixed(1)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, i.value * 100)}%` }} />
              </div>
              <div className="mt-1 text-xs text-slate-500">{i.description}</div>
              <div className="text-[11px] text-slate-400">source: {i.source}</div>
            </div>
          ))}
          {entropy.indicators.length === 0 && <p className="text-sm text-slate-500">Not enough data to compute entropy indicators yet.</p>}
        </div>
      </Card>
    </div>
  );
}

function EnergySection({ P, today }: { P: Projection; today: Date }) {
  const energy = computeLeadershipEnergyBudget(P, today);
  return (
    <div>
      <SectionTitle eyebrow="Part 2 · Law 3" title="Leadership energy budget" desc={energy.label} />
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Stat label="Sources" value={`+${energy.sourceEnergy}`} sub={`${energy.wins} wins (30d) × 3, + positive culture signals × 1`} />
          <Stat label="Drains" value={`-${energy.drainEnergy}`} sub="sev≥4 findings ×2, overdue commitments ×1.5, blocked pipelines (30d) ×1" />
          <Stat label="Balance" value={`${energy.balance >= 0 ? "+" : ""}${energy.balance}`} />
          <Stat label="Assessment" value={<span className="text-base">{energy.assessment}</span>} />
        </div>
      </Card>
    </div>
  );
}

function InertiaSection({ P, today }: { P: Projection; today: Date }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processCount, setProcessCount] = useState(1);
  const [desc, setDesc] = useState("Change 1:1 cadence from biweekly to weekly");

  const processIds = useMemo(() => Array.from({ length: processCount }, (_, i) => `proc-${i}`), [processCount]);
  const result = useMemo(() => computeChangePhysics(desc, Array.from(selected), processIds, P, today), [desc, selected, processIds, P, today]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <SectionTitle eyebrow="Part 2 · Law 1" title="Organizational inertia" desc="F = m × a. Pick who and how much process a hypothetical change touches; the system estimates mass and weeks-to-embed from your actual tenure and event-frequency data." />
      <Card>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">Change description</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />

        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">People affected ({selected.size})</div>
            <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-100 p-2">
              {P.people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span>
                    {p.name} <span className="text-slate-400">— {p.title}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Processes changed</div>
            <input
              type="number"
              min={0}
              max={10}
              value={processCount}
              onChange={(e) => setProcessCount(Math.max(0, Math.min(10, Number(e.target.value))))}
              className="mt-1 w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-2 text-xs text-slate-500">Each assumed ~4 months old, per the brief's heuristic.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
          <Stat label="Mass" value={result.mass} sub={`mean tenure ${result.meanTenureMonths}mo`} />
          <Stat label="Weeks to embed" value={Number.isFinite(result.weeksToEmbed) ? result.weeksToEmbed : "∞"} sub={`${result.eventsPerWeek} events/wk of leadership attention`} />
          <Stat label="Confidence" value={<Badge color="amber">{result.confidence}</Badge>} />
        </div>
        <p className="mt-3 text-xs text-slate-500">{result.label}</p>
      </Card>
    </div>
  );
}

function ResonanceSection({ P }: { P: Projection }) {
  return (
    <div>
      <SectionTitle eyebrow="Part 2 · Law 4" title="Resonance dashboard" desc="Is a behavior becoming more frequent (amplifying), rarer (fading), or holding steady (stable)? First-half vs second-half weekly frequency, per event type." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RESONANCE_WATCHLIST.map((type) => {
          const r = measureResonance(type, P);
          return (
            <Card key={type}>
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm text-slate-800">{type}</div>
                {r ? (
                  r.direction === "AMPLIFYING" ? (
                    <Badge color="indigo">↑ AMPLIFYING</Badge>
                  ) : r.direction === "FADING" ? (
                    <Badge color="amber">↓ FADING</Badge>
                  ) : (
                    <Badge color="slate">● STABLE</Badge>
                  )
                ) : (
                  <Badge color="slate">insufficient data</Badge>
                )}
              </div>
              {r ? (
                <div className="mt-2 text-xs text-slate-500">
                  <div>
                    {r.firstHalfFreqPerWeek}/wk → {r.secondHalfFreqPerWeek}/wk (×{r.changeRatio ?? "–"})
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">{r.label}</div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Fewer than 6 events logged — resonance needs at least 6 to split into two halves meaningfully.</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
