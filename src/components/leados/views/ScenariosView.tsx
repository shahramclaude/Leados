"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  METRIC_DEFINITIONS,
  STRESSOR_CATALOG,
  type MetricKey,
  type Scenario,
  type ScenarioAssumption,
  type ScenarioComparison,
  type ScenarioResult,
  type ScenarioRisk,
  type ScenarioType,
  type Stressor,
} from "@/lib/scenarioEngine";
import type { CompetitorProfile, WargameResult } from "@/lib/wargameEngine";

// ---------------------------------------------------------------------------
// API payload types
// ---------------------------------------------------------------------------

interface ScenarioRow {
  id: string;
  name: string;
  description: string;
  type: ScenarioType;
  status: "draft" | "active" | "archived";
  assumptions: ScenarioAssumption[];
  variableOverrides: Partial<Record<MetricKey, number>>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  lastRunResult?: ScenarioResult | null;
}

interface WargameRow {
  id: string;
  title: string;
  description: string;
  context: string;
  ourMoves: { strategyText: string; moves: string[] };
  competitorMoves: CompetitorProfile[];
  outcomes: WargameResult | Record<string, never>;
  lessons: string;
  ranAt: string | null;
  createdAt: string;
}

type TopTab = "scenarios" | "wargame" | "stress";
type ScenarioMode = "list" | "builder" | "result" | "compare";

const TYPE_STYLES: Record<ScenarioType, string> = {
  base: "bg-slate-700/60 text-slate-200 border-slate-600",
  stress: "bg-rose-900/40 text-rose-300 border-rose-700",
  opportunity: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  crisis: "bg-red-900/50 text-red-300 border-red-700",
  competitive: "bg-indigo-900/40 text-indigo-300 border-indigo-700",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-800 text-slate-400 border-slate-700",
  active: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  archived: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-600",
};

const CHART_METRICS: MetricKey[] = ["revenue", "runwayMonths", "grossMargin", "marketShare", "employeeEngagement"];
const CHART_COLORS: Record<MetricKey, string> = {
  revenue: "#60a5fa",
  burnRate: "#f87171",
  cashBalance: "#34d399",
  runwayMonths: "#fbbf24",
  headcount: "#a78bfa",
  churnRate: "#fb7185",
  grossMargin: "#4ade80",
  marketShare: "#22d3ee",
  pipelineCoverage: "#f472b6",
  employeeEngagement: "#818cf8",
  nps: "#facc15",
};

