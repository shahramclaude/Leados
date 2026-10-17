import { useMemo, useState } from "react";
import type { AppState } from "../lib/types";
import { buildFindings } from "../lib/engine";
import { shannonEntropy, mutualInformation, signalToNoise, identifyBottlenecks } from "../lib/infoTheory";
import { Card, Label, Stat, Bar, Badge } from "./ui";

function entropyBand(normalized: number) {
  if (normalized < 0.4) return { name: "RIGID", color: "from-sky-400 to-sky-600", note: "Low variety of event types — predictable, possibly over-controlled." };
  if (normalized > 0.8) return { name: "CHAOTIC", color: "from-rose-400 to-rose-600", note: "High variety with little dominant pattern — may indicate thrash." };
  return { name: "ADAPTIVE", color: "from-emerald-400 to-emerald-600", note: "Enough variety to adapt without losing coherent identity." };
}

export function ThermodynamicsView({ state }: { state: AppState }) {
  const findings = useMemo(() => buildFindings(state), [state]);
  const entropy = useMemo(() => shannonEntropy(state.events), [state.events]);
  const bottleneck = useMemo(() => identifyBottlenecks(state.events, state.people), [state.events, state.people]);
  const snr = useMemo(() => signalToNoise(state.events, findings), [state.events, findings]);
  const band = entropyBand(entropy.normalized);

  const [personA, setPersonA] = useState(state.people[0]?.id);
  const [personB, setPersonB] = useState(state.people[1]?.id ?? state.people[0]?.id);

  const mi = useMemo(() => {
    const streamA = state.events.filter((e) => e.personId === personA);
    const streamB = state.events.filter((e) => e.personId === personB);
    return mutualInformation(streamA, streamB, new Date(), 90);
  }, [state.events, personA, personB]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Thermodynamics</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Information theory applied to the synthetic event log. Organizations are open systems that stay organized by
          importing energy (attention, talent, information) and exporting entropy (decisions made, problems solved). This
          panel measures the information side of that exchange — nothing more.
        </p>
      </div>

      <Card
        title="Shannon Entropy of Event Mix"
        subtitle="H = −Σ p(x)·log₂ p(x), over the distribution of event types"
        right={<Badge tone={band.name === "ADAPTIVE" ? "emerald" : band.name === "CHAOTIC" ? "rose" : "indigo"}>{band.name}</Badge>}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="H (bits)" value={entropy.H.toFixed(2)} />
          <Stat label="H max (bits)" value={entropy.Hmax.toFixed(2)} />
          <Stat label="Normalized" value={`${(entropy.normalized * 100).toFixed(0)}%`} />
          <Stat label="Distinct types" value={String(entropy.richness)} />
        </div>
        <div className="mt-4">
          <Bar value={entropy.normalized} max={1} color={band.color} />
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>rigid</span>
            <span>adaptive</span>
            <span>chaotic</span>
          </div>
        </div>
        <Label>
          Dominant event type: <code className="rounded bg-slate-800 px-1 py-0.5">{entropy.dominantType ?? "n/a"}</code>. {band.note}
        </Label>
        <Label>
          <strong className="text-slate-400">Disclosed limit:</strong> the 40% / 80% band cutoffs are this delivery's own
          illustrative convention, not a validated organizational-science threshold.
        </Label>
      </Card>

      <Card title="Mutual Information Between Two People's Activity" subtitle="I(X;Y) = H(X) + H(Y) − H(X,Y), binned weekly">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <PersonPicker label="Person A" people={state.people} value={personA} onChange={setPersonA} />
          <span className="text-slate-600">↔</span>
          <PersonPicker label="Person B" people={state.people} value={personB} onChange={setPersonB} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="MI (bits)" value={mi.MI.toFixed(2)} />
          <Stat label="H(A)" value={mi.HX.toFixed(2)} />
          <Stat label="H(B)" value={mi.HY.toFixed(2)} />
          <Stat label="Weeks compared" value={String(mi.weeksCompared)} />
        </div>
        <div className="mt-4">
          <Bar value={mi.normalized} max={1} color="from-indigo-400 to-fuchsia-500" />
        </div>
        <Label>{mi.label}</Label>
      </Card>

      <Card title="Information Bottlenecks" subtitle="People whose logged 'information in' is under 30% of the roster mean">
        {bottleneck.bottlenecks.length === 0 ? (
          <p className="text-sm text-slate-400">No one falls under the 30%-of-mean threshold right now.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {bottleneck.bottlenecks.map((b) => (
              <li key={b.person.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-200">{b.person.name}</div>
                  <div className="text-xs text-slate-500">{b.person.role}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-slate-300">{b.informationIn} events in</div>
                  <div className="text-xs text-rose-400">{b.percentOfMean}% of mean</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Label>{bottleneck.label}</Label>
      </Card>

      <Card title="Signal-to-Noise Ratio" subtitle="Signal = events within ±2 days of an active finding in the same category/person. Noise = everything else.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Signal events" value={String(snr.signalCount)} />
          <Stat label="Noise events" value={String(snr.noiseCount)} />
          <Stat label="SNR" value={snr.snr.toFixed(2)} />
          <Stat label="SNR (dB)" value={`${snr.snrDb.toFixed(1)} dB`} />
        </div>
        <div className="mt-4">
          <Bar value={Math.min(snr.snr, 3)} max={3} color="from-cyan-400 to-blue-500" />
        </div>
        <Label>{snr.interpretation}</Label>
        <Label>{snr.label}</Label>
      </Card>
    </div>
  );
}

function PersonPicker({ label, people, value, onChange }: { label: string; people: { id: string; name: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      {label}
      <select className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200" value={value} onChange={(e) => onChange(e.target.value)}>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
