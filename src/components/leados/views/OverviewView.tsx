"use client";

import type { useIntelligence } from "@/hooks/useIntelligence";
import type { Finding } from "@/lib/intelligence";

const DOMAIN_COLOR: Record<string, string> = {
  people: "bg-sky-500",
  finance: "bg-amber-500",
  sales: "bg-emerald-500",
  ops: "bg-fuchsia-500",
  strategy: "bg-indigo-500",
};

const SEV_STYLE: Record<number, string> = {
  5: "border-rose-500/50 bg-rose-500/10 text-rose-200",
  4: "border-orange-500/50 bg-orange-500/10 text-orange-200",
  3: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  2: "border-slate-600/50 bg-slate-700/20 text-slate-300",
  1: "border-slate-700/50 bg-slate-800/20 text-slate-400",
};

function FindingCard({ f }: { f: Finding }) {
  return (
    <div className={`rounded-xl border p-4 ${SEV_STYLE[f.sev]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${DOMAIN_COLOR[f.domain] ?? "bg-slate-500"}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{f.domain}</span>
          <span className="rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">{f.rule}</span>
        </div>
        <span className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[11px] font-bold">SEV {f.sev}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{f.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{f.detail}</p>
    </div>
  );
}

export default function OverviewView({
  intelligence,
}: {
  intelligence: ReturnType<typeof useIntelligence>;
}) {
  const { data, loading, error, refetch } = intelligence;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Overview</h2>
          <p className="text-sm text-slate-400">Live intelligence across people, finance, sales, ops &amp; strategy.</p>
        </div>
        <button
          onClick={refetch}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-rose-900/40 p-3 text-sm text-rose-200">Failed to load: {error}</p>}
      {loading && !data && <p className="text-slate-400">Loading intelligence…</p>}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <StatCard label="People" value={data.counts.people} />
            <StatCard label="Events" value={data.counts.events} />
            <StatCard label="Findings" value={data.counts.findings} />
            <StatCard label="Critical (sev≥4)" value={data.counts.critical} accent="text-rose-300" />
            <StatCard label="Active Playbooks" value={data.activePlaybooks} accent="text-indigo-300" />
          </div>

          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Findings ({data.findings.length})
          </h3>
          {data.findings.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
              No findings right now — everything looks healthy. Seed demo data from the Activity tab or POST
              /api/seed.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {data.findings.map((f) => (
                <FindingCard key={f.key} f={f} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-white"}`}>{value}</p>
    </div>
  );
}
