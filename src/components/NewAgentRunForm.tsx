"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS = [
  { label: "Low-risk: refresh a dashboard", riskLevel: "low", computeUnits: 1 },
  { label: "Medium-risk: draft an outbound email", riskLevel: "medium", computeUnits: 3 },
  { label: "High-risk: change a pricing rule", riskLevel: "high", computeUnits: 5 },
] as const;

export function NewAgentRunForm() {
  const router = useRouter();
  const [agentName, setAgentName] = useState("ops-copilot");
  const [goal, setGoal] = useState("Investigate the weekly anomaly digest");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>(PRESETS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/agent-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentName,
        goal,
        actions: [
          {
            actionType: preset.label,
            riskLevel: preset.riskLevel,
            computeUnits: preset.computeUnits,
            payload: {},
          },
        ],
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to start agent run");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Agent name
          <input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          Proposed action
          <select
            value={preset.label}
            onChange={(e) => setPreset(PRESETS.find((p) => p.label === e.target.value) ?? PRESETS[0])}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
          >
            {PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Goal
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Starting…" : "Start agent run"}
      </button>
      <p className="text-xs text-slate-500">
        Low risk auto-executes. Medium/high risk will stop and wait in the queue below
        (interrupt policy).
      </p>
    </form>
  );
}
