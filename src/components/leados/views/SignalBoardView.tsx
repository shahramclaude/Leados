// ════════════════════════════════════════════════════════════════════
// Signal Board 2.0 — dynamic, self-calibrating rules engine UI.
// Talks to the Rules API client (src/lib/rulesApiClient.ts), which in
// turn drives the route handlers in src/app/api/rules/route.ts against
// the in-memory store in src/lib/ruleStore.ts.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Beaker,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gauge,
  Plus,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import {
  fetchRules,
  createRule,
  patchRuleApi,
  triggerCalibration,
  markFalsePositive,
  previewCustomRule,
  SerializedRule,
  CalibrationDiffResponse,
} from "../../../lib/rulesApiClient";
import { Domain, DOMAIN_COLORS, DOMAINS, Severity } from "../../../lib/ruleRegistry";
import { cn } from "../../../utils/cn";

type SortKey = "name" | "domain" | "severity" | "weight" | "firing" | "precision" | "lastCalibrated";
type SortDir = "asc" | "desc";

const DOMAIN_LABEL: Record<Domain, string> = {
  people: "People",
  finance: "Finance",
  sales: "Sales",
  ops: "Ops",
  strategy: "Strategy",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function SeverityBadge({ severity }: { severity: number }) {
  const styles: Record<number, string> = {
    1: "bg-slate-700/60 text-slate-300 border-slate-600",
    2: "bg-sky-900/50 text-sky-300 border-sky-700",
    3: "bg-amber-900/50 text-amber-300 border-amber-700",
    4: "bg-orange-900/50 text-orange-300 border-orange-700",
    5: "bg-rose-900/50 text-rose-300 border-rose-700",
  };
  const labels: Record<number, string> = { 1: "Low", 2: "Minor", 3: "Moderate", 4: "High", 5: "Critical" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", styles[severity])}>
      S{severity} · {labels[severity]}
    </span>
  );
}

function DomainDot({ domain }: { domain: Domain }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DOMAIN_COLORS[domain] }} />;
}

function Sparkline({ values }: { values: boolean[] }) {
  return (
    <div className="flex items-end gap-[2px]" title={`${values.filter(Boolean).length}/${values.length} days firing`}>
      {values.map((v, i) => (
        <div
          key={i}
          className={cn("w-[3px] rounded-sm", v ? "bg-rose-400" : "bg-slate-700")}
          style={{ height: v ? "14px" : "6px" }}
        />
      ))}
    </div>
  );
}

function healthColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}22`, color: accent }}>
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-xl font-semibold text-slate-100">{value}</div>
      </div>
    </div>
  );
}

export default function SignalBoardView() {
  const [rules, setRules] = useState<SerializedRule[]>([]);
  const [stats, setStats] = useState({
    count: 0,
    activeCount: 0,
    firingCount: 0,
    precisionAvg: 0,
    domainHealth: {} as Record<Domain, number>,
  });
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState<CalibrationDiffResponse | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<Domain | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRules();
      setRules(data.rules);
      setStats({
        count: data.count,
        activeCount: data.activeCount,
        firingCount: data.firingCount,
        precisionAvg: data.precisionAvg,
        domainHealth: data.domainHealth,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const sortedRules = useMemo(() => {
    const filtered = domainFilter === "all" ? rules : rules.filter((r) => r.domain === domainFilter);
    const dirMul = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dirMul;
        case "domain":
          return a.domain.localeCompare(b.domain) * dirMul;
        case "severity":
          return (a.severity - b.severity) * dirMul;
        case "weight":
          return (a.weight - b.weight) * dirMul;
        case "firing":
          return (Number(a.firing) - Number(b.firing)) * dirMul;
        case "precision":
          return (a.healthScore.precision - b.healthScore.precision) * dirMul;
        case "lastCalibrated":
          return (new Date(a.calibration.lastCalibrated).getTime() - new Date(b.calibration.lastCalibrated).getTime()) * dirMul;
        default:
          return 0;
      }
    });
  }, [rules, sortKey, sortDir, domainFilter]);

  const firingRules = useMemo(() => rules.filter((r) => r.firing), [rules]);
  const findingsByDomain = useMemo(() => {
    const map = new Map<Domain, SerializedRule[]>();
    for (const d of DOMAINS) map.set(d, []);
    for (const r of firingRules) map.get(r.domain)?.push(r);
    return map;
  }, [firingRules]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function handleMarkFalsePositive(ruleId: string, name: string) {
    markFalsePositive(ruleId);
    setToast(`Recorded false positive for "${name}" — weight recalibrated.`);
    await load();
  }

  async function handleToggleEnabled(rule: SerializedRule) {
    await patchRuleApi(rule.id, { enabled: !rule.enabled });
    await load();
  }

  async function handleRunCalibration() {
    setCalibrating(true);
    try {
      const result = await triggerCalibration();
      setCalibrationResult(result);
      setToast(`Calibration complete — ${result.changedCount} rule(s) adjusted.`);
      await load();
    } finally {
      setCalibrating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-6 py-8">
        {/* ── Header ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Signal Board 2.0</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Dynamic, self-calibrating rules engine — {stats.count} rules across {DOMAINS.length} domains.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New rule
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Gauge className="h-5 w-5" />} label="Total rules" value={String(stats.count)} accent="#818cf8" />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Active" value={String(stats.activeCount)} accent="#34d399" />
          <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Firing now" value={String(stats.firingCount)} accent="#fb7185" />
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="Avg precision" value={`${stats.precisionAvg}%`} accent="#fbbf24" />
        </div>

        {/* ── Domain health overview ── */}
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Domain Health Overview</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            {DOMAINS.map((d) => {
              const score = stats.domainHealth[d] ?? 100;
              const color = healthColor(score);
              return (
                <div key={d}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-300">
                      <DomainDot domain={d} /> {DOMAIN_LABEL[d]}
                    </span>
                    <span className="font-semibold" style={{ color }}>
                      {score}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* ── Rules table ── */}
          <div className="xl:col-span-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Rule Catalog</h2>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setDomainFilter("all")}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      domainFilter === "all" ? "border-indigo-500 bg-indigo-500/20 text-indigo-200" : "border-slate-700 text-slate-400 hover:bg-slate-800"
                    )}
                  >
                    All
                  </button>
                  {DOMAINS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDomainFilter(d)}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                        domainFilter === d ? "border-indigo-500 bg-indigo-500/20 text-indigo-200" : "border-slate-700 text-slate-400 hover:bg-slate-800"
                      )}
                    >
                      <DomainDot domain={d} /> {DOMAIN_LABEL[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[650px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {([
                        ["name", "Name"],
                        ["domain", "Domain"],
                        ["severity", "Severity"],
                        ["weight", "Weight"],
                        ["firing", "Firing"],
                        ["precision", "Precision"],
                        ["lastCalibrated", "Last calibrated"],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th key={key} className="px-4 py-3 font-medium">
                          <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-slate-200">
                            {label}
                            {sortKey === key ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-30" />
                            )}
                          </button>
                        </th>
                      ))}
                      <th className="px-4 py-3 font-medium">Enabled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sortedRules.map((rule) => (
                      <tr key={rule.id} className={cn("hover:bg-slate-800/40", !rule.enabled && "opacity-40")}>
                        <td className="max-w-[220px] px-4 py-3">
                          <div className="truncate font-medium text-slate-200">{rule.name}</div>
                          <div className="truncate text-xs text-slate-500">
                            {rule.id} {rule.isCustom && <span className="text-indigo-400">· custom</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                            <DomainDot domain={rule.domain} /> {DOMAIN_LABEL[rule.domain]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <SeverityBadge severity={rule.severity} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{rule.weight.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                rule.firing ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-500"
                              )}
                            >
                              {rule.firing ? "YES" : "no"}
                            </span>
                            <Sparkline values={rule.sparkline} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">{Math.round(rule.healthScore.precision * 100)}%</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{timeAgo(rule.calibration.lastCalibrated)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleEnabled(rule)}
                            className={cn(
                              "h-5 w-9 rounded-full p-0.5 transition-colors",
                              rule.enabled ? "bg-emerald-600" : "bg-slate-700"
                            )}
                            title={rule.enabled ? "Disable rule" : "Enable rule"}
                          >
                            <span
                              className={cn(
                                "block h-4 w-4 rounded-full bg-white transition-transform",
                                rule.enabled ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {sortedRules.length === 0 && !loading && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          No rules match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Calibration panel ── */}
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Calibration</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Re-learns weights from confirmed/false-positive outcomes and re-centers thresholds at the 75th percentile
                    of this org's own history.
                  </p>
                </div>
                <button
                  onClick={handleRunCalibration}
                  disabled={calibrating}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 px-3 py-2 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
                >
                  <Beaker className={cn("h-4 w-4", calibrating && "animate-pulse")} />
                  {calibrating ? "Calibrating…" : "Run calibration pass"}
                </button>
              </div>

              {calibrationResult && (
                <div className="mt-3 overflow-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Rule</th>
                        <th className="px-3 py-2">Weight before</th>
                        <th className="px-3 py-2">Weight after</th>
                        <th className="px-3 py-2">Thresholds before</th>
                        <th className="px-3 py-2">Thresholds after</th>
                        <th className="px-3 py-2">Enabled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {calibrationResult.diff
                        .filter(
                          (d) =>
                            d.before.weight !== d.after.weight ||
                            JSON.stringify(d.before.thresholds) !== JSON.stringify(d.after.thresholds) ||
                            d.before.enabled !== d.after.enabled
                        )
                        .slice(0, 40)
                        .map((d) => (
                          <tr key={d.ruleId}>
                            <td className="px-3 py-2 text-slate-300">{d.ruleName}</td>
                            <td className="px-3 py-2 font-mono text-slate-500">{d.before.weight.toFixed(2)}</td>
                            <td
                              className={cn(
                                "px-3 py-2 font-mono font-semibold",
                                d.after.weight > d.before.weight ? "text-emerald-400" : d.after.weight < d.before.weight ? "text-rose-400" : "text-slate-400"
                              )}
                            >
                              {d.after.weight.toFixed(2)}
                              {d.after.weight > d.before.weight && <ChevronUp className="inline h-3 w-3" />}
                              {d.after.weight < d.before.weight && <ChevronDown className="inline h-3 w-3" />}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500">{JSON.stringify(d.before.thresholds)}</td>
                            <td className="px-3 py-2 font-mono text-slate-300">{JSON.stringify(d.after.thresholds)}</td>
                            <td className="px-3 py-2">
                              {d.before.enabled !== d.after.enabled ? (
                                <span className={d.after.enabled ? "text-emerald-400" : "text-rose-400"}>
                                  {d.after.enabled ? "enabled" : "disabled"}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      {calibrationResult.changedCount === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            No material changes this pass — the catalog is already well calibrated.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Active findings panel ── */}
          <div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                <AlertTriangle className="h-4 w-4 text-rose-400" /> Active Findings ({firingRules.length})
              </h2>
              <div className="max-h-[1000px] space-y-4 overflow-auto pr-1">
                {DOMAINS.map((d) => {
                  const items = findingsByDomain.get(d) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={d}>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <DomainDot domain={d} /> {DOMAIN_LABEL[d]} ({items.length})
                      </div>
                      <div className="space-y-2">
                        {items.map((rule) => (
                          <div key={rule.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-slate-200">{rule.name}</span>
                              <SeverityBadge severity={rule.severity} />
                            </div>
                            <p className="text-xs text-slate-400">{rule.evidenceText ?? rule.description}</p>
                            <p className="mt-1 text-xs text-indigo-300">↳ {rule.suggestedAction}</p>
                            <button
                              onClick={() => handleMarkFalsePositive(rule.id, rule.name)}
                              className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-400 hover:border-rose-600 hover:text-rose-300"
                            >
                              <ThumbsDown className="h-3 w-3" /> Mark as false positive
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {firingRules.length === 0 && !loading && (
                  <p className="py-8 text-center text-sm text-slate-500">No rules are currently firing. 🎉</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {drawerOpen && <RuleBuilderDrawer onClose={() => setDrawerOpen(false)} onCreated={() => { setDrawerOpen(false); load(); }} />}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Rule Builder Drawer ───────────────────────────

function RuleBuilderDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<Domain>("people");
  const [severity, setSeverity] = useState<Severity>(3);
  const [tagsInput, setTagsInput] = useState("");
  const [expression, setExpression] = useState("metric('runway_months') < 6");
  const [preview, setPreview] = useState<{ valid: boolean; error: string | null; fireCount: number; windowDays: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPreview(previewCustomRule(expression, 30));
    }, 250);
    return () => clearTimeout(t);
  }, [expression]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!preview?.valid) {
      setSubmitError(preview?.error ?? "Fix the expression before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await createRule({
        name,
        domain,
        condition_expression: expression,
        severity,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      });
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create rule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">New custom rule</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
              placeholder="e.g. Support backlog breach"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Domain</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as Domain)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABEL[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value) as Severity)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>
                    S{s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Tags (comma separated)</label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="support, custom"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Condition (safe DSL)</label>
            <textarea
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-indigo-500"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Allowed: <code className="text-indigo-300">metric('key') &gt; value</code>,{" "}
              <code className="text-indigo-300">daysSince('event_type') &gt; N</code>,{" "}
              <code className="text-indigo-300">countInWindow('event_type', days) &gt; N</code>. Combine with{" "}
              <code className="text-indigo-300">&amp;&amp;</code>.
            </p>
          </div>

          <div
            className={cn(
              "rounded-lg border p-3 text-sm",
              preview?.valid ? "border-emerald-800 bg-emerald-950/40 text-emerald-200" : "border-rose-800 bg-rose-950/40 text-rose-200"
            )}
          >
            {preview?.valid ? (
              <span>
                ✓ Valid — this rule would have fired <strong>{preview.fireCount}</strong> time(s) in the last {preview.windowDays} days.
              </span>
            ) : (
              <span>⚠ {preview?.error ?? "Checking…"}</span>
            )}
          </div>

          {submitError && <div className="rounded-lg border border-rose-800 bg-rose-950/40 p-2 text-xs text-rose-200">{submitError}</div>}

          <div className="mt-auto flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !preview?.valid}
              className="flex-1 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
