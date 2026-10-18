"use client";

import { useState, type ReactNode } from "react";
import { useAppContext } from "@/lib/AppContext";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { SkeletonList } from "@/components/leados/ui/Skeleton";
import { DOMAINS, DOMAIN_LABELS } from "@/lib/domains";
import type { NotificationPrefs } from "@/db/schema";

interface SettingsRow {
  id: number;
  orgName: string;
  industry: string;
  stage: string;
  teamSize: number;
  notificationPrefs: NotificationPrefs;
  autonomousEnabled: boolean;
  autonomousIntervalMinutes: number;
  lastRunAt: string | null;
}

interface AutonomousRunRow {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  summary: string;
  findingsCount: number;
}

interface MetricRow {
  key: string;
  label: string;
  domain: string;
  target: string;
  benchmark: string;
}

interface RuleRow {
  key: string;
  name: string;
  domain: string;
  weight: string;
  enabled: boolean;
}

interface StatsPayload {
  appVersion: string;
  schemaVersion: string;
  totalEvents: number;
  totalPeople: number;
  lastIntelligenceRun: string | null;
}

const STAGES = ["seed", "series-a", "series-b", "growth", "enterprise"];
const INTERVALS = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "Daily", value: 1440 },
];

export default function SettingsView() {
  const { toast, refetch } = useAppContext();
  const { data: settings, setData: setSettings, refetch: refetchSettings } = useFetchResource<SettingsRow>("/api/settings");
  const { data: runs, refetch: refetchRuns } = useFetchResource<AutonomousRunRow[]>("/api/autonomous/history");
  const { data: metrics, setData: setMetrics } = useFetchResource<MetricRow[]>("/api/metrics");
  const { data: rules, setData: setRules } = useFetchResource<RuleRow[]>("/api/rules");
  const { data: stats } = useFetchResource<StatsPayload>("/api/stats");

  const [confirmClear, setConfirmClear] = useState(false);
  const [running, setRunning] = useState(false);

  const saveProfile = async (patch: Partial<SettingsRow>) => {
    if (!settings) return;
    const prev = settings;
    setSettings(() => ({ ...settings, ...patch }));
    try {
      await postJson("/api/settings", patch, "PATCH");
    } catch (err) {
      setSettings(() => prev);
      toast(err instanceof Error ? err.message : "Failed to save settings", 4);
    }
  };

  const toggleDomainPref = async (domain: string, field: "enabled" | "minSeverity", value: boolean | number) => {
    if (!settings) return;
    const current = settings.notificationPrefs[domain] ?? { enabled: true, minSeverity: 2 };
    const nextPrefs: NotificationPrefs = {
      ...settings.notificationPrefs,
      [domain]: { ...current, [field]: value },
    };
    await saveProfile({ notificationPrefs: nextPrefs });
  };

  const runNow = async () => {
    setRunning(true);
    try {
      await postJson("/api/autonomous/trigger", {});
      toast("Autonomous pass complete", 1);
      void refetchRuns();
      void refetchSettings();
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Autonomous run failed", 4);
    } finally {
      setRunning(false);
    }
  };

  const updateMetricTarget = async (metric: MetricRow, field: "target" | "benchmark", value: number) => {
    const prevMetrics = metrics;
    setMetrics((prev) => prev?.map((m) => (m.key === metric.key ? { ...m, [field]: String(value) } : m)) ?? prev);
    try {
      await postJson("/api/metrics", { key: metric.key, [field]: value }, "PATCH");
    } catch (err) {
      setMetrics(() => prevMetrics ?? null);
      toast(err instanceof Error ? err.message : "Failed to update metric", 4);
    }
  };

  const updateRule = async (rule: RuleRow, patch: Partial<RuleRow>) => {
    const prevRules = rules;
    setRules((prev) => prev?.map((r) => (r.key === rule.key ? { ...r, ...patch } : r)) ?? prev);
    try {
      await postJson("/api/rules", { key: rule.key, ...patch }, "PATCH");
    } catch (err) {
      setRules(() => prevRules ?? null);
      toast(err instanceof Error ? err.message : "Failed to update rule", 4);
    }
  };

  const seedDemo = async () => {
    try {
      const result = await postJson<{ seeded: boolean }>("/api/seed", {});
      toast(result.seeded ? "Demo data seeded" : "Demo data already present", result.seeded ? 1 : 2);
      refetch();
      void refetchSettings();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Seeding failed", 4);
    }
  };

  const clearAll = async () => {
    try {
      await fetch("/api/seed", { method: "DELETE" });
      toast("All data cleared", 3);
      setConfirmClear(false);
      refetch();
      void refetchSettings();
    } catch {
      toast("Failed to clear data", 4);
    }
  };

  const exportData = () => {
    window.open("/api/export", "_blank");
  };

  return (
    <div className="flex flex-col gap-6 p-6 pb-16">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500">Org profile, notifications, autonomous runner, and data management.</p>
      </header>

      <Section title="Org Profile">
        {!settings ? (
          <SkeletonList rows={2} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <LabeledInput label="Org name" value={settings.orgName} onChange={(v) => void saveProfile({ orgName: v })} />
            <LabeledInput label="Industry" value={settings.industry} onChange={(v) => void saveProfile({ industry: v })} />
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Stage
              <select
                value={settings.stage}
                onChange={(e) => void saveProfile({ stage: e.target.value })}
                className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Team size
              <input
                type="number"
                value={settings.teamSize}
                onChange={(e) => void saveProfile({ teamSize: Number(e.target.value) })}
                className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
              />
            </label>
          </div>
        )}
      </Section>

      <Section title="Notification Preferences">
        {!settings ? (
          <SkeletonList rows={3} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Domain</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2">Min severity to notify</th>
                </tr>
              </thead>
              <tbody>
                {DOMAINS.map((d) => {
                  const pref = settings.notificationPrefs[d] ?? { enabled: true, minSeverity: 2 };
                  return (
                    <tr key={d} className="border-t border-slate-800">
                      <td className="px-3 py-2 text-slate-300">{DOMAIN_LABELS[d]}</td>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={pref.enabled} onChange={(e) => void toggleDomainPref(d, "enabled", e.target.checked)} className="accent-indigo-500" />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={pref.minSeverity}
                          onChange={(e) => void toggleDomainPref(d, "minSeverity", Number(e.target.value))}
                          className="accent-indigo-500"
                        />
                        <span className="ml-2 text-xs text-slate-400">{pref.minSeverity}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Autonomous Runner">
        {!settings ? (
          <SkeletonList rows={2} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={settings.autonomousEnabled} onChange={(e) => void saveProfile({ autonomousEnabled: e.target.checked })} className="accent-indigo-500" />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Interval
                <select
                  value={settings.autonomousIntervalMinutes}
                  onChange={(e) => void saveProfile({ autonomousIntervalMinutes: Number(e.target.value) })}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1 text-sm text-slate-100"
                >
                  {INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-slate-500">
                Last run: {settings.lastRunAt ? new Date(settings.lastRunAt).toLocaleString() : "never"}
              </span>
              <button disabled={running} onClick={() => void runNow()} className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-50">
                {running ? "Running…" : "Run now"}
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-left uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Summary</th>
                    <th className="px-3 py-2">Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-slate-800 text-slate-300">
                      <td className="px-3 py-2">{new Date(r.startedAt).toLocaleString()}</td>
                      <td className="px-3 py-2 capitalize">{r.status}</td>
                      <td className="px-3 py-2">{r.summary}</td>
                      <td className="px-3 py-2">{r.findingsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="Metric Targets">
        {!metrics ? (
          <SkeletonList rows={3} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Metric</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Benchmark</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.key} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-300">{m.label}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={m.target}
                        onBlur={(e) => void updateMetricTarget(m, "target", Number(e.target.value))}
                        className="w-28 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1 text-sm text-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        defaultValue={m.benchmark}
                        onBlur={(e) => void updateMetricTarget(m, "benchmark", Number(e.target.value))}
                        className="w-28 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1 text-sm text-slate-100"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Rule Weights">
        {!rules ? (
          <SkeletonList rows={3} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Rule</th>
                  <th className="px-3 py-2">Weight</th>
                  <th className="px-3 py-2">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.key} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-300">{r.name}</td>
                    <td className="px-3 py-2">
                      <input type="range" min={0} max={3} step={0.1} value={parseFloat(r.weight)} onChange={(e) => void updateRule(r, { weight: e.target.value })} className="accent-indigo-500" />
                      <span className="ml-2 text-xs text-slate-400">{parseFloat(r.weight).toFixed(1)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={r.enabled} onChange={(e) => void updateRule(r, { enabled: e.target.checked })} className="accent-indigo-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Data Management">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void seedDemo()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
            Seed demo data
          </button>
          <button onClick={exportData} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700">
            Export all data (JSON)
          </button>
          <button onClick={() => setConfirmClear(true)} className="rounded-lg bg-red-900/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/60">
            Clear all data
          </button>
        </div>
      </Section>

      <Section title="About">
        {!stats ? (
          <SkeletonList rows={2} />
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-300 sm:grid-cols-4">
            <p>App version: <span className="text-slate-100">{stats.appVersion}</span></p>
            <p>Schema version: <span className="text-slate-100">{stats.schemaVersion}</span></p>
            <p>Total events: <span className="text-slate-100">{stats.totalEvents}</span></p>
            <p>Total people: <span className="text-slate-100">{stats.totalPeople}</span></p>
            <p className="col-span-2">
              Last intelligence run: <span className="text-slate-100">{stats.lastIntelligenceRun ? new Date(stats.lastIntelligenceRun).toLocaleString() : "never"}</span>
            </p>
          </div>
        )}
      </Section>

      {confirmClear && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-[#10131a] p-5">
            <h3 className="text-sm font-semibold text-slate-100">Clear all data?</h3>
            <p className="mt-2 text-xs text-slate-400">
              This permanently deletes every person, decision, metric, event, rule, and notification. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmClear(false)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
                Cancel
              </button>
              <button onClick={() => void clearAll()} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-600">
                Yes, clear everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(draft)}
        className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
      />
    </label>
  );
}
