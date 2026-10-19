"use client";

import { useEffect, useState, useCallback } from "react";

interface DomainRow {
  key: string;
  label: string;
  currentScore: number;
  velocity: number;
  direction: "improving" | "degrading" | "stable";
  projectedIn14d: number;
  projectedIn30d: number;
  confidenceLevel: "high" | "medium" | "low";
  eventCount: number;
}

interface FindingRow {
  key: string;
  domain: string;
  sev: number;
  title: string;
  rule: string;
  confidence: number;
  basis: string;
  scoreMath: string;
  suggestedPlaybook: string | null;
  amplificationFactor?: number;
}

interface CascadeRow {
  link: string;
  fromFiring: { ruleId: string };
  toFiring: { ruleId: string };
  confidence: number;
  amplificationFactor: number;
  intervention: string;
}

interface CockpitData {
  ok: boolean;
  now: string;
  eventCount: number;
  domains: DomainRow[];
  orgHealthScore: number;
  riskProfile: "green" | "yellow" | "amber" | "red" | "critical";
  dominantDomain: string;
  physicsSummary: string;
  uncertaintyCount: number;
  orgPhysics: {
    entropy: { compositeEntropy: number; interpretation: string; label: string };
    energyBudget: { balance: number; assessment: string; label: string };
    resonance: { eventType: string; direction: string; label: string } | null;
    changePhysics: { weeksToEmbed: number; mass: number; label: string };
  };
  topFindings: FindingRow[];
  totalFindings: number;
  cascades: CascadeRow[];
  hypotheses: { id: string; claim: string; resolveBy: string }[];
}

const RISK_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-yellow-400",
  amber: "bg-amber-500",
  red: "bg-red-500",
  critical: "bg-red-700",
};

const SEV_COLORS: Record<number, string> = {
  5: "border-red-500/60 bg-red-500/10 text-red-300",
  4: "border-amber-500/60 bg-amber-500/10 text-amber-300",
  3: "border-sky-500/50 bg-sky-500/10 text-sky-300",
  2: "border-slate-500/50 bg-slate-500/10 text-slate-300",
  1: "border-slate-600/50 bg-slate-600/10 text-slate-400",
};

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "improving") return <span className="text-emerald-400">▲</span>;
  if (direction === "degrading") return <span className="text-red-400">▼</span>;
  return <span className="text-slate-500">▬</span>;
}

