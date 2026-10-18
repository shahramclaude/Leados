"use client";
import { useEffect, useState, useCallback } from "react";
import type { IntelligenceData } from "@/hooks/useIntelligence";

interface QueueItem {
  id: number;
  title: string;
  type: string;
  status: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export function WorkQueueView({ data, onRefetch }: { data: IntelligenceData; onRefetch: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("draft");

  const load = useCallback(async () => {
    const res = await fetch("/api/work-queue");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, status: "accepted" | "dismissed") {
    await fetch("/api/work-queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
    onRefetch();
  }

  async function addItem() {
    if (!title.trim()) return;
    await fetch("/api/work-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type }),
    });
    setTitle("");
    setShowForm(false);
    load();
  }

  const pending = items.filter((i) => i.status === "pending");
  const resolved = items.filter((i) => i.status !== "pending");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-300">Autonomous work queue — {pending.length} pending</div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white">
          + Add to queue
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Work product title"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none"
          />
          <select value={type} onChange={(e) => setType(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none">
            {["draft", "summary", "email", "plan"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button onClick={addItem} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white">
            Save
          </button>
        </div>
      )}

      {loading && <div className="text-sm text-slate-500">Loading queue…</div>}

      <div className="space-y-2">
        {pending.map((item) => (
          <div key={item.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-sm text-slate-100">{item.title}</div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {item.type} · {new Date(item.createdAt).toLocaleString()}
              </div>
            </div>
            <button onClick={() => act(item.id, "accepted")} className="bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-1.5 text-xs text-white">
              Accept
            </button>
            <button onClick={() => act(item.id, "dismissed")} className="bg-slate-700 hover:bg-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200">
              Dismiss
            </button>
          </div>
        ))}
        {!loading && pending.length === 0 && <div className="text-sm text-slate-500">Queue is empty.</div>}
      </div>

      <details className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
        <summary className="cursor-pointer text-xs text-slate-400">Accepted / dismissed ({resolved.length})</summary>
        <div className="space-y-2 mt-3">
          {resolved.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-800/60 py-1.5">
              <span>{item.title}</span>
              <span className={item.status === "accepted" ? "text-emerald-400" : "text-slate-600"}>{item.status}</span>
            </div>
          ))}
          {resolved.length === 0 && <div className="text-xs text-slate-600">Nothing resolved yet.</div>}
        </div>
      </details>
    </div>
  );
}
