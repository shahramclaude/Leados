"use client";

import { useCallback, useEffect, useState } from "react";
import type { useIntelligence } from "@/hooks/useIntelligence";

interface WorkItem {
  id: number;
  title: string;
  type: string;
  status: string;
  data: { findingKey?: string; rule?: string; domain?: string; suggestedAction?: string };
  createdAt: string;
}

export default function WorkQueueView({ intelligence }: { intelligence: ReturnType<typeof useIntelligence> }) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/work-queue", { cache: "no-store" });
    setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, intelligence.data?.generatedAt]);

  async function setStatus(id: number, status: string) {
    await fetch("/api/work-queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
    intelligence.refetch();
  }

  const pending = items.filter((i) => i.status === "pending");
  const resolved = items.filter((i) => i.status !== "pending");

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-white">Work Queue</h2>
      <p className="mb-6 text-sm text-slate-400">
        Critical findings (sev ≥ 4) automatically generate work here — the system prepares work before you ask.
      </p>

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Pending ({pending.length})
          </h3>
          <div className="mb-8 space-y-3">
            {pending.length === 0 && <p className="text-sm text-slate-500">Nothing pending. Nice.</p>}
            {pending.map((i) => (
              <div key={i.id} className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wide text-orange-300">
                      {i.data?.rule} · {i.data?.domain}
                    </p>
                    <p className="mt-1 font-semibold text-white">{i.title}</p>
                    {i.data?.suggestedAction && (
                      <p className="mt-1 text-xs text-slate-300">Suggested: {i.data.suggestedAction}</p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-500">
                      Auto-created {new Date(i.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      onClick={() => setStatus(i.id, "done")}
                      className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => setStatus(i.id, "dismissed")}
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Resolved ({resolved.length})
          </h3>
          <div className="space-y-2">
            {resolved.map((i) => (
              <div key={i.id} className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-500">
                <span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase">{i.status}</span>
                {i.title}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
