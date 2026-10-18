"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { useFetchResource, postJson } from "@/lib/useFetch";
import { SkeletonList } from "@/components/leados/ui/Skeleton";

interface PlaybookStep {
  text: string;
  done: boolean;
}

interface PlaybookRow {
  id: number;
  name: string;
  description: string;
  domain: string;
  dueDate: string | null;
  status: string;
  steps: PlaybookStep[];
}

export default function PlaybooksView() {
  const { toast } = useAppContext();
  const { data: playbooks, setData } = useFetchResource<PlaybookRow[]>("/api/playbooks");

  const toggleStep = async (playbook: PlaybookRow, idx: number) => {
    const nextSteps = playbook.steps.map((s, i) => (i === idx ? { ...s, done: !s.done } : s));
    setData((prev) => prev?.map((p) => (p.id === playbook.id ? { ...p, steps: nextSteps } : p)) ?? prev);
    try {
      await postJson(`/api/playbooks`, { id: playbook.id, steps: nextSteps }, "PATCH");
    } catch (err) {
      setData((prev) => prev?.map((p) => (p.id === playbook.id ? playbook : p)) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to update step", 4);
    }
  };

  const setStatus = async (playbook: PlaybookRow, status: string) => {
    setData((prev) => prev?.map((p) => (p.id === playbook.id ? { ...p, status } : p)) ?? prev);
    try {
      await postJson(`/api/playbooks`, { id: playbook.id, status }, "PATCH");
      toast(`Playbook marked ${status}`, 1);
    } catch (err) {
      setData((prev) => prev?.map((p) => (p.id === playbook.id ? playbook : p)) ?? prev);
      toast(err instanceof Error ? err.message : "Failed to update status", 4);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Playbooks</h1>
        <p className="text-sm text-slate-500">Standard response plans for recurring situations.</p>
      </header>

      {!playbooks ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {playbooks.map((p) => {
            const done = p.steps.filter((s) => s.done).length;
            return (
              <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-100">{p.name}</p>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">{p.status}</span>
                </div>
                <p className="text-xs text-slate-500">{p.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {p.domain} {p.dueDate ? `· due ${new Date(p.dueDate).toLocaleDateString()}` : ""} · {done}/{p.steps.length} steps
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {p.steps.map((s, idx) => (
                    <label key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={s.done} onChange={() => void toggleStep(p, idx)} className="accent-indigo-500" />
                      <span className={s.done ? "line-through text-slate-500" : ""}>{s.text}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex gap-1.5">
                  {["pending", "active", "done"].map((s) => (
                    <button
                      key={s}
                      onClick={() => void setStatus(p, s)}
                      className={`rounded-md px-2 py-1 text-[11px] capitalize ${
                        p.status === s ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