export default function CockpitDashboard() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningCycle, setRunningCycle] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cockpit", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "failed to load cockpit");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  async function triggerCycle() {
    setRunningCycle(true);
    try {
      await fetch("/api/autonomous/run", { method: "POST" });
      await load();
    } finally {
      setRunningCycle(false);
    }
  }

  if (loading && !data) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Booting the intelligence brain…</div>;
  }

  if (error && !data) {
    return <div className="flex min-h-screen items-center justify-center text-red-400">Error: {error}</div>;
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Lead<span className="text-emerald-400">OS</span>{" "}
              <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Event-Sourced Intelligence Brain
              </span>
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {data.eventCount} events · as of {new Date(data.now).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${RISK_COLORS[data.riskProfile]}`} />
              <span className="text-sm font-semibold uppercase tracking-wide">{data.riskProfile}</span>
            </div>
            <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm">
              Org health <span className="font-bold text-white">{data.orgHealthScore}</span>/100
            </div>
            <button
              onClick={triggerCycle}
              disabled={runningCycle}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {runningCycle ? "Running…" : "Run autonomous cycle"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <p className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          {data.physicsSummary} Dominant domain of concern: <span className="font-semibold text-white">{data.dominantDomain}</span>. {data.uncertaintyCount}{" "}
          finding(s) have confidence &lt; 0.5.
        </p>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Domain metrics — 8 domains, live velocity</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.domains.map((d) => (
              <div key={d.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{d.label}</div>
                  <DirectionIcon direction={d.direction} />
                </div>
                <div className="mt-2 text-2xl font-bold">{d.currentScore.toFixed(1)}<span className="text-sm text-slate-500">/10</span></div>
                <div className="mt-1 text-[11px] text-slate-500">
                  velocity {d.velocity >= 0 ? "+" : ""}
                  {d.velocity.toFixed(3)}/d · 14d→{d.projectedIn14d.toFixed(1)} · 30d→{d.projectedIn30d.toFixed(1)}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">{d.eventCount} events/90d</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold uppercase ${
                      d.confidenceLevel === "high" ? "bg-emerald-500/15 text-emerald-300" : d.confidenceLevel === "medium" ? "bg-amber-500/15 text-amber-300" : "bg-slate-700/40 text-slate-400"
                    }`}
                  >
                    {d.confidenceLevel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Top findings ({data.totalFindings} active across 48 rules)
            </h2>
            <div className="space-y-2">
              {data.topFindings.length === 0 && <div className="text-sm text-slate-500">No findings firing right now.</div>}
              {data.topFindings.map((f) => (
                <div key={f.key} className={`rounded-lg border px-4 py-3 ${SEV_COLORS[f.sev] ?? SEV_COLORS[1]}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                      <span className="rounded bg-black/30 px-1.5 py-0.5">{f.rule}</span>
                      <span>{f.domain}</span>
                      <span>sev {f.sev}</span>
                      {f.amplificationFactor && f.amplificationFactor > 1 && (
                        <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-fuchsia-300">×{f.amplificationFactor.toFixed(2)} cascade</span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">conf {Math.round(f.confidence * 100)}%</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-100">{f.title}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{f.scoreMath}{f.suggestedPlaybook ? ` · playbook: ${f.suggestedPlaybook}` : ""}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Org physics</h2>
            <div className="space-y-3">
              <PhysicsCard title="Entropy (Law 2)" value={`${data.orgPhysics.entropy.compositeEntropy}%`} sub={data.orgPhysics.entropy.interpretation} label={data.orgPhysics.entropy.label} />
              <PhysicsCard
                title="Leadership energy (Law 3)"
                value={data.orgPhysics.energyBudget.balance.toString()}
                sub={data.orgPhysics.energyBudget.assessment}
                label={data.orgPhysics.energyBudget.label}
              />
              <PhysicsCard
                title="Resonance (Law 4)"
                value={data.orgPhysics.resonance?.direction ?? "n/a"}
                sub={data.orgPhysics.resonance ? data.orgPhysics.resonance.eventType : "insufficient data"}
                label={data.orgPhysics.resonance?.label ?? "Needs 6+ events of one watched type."}
              />
              <PhysicsCard
                title="Change inertia (Law 1)"
                value={Number.isFinite(data.orgPhysics.changePhysics.weeksToEmbed) ? `${data.orgPhysics.changePhysics.weeksToEmbed}w` : "∞"}
                sub={`mass ${data.orgPhysics.changePhysics.mass}`}
                label={data.orgPhysics.changePhysics.label}
              />
            </div>

            <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">Causal cascades ({data.cascades.length})</h2>
            <div className="space-y-2">
              {data.cascades.length === 0 && <div className="text-sm text-slate-500">No active cross-domain cascades detected.</div>}
              {data.cascades.map((c) => (
                <div key={c.link} className="rounded-lg border border-fuchsia-800/40 bg-fuchsia-500/5 px-3 py-2 text-xs">
                  <div className="font-semibold text-fuchsia-300">
                    {c.link}: {c.fromFiring.ruleId} → {c.toFiring.ruleId} (×{c.amplificationFactor.toFixed(2)}, conf {Math.round(c.confidence * 100)}%)
                  </div>
                  <div className="mt-1 text-slate-400">{c.intervention}</div>
                </div>
              ))}
            </div>

            <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-400">Open hypotheses</h2>
            <div className="space-y-2">
              {data.hypotheses.slice(0, 5).map((h) => (
                <div key={h.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                  {h.claim}
                  <div className="mt-1 text-slate-500">resolve by {new Date(h.resolveBy).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-500">
          Self-tests: <a className="underline hover:text-slate-300" href="/api/brain-health" target="_blank" rel="noreferrer">/api/brain-health</a> ·{" "}
          Raw log: <a className="underline hover:text-slate-300" href="/api/events" target="_blank" rel="noreferrer">/api/events</a> ·{" "}
          Full intelligence: <a className="underline hover:text-slate-300" href="/api/intelligence" target="_blank" rel="noreferrer">/api/intelligence</a>
        </footer>
      </main>
    </div>
  );
}

function PhysicsCard({ title, value, sub, label }: { title: string; value: string; sub: string; label: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      <div className="text-xs text-slate-400">{sub}</div>
      <div className="mt-2 text-[10px] italic leading-relaxed text-slate-600">{label}</div>
    </div>
  );
}
