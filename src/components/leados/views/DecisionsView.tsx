"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

// ---------------------------------------------------------------------------
// Types mirroring the API shapes (kept local to the view to avoid coupling
// the client bundle to server-only modules like drizzle).
// ---------------------------------------------------------------------------

interface DecisionOption {
  id: string;
  label: string;
  description: string;
  cost: number;
  impact: number;
  reversibility: number;
  speed: number;
  risk: number;
  createdAt: string;
}

type DecisionStatus = "open" | "decided" | "reversed" | "archived";

interface DecisionRow {
  id: number;
  title: string;
  description: string;
  domain: string;
  status: DecisionStatus;
  options: DecisionOption[];
  chosenOptionId: string | null;
  rationale: string | null;
  confidenceAtDecision: number | null;
  expectedOutcome: string | null;
  actualOutcome: string | null;
  outcomeScore: number | null;
  ownerId: number | null;
  stakeholders: number[] | null;
  deadline: string | null;
  decidedAt: string | null;
  createdAt: string;
  data: { ownerName?: string; stakeholderNames?: string[] } | null;
  ageDays: number;
  optionsCount: number;
}

interface VelocityMetrics {
  avgDaysOpen: number;
  stalledCount: number;
  overdueCount: number;
  resolvedLast30d: number;
  velocityTrend: "improving" | "declining" | "steady";
}

interface ScoredOption {
  optionId: string;
  label: string;
  total: number;
  rank: number;
  breakdown: { criterion: string; weight: number; rawValue: number; normalizedValue: number; weightedContribution: number }[];
}

interface BiasFlag {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidence?: string;
}

interface Counterfactual {
  optionId: string;
  label: string;
  isChosen: boolean;
  simulated: { p10: number; p50: number; p90: number; mean: number };
  narrative: string;
}

interface PostMortem {
  decisionId: number;
  expectedVsActual: string;
  calibrationScore: number;
  outcomeScore: number | null;
  lessons: string[];
  biasRecap: BiasFlag[];
  metricDeltas: { metric: string; expected: number; actual: number; delta: number }[];
}

interface SimResult {
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  stdDev: number;
  histogram: [number, number][];
  varAtP5: number;
  samples: number;
}

interface DecisionDetail {
  decision: DecisionRow;
  logs: { id: number; action: string; actor: string; createdAt: string }[];
  scoredOptions: ScoredOption[];
  biasFlags: BiasFlag[];
  counterfactuals: Counterfactual[];
  postMortem: PostMortem | null;
  simulation: SimResult | null;
}

interface ListResponse {
  decisions: DecisionRow[];
  velocity: VelocityMetrics;
  domains: string[];
  owners: { id: number; name: string }[];
}

const STATUS_META: Record<DecisionStatus, { label: string; headerClass: string; dot: string }> = {
  open: { label: "Open", headerClass: "bg-amber-50 border-amber-200 text-amber-900", dot: "bg-amber-500" },
  decided: { label: "Decided", headerClass: "bg-emerald-50 border-emerald-200 text-emerald-900", dot: "bg-emerald-500" },
  reversed: { label: "Reversed", headerClass: "bg-rose-50 border-rose-200 text-rose-900", dot: "bg-rose-500" },
  archived: { label: "Archived", headerClass: "bg-slate-100 border-slate-200 text-slate-700", dot: "bg-slate-400" },
};

const STATUS_ORDER: DecisionStatus[] = ["open", "decided", "reversed", "archived"];

