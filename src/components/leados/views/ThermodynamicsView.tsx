"use client";

import { useMemo } from "react";
import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import StatTile from "../ui/StatTile";
import GaugeArc from "../ui/GaugeArc";
import Badge from "../ui/Badge";
import useSimulatedLoad from "../ui/useSimulatedLoad";
import { findings, domains } from "@/lib/leados/data";
import { domainLabel } from "../ui/tokens";

function shannonEntropy(counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const entropy = counts.reduce((acc, c) => {
    if (c === 0) return acc;
    const p = c / total;
    return acc - p * Math.log2(p);
  }, 0);
  const maxEntropy = Math.log2(counts.length || 1);
  return maxEntropy === 0 ? 0 : (entropy / maxEntropy) * 100;
}

export default function ThermodynamicsView() {
  const loading = useSimulatedLoad();

  const { entropyPct, snr, bottlenecks, byDomain } = useMemo(() => {
    const active = findings.filter((f) => f.status !== "resolved");
    const counts = domains.map((d) => active.filter((f) => f.domain === d).length);
    const entropy = shannonEntropy(counts);
    const signal = active.filter((f) => f.severity === "sev4" || f.severity === "sev5").length;
    const noise = active.length - signal;
    const ratio = noise === 0 ? signal : signal / Math.max(noise, 1);
    const sorted = domains
      .map((d, i) => ({ domain: d, count: counts[i] }))
      .sort((a, b) => b.count - a.count);
    return { entropyPct: entropy, snr: ratio, bottlenecks: sorted.slice(0, 2), byDomain: sorted };
  }, []);

  return (
    <div>
      <PageHeader
        title="Thermodynamics"
        subtitle="Shannon entropy of active findings, signal-to-noise ratio, and information bottlenecks."
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Entropy" subtitle="Distribution across domains" dense>
            <div className="flex justify-center py-2">
              <GaugeArc value={entropyPct} label="Entropy %" colorStops={[[40, "var(--sev2)"], [70, "var(--sev3)"], [100, "var(--sev5)"]]} />
            </div>
            <p className="mt-2 text-center" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>
              Higher entropy means findings are spread evenly — lower means concentrated in one domain.
            </p>
          </Panel>

          <StatTile
            label="Signal-to-Noise Ratio"
            value={snr.toFixed(2)}
            unit="x"
            status={snr >= 1 ? "yellow" : "green"}
            deltaDir={snr >= 1 ? "up" : "flat"}
            delta={snr >= 1 ? "elevated" : "stable"}
            tooltip="Ratio of sev4+ findings to all other active findings."
          />

          <Panel title="Bottlenecks" subtitle="Highest-concentration domains" dense>
            <ul className="flex flex-col gap-2">
              {bottlenecks.map((b) => (
                <li key={b.domain} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
                  <Badge variant={b.domain} size="sm" label={domainLabel[b.domain]} />
                  <span className="font-data" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>
                    {b.count} active
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <Panel title="Domain Activation" subtitle="Active finding count by domain" className="mt-4">
        <div className="flex flex-col gap-2">
          {byDomain.map((d) => {
            const max = Math.max(...byDomain.map((x) => x.count), 1);
            const pct = (d.count / max) * 100;
            return (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>
                  {domainLabel[d.domain]}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--border-subtle)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--accent-indigo)" }} />
                </div>
                <span className="font-data w-6 text-right" style={{ color: "var(--text-primary)", fontSize: "var(--fs-xs)" }}>
                  {d.count}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
