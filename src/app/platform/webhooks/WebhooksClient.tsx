"use client";

import { useCallback, useEffect, useState } from "react";

interface Subscription {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
}

interface Delivery {
  id: string;
  subscriptionId: string;
  eventType: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  responseStatus: number | null;
  nextRetryAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  delivered: "bg-emerald-100 text-emerald-700",
  pending: "bg-slate-100 text-slate-700",
  retrying: "bg-amber-100 text-amber-700",
  dead_letter: "bg-rose-100 text-rose-700",
};

export default function WebhooksClient() {
  const [token, setToken] = useState("");
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("decision.created,run.completed");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [subsRes, deliveriesRes] = await Promise.all([
        fetch("/api/v1/webhooks/subscriptions", { headers: authHeaders() }),
        fetch("/api/v1/webhooks/deliveries?limit=25", { headers: authHeaders() }),
      ]);
      if (!subsRes.ok || !deliveriesRes.ok) {
        const body = await (subsRes.ok ? deliveriesRes : subsRes).json().catch(() => null);
        setError(body?.error?.message ?? "Failed to load. Check your token's scopes.");
        return;
      }
      setSubs((await subsRes.json()).items ?? []);
      setDeliveries((await deliveriesRes.json()).items ?? []);
    } catch {
      setError("Network error while refreshing.");
    }
  }, [token, authHeaders]);

  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);

  async function createSubscription() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/webhooks/subscriptions", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ url, eventTypes: events.split(",").map((e) => e.trim()).filter(Boolean) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "Failed to create subscription");
      } else {
        setUrl("");
        await refresh();
        alert(`Subscription created. Secret (shown once): ${body.secret}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function retryDelivery(id: string) {
    await fetch(`/api/v1/webhooks/deliveries/${id}/retry`, { method: "POST", headers: authHeaders() });
    await refresh();
  }

  async function sendSandboxTest() {
    setBusy(true);
    try {
      await fetch("/api/v1/decisions", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Sandbox test event ${new Date().toISOString()}` }),
      });
      setTimeout(refresh, 800);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <label className="block text-sm font-medium text-slate-700">API token</label>
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="lead_sk_..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="m-0 text-lg font-semibold text-slate-900">New subscription</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="https://example.com/webhooks/leados"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="decision.created,run.completed"
            value={events}
            onChange={(e) => setEvents(e.target.value)}
          />
        </div>
        <div className="mt-3 flex gap-3">
          <button
            disabled={busy || !token || !url}
            onClick={createSubscription}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Create subscription
          </button>
          <button
            disabled={busy || !token}
            onClick={sendSandboxTest}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            Send test event
          </button>
          <button onClick={refresh} disabled={!token} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">
            Refresh
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="m-0 text-lg font-semibold text-slate-900">Subscriptions ({subs.length})</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {subs.map((s) => (
            <li key={s.id} className="rounded-lg border border-slate-100 p-3">
              <p className="m-0 font-mono text-xs text-slate-500">{s.id}</p>
              <p className="m-0 break-all">{s.url}</p>
              <p className="m-0 text-xs text-slate-500">{s.eventTypes.join(", ")}</p>
            </li>
          ))}
          {subs.length === 0 && <p className="text-sm text-slate-500">No subscriptions yet.</p>}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="m-0 text-lg font-semibold text-slate-900">Delivery log</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Event</th>
                <th>Status</th>
                <th>Attempt</th>
                <th>Response</th>
                <th>Next retry</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="py-2">{d.eventType}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? "bg-slate-100"}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>
                    {d.attempt}/{d.maxAttempts}
                  </td>
                  <td>{d.responseStatus ?? "—"}</td>
                  <td>{d.nextRetryAt ? new Date(d.nextRetryAt).toLocaleTimeString() : "—"}</td>
                  <td>
                    {d.status !== "delivered" && (
                      <button onClick={() => retryDelivery(d.id)} className="text-xs font-medium text-slate-700 underline">
                        Retry now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No deliveries yet — create a subscription and send a test event.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
