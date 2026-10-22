"use client";

import { useEffect, useState } from "react";
import { ProcessShell, ProvenanceBanner } from "@/components/processMining/ProcessShell";
import { formatDuration, formatNumber, formatPct } from "@/components/processMining/format";

interface OverviewData {
  ok: boolean;
  error?: string;
  provenance?: string;
  reconstructionReport?: {
    totalRawEvents: number;
    totalCases: number;
    ambiguousCases: number;
    openCases: number;
    issueCounts: Record<string, number>;
  };
  metrics?: {
    caseCount: number;
    cycleTimeMsAvg: number;
    cycleTimeMsP50: number;
    cycleTimeMsP85: number;
    throughputPerDay: number;
    firstPassYield: number | null;
    reworkRate: number;
    slaAttainment: number | null;
    slaInstrumented: boolean;
  };
  model?: { activities: string[]; edges: unknown[]; caseCount: number };
  bottlenecks?: { activity: string; p85QueueMs: number; flagged: boolean }[];
  conformanceMined?: { conformanceRate: number; caseCount: number };
  conformanceDeclared?: { conformanceRate: number; caseCount: number } | null;
  cycleTimeControlChart?: { points: { outOfControl: boolean }[] };
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (processName: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/process-mining/overview?processName=${encodeURIComponent(processName)}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProcessShell onProcessChange={load}>
      {() => (
        <div>
          {loading && <p className="text-sm text-slate-500">Running mining pipeline…</p>}
          {!loading && data && !data.ok && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {data.error} — use the &ldquo;Seed demo data&rdquo; button above.
            </div>
          )}
          {!loading && data?.ok && (
            <>
              <ProvenanceBanner text={data.provenance ?? ""} />

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="Cases reconstructed" value={String(data.reconstructionReport?.totalCases ?? 0)} />
                <Stat
                  label="Ambiguous reconstructions"
                  value={String(data.reconstructionReport?.ambiguousCases ?? 0)}
                  sub="overlapping/shared correlation ids"
                />
                <Stat label="Open (no end observed)" value={String(data.reconstructionReport?.openCases ?? 0)} />
                <Stat label="Distinct activities" value={String(data.model?.activities.length ?? 0)} />

                <Stat label="Avg cycle time" value={formatDuration(data.metrics?.cycleTimeMsAvg ?? 0)} />
                <Stat label="P85 cycle time" value={formatDuration(data.metrics?.cycleTimeMsP85 ?? 0)} />
                <Stat label="Throughput / day" value={formatNumber(data.metrics?.throughputPerDay ?? 0)} />
                <Stat label="Rework rate" value={formatPct(data.metrics?.reworkRate ?? 0)} />

                <Stat
                  label="Conformance (mined model)"
                  value={formatPct(data.conformanceMined?.conformanceRate ?? null)}
                  sub="statistical — rare path ≠ wrong"
                />
                <Stat
                  label="Conformance (declared)"
                  value={data.conformanceDeclared ? formatPct(data.conformanceDeclared.conformanceRate) : "no reference"}
                  sub="rule violations only"
                />
                <Stat
                  label="SLA attainment"
                  value={data.metrics?.slaInstrumented ? formatPct(data.metrics.slaAttainment) : "not instrumented"}
                />
                <Stat
                  label="Cycle-time drift (control chart)"
                  value={`${data.cycleTimeControlChart?.points.filter((p) => p.outOfControl).length ?? 0} out-of-control periods`}
                />
              </div>

              <section className="mt-8">
                <h2 className="text-lg font-semibold text-slate-900">Top wait-time offenders</h2>
                <p className="text-sm text-slate-600">Ranked by p85 queue wait. Full root-cause drill is on the Bottleneck Board.</p>
                <ul className="mt-3 space-y-2">
                  {(data.bottlenecks ?? []).slice(0, 5).map((b) => (
                    <li key={b.activity} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-2">
                      <span className="font-medium text-slate-800">{b.activity}</span>
                      <span className={`rounded px-2 py-0.5 text-sm ${b.flagged ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                        p85 wait {formatDuration(b.p85QueueMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </ProcessShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}
