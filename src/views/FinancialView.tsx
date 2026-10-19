"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BurnTrend,
  CostAttributionReport,
  Domain,
  FinancialEvent,
  RunwayDistribution,
} from "@/lib/financialOS";
import type { RunwayDistribution as WorkerRunwayDistribution, RunwayParams } from "@/workers/monteCarloWorker";

export interface FinancialApiResponse {
  runway: RunwayDistribution;
  costAttribution: CostAttributionReport;
  financialHealthScore: number;
  latestPLEvent: FinancialEvent | null;
  burnTrend: BurnTrend;
  currentCashBalance: number;
  baselineMonthlyRevenue: number;
  baselineRevenueGrowthRate: number;
  monthlyBurnMean: number;
  monthlyBurnStdDev: number;
  orchestrator: {
    overallHealthScore: number;
    pillarsIncluded: string[];
  };
  generatedAt: string;
}

const DOMAIN_COLORS: Record<Domain, string> = {
  engineering: "#2563eb",
  product: "#7c3aed",
  design: "#db2777",
  sales: "#059669",
  marketing: "#d97706",
  operations: "#0891b2",
  finance: "#4338ca",
  people: "#be123c",
  other: "#64748b",
};

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function healthScoreColor(score: number): string {
  if (score >= 80) return "#059669";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function bucketColor(bucketMonths: number): string {
  if (bucketMonths < 6) return "#dc2626"; // red
  if (bucketMonths < 12) return "#f59e0b"; // amber
  if (bucketMonths < 18) return "#eab308"; // yellow
  return "#16a34a"; // green
}

function RunwayHistogram({ histogram, height = 140 }: { histogram: RunwayDistribution["histogram"]; height?: number }) {
  const maxCount = Math.max(1, ...histogram.map((b) => b.count));
  const width = Math.max(240, histogram.length * 26);
  const barWidth = 18;

  return (
    <svg viewBox={`0 0 ${width} ${height + 24}`} width="100%" height={height + 24} role="img" aria-label="Runway distribution histogram">
      {histogram.map((b, i) => {
        const barHeight = (b.count / maxCount) * height;
        const x = i * 26;
        const y = height - barHeight;
        return (
          <g key={b.bucketMonths}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={bucketColor(b.bucketMonths)} rx={2}>
              <title>{`${b.bucketMonths}-${b.bucketMonths + 3} months: ${b.count} paths`}</title>
            </rect>
            <text x={x + barWidth / 2} y={height + 14} fontSize={9} textAnchor="middle" fill="#475569">
              {b.bucketMonths}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({
  byDomain,
  onHover,
}: {
  byDomain: CostAttributionReport["byDomain"];
  onHover: (domain: Domain | null) => void;
}) {
  const entries = (Object.entries(byDomain) as [Domain, { headcount: number; estimatedCost: number }][]).filter(
    ([, v]) => v.headcount > 0,
  );
  const total = entries.reduce((sum, [, v]) => sum + v.estimatedCost, 0) || 1;

  const radius = 60;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;

  return (
    <svg viewBox="0 0 160 160" width={200} height={200} role="img" aria-label="Burn attribution donut chart">
      <g transform="translate(80,80) rotate(-90)">
        {entries.map(([domain, v]) => {
          const fraction = v.estimatedCost / total;
          const dash = fraction * circumference;
          const dashArray = `${dash} ${circumference - dash}`;
          const dashOffset = -cumulative * circumference;
          cumulative += fraction;
          return (
            <circle
              key={domain}
              r={radius}
              cx={0}
              cy={0}
              fill="transparent"
              stroke={DOMAIN_COLORS[domain]}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              onMouseEnter={() => onHover(domain)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: "pointer", transition: "opacity 0.15s" }}
            >
              <title>{`${domain}: ${v.headcount} people, ${formatUsd(v.estimatedCost)}/mo`}</title>
            </circle>
          );
        })}
      </g>
    </svg>
  );
}

interface WhatIf {
  burnChangePct: number; // -50..50
  revenueGrowthRate: number; // e.g. -0.05..0.20
  headcountDelta: number; // -20..20
}

export default function FinancialView({ initial }: { initial: FinancialApiResponse }) {
  const [report] = useState(initial);
  const [hoverDomain, setHoverDomain] = useState<Domain | null>(null);

  const [whatIf, setWhatIf] = useState<WhatIf>({
    burnChangePct: 0,
    revenueGrowthRate: report.baselineRevenueGrowthRate,
    headcountDelta: 0,
  });

  const [liveRunway, setLiveRunway] = useState<WorkerRunwayDistribution | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/monteCarloWorker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerRunwayDistribution>) => {
      if (event.data.requestId !== requestIdRef.current) return; // stale response, ignore
      setLiveRunway(event.data);
      setIsRecalculating(false);
    };
    return () => {
      worker.terminate();
    };
  }, []);

  const averageCostPerHead = useMemo(() => {
    const headcount = Object.values(report.costAttribution.byDomain).reduce((s, d) => s + d.headcount, 0);
    return headcount > 0 ? report.costAttribution.totalBurn / headcount : 12_000;
  }, [report]);

  useEffect(() => {
    if (!workerRef.current) return;
    setIsRecalculating(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      const adjustedBurnMean = Math.max(
        0,
        report.monthlyBurnMean * (1 + whatIf.burnChangePct / 100) + whatIf.headcountDelta * averageCostPerHead,
      );
      const params: RunwayParams = {
        currentBalance: report.currentCashBalance,
        monthlyBurnMean: adjustedBurnMean,
        monthlyBurnStdDev: report.monthlyBurnStdDev,
        expectedMonthlyRevenue: report.baselineMonthlyRevenue,
        revenueGrowthRate: whatIf.revenueGrowthRate,
        n: 3000,
        seed: 42,
        requestId,
      };
      workerRef.current?.postMessage(params);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [whatIf, report, averageCostPerHead]);

  const displayedRunway = liveRunway ?? report.runway;
  const isWhatIfActive =
    whatIf.burnChangePct !== 0 || whatIf.headcountDelta !== 0 || whatIf.revenueGrowthRate !== report.baselineRevenueGrowthRate;

  const domainRows = (Object.entries(report.costAttribution.byDomain) as [Domain, { headcount: number; estimatedCost: number }][])
    .filter(([, v]) => v.headcount > 0)
    .sort((a, b) => b[1].estimatedCost - a[1].estimatedCost);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Financial Intelligence OS</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Runway, Burn &amp; Scenario Planning</h1>
            <p className="mt-1 text-sm text-slate-600">
              Generated {new Date(report.generatedAt).toLocaleString()} · Monte Carlo n=5,000 (seeded, reproducible)
            </p>
          </div>
          <div
            className="rounded-2xl bg-white px-6 py-4 text-right shadow-[0_12px_30px_rgba(16,24,40,0.1)]"
            style={{ borderTop: `4px solid ${healthScoreColor(report.financialHealthScore)}` }}
          >
            <p className="m-0 text-xs uppercase tracking-wide text-slate-500">Financial Health Score</p>
            <p className="m-0 text-5xl font-bold" style={{ color: healthScoreColor(report.financialHealthScore) }}>
              {report.financialHealthScore}
            </p>
            <p className="m-0 text-xs text-slate-500">burn trend: {report.burnTrend}</p>
          </div>
        </header>

        {/* RUNWAY PANEL */}
        <section className="grid grid-cols-1 gap-6 rounded-3xl bg-white p-8 shadow-[0_12px_30px_rgba(16,24,40,0.08)] lg:grid-cols-2">
          <div>
            <h2 className="m-0 text-lg font-semibold text-slate-900">Cash Runway (Monte Carlo)</h2>
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-5xl font-bold text-slate-950">{displayedRunway.p50RunwayMonths.toFixed(1)}</span>
              <span className="text-lg text-slate-600">months (median)</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              90% confidence band: {displayedRunway.p10RunwayMonths.toFixed(1)}–{displayedRunway.p90RunwayMonths.toFixed(1)} months
            </p>

            <div
              className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: displayedRunway.pathsBelow6Months > 0.1 ? "#fee2e2" : "#dcfce7",
                color: displayedRunway.pathsBelow6Months > 0.1 ? "#b91c1c" : "#166534",
              }}
            >
              {(displayedRunway.pathsBelow6Months * 100).toFixed(1)}% of simulated paths hit critical (&lt;6mo)
            </div>

            <div className="mt-4 flex gap-4 text-sm text-slate-600">
              <span>P(runway ≥ 12mo): {(displayedRunway.probabilityOfRunwayAbove12Months * 100).toFixed(0)}%</span>
              <span>P(runway ≥ 18mo): {(displayedRunway.probabilityOfRunwayAbove18Months * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div>
            <h3 className="m-0 text-sm font-semibold text-slate-700">Distribution of outcomes across simulated paths</h3>
            <div className="mt-2">
              <RunwayHistogram histogram={displayedRunway.histogram} />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
              <span><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#dc2626" }} /> &lt;6mo</span>
              <span><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} /> 6–12mo</span>
              <span><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#eab308" }} /> 12–18mo</span>
              <span><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#16a34a" }} /> 18mo+</span>
            </div>
          </div>
        </section>

        {/* BURN ATTRIBUTION */}
        <section className="rounded-3xl bg-white p-8 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <h2 className="m-0 text-lg font-semibold text-slate-900">Burn Attribution by Domain</h2>
          <p className="mt-1 text-sm text-slate-600">
            Total estimated monthly headcount cost: <strong>{formatUsd(report.costAttribution.totalBurn)}</strong>
            {report.costAttribution.containsEstimatedCosts && (
              <span className="ml-2 text-xs italic text-amber-600">
                (includes role-based estimates where salary isn&apos;t on file — unverified)
              </span>
            )}
          </p>

          <div className="mt-6 flex flex-col items-center gap-8 lg:flex-row lg:items-start">
            <div className="relative flex flex-col items-center">
              <DonutChart byDomain={report.costAttribution.byDomain} onHover={setHoverDomain} />
              <div className="mt-2 min-h-[3rem] text-center text-sm text-slate-700">
                {hoverDomain ? (
                  <>
                    <strong className="capitalize">{hoverDomain}</strong>
                    <br />
                    {report.costAttribution.byDomain[hoverDomain].headcount} people ·{" "}
                    {formatUsd(report.costAttribution.byDomain[hoverDomain].estimatedCost)}/mo
                  </>
                ) : (
                  <span className="text-slate-400">Hover a slice for details</span>
                )}
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Domain</th>
                    <th className="py-2 pr-4">Headcount</th>
                    <th className="py-2 pr-4">Monthly Cost</th>
                    <th className="py-2 pr-4">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {domainRows.map(([domain, v]) => (
                    <tr key={domain} className="border-b border-slate-100">
                      <td className="py-2 pr-4">
                        <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: DOMAIN_COLORS[domain] }} />{" "}
                        <span className="capitalize align-middle">{domain}</span>
                      </td>
                      <td className="py-2 pr-4">{v.headcount}</td>
                      <td className="py-2 pr-4">{formatUsd(v.estimatedCost)}</td>
                      <td className="py-2 pr-4">
                        {report.costAttribution.totalBurn > 0
                          ? ((v.estimatedCost / report.costAttribution.totalBurn) * 100).toFixed(1)
                          : "0.0"}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 className="mt-6 text-sm font-semibold text-slate-700">Top Cost Centers</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {report.costAttribution.topCostCenters.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span>{c.name}</span>
                    <span className="flex items-center gap-1">
                      {formatUsd(c.cost)}
                      <span
                        aria-label={`trend ${c.trend}`}
                        style={{ color: c.trend === "up" ? "#dc2626" : c.trend === "down" ? "#16a34a" : "#64748b" }}
                      >
                        {c.trend === "up" ? "▲" : c.trend === "down" ? "▼" : "→"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* WHAT-IF PANEL */}
        <section className="rounded-3xl bg-white p-8 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-lg font-semibold text-slate-900">What-If Scenario Modeling</h2>
            {isRecalculating && <span className="text-xs text-slate-500">recalculating…</span>}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Runs client-side in a Web Worker (n=3,000 paths, 300ms debounce) so dragging sliders never freezes the UI.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <label className="block text-sm text-slate-700">
              Monthly burn change: <strong>{whatIf.burnChangePct > 0 ? "+" : ""}{whatIf.burnChangePct}%</strong>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={whatIf.burnChangePct}
                onChange={(e) => setWhatIf((w) => ({ ...w, burnChangePct: Number(e.target.value) }))}
                className="mt-2 w-full"
              />
            </label>

            <label className="block text-sm text-slate-700">
              Revenue growth rate: <strong>{(whatIf.revenueGrowthRate * 100).toFixed(1)}%/mo</strong>
              <input
                type="range"
                min={-0.05}
                max={0.2}
                step={0.005}
                value={whatIf.revenueGrowthRate}
                onChange={(e) => setWhatIf((w) => ({ ...w, revenueGrowthRate: Number(e.target.value) }))}
                className="mt-2 w-full"
              />
            </label>

            <label className="block text-sm text-slate-700">
              Headcount change: <strong>{whatIf.headcountDelta > 0 ? "+" : ""}{whatIf.headcountDelta} people</strong>
              <input
                type="range"
                min={-20}
                max={20}
                step={1}
                value={whatIf.headcountDelta}
                onChange={(e) => setWhatIf((w) => ({ ...w, headcountDelta: Number(e.target.value) }))}
                className="mt-2 w-full"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() =>
              setWhatIf({ burnChangePct: 0, revenueGrowthRate: report.baselineRevenueGrowthRate, headcountDelta: 0 })
            }
            className="mt-4 rounded-full border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Reset to baseline
          </button>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="m-0 text-xs uppercase text-slate-500">P10</p>
                <p className="m-0 text-2xl font-bold text-slate-900">{displayedRunway.p10RunwayMonths.toFixed(1)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="m-0 text-xs uppercase text-slate-500">P50</p>
                <p className="m-0 text-2xl font-bold text-slate-900">{displayedRunway.p50RunwayMonths.toFixed(1)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="m-0 text-xs uppercase text-slate-500">P90</p>
                <p className="m-0 text-2xl font-bold text-slate-900">{displayedRunway.p90RunwayMonths.toFixed(1)}</p>
              </div>
            </div>
            <div>
              <RunwayHistogram histogram={displayedRunway.histogram} height={110} />
            </div>
          </div>

          {isWhatIfActive && (
            <p className="mt-4 text-xs text-slate-500">
              Showing live what-if scenario vs. baseline P50 of {report.runway.p50RunwayMonths.toFixed(1)} months.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