function metricLabel(key: MetricKey): string {
  return METRIC_DEFINITIONS.find((m) => m.key === key)?.label ?? key;
}
function metricDef(key: MetricKey) {
  return METRIC_DEFINITIONS.find((m) => m.key === key)!;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "Never run";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtValue(key: MetricKey, value: number): string {
  const def = metricDef(key);
  if (def.unit === "$") return `$${Math.round(value).toLocaleString()}`;
  if (def.unit === "%") return `${value.toFixed(1)}%`;
  if (def.unit === "months") return `${value.toFixed(1)}mo`;
  if (def.unit === "x") return `${value.toFixed(1)}x`;
  return `${Math.round(value)}`;
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

function deriveScenarioInsights(result: ScenarioResult): string[] {
  const insights: string[] = [];
  const revenuePath = result.keyMetrics.revenue;
  const runwayPath = result.keyMetrics.runwayMonths;
  if (revenuePath) {
    const deltaPct = revenuePath.base[0] ? Math.round(((revenuePath.base[11] - revenuePath.base[0]) / revenuePath.base[0]) * 100) : 0;
    insights.push(`Revenue ${deltaPct >= 0 ? "grows" : "contracts"} ${Math.abs(deltaPct)}% over the 12-month horizon on the base path.`);
  }
  if (runwayPath) {
    const low = Math.min(...runwayPath.p10);
    insights.push(`Downside (p10) runway dips as low as ${low.toFixed(1)} months — ${low < 6 ? "a financing trigger point" : "within a manageable buffer"}.`);
  }
  const critical = result.riskEvents.filter((r) => r.severity === "critical" || r.severity === "high");
  if (critical.length > 0) {
    insights.push(`${critical.length} high/critical risk event(s) detected, first at month ${critical[0].month}: "${critical[0].title}".`);
  } else {
    insights.push("No high-severity thresholds are breached on the base path — this scenario is structurally resilient.");
  }
  insights.push(`Strategic flexibility score: ${result.flexibilityScore}/100 — ${result.flexibilityScore > 65 ? "ample room to adapt" : result.flexibilityScore > 35 ? "moderate room to maneuver" : "little room to absorb further shocks"}.`);
  return insights;
}

// ---------------------------------------------------------------------------
// Small shared UI atoms
// ---------------------------------------------------------------------------

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

function SectionCard({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", disabled, type = "button", className = "" }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  const styles: Record<string, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700",
    danger: "bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-800",
    ghost: "bg-transparent hover:bg-slate-800 text-slate-300",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Projection chart (multi-line + confidence band for a focus metric)
// ---------------------------------------------------------------------------

function ProjectionChart({ result, focusMetric }: { result: ScenarioResult; focusMetric: MetricKey }) {
  const w = 720;
  const h = 260;
  const pad = 32;
  const months = 12;

  const xFor = (i: number) => pad + (i / (months - 1)) * (w - pad * 2);
  const yFor = (v01: number) => h - pad - v01 * (h - pad * 2);

  function normalized(key: MetricKey, values: number[]): number[] {
    const def = metricDef(key);
    const [lo, hi] = def.normalRange;
    return values.map((v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))));
  }

  const lines = CHART_METRICS.map((key) => {
    const path = result.keyMetrics[key];
    if (!path) return null;
    const norm = normalized(key, path.base);
    const points = norm.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
    return { key, points, color: CHART_COLORS[key] };
  }).filter(Boolean) as { key: MetricKey; points: string; color: string }[];

  const focusPath = result.keyMetrics[focusMetric];
  const bandArea = focusPath
    ? (() => {
        const def = metricDef(focusMetric);
        const [lo, hi] = def.normalRange;
        const norm = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));
        const top = focusPath.p90.map((v, i) => `${xFor(i)},${yFor(norm(v))}`);
        const bottom = [...focusPath.p10.map((v, i) => `${xFor(i)},${yFor(norm(v))}`)].reverse();
        return [...top, ...bottom].join(" ");
      })()
    : null;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="rounded-lg bg-slate-950/60">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <line key={v} x1={pad} x2={w - pad} y1={yFor(v)} y2={yFor(v)} stroke="#1e293b" strokeWidth={1} />
        ))}
        {bandArea && <polygon points={bandArea} fill={CHART_COLORS[focusMetric]} fillOpacity={0.15} stroke="none" />}
        {lines.map((line) => (
          <polyline key={line.key} points={line.points} fill="none" stroke={line.color} strokeWidth={line.key === focusMetric ? 3 : 1.75} opacity={line.key === focusMetric ? 1 : 0.65} />
        ))}
        {Array.from({ length: months }).map((_, i) => (
          <text key={i} x={xFor(i)} y={h - 8} fontSize="9" fill="#64748b" textAnchor="middle">
            M{i + 1}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
        {lines.map((line) => (
          <span key={line.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: line.color }} />
            {metricLabel(line.key)}
            {line.key === focusMetric && <span className="text-slate-500">(p10–p90 band shown)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function RiskTimeline({ risks }: { risks: ScenarioRisk[] }) {
  if (risks.length === 0) {
    return <p className="text-xs text-slate-500">No modeled risk events on this scenario&apos;s base path.</p>;
  }
  const w = 720;
  const h = 70;
  const pad = 24;
  const xFor = (month: number) => pad + ((month - 1) / 11) * (w - pad * 2);

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="rounded-lg bg-slate-950/60">
        <line x1={pad} x2={w - pad} y1={h / 2} y2={h / 2} stroke="#334155" strokeWidth={2} />
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={xFor(i + 1)} x2={xFor(i + 1)} y1={h / 2 - 4} y2={h / 2 + 4} stroke="#334155" strokeWidth={1} />
        ))}
        {risks.map((r) => (
          <circle key={r.id} cx={xFor(r.month)} cy={h / 2} r={6} className={SEVERITY_STYLES[r.severity]} fill="currentColor">
            <title>{`M${r.month} · ${r.title}: ${r.description}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 space-y-1">
        {risks.slice(0, 6).map((r) => (
          <div key={r.id} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLES[r.severity]}`} />
            <span className="text-slate-400">
              <span className="font-semibold text-slate-200">M{r.month} · {r.title}</span> — {r.description}
            </span>
          </div>
        ))}
        {risks.length > 6 && <p className="text-[11px] text-slate-500">+ {risks.length - 6} more risk event(s)</p>}
      </div>
    </div>
  );
}

function heatColor(normalized: number): string {
  // 0 (bad, red) -> 50 (amber) -> 100 (good, green)
  const hue = Math.max(0, Math.min(120, (normalized / 100) * 120));
  return `hsl(${hue}, 65%, 28%)`;
}

// ---------------------------------------------------------------------------
// Scenario Builder
// ---------------------------------------------------------------------------

const METRIC_KEYS_ALL: MetricKey[] = METRIC_DEFINITIONS.map((m) => m.key);

function ScenarioBuilder({ onCreated, onCancel }: { onCreated: (row: ScenarioRow, result: ScenarioResult) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ScenarioType>("base");
  const [assumptions, setAssumptions] = useState<Omit<ScenarioAssumption, "id">[]>([
    { key: "revenue", type: "multiplier", value: 0, month: 1, description: "" },
  ]);
  const [overrides, setOverrides] = useState<Partial<Record<MetricKey, number>>>({});
  const [iterations, setIterations] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateAssumption(idx: number, patch: Partial<Omit<ScenarioAssumption, "id">>) {
    setAssumptions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  async function submit() {
    if (!name.trim()) {
      setError("Scenario name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ scenario: ScenarioRow; result: ScenarioResult }>("/api/scenarios", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          name,
          description,
          type,
          assumptions,
          variableOverrides: overrides,
          run: true,
          monteCarloIterations: iterations,
        }),
      });
      onCreated(res.scenario, res.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create scenario");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Scenario Builder" subtitle="Define baseline overrides and causal assumptions, then run a Monte Carlo projection.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="e.g. Aggressive expansion + recession overlap" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as ScenarioType)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            {(["base", "stress", "opportunity", "crisis", "competitive"] as ScenarioType[]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="What is this scenario testing for?" />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assumptions</h4>
          <Button variant="secondary" onClick={() => setAssumptions((prev) => [...prev, { key: "revenue", type: "multiplier", value: 0, month: 1, description: "" }])}>
            + Add assumption
          </Button>
        </div>
        <div className="space-y-2">
          {assumptions.map((a, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2 md:grid-cols-6">
              <select value={a.key} onChange={(e) => updateAssumption(idx, { key: e.target.value as MetricKey })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                {METRIC_KEYS_ALL.map((k) => (
                  <option key={k} value={k}>
                    {metricLabel(k)}
                  </option>
                ))}
              </select>
              <select value={a.type} onChange={(e) => updateAssumption(idx, { type: e.target.value as ScenarioAssumption["type"] })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
                <option value="override">override (set value)</option>
                <option value="multiplier">multiplier (% shift)</option>
                <option value="event">event (one-off shock)</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={a.value}
                onChange={(e) => updateAssumption(idx, { value: Number(e.target.value) })}
                placeholder={a.type === "override" ? "absolute value" : "fraction e.g. 0.2 = +20%"}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
              />
              <input
                type="number"
                min={1}
                max={12}
                value={a.month ?? 1}
                onChange={(e) => updateAssumption(idx, { month: Number(e.target.value) })}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                title="Month (1-12)"
              />
              <input
                value={a.description ?? ""}
                onChange={(e) => updateAssumption(idx, { description: e.target.value })}
                placeholder="description / rationale"
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 md:col-span-1"
              />
              <Button variant="ghost" onClick={() => setAssumptions((prev) => prev.filter((_, i) => i !== idx))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Variable overrides (immediate % shift at month 1)</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {METRIC_KEYS_ALL.filter((k) => !metricDef(k).derived).map((k) => (
            <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span>{metricLabel(k)}</span>
                <span className="font-mono text-slate-300">{Math.round((overrides[k] ?? 0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                value={Math.round((overrides[k] ?? 0) * 100)}
                onChange={(e) => setOverrides((prev) => ({ ...prev, [k]: Number(e.target.value) / 100 }))}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Monte Carlo iterations</label>
          <input type="number" min={100} max={20000} step={100} value={iterations} onChange={(e) => setIterations(Number(e.target.value))} className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Running…" : "Create & Run Scenario"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Scenario Result
// ---------------------------------------------------------------------------

function ScenarioResultView({ scenario, result, onBack }: { scenario: ScenarioRow; result: ScenarioResult; onBack: () => void }) {
  const [focusMetric, setFocusMetric] = useState<MetricKey>("runwayMonths");
  const insights = useMemo(() => deriveScenarioInsights(result), [result]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-100">{scenario.name}</h3>
            <Badge className={TYPE_STYLES[scenario.type]}>{scenario.type}</Badge>
          </div>
          <p className="text-xs text-slate-500">{scenario.description || "No description provided."}</p>
        </div>
        <Button variant="secondary" onClick={onBack}>
          ← Back to scenarios
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Expected outcome" value={`${result.expectedOutcomeScore}/100`} tone={result.expectedOutcomeScore >= 60 ? "good" : result.expectedOutcomeScore >= 40 ? "warn" : "bad"} />
        <StatTile label="Downside (p10) read" value={`${result.downsideScore}/100`} tone={result.downsideScore >= 60 ? "good" : result.downsideScore >= 40 ? "warn" : "bad"} />
        <StatTile label="Strategic flexibility" value={`${result.flexibilityScore}/100`} tone={result.flexibilityScore >= 60 ? "good" : result.flexibilityScore >= 40 ? "warn" : "bad"} />
        <StatTile label="Risk events" value={`${result.riskEvents.length}`} tone={result.riskEvents.length === 0 ? "good" : result.riskEvents.length < 4 ? "warn" : "bad"} />
      </div>

      <SectionCard
        title="12-month projection"
        subtitle="Base path (solid, normalized to each metric's healthy range), with p10–p90 confidence band for the focus metric."
        right={
          <select value={focusMetric} onChange={(e) => setFocusMetric(e.target.value as MetricKey)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
            {CHART_METRICS.map((k) => (
              <option key={k} value={k}>
                Focus: {metricLabel(k)}
              </option>
            ))}
          </select>
        }
      >
        <ProjectionChart result={result} focusMetric={focusMetric} />
      </SectionCard>

      <SectionCard title="Risk event timeline" subtitle="Thresholds breached on the base path, plus scheduled assumption shocks.">
        <RiskTimeline risks={result.riskEvents} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard title="Key insights">
          <ul className="space-y-2 text-xs text-slate-300">
            {insights.map((ins, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-indigo-400">▸</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title="Summary">
          <p className="text-xs leading-relaxed text-slate-300">{result.summary}</p>
        </SectionCard>
      </div>

      <SectionCard title="Month 12 — all tracked metrics">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {METRIC_KEYS_ALL.map((k) => {
            const path = result.keyMetrics[k];
            if (!path) return null;
            return (
              <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                <div className="text-[11px] text-slate-500">{metricLabel(k)}</div>
                <div className="text-sm font-semibold text-slate-100">{fmtValue(k, path.base[11])}</div>
                <div className="text-[10px] text-slate-500">
                  p10 {fmtValue(k, path.p10[11])} · p90 {fmtValue(k, path.p90[11])}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison view
// ---------------------------------------------------------------------------

function ComparisonView({ results, comparison, onBack }: { results: ScenarioResult[]; comparison: ScenarioComparison; onBack: () => void }) {
  const metrics: MetricKey[] = ["revenue", "runwayMonths", "grossMargin", "marketShare", "pipelineCoverage", "employeeEngagement", "nps", "churnRate"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-100">Scenario comparison</h3>
        <Button variant="secondary" onClick={onBack}>
          ← Back to scenarios
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile label="Best expected outcome" value={comparison.bestExpectedOutcome} tone="good" />
        <StatTile label="Lowest downside risk" value={comparison.lowestDownsideRisk} tone="good" />
        <StatTile label="Highest flexibility" value={comparison.highestFlexibility} tone="good" />
      </div>

      <SectionCard title="Ranking">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1">Rank</th>
              <th>Scenario</th>
              <th>Expected outcome</th>
              <th>Downside risk</th>
              <th>Flexibility</th>
            </tr>
          </thead>
          <tbody>
            {comparison.ranking.map((r) => (
              <tr key={r.scenarioId} className="border-t border-slate-800 text-slate-300">
                <td className="py-1.5">#{r.rank}</td>
                <td className="font-medium text-slate-100">{r.scenarioName}</td>
                <td>{r.expectedOutcomeScore}/100</td>
                <td>{r.downsideRisk}/100</td>
                <td>{r.flexibilityScore}/100</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <div className={`grid grid-cols-1 gap-3 md:grid-cols-${results.length}`}>
        {results.map((r) => (
          <SectionCard key={r.scenarioId} title={r.scenarioName} subtitle={r.scenarioType}>
            <div className="space-y-1 text-xs text-slate-300">
              {metrics.map((m) => (
                <div key={m} className="flex justify-between border-b border-slate-800/60 py-1">
                  <span className="text-slate-500">{metricLabel(m)}</span>
                  <span className="font-mono">{fmtValue(m, r.keyMetrics[m]?.base[11] ?? 0)}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="Trade-off matrix" subtitle="Month 12 values, normalized 0–100 against each metric's healthy range (green = favorable).">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-2">Metric</th>
                {comparison.scenarios.map((s) => (
                  <th key={s} className="px-2">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m}>
                  <td className="py-1 pr-2 text-slate-400">{metricLabel(m)}</td>
                  {comparison.scenarios.map((s) => {
                    const cell = comparison.tradeoffMatrix.find((c) => c.scenarioName === s && c.metric === m);
                    return (
                      <td key={s} className="px-2 py-1 text-center text-slate-100" style={{ background: cell ? heatColor(cell.normalized) : undefined }}>
                        {cell ? fmtValue(m, cell.value) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenarios tab (list + orchestration)
// ---------------------------------------------------------------------------

function ScenariosTab() {
  const [mode, setMode] = useState<ScenarioMode>("list");
  const [rows, setRows] = useState<ScenarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeScenario, setActiveScenario] = useState<{ scenario: ScenarioRow; result: ScenarioResult } | null>(null);
  const [compareData, setCompareData] = useState<{ results: ScenarioResult[]; comparison: ScenarioComparison } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ scenarios: ScenarioRow[] }>("/api/scenarios");
      setRows(data.scenarios);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  async function quickRun(row: ScenarioRow) {
    setBusyId(row.id);
    try {
      const res = await api<{ result: ScenarioResult }>("/api/scenarios", {
        method: "POST",
        body: JSON.stringify({ action: "run", scenarioId: row.id }),
      });
      setActiveScenario({ scenario: row, result: res.result });
      setMode("result");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusyId(null);
    }
  }

  async function runCompare() {
    if (selected.size < 2) return;
    try {
      const res = await api<{ results: ScenarioResult[]; comparison: ScenarioComparison }>("/api/scenarios", {
        method: "POST",
        body: JSON.stringify({ action: "compare", scenarioIds: Array.from(selected) }),
      });
      setCompareData(res);
      setMode("compare");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    }
  }

  async function removeScenario(id: string) {
    await api("/api/scenarios?id=" + id, { method: "DELETE" });
    load();
  }

  if (mode === "builder") {
    return (
      <ScenarioBuilder
        onCreated={(row, result) => {
          setActiveScenario({ scenario: row, result });
          setMode("result");
          load();
        }}
        onCancel={() => setMode("list")}
      />
    );
  }

  if (mode === "result" && activeScenario) {
    return <ScenarioResultView scenario={activeScenario.scenario} result={activeScenario.result} onBack={() => setMode("list")} />;
  }

  if (mode === "compare" && compareData) {
    return <ComparisonView results={compareData.results} comparison={compareData.comparison} onBack={() => setMode("list")} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Scenarios</h3>
          <p className="text-xs text-slate-500">Model futures by overriding baseline metrics and causal assumptions, then run a Monte Carlo projection.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={runCompare} disabled={selected.size < 2}>
            Compare selected ({selected.size})
          </Button>
          <Button onClick={() => setMode("builder")}>+ New scenario</Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {loading && <p className="text-xs text-slate-500">Loading scenarios…</p>}

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No scenarios yet. Create one to start modeling.</div>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} className="h-4 w-4" />
            <div className="min-w-[180px] flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">{row.name}</span>
                <Badge className={TYPE_STYLES[row.type]}>{row.type}</Badge>
                <Badge className={STATUS_STYLES[row.status]}>{row.status}</Badge>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{row.description || "No description"}</p>
            </div>
            <div className="text-xs text-slate-500">Last run: {fmtDate(row.lastRunAt)}</div>
            {row.lastRunResult && (
              <div className="text-xs text-slate-400">
                Score <span className="font-semibold text-slate-200">{row.lastRunResult.expectedOutcomeScore}/100</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (row.lastRunResult) {
                    setActiveScenario({ scenario: row, result: row.lastRunResult });
                    setMode("result");
                  } else {
                    quickRun(row);
                  }
                }}
              >
                {row.lastRunResult ? "View" : "Run"}
              </Button>
              <Button variant="secondary" onClick={() => quickRun(row)} disabled={busyId === row.id}>
                {busyId === row.id ? "Running…" : "Quick-run"}
              </Button>
              <Button variant="danger" onClick={() => removeScenario(row.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// War Room tab
// ---------------------------------------------------------------------------

function CompetitorEditor({ competitor, onChange, onRemove }: { competitor: CompetitorProfile; onChange: (c: CompetitorProfile) => void; onRemove: () => void }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <input value={competitor.name} onChange={(e) => onChange({ ...competitor, name: e.target.value })} className="w-1/2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm font-semibold text-slate-100" />
        <Button variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {(["aggressiveness", "riskTolerance", "capitalConstraint"] as const).map((field) => (
        <div key={field} className="mb-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="capitalize">{field.replace(/([A-Z])/g, " $1")}</span>
            <span className="font-mono text-slate-300">{Math.round(competitor[field] * 100)}%</span>
          </div>
          <input type="range" min={0} max={100} value={Math.round(competitor[field] * 100)} onChange={(e) => onChange({ ...competitor, [field]: Number(e.target.value) / 100 })} className="w-full" />
        </div>
      ))}
      <div className="mt-2 text-[11px] text-slate-500">
        <div>
          <span className="font-semibold text-slate-400">Likely moves:</span> {competitor.likelyMoves.join(", ") || "—"}
        </div>
        <div className="mt-1">
          <span className="font-semibold text-slate-400">Weaknesses:</span> {competitor.weaknesses.join("; ") || "—"}
        </div>
      </div>
    </div>
  );
}

function WarRoomTab() {
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [ourStrategy, setOurStrategy] = useState("");
  const [rounds, setRounds] = useState(5);
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [newCompName, setNewCompName] = useState("");
  const [newCompNotes, setNewCompNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WargameResult | null>(null);
  const [saved, setSaved] = useState<WargameRow[]>([]);

  const loadSaved = useCallback(async () => {
    try {
      const data = await api<{ wargames: WargameRow[] }>("/api/wargames");
      setSaved(data.wargames);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  async function addCompetitor() {
    if (!newCompName.trim()) return;
    try {
      const data = await api<{ profile: CompetitorProfile }>("/api/wargames", {
        method: "POST",
        body: JSON.stringify({ action: "generateProfile", name: newCompName, knownData: { notes: newCompNotes } }),
      });
      setCompetitors((prev) => [...prev, data.profile]);
      setNewCompName("");
      setNewCompNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate profile");
    }
  }

  async function run() {
    if (!title.trim() || !context.trim() || !ourStrategy.trim() || competitors.length === 0) {
      setError("Title, context, our strategy, and at least one competitor are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ result: WargameResult }>("/api/wargames", {
        method: "POST",
        body: JSON.stringify({ action: "run", title, description: "", context, ourStrategy, competitorProfiles: competitors, rounds }),
      });
      setResult(data.result);
      loadSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "War game run failed");
    } finally {
      setBusy(false);
    }
  }

  function loadFromSaved(row: WargameRow) {
    setTitle(row.title);
    setContext(row.context);
    setOurStrategy(row.ourMoves?.strategyText ?? "");
    setCompetitors(row.competitorMoves ?? []);
    if (row.outcomes && "rounds" in row.outcomes) setResult(row.outcomes as WargameResult);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">War Room</h3>
        <p className="text-xs text-slate-500">Model competitive exchanges round by round: we move, competitors counter based on their profile, outcomes score across market share, talent, capital, and momentum.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Setup">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">War game title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="e.g. Response to Acme's enterprise push" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Context</label>
              <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="Market situation, trigger event, stakes..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Our strategy</label>
              <textarea value={ourStrategy} onChange={(e) => setOurStrategy(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" placeholder="Describe the moves you're considering (pricing, hiring, partnerships, expansion...)" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-400">Rounds</label>
              <input type="number" min={1} max={10} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Competitor profiles" subtitle="Generated heuristically from known data; tweak sliders to refine.">
          <div className="space-y-2">
            {competitors.map((c, i) => (
              <CompetitorEditor key={i} competitor={c} onChange={(nc) => setCompetitors((prev) => prev.map((p, idx) => (idx === i ? nc : p)))} onRemove={() => setCompetitors((prev) => prev.filter((_, idx) => idx !== i))} />
            ))}
            <div className="rounded-lg border border-dashed border-slate-700 p-3">
              <input value={newCompName} onChange={(e) => setNewCompName(e.target.value)} placeholder="Competitor name" className="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
              <textarea value={newCompNotes} onChange={(e) => setNewCompNotes(e.target.value)} placeholder="Known data: funding stage, recent moves, market position..." rows={2} className="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100" />
              <Button onClick={addCompetitor}>+ Generate & add competitor</Button>
            </div>
          </div>
        </SectionCard>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={run} disabled={busy}>
          {busy ? "Running war game…" : "Run war game"}
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <OutcomeTile label="Us — market share" value={result.ourOutcome.marketShare} />
            <OutcomeTile label="Us — talent" value={result.ourOutcome.talent} />
            <OutcomeTile label="Us — capital" value={result.ourOutcome.capital} />
            <OutcomeTile label="Us — momentum" value={result.ourOutcome.momentum} />
            <OutcomeTile label="Us — total" value={result.ourOutcome.total} emphasize />
          </div>

          <SectionCard title="Rounds">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">Round</th>
                    <th className="pr-2">Our move</th>
                    <th className="pr-2">Competitor responses</th>
                    <th className="pr-2">Our outcome (share/talent/capital/momentum)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rounds.map((r) => (
                    <tr key={r.round} className="border-t border-slate-800 align-top text-slate-300">
                      <td className="py-2 pr-2 font-semibold text-slate-100">{r.round}</td>
                      <td className="pr-2">
                        <div className="font-medium text-slate-100">{r.ourMove}</div>
                        <div className="text-[11px] text-slate-500">{r.ourRationale}</div>
                      </td>
                      <td className="pr-2">
                        {r.competitorResponses.map((c, i) => (
                          <div key={i} className="mb-1">
                            <span className="font-medium text-slate-200">{c.competitor}:</span> {c.move}
                          </div>
                        ))}
                      </td>
                      <td className="pr-2 font-mono">
                        {r.ourOutcome.marketShare} / {r.ourOutcome.talent} / {r.ourOutcome.capital} / {r.ourOutcome.momentum}
                        <div className="mt-1 font-sans text-[11px] text-slate-500">{r.narrative}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SectionCard title="Key insights">
              <ul className="space-y-2 text-xs text-slate-300">
                {result.keyInsights.map((ins, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-indigo-400">▸</span>
                    <span>{ins}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
            <SectionCard title="Blindspots">
              {result.blindspots.length === 0 ? (
                <p className="text-xs text-slate-500">No blindspots identified — competitor responses tracked within modeled expectations.</p>
              ) : (
                <ul className="space-y-2 text-xs text-slate-300">
                  {result.blindspots.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${b.severity === "high" ? "bg-red-500" : b.severity === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} />
                      <span>
                        <span className="font-semibold text-slate-100">Round {b.round} · {b.competitor}:</span> {b.description}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <SectionCard title="Saved war games">
          <div className="space-y-1">
            {saved.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-100">{row.title}</span>
                  <span className="ml-2 text-slate-500">{row.ranAt ? `Ran ${fmtDate(row.ranAt)}` : "Not yet run"}</span>
                </div>
                <Button variant="secondary" onClick={() => loadFromSaved(row)}>
                  Load
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function OutcomeTile({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  const tone = value > 2 ? "text-emerald-400" : value < -2 ? "text-red-400" : "text-slate-300";
  return (
    <div className={`rounded-xl border p-3 ${emphasize ? "border-indigo-700 bg-indigo-950/30" : "border-slate-800 bg-slate-900/60"}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>{value > 0 ? "+" : ""}{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stress Test wizard
// ---------------------------------------------------------------------------

function StressTestTab() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(STRESSOR_CATALOG.map((s: Stressor) => s.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<{ scenario: ScenarioRow; result: ScenarioResult }[] | null>(null);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generateAndRun() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ runs: { scenario: ScenarioRow; result: ScenarioResult }[] }>("/api/scenarios", {
        method: "POST",
        body: JSON.stringify({ action: "stressTest", stressorIds: Array.from(selectedIds) }),
      });
      setRuns(data.runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stress test failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Stress Test Wizard</h3>
        <p className="text-xs text-slate-500">Select stressors from the catalog, auto-generate a scenario for each, run them all, and rank by severity.</p>
      </div>

      <SectionCard title="Stressor catalog">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STRESSOR_CATALOG.map((s: Stressor) => (
            <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggle(s.id)} className="mt-0.5 h-4 w-4" />
              <div>
                <div className="text-sm font-semibold text-slate-100">{s.label}</div>
                <div className="text-xs text-slate-500">{s.description}</div>
                <div className="mt-1 text-[11px] text-slate-600">
                  Target: {metricLabel(s.targetMetric)} ({s.magnitudePct > 0 ? "+" : ""}
                  {Math.round(s.magnitudePct * 100)}%) at month {s.month ?? 1}
                </div>
              </div>
            </label>
          ))}
        </div>
      </SectionCard>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={generateAndRun} disabled={busy || selectedIds.size === 0}>
          {busy ? "Generating & running…" : "Generate & Run All"}
        </Button>
      </div>

      {runs && (
        <SectionCard title="Results — ranked by severity (most severe first)">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-2">#</th>
                  <th className="pr-2">Stressor</th>
                  <th className="pr-2">Expected outcome</th>
                  <th className="pr-2">Downside (p10)</th>
                  <th className="pr-2">Flexibility</th>
                  <th className="pr-2">Risk events</th>
                  <th className="pr-2">Worst runway</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => {
                  const runway = r.result.keyMetrics.runwayMonths;
                  const worstRunway = runway ? Math.min(...runway.p10) : 0;
                  return (
                    <tr key={r.scenario.id} className="border-t border-slate-800 text-slate-300">
                      <td className="py-1.5 pr-2">{i + 1}</td>
                      <td className="pr-2 font-medium text-slate-100">{r.scenario.name}</td>
                      <td className="pr-2" style={{ color: r.result.expectedOutcomeScore < 40 ? "#f87171" : r.result.expectedOutcomeScore < 60 ? "#fbbf24" : "#4ade80" }}>
                        {r.result.expectedOutcomeScore}/100
                      </td>
                      <td className="pr-2">{r.result.downsideScore}/100</td>
                      <td className="pr-2">{r.result.flexibilityScore}/100</td>
                      <td className="pr-2">{r.result.riskEvents.length}</td>
                      <td className="pr-2">{worstRunway.toFixed(1)}mo</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root view
// ---------------------------------------------------------------------------

export default function ScenariosView() {
  const [tab, setTab] = useState<TopTab>("scenarios");

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">LEADOS · Part 8</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-50">Scenario Engine & War Room</h1>
          <p className="mt-1 text-sm text-slate-400">Model futures, stress-test strategy, run competitive simulations, and surface second-order effects.</p>
        </div>

        <div className="flex gap-2 border-b border-slate-800 pb-2">
          {([
            ["scenarios", "Scenarios"],
            ["wargame", "War Room"],
            ["stress", "Stress Test"],
          ] as [TopTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${tab === key ? "bg-slate-900 text-indigo-300" : "text-slate-500 hover:text-slate-300"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "scenarios" && <ScenariosTab />}
        {tab === "wargame" && <WarRoomTab />}
        {tab === "stress" && <StressTestTab />}
      </div>
    </div>
  );
}
