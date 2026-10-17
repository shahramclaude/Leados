import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { shannonEntropy, mutualInformation, signalToNoise, identifyBottlenecks } from "../lib/infoTheory";
import { Card, Label, Stat, Bar, Badge } from "./ui";

function entropyBand(normalized: number) {
  if (normalized < 0.4) return { name: "RIGID", tone: "sky" as const, note: "Low variety of event types — predictable, possibly over-controlled." };
  if (normalized < 0.8) return { name: "ADAPTIVE", tone: "emerald" as const, note: "Healthy variety of event types without chaos." };
  return { name: "CHAOTIC", tone: "rose" as const, note: "Very high variety — may indicate thrash or lack of focus." };
}

export function ThermodynamicsView({ state }: { state: AppState }) {
  const entropy = useMemo(() => shannonEntropy(state.events), [state.events]);
  const band = entropyBand(entropy.normalized);
  const snr = useMemo(() => signalToNoise(state.events), [state.events]);
  const bottlenecks = useMemo(() => identifyBottlenecks(state.events, state.roster.map((p) => p.id)), [state.events, state.roster]);

  const [personA, setPersonA] = useState(state.roster[0]?.id ?? "");
  const [personB, setPersonB] = useState(state.roster[1]?.id ?? "");
  const mi = useMemo(() => mutualInformation(state.events, personA, personB), [state.events, personA, personB]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Thermodynamics (Information Theory)</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Shannon entropy, mutual information, signal-to-noise ratio, and information bottlenecks computed over the synthetic in-browser
          event log. Disclosed limit: these are standard textbook formulas (Shannon, 1948) applied to a tiny synthetic dataset — not a
          validated organizational-science instrument.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Entropy of event log">
          <Stat label="Normalized entropy" value={`${Math.round(entropy.normalized * 100)}%`} tone={band.tone} />
          <div className="mt-2">
            <Badge tone={band.tone}>{band.name}</Badge>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{band.note}</p>
          <p className="mt-2 text-[11px] text-slate-600">Raw: {entropy.bits.toFixed(3)} bits. Disclosed convention: bands at 40%/80% are illustrative, not validated thresholds.</p>
        </Card>

        <Card title="Signal-to-noise ratio">
          <Stat label="Signal : noise" value={snr === Infinity ? "∞" : snr.toFixed(2)} tone={snr > 1 ? "emerald" : "amber"} />
          <p className="mt-2 text-[11px] text-slate-500">"Signal" = commit/review/ticket events. "Noise" = message/meeting events. A disclosed, simplified convention.</p>
        </Card>

        <Card title="Information bottlenecks">
          <Stat label="People below 30% of mean" value={bottlenecks.length} tone={bottlenecks.length > 0 ? "rose" : "emerald"} />
          {bottlenecks.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
              {bottlenecks.map((b) => {
                const person = state.roster.find((p) => p.id === b.personId);
                return (
                  <li key={b.personId}>
                    {person?.name ?? b.personId}: {b.informationIn} events ({Math.round(b.thresholdRatio * 100)}% of mean)
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">No one is currently below 30% of the team's mean event volume.</p>
          )}
        </Card>
      </div>

      <Card title="Mutual information between two people" subtitle="Estimated from hourly activity co-occurrence over the synthetic log.">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <Label>Person A</Label>
            <select value={personA} onChange={(e) => setPersonA(e.target.value)} className="mt-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">
              {state.roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Person B</Label>
            <select value={personB} onChange={(e) => setPersonB(e.target.value)} className="mt-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">
              {state.roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto">
            <Stat label="Mutual information" value={`${mi.toFixed(3)} bits`} tone="sky" />
          </div>
        </div>
        <div className="mt-3">
          <Bar value={mi} max={1} tone="sky" />
        </div>
      </Card>
    </div>
  );
}
