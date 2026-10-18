"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { SkeletonList } from "@/components/leados/ui/Skeleton";

interface DecisionRow {
  id: number;
  title: string;
  description: string;
  owner: string;
  domain: string;
  status: string;
  deadline: string | null;
  createdAt: string;
  decidedAt: string | null;
  confidence: number;
  outcomeSuccess: boolean | null;
  impact: number;
}

export default function DecisionsView() {
  const { decisionHealth, loading, refetch, toast } = useAppContext();
  const { data: decisions, setData, refetch: refetchDecisions } = useFetchResource<DecisionRow[]>("/api/decisions");
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [domain, setDomain] = useState("execution");
  const [deadline, setDeadline] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    if (title.trim() === "") nextErrors.title = "Title is required.";
    if (owner.trim() === "") nextErrors.owner = "Owner is required.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const optimistic: DecisionRow = {
      id: -Date.now(),
      title,
      description: "",
      owner,
      domain,
      status: "proposed",
      deadline: deadline || null,
      createdAt: new Date().toISOString(),
      decidedAt: null,
      confidence: 50,
      outcomeSuccess: null,
      impact: 3,
    };
    setData((prev) => (prev ? [optimistic, ...prev] : [optimistic]));
    try {
      await postJson("/api/decisions", { title, owner, domain, deadline: deadline || undefined });
      toast("Decision added", 1);
      setTitle("");
      setOwner("");
      setDeadline("");
      setFormOpen(false);
      void refetchDecisions();
      refetch();
    } catch (err) {
      setData((prev) => prev?.filter((d) => d.id !== optimistic.id) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to add decision", 4);
    }
  };

  const markDecided = async (decision: DecisionRow, outcomeSuccess: boolean) => {
    setData((prev) => prev?.map((d) => (d.id === decision.id ? { ...d, status: "decided", outcomeSuccess } : d)) ?? prev);
    try {
      await postJson(`/api/decisions/${decision.id}`, { status: "decided", outcomeSuccess }, "PATCH");
      refetch();
    } catch (err) {
      setData((prev) => prev?.map((d) => (d.id === decision.id ? decision : d)) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to update decision", 4);
    }
  };

  const isOverdue = (d: DecisionRow) => d.status !== "decided" && d.deadline && new Date(d.deadline) < new Date();

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Decisions</h1>
          <p className="text-sm text-slate-500">
            Decision Health {decisionHealth.score}/100 · avg cycle time {decisionHealth.avgCycleTimeDays}d
            {decisionHealth.brierScore !== null ? ` · calibration (Brier) ${decisionHealth.brierScore}` : ""}
          </p>
        </div>
        <button onClick={() => setFormOpen((v) => !v)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
          {formOpen ? "Cancel" : "Add decision"}
        </button>
      </header>

      {formOpen && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Decision title" className="w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
              {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title}</p>}
            </div>
            <div>
              <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" className="w-full rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
              {errors.owner && <p className="mt-1 text-xs text-red-400">{errors.owner}</p>}
            </div>
            <select value={domain} onChange={(e) => setDomain(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100">
              {["people", "decisions", "metrics", "execution", "finance", "product", "culture", "risk"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-100" />
          </div>
          <button onClick={() => void submit()} className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
            Save decision
          </button>
        </div>
      )}

      {loading && !decisions ? (
        <SkeletonList rows={6} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Domain</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Deadline</th>
                <th className="px-4 py-2">Confidence</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(decisions ?? []).map((d) => (
                <tr key={d.id} className={`border-t border-slate-800 ${isOverdue(d) ? "bg-amber-950/10" : "bg-slate-950/30"}`}>
                  <td className="px-4 py-3 text-slate-100">{d.title}</td>
                  <td className="px-4 py-3 text-slate-300">{d.owner}</td>
                  <td className="px-4 py-3 text-slate-400">{d.domain}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] capitalize text-slate-300">{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {d.deadline ? new Date(d.deadline).toLocaleDateString() : "—"}
                    {isOverdue(d) && <span className="ml-1 text-amber-400">overdue</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{d.confidence}%</td>
                  <td className="px-4 py-3">
                    {d.status !== "decided" ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => void markDecided(d, true)} className="rounded-md bg-emerald-700/30 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-700/50">
                          Decide: Success
                        </button>
                        <button onClick={() => void markDecided(d, false)} className="rounded-md bg-red-700/30 px-2 py-1 text-[11px] text-red-300 hover:bg-red-700/50">
                          Decide: Failed
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">{d.outcomeSuccess ? "Succeeded" : d.outcomeSuccess === false ? "Failed" : "Decided"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
