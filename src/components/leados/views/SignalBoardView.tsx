"use client";

import { useMemo, useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { SkeletonList } from "@/components/leados/ui/Skeleton";
import { DOMAINS, DOMAIN_LABELS } from "@/lib/domains";
import type { RuleHealth } from "@/lib/types";

interface RuleRow {
  id: number;
  key: string;
  name: string;
  domain: string;
  weight: string;
  enabled: boolean;
  description: string;
}

const STATUS_STYLES: Record<RuleHealth["status"], string> = {
  healthy: "bg-emerald-500/15 text-emerald-300 border-emerald-700/40",
  warning: "bg-amber-500/15 text-amber-300 border-amber-700/40",
  critical: "bg-red-500/15 text-red-300 border-red-700/40",
};

export default function SignalBoardView() {
  const { ruleHealthMap, loading, refetch, toast } = useAppContext();
  const { data: rules, setData } = useFetchResource<RuleRow[]>("/api/rules");
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!rules) return [];
    return domainFilter === "all" ? rules : rules.filter((r) => r.domain === domainFilter);
  }, [rules, domainFilter]);

  const toggleEnabled = async (rule: RuleRow) => {
    const next = !rule.enabled;
    setData((prev) => prev?.map((r) => (r.key === rule.key ? { ...r, enabled: next } : r)) ?? prev);
    try {
      await postJson("/api/rules", { key: rule.key, enabled: next }, "PATCH");
      refetch();
    } catch (err) {
      setData((prev) => prev?.map((r) => (r.key === rule.key ? { ...r, enabled: !next } : r)) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to update rule", 4);
    }
  };

  const updateWeight = async (rule: RuleRow, weight: number) => {
    const prevWeight = rule.weight;
    setData((prev) => prev?.map((r) => (r.key === rule.key ? { ...r, weight: String(weight) } : r)) ?? prev);
    try {
      await postJson("/api/rules", { key: rule.key, weight }, "PATCH");
      refetch();
    } catch (err) {
      setData((prev) => prev?.map((r) => (r.key === rule.key ? { ...r, weight: prevWeight } : r)) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to update weight", 4);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Signal Board</h1>
          <p className="text-sm text-slate-500">50-rule health monitor across every domain.</p>
        </div>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="all">All domains</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {DOMAIN_LABELS[d]}
            </option>
          ))}
        </select>
      </header>

      {loading && !rules ? (
        <SkeletonList rows={8} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Rule</th>
                <th className="px-4 py-2">Domain</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Score</th>
                <th className="px-4 py-2">Weight</th>
                <th className="px-4 py-2">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rule) => {
                const health = ruleHealthMap[rule.key];
                return (
                  <tr key={rule.key} className="border-t border-slate-800 bg-slate-950/30 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-100">{rule.name}</p>
                      <p className="text-xs text-slate-500">{rule.description}</p>
                      {health && <p className="mt-1 text-xs text-slate-400">{health.detail}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{DOMAIN_LABELS[rule.domain as keyof typeof DOMAIN_LABELS] ?? rule.domain}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${STATUS_STYLES[health?.status ?? "healthy"]}`}>
                        {health?.status ?? "healthy"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{health ? Math.round(health.score) : 100}</td>
                    <td className="px-4 py-3">
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={0.1}
                        value={parseFloat(rule.weight)}
                        onChange={(e) => void updateWeight(rule, parseFloat(e.target.value))}
                        className="w-28 accent-indigo-500"
                      />
                      <span className="ml-2 text-xs text-slate-400">{parseFloat(rule.weight).toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void toggleEnabled(rule)}
                        className={`h-5 w-9 rounded-full transition-colors ${rule.enabled ? "bg-indigo-600" : "bg-slate-700"}`}
                      >
                        <span
                          className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white transition-transform ${
                            rule.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
