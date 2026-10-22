"use client";

import { useCallback, useEffect, useState } from "react";

interface Ritual {
  id: string;
  name: string;
  kind: string;
}

interface Policy {
  id: string;
  ritualId: string;
  name: string;
  description: string;
  rule: { kind: string; varianceThresholdPct?: number; anomalyFreeOccurrences?: number; degradeTo?: string };
  active: boolean;
}

interface SimulationResult {
  totalOccurrences: number;
  wouldDegradeCount: number;
  wouldDegradeOccurrenceKeys: string[];
  details: Array<{ occurrenceKey: string; mode: string; reason: string }>;
}

export default function PoliciesClient() {
  const [rituals, setRituals] = useState<Ritual[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [ritualId, setRitualId] = useState("");
  const [name, setName] = useState("Degrade when stable");
  const [variancePct, setVariancePct] = useState(2);
  const [anomalyFreeOccurrences, setAnomalyFreeOccurrences] = useState(3);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideType, setOverrideType] = useState<"force_full" | "force_async" | "force_skip">("force_full");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ritualsRes, policiesRes] = await Promise.all([
      fetch("/api/cadence/rituals").then((r) => r.json()),
      fetch("/api/cadence/policies").then((r) => r.json()),
    ]);
    setRituals(ritualsRes.rituals ?? []);
    setPolicies(policiesRes.policies ?? []);
    if (!ritualId && ritualsRes.rituals?.length) setRitualId(ritualsRes.rituals[0].id);
  }, [ritualId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const description = `If variance stays under ${variancePct}% and no anomalies are observed for ${anomalyFreeOccurrences} consecutive occurrences, degrade this ritual to an async checklist.`;

  function currentRule() {
    return { kind: "variance_anomaly_degrade" as const, varianceThresholdPct: variancePct, anomalyFreeOccurrences, degradeTo: "async_checklist" as const };
  }

  async function simulate() {
    if (!ritualId) return;
    const res = await fetch("/api/cadence/policies/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ritualId, rule: currentRule() }),
    }).then((r) => r.json());
    setSimResult(res);
  }

  async function save() {
    if (!ritualId) return;
    await fetch("/api/cadence/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ritualId, name, description, rule: currentRule() }),
    });
    setMessage("Policy saved.");
    await load();
  }

  async function logOverride() {
    if (!ritualId || overrideReason.trim().length < 3) {
      setMessage("An override reason (3+ characters) is required — it is logged, not silent.");
      return;
    }
    await fetch("/api/cadence/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ritualId, overrideType, reason: overrideReason }),
    });
    setMessage(`Override "${overrideType}" logged for this ritual.`);
    setOverrideReason("");
  }

  return (
    <div className="mt-6 space-y-6">
      {message && <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">{message}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">New adaptive-cadence rule</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-700">
            Ritual
            <select value={ritualId} onChange={(e) => setRitualId(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
              {rituals.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Policy name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-sm text-slate-700">
            Variance threshold (%)
            <input
              type="number"
              value={variancePct}
              onChange={(e) => setVariancePct(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700">
            Anomaly-free occurrences required
            <input
              type="number"
              value={anomalyFreeOccurrences}
              onChange={(e) => setAnomalyFreeOccurrences(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
        <p className="mt-3 rounded bg-slate-50 p-2 text-sm text-slate-600">&quot;{description}&quot;</p>
        <div className="mt-3 flex gap-2">
          <button onClick={simulate} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Simulate against history
          </button>
          <button onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500">
            Save policy
          </button>
        </div>

        {simResult && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              This policy would have degraded {simResult.wouldDegradeCount} of {simResult.totalOccurrences} occurrence(s) in this
              ritual&apos;s history — is that intended?
            </p>
            {simResult.wouldDegradeOccurrenceKeys.length > 0 && (
              <p className="mt-1 text-xs">Occurrences: {simResult.wouldDegradeOccurrenceKeys.join(", ")}</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Existing policies</h2>
        <ul className="mt-2 space-y-2">
          {policies.map((p) => (
            <li key={p.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-800">
                {p.name} {p.active ? "" : "(inactive)"}
              </p>
              <p className="text-slate-600">{p.description}</p>
            </li>
          ))}
          {policies.length === 0 && <p className="text-sm text-slate-500">No policies configured yet.</p>}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Human override (itself logged)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Overrides the adaptive policy for this ritual going forward. Every override requires a reason and is
          written to an append-only log — it is never silent.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <select
            value={overrideType}
            onChange={(e) => setOverrideType(e.target.value as "force_full" | "force_async" | "force_skip")}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="force_full">Force full cadence</option>
            <option value="force_async">Force async checklist</option>
            <option value="force_skip">Force skip next occurrence</option>
          </select>
          <input
            placeholder="Reason (required)"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-2"
          />
        </div>
        <button onClick={logOverride} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
          Log override
        </button>
      </section>
    </div>
  );
}
