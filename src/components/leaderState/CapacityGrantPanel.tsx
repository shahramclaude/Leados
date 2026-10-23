"use client";

import { useCallback, useEffect, useState } from "react";
import { DEMO_USER_ID } from "@/lib/leaderState/demo";
import { UncertaintyNote } from "@/components/leaderState/UncertaintyNote";

interface Grant {
  id: string;
  scope: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

interface SignalResult {
  granted: boolean;
  reason?: string;
  signal: {
    capacityScore: number;
    suggestedDecisionWindows: string[];
    confidence: "low" | "moderate";
    sourceSampleSize: number;
  } | null;
}

const HEADERS = { "Content-Type": "application/json", "x-user-id": DEMO_USER_ID };

export function CapacityGrantPanel() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const refresh = useCallback(async () => {
    const [grantsRes, signalRes] = await Promise.all([
      fetch("/api/leader-state/grants", { headers: HEADERS }),
      fetch("/api/leader-state/capacity-signal", { headers: HEADERS }),
    ]);
    const grantsBody = await grantsRes.json();
    const signalBody = await signalRes.json();
    setGrants(grantsBody.grants ?? []);
    setSignal(signalBody);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function grant1Hour() {
    setLoading(true);
    await fetch("/api/leader-state/grants", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ scope: "scheduler-optimizer", ttlMs: 60 * 60 * 1000 }),
    });
    await refresh();
    setLoading(false);
  }

  async function revoke(id: string) {
    setLoading(true);
    await fetch(`/api/leader-state/grants?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: HEADERS });
    await refresh();
    setLoading(false);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="m-0 text-sm font-semibold text-slate-900">Capacity-aware scheduling grant</h3>
      <p className="m-0 text-xs text-slate-500">
        The scheduling optimizer (Part 45) can only read a coarse capacity signal derived from your own
        history, and only while a grant like this is active and unexpired. Revoking or letting it expire
        stops the flow immediately — the optimizer falls back to no signal, never to raw data.
      </p>
      <button
        type="button"
        onClick={grant1Hour}
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Grant scheduler access for 1 hour
      </button>
      <ul className="m-0 list-none space-y-1 p-0 text-xs text-slate-600">
        {grants.length === 0 ? <li>No grants issued.</li> : null}
        {grants.map((g) => {
          const active = !g.revokedAt && nowMs !== null && new Date(g.expiresAt).getTime() > nowMs;
          return (
            <li key={g.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1">
              <span>
                {g.scope} — {active ? "active" : "inactive"} — expires {new Date(g.expiresAt).toLocaleTimeString()}
              </span>
              {active ? (
                <button type="button" onClick={() => revoke(g.id)} className="text-red-600 underline">
                  Revoke
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {signal ? (
        signal.granted && signal.signal ? (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            <p className="m-0">
              Signal the optimizer would receive: capacity score {signal.signal.capacityScore}, suggested
              windows: {signal.signal.suggestedDecisionWindows.join(", ") || "none yet"}.
            </p>
            <UncertaintyNote confidence={signal.signal.confidence} sampleSize={signal.signal.sourceSampleSize} />
          </div>
        ) : (
          <p className="m-0 text-xs text-slate-500">
            No active grant — the optimizer currently receives nothing ({signal.reason}).
          </p>
        )
      ) : null}
    </div>
  );
}
