"use client";

// src/views/FinancialView.tsx
//
// Financial Nervous System dashboard (/financial).
//
// NOTE ON "trend arrows": Part 5's API does not persist a historical time
// series of computed health scores (only raw metric_values), so there is
// no true "value a month ago" to diff against for the four headline KPIs.
// The arrows below are therefore a status indicator (good/neutral/bad
// relative to the same design-parameter thresholds used server-side in
// financialOS.ts), not a literal day-over-day trend. This simplification
// is intentional and disclosed here rather than faked with invented
// history.

import { useEffect, useMemo, useState } from "react";
import type {
  FinancialIntelligenceReport,
  MonteCarloPath,
  RunwayDistribution,
} from "@/lib/types";

type HealthColor = "red" | "amber" | "green" | "gray";

const COLOR_CLASSES: Record<HealthColor, { text: string; bg: string; ring: string; dot: string }> = {
  red: { text: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200", dot: "bg-rose-500" },
  amber: { text: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200", dot: "bg-amber-500" },
  green: { text: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  gray: { text: "text-slate-500", bg: "bg-slate-50", ring: "ring-slate-200", dot: "bg-slate-400" },
};

function fmtUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtNum(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtPct(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function runwayHealth(p50: number): HealthColor {
  if (p50 < 6) return "red";
  if (p50 < 12) return "amber";
  return "green";
}

function ltvCacHealth(ratio: number | null): HealthColor {
  if (ratio === null) return "gray";
  if (ratio >= 3) return "green";
  if (ratio >= 2) return "amber";
  return "red";
}

function burnMultipleHealth(bm: number | null): HealthColor {
  if (bm === null) return "gray";
  if (bm < 1.5) return "green";
  if (bm < 2) return "amber";
  return "red";
}

function ruleOf40Health(score: number | null): HealthColor {
  if (score === null) return "gray";
  if (score >= 40) return "green";
  if (score >= 25) return "amber";
  return "red";
}

function TrendArrow({ color }: { color: HealthColor }) {
  const glyph = color === "green" ? "▲" : color === "red" ? "▼" : "►";
  return <span className={`text-sm ${COLOR_CLASSES[color].text}`}>{glyph}</span>;
}

function Badge({ color, children }: { color: HealthColor; children: React.ReactNode }) {
  const c = COLOR_CLASSES[color];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Runway panel visuals
// ---------------------------------------------------------------------------

const PROBABILITY_BAR_MAX_MONTHS = 60;

function ProbabilityBar({ runway, accent }: { runway: RunwayDistribution; accent: boolean }) {
  const clamp = (m: number) => Math.max(0, Math.min(PROBABILITY_BAR_MAX_MONTHS, m));
  const pct = (m: number) => (clamp(m) / PROBABILITY_BAR_MAX_MONTHS) * 100;

  const redStart = pct(runway.p10);
  const redEnd = pct(runway.p25);
  const amberEnd = pct(runway.p75);
  const greenEnd = pct(runway.p95);
  const p50pct = pct(runway.p50);

  return (
    <div className="relative mt-4 h-10 w-full rounded-lg bg-slate-100">
      {/* p10 -> p25 : red gradient */}
      <div
        className="absolute inset-y-0 rounded-l-lg bg-gradient-to-r from-rose-400 to-rose-300"
        style={{ left: `${redStart}%`, width: `${Math.max(0, redEnd - redStart)}%` }}
      />
      {/* p25 -> p75 : amber gradient */}
      <div
        className="absolute inset-y-0 bg-gradient-to-r from-amber-300 to-amber-400"
        style={{ left: `${redEnd}%`, width: `${Math.max(0, amberEnd - redEnd)}%` }}
      />
      {/* p75 -> p95 : green gradient */}
      <div
        className="absolute inset-y-0 rounded-r-lg bg-gradient-to-r from-emerald-300 to-emerald-500"
        style={{ left: `${amberEnd}%`, width: `${Math.max(0, greenEnd - amberEnd)}%` }}
      />
      {/* p50 vertical marker */}
      <div
        className={`absolute inset-y-[-6px] w-[2px] ${accent ? "bg-sky-600" : "bg-slate-900"}`}
        style={{ left: `${p50pct}%` }}
      />
      <div
        className="absolute -top-7 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-slate-700"
        style={{ left: `${p50pct}%` }}
      >
        {accent ? "Simulated" : "Most likely"}: {Math.round(runway.p50)}mo
      </div>
      <div className="absolute -bottom-5 left-0 text-[10px] text-slate-400">0mo</div>
      <div className="absolute -bottom-5 right-0 text-[10px] text-slate-400">
        {PROBABILITY_BAR_MAX_MONTHS}mo
      </div>
    </div>
  );
}

const PATH_CHART_WIDTH = 640;
const PATH_CHART_HEIGHT = 220;
const PATH_CHART_PAD = 28;

function PathChart({ paths, accent }: { paths: MonteCarloPath[]; accent: boolean }) {
  const maxMonth = Math.max(
    1,
    ...paths.map((p) => p.monthly[p.monthly.length - 1]?.month ?? 0)
  );
  const maxCash = Math.max(
    1,
    ...paths.flatMap((p) => p.monthly.map((m) => Math.max(0, m.cash)))
  );

  const xScale = (month: number) =>
    PATH_CHART_PAD + (month / maxMonth) * (PATH_CHART_WIDTH - 2 * PATH_CHART_PAD);
  const yScale = (cash: number) =>
    PATH_CHART_HEIGHT -
    PATH_CHART_PAD -
    (Math.max(0, cash) / maxCash) * (PATH_CHART_HEIGHT - 2 * PATH_CHART_PAD);

  const dangerZoneX2 = xScale(Math.min(12, maxMonth));

  // Order of `paths` is [p10, p25, p50, p75, p90] per financialOS.ts
  // pickRepresentativePaths(). Colors per spec: p10 red, p50 white (on
  // dark track so we use near-black for contrast on a light background —
  // rendered as slate-900), p90 green, the other two gray.
  const colorFor = (index: number) => {
    if (accent) {
      // When showing a simulated scenario, highlight everything in blue
      // tones per spec ("highlighted in blue").
      if (index === 0) return "#be123c"; // still flag the worst case in red
      if (index === 2) return "#0369a1"; // median path in blue
      if (index === 4) return "#0ea5e9";
      return "#93c5fd";
    }
    if (index === 0) return "#e11d48"; // p10 red
    if (index === 2) return "#0f172a"; // p50 "white" line rendered dark for contrast
    if (index === 4) return "#059669"; // p90 green
    return "#94a3b8"; // p25 / p75 gray
  };

  return (
    <svg
      viewBox={`0 0 ${PATH_CHART_WIDTH} ${PATH_CHART_HEIGHT}`}
      className="mt-2 w-full rounded-lg bg-slate-900/95"
      role="img"
      aria-label="Five representative Monte Carlo cash paths"
    >
      {/* Danger zone: shade x-axis below month 12 */}
      <rect
        x={PATH_CHART_PAD}
        y={PATH_CHART_PAD}
        width={Math.max(0, dangerZoneX2 - PATH_CHART_PAD)}
        height={PATH_CHART_HEIGHT - 2 * PATH_CHART_PAD}
        fill="#f43f5e"
        opacity={0.12}
      />
      <text x={PATH_CHART_PAD + 4} y={PATH_CHART_HEIGHT - 8} fill="#fca5a5" fontSize={10}>
        Danger zone (&lt; 12mo)
      </text>

      {/* zero line */}
      <line
        x1={PATH_CHART_PAD}
        x2={PATH_CHART_WIDTH - PATH_CHART_PAD}
        y1={yScale(0)}
        y2={yScale(0)}
        stroke="#334155"
        strokeWidth={1}
      />

      {paths.map((path, idx) => {
        const points = path.monthly
          .map((m) => `${xScale(m.month)},${yScale(m.cash)}`)
          .join(" ");
        return (
          <polyline
            key={path.pathId}
            points={points}
            fill="none"
            stroke={colorFor(idx)}
            strokeWidth={idx === 2 ? 2.5 : 1.5}
            opacity={idx === 2 ? 1 : 0.85}
          />
        );
      })}

      <text x={PATH_CHART_PAD} y={14} fill="#cbd5e1" fontSize={10}>
        Cash balance over time (5 representative simulated paths)
      </text>
    </svg>
  );
}

function RunwayPanel({
  runway,
  simulated,
}: {
  runway: RunwayDistribution;
  simulated: RunwayDistribution | null;
}) {
  const active = simulated ?? runway;
  return (
    <div
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        simulated ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Runway Distribution</h2>
        {simulated && <Badge color="gray">Showing simulated scenario</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {active.probabilityCritical > 0
          ? `${Math.round(active.probabilityCritical * 100)}% of simulated paths run out of cash within 6 months.`
          : "No simulated paths run out of cash within 6 months."}{" "}
        {Math.round(active.probabilityComfortable * 100)}% stay comfortable past 18 months.
      </p>
      <ProbabilityBar runway={active} accent={Boolean(simulated)} />
      <div className="mt-8">
        <PathChart paths={active.topPaths} accent={Boolean(simulated)} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-500 sm:grid-cols-7">
        <div>
          <div className="font-semibold text-slate-800">{Math.round(active.p5)}</div>p5
        </div>
        <div>
          <div className="font-semibold text-slate-800">{Math.round(active.p10)}</div>p10
        </div>
        <div>
          <div className="font-semibold text-slate-800">{Math.round(active.p25)}</div>p25
        </div>
        <div>
          <div className="font-semibold text-slate-800">{Math.round(active.p50)}</div>p50
        </div>
        <div>
          <div className="font-semibold text-slate-800">{Math.round(active.p75)}</div>p75
        </div>
        <div>
          <div className="font-semibold text-slate-800">{Math.round(active.p90)}</div>p90
        </div>
        <div>
          <div className="font-semibold text-slate-800">{Math.round(active.p95)}</div>p95
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fundraising readiness gauge
// ---------------------------------------------------------------------------

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return ["M", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

function ReadinessGauge({ score }: { score: number }) {
  const cx = 110;
  const cy = 110;
  const r = 90;
  const angle = -90 + (Math.min(100, Math.max(0, score)) / 100) * 180;
  const color = score >= 70 ? "#059669" : score >= 40 ? "#d97706" : "#e11d48";

  return (
    <svg viewBox="0 0 220 130" className="mx-auto w-full max-w-[260px]">
      <path d={describeArc(cx, cy, r, -90, 90)} stroke="#e2e8f0" strokeWidth={16} fill="none" />
      <path d={describeArc(cx, cy, r, -90, angle)} stroke={color} strokeWidth={16} fill="none" strokeLinecap="round" />
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={36} fontWeight={700} fill="#0f172a">
        {Math.round(score)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#64748b">
        readiness / 100
      </text>
    </svg>
  );
}

const RAISE_LABELS: Record<string, { label: string; color: HealthColor }> = {
  raise_now: { label: "Raise now", color: "red" },
  raise_in_3_months: { label: "Raise in ~3 months", color: "amber" },
  raise_in_6_months: { label: "Raise in ~6 months", color: "amber" },
  not_ready: { label: "Not ready to raise", color: "red" },
  no_need: { label: "No need to raise", color: "green" },
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

interface SimForm {
  burnRate: string;
  revenue: string;
  revenueGrowth: string; // percent, e.g. "3" for 3%
  cashBalance: string;
}

export default function FinancialView() {
  const [report, setReport] = useState<FinancialIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [simOpen, setSimOpen] = useState(false);
  const [form, setForm] = useState<SimForm>({
    burnRate: "",
    revenue: "",
    revenueGrowth: "0",
    cashBalance: "",
  });
  const [simulated, setSimulated] = useState<RunwayDistribution | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/financial");
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data: FinancialIntelligenceReport = await res.json();
        if (cancelled) return;
        setReport(data);
        setForm({
          burnRate: String(data.latestMetrics.burn_rate?.value ?? 150000),
          revenue: String(data.latestMetrics.monthly_revenue?.value ?? 0),
          revenueGrowth: "3",
          cashBalance: String(data.latestMetrics.cash_balance?.value ?? 1800000),
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const headline = useMemo(() => {
    if (!report) return null;
    const { runway, unitEconomics } = report;
    return [
      {
        key: "runway",
        label: "Median Runway",
        value: `${Math.round(runway.p50)} mo`,
        color: runwayHealth(runway.p50),
      },
      {
        key: "ltvcac",
        label: "LTV : CAC",
        value: unitEconomics.ltvCacRatio !== null ? `${unitEconomics.ltvCacRatio.toFixed(1)}x` : "—",
        color: ltvCacHealth(unitEconomics.ltvCacRatio),
      },
      {
        key: "burnmult",
        label: "Burn Multiple",
        value: unitEconomics.burnMultiple !== null ? `${unitEconomics.burnMultiple.toFixed(1)}x` : "—",
        color: burnMultipleHealth(unitEconomics.burnMultiple),
      },
      {
        key: "ruleof40",
        label: "Rule of 40",
        value: unitEconomics.ruleOf40Score !== null ? unitEconomics.ruleOf40Score.toFixed(0) : "—",
        color: ruleOf40Health(unitEconomics.ruleOf40Score),
      },
    ];
  }, [report]);

  async function runSimulation() {
    setSimError(null);
    const burnRate = Number(form.burnRate);
    const revenue = Number(form.revenue);
    const revenueGrowthPct = Number(form.revenueGrowth);
    const cashBalance = Number(form.cashBalance);
    const revenueGrowth = revenueGrowthPct / 100;

    if (!Number.isFinite(burnRate) || burnRate <= 0) {
      setSimError("Monthly burn must be a positive number.");
      return;
    }
    if (!Number.isFinite(revenue) || revenue < 0) {
      setSimError("Monthly revenue must be zero or a positive number.");
      return;
    }
    if (!Number.isFinite(cashBalance) || cashBalance <= 0) {
      setSimError("Starting cash balance must be a positive number.");
      return;
    }
    if (!Number.isFinite(revenueGrowth) || revenueGrowth < -0.5 || revenueGrowth > 0.5) {
      setSimError("Revenue growth rate must be between -50% and 50%.");
      return;
    }

    try {
      setSimLoading(true);
      const res = await fetch("/api/financial/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ burnRate, revenue, revenueGrowth, cashBalance }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSimError(data.error ?? "Simulation failed.");
        return;
      }
      setSimulated(data as RunwayDistribution);
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "Simulation failed.");
    } finally {
      setSimLoading(false);
    }
  }

  function resetToActuals() {
    if (!report) return;
    setSimulated(null);
    setSimError(null);
    setForm({
      burnRate: String(report.latestMetrics.burn_rate?.value ?? 150000),
      revenue: String(report.latestMetrics.monthly_revenue?.value ?? 0),
      revenueGrowth: "3",
      cashBalance: String(report.latestMetrics.cash_balance?.value ?? 1800000),
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-6xl text-slate-500">Loading financial intelligence…</div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-6xl rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          Failed to load financial data{error ? `: ${error}` : ""}.
        </div>
      </main>
    );
  }

  const { unitEconomics, fundraisingReadiness } = report;
  const raiseInfo = RAISE_LABELS[fundraisingReadiness.raiseNowOrWait];

  const ueRows: { label: string; value: string; color: HealthColor }[] = [
    { label: "CAC", value: fmtUsd(unitEconomics.cac), color: "gray" },
    { label: "LTV", value: fmtUsd(unitEconomics.ltv), color: "gray" },
    { label: "LTV : CAC", value: unitEconomics.ltvCacRatio !== null ? `${fmtNum(unitEconomics.ltvCacRatio)}x` : "—", color: ltvCacHealth(unitEconomics.ltvCacRatio) },
    { label: "Payback (months)", value: fmtNum(unitEconomics.paybackMonths), color: unitEconomics.paybackMonths === null ? "gray" : unitEconomics.paybackMonths <= 12 ? "green" : "amber" },
    { label: "Gross Margin", value: fmtPct(unitEconomics.grossMargin), color: unitEconomics.grossMargin === null ? "gray" : unitEconomics.grossMargin >= 70 ? "green" : "amber" },
    { label: "Net Revenue Retention", value: fmtPct(unitEconomics.netRevenueRetention), color: unitEconomics.netRevenueRetention === null ? "gray" : unitEconomics.netRevenueRetention >= 100 ? "green" : "red" },
    { label: "ARPU", value: fmtUsd(unitEconomics.arpu), color: "gray" },
    { label: "Burn Multiple", value: unitEconomics.burnMultiple !== null ? `${fmtNum(unitEconomics.burnMultiple)}x` : "—", color: burnMultipleHealth(unitEconomics.burnMultiple) },
    { label: "Rule of 40", value: unitEconomics.ruleOf40Score !== null ? unitEconomics.ruleOf40Score.toFixed(0) : "—", color: ruleOf40Health(unitEconomics.ruleOf40Score) },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Financial Nervous System
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Financial Intelligence</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generated {new Date(report.generatedAt).toLocaleString()} · Overall health score{" "}
            <span className="font-semibold text-slate-700">{report.financialHealthScore}/100</span> · Financial
            risk posterior <span className="font-semibold text-slate-700">{(report.financialRiskPosterior * 100).toFixed(0)}%</span>
          </p>
        </header>

        {/* TOP ROW — 4 headline numbers */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {headline?.map((h) => (
            <div key={h.key} className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{h.label}</p>
                <TrendArrow color={h.color} />
              </div>
              <p className={`mt-2 text-3xl font-bold ${COLOR_CLASSES[h.color].text}`}>{h.value}</p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* RUNWAY PANEL */}
          <div className="lg:col-span-2">
            <RunwayPanel runway={report.runway} simulated={simulated} />
          </div>

          {/* FUNDRAISING READINESS */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Fundraising Readiness</h2>
            <ReadinessGauge score={fundraisingReadiness.readinessScore} />
            <div className="flex justify-center">
              <Badge color={raiseInfo.color}>{raiseInfo.label}</Badge>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-1 flex items-center gap-1 font-semibold text-emerald-700">
                  <span>✓</span> Strengths
                </p>
                <ul className="space-y-1 text-slate-600">
                  {fundraisingReadiness.strengthSignals.length === 0 && <li className="text-slate-400">None yet</li>}
                  {fundraisingReadiness.strengthSignals.map((s, i) => (
                    <li key={i} className="flex gap-1">
                      <span className="text-emerald-500">●</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1 font-semibold text-rose-700">
                  <span>✗</span> Weaknesses
                </p>
                <ul className="space-y-1 text-slate-600">
                  {fundraisingReadiness.weaknessSignals.length === 0 && <li className="text-slate-400">None flagged</li>}
                  {fundraisingReadiness.weaknessSignals.map((s, i) => (
                    <li key={i} className="flex gap-1">
                      <span className="text-rose-500">●</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Optimal raise window:{" "}
              <span className="font-semibold text-slate-900">
                {fundraisingReadiness.optimalRaiseWindowMonths} months from now
              </span>
            </p>

            {fundraisingReadiness.diligenceRisks.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  What diligence will probe
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-500">
                  {fundraisingReadiness.diligenceRisks.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* UNIT ECONOMICS TABLE */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Unit Economics</h2>
            <Badge
              color={
                unitEconomics.unitEconomicsHealth === "strong"
                  ? "green"
                  : unitEconomics.unitEconomicsHealth === "adequate"
                    ? "amber"
                    : unitEconomics.unitEconomicsHealth === "weak"
                      ? "red"
                      : "gray"
              }
            >
              Overall: {unitEconomics.unitEconomicsHealth}
            </Badge>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {ueRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-600">{row.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{row.value}</span>
                  <Badge color={row.color}>{row.color === "gray" ? "n/a" : row.color}</Badge>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* WHAT-IF SIMULATOR */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <button
            onClick={() => setSimOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <h2 className="text-lg font-semibold text-slate-900">What-If Simulator</h2>
            <span className="text-slate-400">{simOpen ? "▲ collapse" : "▼ expand"}</span>
          </button>

          {simOpen && (
            <div className="mt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <label className="text-sm text-slate-600">
                  Monthly burn (USD)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.burnRate}
                    onChange={(e) => setForm((f) => ({ ...f, burnRate: e.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Monthly revenue (USD)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.revenue}
                    onChange={(e) => setForm((f) => ({ ...f, revenue: e.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Revenue growth rate (%/mo)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.revenueGrowth}
                    onChange={(e) => setForm((f) => ({ ...f, revenueGrowth: e.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Starting cash balance (USD)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.cashBalance}
                    onChange={(e) => setForm((f) => ({ ...f, cashBalance: e.target.value }))}
                  />
                </label>
              </div>

              {simError && <p className="mt-3 text-sm text-rose-600">{simError}</p>}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={runSimulation}
                  disabled={simLoading}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
                >
                  {simLoading ? "Simulating…" : "Simulate"}
                </button>
                <button
                  onClick={resetToActuals}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Reset to actuals
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
