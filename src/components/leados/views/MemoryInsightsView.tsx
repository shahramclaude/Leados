"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { SkeletonList } from "@/components/leados/ui/Skeleton";

interface InsightRow {
  id: number;
  title: string;
  body: string;
  domain: string;
  tags: string[];
  createdAt: string;
}

export default function MemoryInsightsView() {
  const { graph, weeklyBriefing, toast } = useAppContext();
  const { data: insightRows, setData } = useFetchResource<InsightRow[]>("/api/insights");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [domain, setDomain] = useState("execution");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (title.trim() === "" || body.trim() === "") {
      setError("Title and body are required.");
      return;
    }
    setError(null);
    const optimistic: InsightRow = { id: -Date.now(), title, body, domain, tags: [], createdAt: new Date().toISOString() };
    setData((prev) => (prev ? [optimistic, ...prev] : [optimistic]));
    try {
      await postJson("/api/insights", { title, body, domain });
      toast("Insight saved", 1);
      setTitle("");
      setBody("");
    } catch (err) {
      setData((prev) => prev?.filter((i) => i.id !== optimistic.id) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to save insight", 4);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Memory & Insights</h1>
        <p className="text-sm text-slate-500">Cross-domain knowledge graph and accumulated institutional memory.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Weekly Briefing — Highlights</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
            {weeklyBriefing.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Weekly Briefing — Risks</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
            {weeklyBriefing.risks.length === 0 ? <li className="text-slate-500">No elevated risks.</li> : weeklyBriefing.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Knowledge Graph (ranked by PageRank importance)</h2>
        <div className="flex flex-wrap gap-2">
          {graph.nodes.slice(0, 24).map((n) => (
            <span
              key={n.id}
              className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs text-slate-300"
              style={{ opacity: 0.5 + Math.min(0.5, n.importance) }}
              title={`${n.type} · importance ${n.importance}`}
            >
              {n.label}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Add Insight</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Insight title" className="w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did we learn?" className="mt-2 h-20 w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
        <div className="mt-2 flex items-center gap-2">
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100">
            {["people", "decisions", "metrics", "execution", "finance", "product", "culture", "risk"].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button onClick={() => void submit()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
            Save insight
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>

      {!insightRows ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="flex flex-col gap-2">
          {insightRows.map((i) => (
            <div key={i.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-sm font-medium text-slate-100">{i.title} <span className="ml-2 text-[10px] uppercase text-slate-500">{i.domain}</span></p>
              <p className="text-xs text-slate-400">{i.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
