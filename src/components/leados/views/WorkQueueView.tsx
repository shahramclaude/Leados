"use client";

import { useCallback, useEffect, useState } from "react";

interface WorkItem {
  id: number;
  title: string;
  type: string;
  data: Record<string, unknown>;
  status: "pending" | "accepted" | "dismissed";
  createdAt: string;
}

export function WorkQueueView() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/work-queue", { cache: "no-store" });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, status: "accepted" | "dismissed") {
    await fetch(`/api/work-queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  const pending = items.filter((i) => i.status === "pending");
  const history = items.filter((i) => i.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Autonomous Work Queue</h2>
        <p className="mt-1 text-xs text-slate-500">Items prepared by the system awaiting your review</p>
      </div>

      {loading && <div className="text-slate-500">Loading…</div>}

      {!loading && pending.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-500">
          No pending items. The system has nothing queued for review right now.
        </div>
      )}

      <div className="space-y-2">
        {pending.map((item) => (
          <div key={item.id} className="rounded-xl border border-indigo-700/40 bg-indigo-950/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-xs text-indigo-400">{item.type}</span>
                <span className="font-medium text-slate-100">{item.title}</span>
              </div>
              <span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-950/60 p-2 text-[10px] text-slate-500">
              {JSON.stringify(item.data, null, 2)}
            </pre>
            <div className="mt-2 flex gap-2">
              <button onClick={() => act(item.id, "accepted")} className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-500">
                Accept ✓
              </button>
              <button onClick={() => act(item.id, "dismissed")} className="rounded-lg bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600">
                Dismiss ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <button onClick={() => setShowHistory((s) => !s)} className="text-sm font-semibold text-slate-400 hover:text-slate-200">
          {showHistory ? "▾" : "▸"} History ({history.length})
        </button>
        {showHistory && (
          <div className="mt-2 space-y-2">
            {history.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-2 text-sm">
                <span className="text-slate-300">{item.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    item.status === "accepted" ? "bg-green-600/20 text-green-400" : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {item.status === "accepted" ? "Accepted" : "Dismissed"}
                </span>
              </div>
            ))}
            {history.length === 0 && <div className="text-xs text-slate-600">No history yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