function confidenceBadgeClass(confidence: number | null): string {
  if (confidence == null) return "bg-slate-100 text-slate-500";
  if (confidence >= 70) return "bg-emerald-100 text-emerald-800";
  if (confidence >= 40) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function scoreColor(total: number): string {
  if (total >= 70) return "bg-emerald-100 text-emerald-900";
  if (total >= 45) return "bg-amber-100 text-amber-900";
  return "bg-rose-100 text-rose-900";
}

function trendIcon(trend: VelocityMetrics["velocityTrend"]): { icon: string; cls: string } {
  if (trend === "improving") return { icon: "▲", cls: "text-emerald-600" };
  if (trend === "declining") return { icon: "▼", cls: "text-rose-600" };
  return { icon: "■", cls: "text-slate-500" };
}

function emptyOption(order: number): DecisionOption {
  return {
    id: `draft_${order}_${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    description: "",
    cost: 5,
    impact: 5,
    reversibility: 5,
    speed: 5,
    risk: 5,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function StatTile({ label, value, sub, trend }: { label: string; value: string | number; sub?: string; trend?: { icon: string; cls: string } }) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        {trend && <span className={`text-sm font-semibold ${trend.cls}`}>{trend.icon}</span>}
      </div>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

function Histogram({ histogram }: { histogram: [number, number][] }) {
  if (!histogram || histogram.length === 0) {
    return <p className="text-sm text-slate-400">No simulation data.</p>;
  }
  const width = 480;
  const height = 160;
  const padding = 24;
  const maxCount = Math.max(...histogram.map(([, c]) => c), 1);
  const barWidth = (width - padding * 2) / histogram.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Monte Carlo outcome histogram">
      {histogram.map(([value, count], i) => {
        const barHeight = (count / maxCount) * (height - padding * 2);
        const x = padding + i * barWidth;
        const y = height - padding - barHeight;
        return (
          <g key={i}>
            <rect x={x + 1} y={y} width={Math.max(barWidth - 2, 1)} height={barHeight} className="fill-indigo-400" />
            {i % Math.ceil(histogram.length / 6 || 1) === 0 && (
              <text x={x + barWidth / 2} y={height - padding + 12} textAnchor="middle" className="fill-slate-400 text-[8px]">
                {value.toFixed(0)}
              </text>
            )}
          </g>
        );
      })}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth={1} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function DecisionsView() {
  const [listData, setListData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({ domain: "", status: "", owner: "", from: "", to: "" });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.domain) params.set("domain", filters.domain);
      if (filters.status) params.set("status", filters.status);
      if (filters.owner) params.set("owner", filters.owner);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const res = await fetch(`/api/decisions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load decisions");
      const json: ListResponse = await res.json();
      setListData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decisions");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: number) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/decisions/${id}`);
      if (!res.ok) throw new Error("Failed to load decision detail");
      const json: DecisionDetail = await res.json();
      setDetail(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decision detail");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId);
  }, [selectedId]);

  const grouped = useMemo(() => {
    const byStatus: Record<DecisionStatus, DecisionRow[]> = { open: [], decided: [], reversed: [], archived: [] };
    for (const d of listData?.decisions ?? []) {
      byStatus[d.status]?.push(d);
    }
    return byStatus;
  }, [listData]);

  async function handleAction(action: string, payload: Record<string, unknown> = {}) {
    if (!detail) return;
    const res = await fetch(`/api/decisions/${detail.decision.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (res.ok) {
      await loadDetail(detail.decision.id);
      await loadList();
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Decision Intelligence</h1>
        <p className="text-sm text-slate-500">Traceable, probabilistically evaluated, automatically post-mortemed decisions.</p>
      </header>

      {listData && <VelocityWidget velocity={listData.velocity} />}

      <FilterBar filters={filters} setFilters={setFilters} domains={listData?.domains ?? []} owners={listData?.owners ?? []} onAdd={() => setShowAddModal(true)} />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && <p className="text-sm text-slate-400">Loading decisions…</p>}

      <div className="flex flex-col gap-6">
        {STATUS_ORDER.map((status) => (
          <DecisionGroup
            key={status}
            status={status}
            decisions={grouped[status]}
            owners={listData?.owners ?? []}
            onSelect={(id) => setSelectedId(id)}
          />
        ))}
      </div>

      {selectedId != null && (
        <DecisionDrawer
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setSelectedId(null);
            setDetail(null);
          }}
          onAction={handleAction}
        />
      )}

      {showAddModal && (
        <AddDecisionModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            loadList();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Velocity widget
// ---------------------------------------------------------------------------

function VelocityWidget({ velocity }: { velocity: VelocityMetrics }) {
  const trend = trendIcon(velocity.velocityTrend);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <StatTile label="Avg days open" value={velocity.avgDaysOpen} sub="across open decisions" />
      <StatTile label="Stalled (14d+)" value={velocity.stalledCount} sub="open & aging" />
      <StatTile label="Overdue" value={velocity.overdueCount} sub="past deadline" />
      <StatTile label="Resolved last 30d" value={velocity.resolvedLast30d} sub={`trend: ${velocity.velocityTrend}`} trend={trend} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  filters,
  setFilters,
  domains,
  owners,
  onAdd,
}: {
  filters: { domain: string; status: string; owner: string; from: string; to: string };
  setFilters: (f: { domain: string; status: string; owner: string; from: string; to: string }) => void;
  domains: string[];
  owners: { id: number; name: string }[];
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Field label="Domain">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.domain}
          onChange={(e) => setFilters({ ...filters, domain: e.target.value })}
        >
          <option value="">All</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner">
        <select
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.owner}
          onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
        >
          <option value="">All</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="From">
        <input
          type="date"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
      </Field>
      <button
        type="button"
        className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        onClick={onAdd}
      >
        + Add decision
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {label}
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Decision list, grouped by status
// ---------------------------------------------------------------------------

function DecisionGroup({
  status,
  decisions,
  owners,
  onSelect,
}: {
  status: DecisionStatus;
  decisions: DecisionRow[];
  owners: { id: number; name: string }[];
  onSelect: (id: number) => void;
}) {
  const meta = STATUS_META[status];
  const ownerName = (id: number | null, data: DecisionRow["data"]) => {
    if (data?.ownerName) return data.ownerName;
    if (id == null) return "Unassigned";
    return owners.find((o) => o.id === id)?.name ?? `Owner #${id}`;
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold ${meta.headerClass}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
        {meta.label}
        <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium">{decisions.length}</span>
      </div>
      {decisions.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-400">No decisions in this status.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {decisions.map((d) => (
            <li
              key={d.id}
              className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50"
              onClick={() => onSelect(d.id)}
            >
              <span className="min-w-[180px] flex-1 font-medium text-slate-900">{d.title}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{d.domain}</span>
              <span className="text-xs text-slate-500">{d.ageDays}d old</span>
              <span className="text-xs text-slate-500">{ownerName(d.ownerId, d.data)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${confidenceBadgeClass(d.confidenceAtDecision)}`}>
                {d.confidenceAtDecision != null ? `${Math.round(d.confidenceAtDecision)}% conf.` : "no confidence"}
              </span>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{d.optionsCount} options</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

function DecisionDrawer({
  detail,
  loading,
  onClose,
  onAction,
}: {
  detail: DecisionDetail | null;
  loading: boolean;
  onClose: () => void;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}) {
  const [chosenOptionId, setChosenOptionId] = useState("");
  const [rationale, setRationale] = useState("");
  const [actualOutcome, setActualOutcome] = useState("");
  const [outcomeScore, setOutcomeScore] = useState(0);

  useEffect(() => {
    if (detail?.decision) {
      setChosenOptionId(detail.decision.chosenOptionId ?? detail.decision.options[0]?.id ?? "");
      setRationale(detail.decision.rationale ?? "");
      setActualOutcome(detail.decision.actualOutcome ?? "");
      setOutcomeScore(detail.decision.outcomeScore ?? 0);
    }
  }, [detail?.decision.id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{detail?.decision.title ?? "Decision"}</h2>
          <button onClick={onClose} className="rounded-full px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {detail && !loading && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2 py-1 font-semibold ${STATUS_META[detail.decision.status].headerClass}`}>
                {STATUS_META[detail.decision.status].label}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{detail.decision.domain}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{detail.decision.ageDays} days old</span>
              {detail.decision.deadline && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Deadline: {detail.decision.deadline}</span>
              )}
            </div>

            <p className="text-sm text-slate-700">{detail.decision.description || "No description provided."}</p>

            {/* Options comparison table */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Options comparison</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Option</th>
                      <th className="px-3 py-2">Score</th>
                      <th className="px-3 py-2">Impact</th>
                      <th className="px-3 py-2">Reversibility</th>
                      <th className="px-3 py-2">Speed</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.scoredOptions.map((opt) => {
                      const raw = detail.decision.options.find((o) => o.id === opt.optionId);
                      return (
                        <tr key={opt.optionId} className={`border-t border-slate-100 ${opt.optionId === detail.decision.chosenOptionId ? "ring-1 ring-inset ring-indigo-400" : ""}`}>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {opt.label}
                            {opt.optionId === detail.decision.chosenOptionId && <span className="ml-1 text-indigo-600">★</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${scoreColor(opt.total)}`}>{opt.total.toFixed(0)}</span>
                          </td>
                          <td className="px-3 py-2">{raw?.impact ?? "-"}</td>
                          <td className="px-3 py-2">{raw?.reversibility ?? "-"}</td>
                          <td className="px-3 py-2">{raw?.speed ?? "-"}</td>
                          <td className="px-3 py-2">{raw?.cost ?? "-"}</td>
                          <td className="px-3 py-2">{raw?.risk ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bias flags */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Bias flags</h3>
              {detail.biasFlags.length === 0 ? (
                <p className="text-xs text-slate-400">No cognitive bias signals detected.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.biasFlags.map((b, i) => (
                    <li
                      key={i}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        b.severity === "high" ? "border-rose-200 bg-rose-50 text-rose-800" : b.severity === "medium" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      <p className="font-semibold uppercase tracking-wide">{b.type.replace(/_/g, " ")}</p>
                      <p className="mt-1">{b.message}</p>
                      {b.evidence && <p className="mt-1 italic text-slate-500">{b.evidence}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Monte Carlo histogram */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Simulated outcome distribution</h3>
              {detail.simulation ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <Histogram histogram={detail.simulation.histogram} />
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                    <span>p10: {detail.simulation.p10.toFixed(1)}</span>
                    <span>p50: {detail.simulation.p50.toFixed(1)}</span>
                    <span>p90: {detail.simulation.p90.toFixed(1)}</span>
                    <span>mean: {detail.simulation.mean.toFixed(1)}</span>
                    <span>VaR(5%): {detail.simulation.varAtP5.toFixed(1)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No options to simulate.</p>
              )}
            </div>

            {/* Counterfactuals */}
            {detail.counterfactuals.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Counterfactuals — &ldquo;what if we had chosen X?&rdquo;</h3>
                <ul className="flex flex-col gap-2">
                  {detail.counterfactuals.map((c) => (
                    <li key={c.optionId} className={`rounded-lg border px-3 py-2 text-xs ${c.isChosen ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}>
                      <p className="font-semibold text-slate-800">
                        {c.label} {c.isChosen && <span className="text-indigo-600">(chosen)</span>}
                      </p>
                      <p className="mt-1 text-slate-600">{c.narrative}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Post-mortem */}
            {detail.postMortem && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Post-mortem</h3>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                  <p className="text-slate-700">{detail.postMortem.expectedVsActual}</p>
                  <p className="mt-2">
                    Calibration score:{" "}
                    <span className="font-semibold">{(detail.postMortem.calibrationScore * 100).toFixed(0)}%</span>
                    {detail.postMortem.outcomeScore != null && (
                      <span className="ml-3">Outcome score: <span className="font-semibold">{detail.postMortem.outcomeScore.toFixed(2)}</span></span>
                    )}
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-600">
                    {detail.postMortem.lessons.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Actions</h3>

              {detail.decision.status === "open" && (
                <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
                  <label className="text-xs font-medium text-slate-500">Choose option</label>
                  <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={chosenOptionId} onChange={(e) => setChosenOptionId(e.target.value)}>
                    {detail.decision.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs font-medium text-slate-500">Rationale</label>
                  <textarea className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                  <button
                    className="self-start rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    onClick={() => onAction("decide", { chosenOptionId, rationale, confidenceAtDecision: detail.decision.confidenceAtDecision ?? 50 })}
                  >
                    Mark as decided
                  </button>
                </div>
              )}

              {(detail.decision.status === "decided" || detail.decision.status === "reversed") && (
                <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
                  <label className="text-xs font-medium text-slate-500">Actual outcome</label>
                  <textarea className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" rows={2} value={actualOutcome} onChange={(e) => setActualOutcome(e.target.value)} />
                  <label className="text-xs font-medium text-slate-500">Outcome score ({outcomeScore.toFixed(2)})</label>
                  <input type="range" min={-1} max={1} step={0.05} value={outcomeScore} onChange={(e) => setOutcomeScore(Number(e.target.value))} />
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                      onClick={() => onAction("record_outcome", { actualOutcome, outcomeScore })}
                    >
                      Save outcome
                    </button>
                    {detail.decision.status === "decided" && (
                      <button className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={() => onAction("reverse", { rationale })}>
                        Reverse decision
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {detail.decision.status !== "open" && (
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => onAction("reopen")}>
                    Reopen
                  </button>
                )}
                {detail.decision.status !== "archived" && (
                  <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => onAction("archive")}>
                    Archive
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add decision modal
// ---------------------------------------------------------------------------

function AddDecisionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("general");
  const [deadline, setDeadline] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [confidence, setConfidence] = useState(50);
  const [options, setOptions] = useState<DecisionOption[]>([emptyOption(0), emptyOption(1)]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function updateOption(idx: number, patch: Partial<DecisionOption>) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }

  function addOption() {
    setOptions((prev) => [...prev, emptyOption(prev.length)]);
  }

  function removeOption(idx: number) {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    const validOptions = options.filter((o) => o.label.trim());
    if (validOptions.length === 0) {
      setFormError("At least one option with a label is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          domain,
          deadline: deadline || null,
          ownerName: ownerName || undefined,
          confidenceAtDecision: confidence,
          options: validOptions,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to create decision");
      }
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create decision");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit} className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New decision</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>

        {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-500">
            Title
            <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-500">
            Description
            <textarea className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Domain
            <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Owner
            <input className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Deadline
            <input type="date" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Confidence ({confidence}%)
            <input type="range" min={0} max={100} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Options</h3>
            <button type="button" onClick={addOption} className="rounded-lg border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
              + Add option
            </button>
          </div>
          {options.map((opt, idx) => (
            <div key={opt.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder={`Option ${idx + 1} label`}
                  value={opt.label}
                  onChange={(e) => updateOption(idx, { label: e.target.value })}
                />
                {options.length > 1 && (
                  <button type="button" onClick={() => removeOption(idx)} className="rounded-lg border border-rose-200 px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50">
                    Remove
                  </button>
                )}
              </div>
              <textarea
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                rows={2}
                placeholder="Description"
                value={opt.description}
                onChange={(e) => updateOption(idx, { description: e.target.value })}
              />
              <div className="grid grid-cols-5 gap-2 text-[11px] text-slate-500">
                {(["impact", "reversibility", "speed", "cost", "risk"] as const).map((key) => (
                  <label key={key} className="flex flex-col gap-0.5">
                    {key} ({opt[key]})
                    <input type="range" min={0} max={10} value={opt[key]} onChange={(e) => updateOption(idx, { [key]: Number(e.target.value) } as Partial<DecisionOption>)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
            {submitting ? "Creating…" : "Create decision"}
          </button>
        </div>
      </form>
    </div>
  );
}
