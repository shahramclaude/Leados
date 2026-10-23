"use client";

import { useState } from "react";
import { EvidenceChip } from "@/components/EvidenceChip";
import { MethodBadge } from "@/components/MethodBadge";

interface OrgOption {
  id: number;
  name: string;
}

interface BenchmarkResponse {
  target: { id: number; name: string };
  metric: string;
  peerGroup: {
    method: string;
    featureWeights: Record<string, number>;
    k: number;
    rationale: string;
    peers: OrgOption[];
  };
  benchmark: {
    orgValue: number;
    percentile: number | null;
    sampleSize: number;
    methodBadge: string;
    lowSample: boolean;
    evidenceClass: "model_estimate";
  };
}

const METRICS = ["growthRateYoy", "grossMarginPct", "revenueUsd", "headcount"];

export function PeerBenchmarkExplorer({ orgs, defaultOrgId }: { orgs: OrgOption[]; defaultOrgId: number }) {
  const [orgId, setOrgId] = useState(defaultOrgId);
  const [metric, setMetric] = useState("growthRateYoy");
  const [k, setK] = useState(5);
  const [weights, setWeights] = useState<Record<string, number>>({
    revenueUsd: 1,
    headcount: 1,
    growthRateYoy: 1,
    grossMarginPct: 1,
  });
  const [result, setResult] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        orgId: String(orgId),
        metric,
        k: String(k),
        weights: JSON.stringify(weights),
      });
      const res = await fetch(`/api/benchmark?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Benchmark failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Org</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={orgId}
              onChange={(e) => setOrgId(Number(e.target.value))}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Metric</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Peer group size (k)</label>
            <input
              type="number"
              min={2}
              max={20}
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-600">
            Peer-similarity feature weights (editable — the peer definition is never hidden)
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            {Object.keys(weights).map((feature) => (
              <div key={feature}>
                <label className="block text-[11px] text-slate-500">{feature}</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={weights[feature]}
                  onChange={(e) => setWeights((w) => ({ ...w, [feature]: Number(e.target.value) }))}
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={run}
          disabled={loading}
          className="mt-5 rounded-full bg-violet-700 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {loading ? "Computing..." : "Compute benchmark"}
        </button>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      </div>

      {result ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-950">
              {result.target.name} — {result.metric}
            </h3>
            <EvidenceChip evidenceClass={result.benchmark.evidenceClass} sourceRef="peer-group percentile model" />
          </div>

          <div className="mt-3 flex items-center gap-3">
            <MethodBadge label={result.benchmark.methodBadge} />
            {result.benchmark.lowSample ? (
              <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                low-sample warning
              </span>
            ) : null}
          </div>

          <p className="mt-4 text-2xl font-semibold text-violet-700">
            {result.benchmark.percentile !== null ? `${result.benchmark.percentile}th percentile` : "Percentile withheld"}
          </p>
          <p className="text-sm text-slate-500">
            Org value: {result.benchmark.orgValue} · Peer sample size: {result.benchmark.sampleSize}
          </p>

          <div className="mt-5">
            <h4 className="text-sm font-semibold text-slate-800">Peer definition (fully visible)</h4>
            <p className="mt-1 text-xs text-slate-500">{result.peerGroup.rationale}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {result.peerGroup.peers.map((p) => (
                <li key={p.id} className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                  {p.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
