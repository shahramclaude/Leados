"use client";

import { useState } from "react";
import type { AttentionItem, IntelligenceData } from "@/lib/intelligence";

const DOMAIN_COLOR: Record<string, string> = {
  people: "bg-blue-400",
  finance: "bg-emerald-400",
  sales: "bg-orange-400",
  ops: "bg-purple-400",
  strategy: "bg-cyan-400",
  gov: "bg-pink-400",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

function barColor(pct: number) {
  if (pct > 90) return "bg-red-500";
  if (pct > 70) return "bg-amber-500";
  return "bg-green-500";
}

function AttentionCard({ item, onStart }: { item: AttentionItem; onStart: (item: AttentionItem) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-xs"
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${DOMAIN_COLOR[item.domain]}`} />
        <span className="truncate text-slate-200">{item.title}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-slate-700 px-1 py-0.5 font-mono text-[10px] text-slate-500">{item.rule}</span>
        <span className="rounded-full bg-indigo-600/20 px-1.5 py-0.5 text-[10px] text-indigo-400">ROI {item.roi}</span>
        <span className="text-[10px] text-slate-500">{item.hours}h</span>
      </div>
      {hover && (
        <button
          onClick={() => onStart(item)}
          className="mt-2 w-full rounded-lg bg-indigo-600 px-2 py-1 text-[10px] text-white hover:bg-indigo-500"
        >
          Start now
        </button>
      )}
    </div>
  );
}

export function AttentionView({ data, refetch }: { data: IntelligenceData; refetch: () => Promise<void> }) {
  const [deferredOpen, setDeferredOpen] = useState(false);
  const { attentionPlan } = data;

  async function startNow(item: AttentionItem) {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "attention_started", domain: item.domain, data: { findingKey: item.findingKey, title: item.title } }),
    });
    refetch();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Weekly Attention Plan</h2>
        <p className="mt-1 text-xs text-slate-500">Simulated annealing optimization · Kirkpatrick et al. (1983)</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Hours</span>
            <span className="font-mono">{attentionPlan.totalHours}h / 30h</span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full ${barColor(attentionPlan.utilizationPct)}`} style={{ width: `${Math.min(100, attentionPlan.utilizationPct)}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Cognitive load</span>
            <span className="font-mono">{attentionPlan.cognitiveLoadUsed} / 40</span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full ${barColor((attentionPlan.cognitiveLoadUsed / 40) * 100)}`}
              style={{ width: `${Math.min(100, (attentionPlan.cognitiveLoadUsed / 40) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {DAYS.map((day) => (
          <div key={day} className="flex flex-col gap-2">
            <div className="text-center text-xs font-semibold uppercase text-slate-500">{day}</div>
            {attentionPlan.sequence
              .filter((i) => i.day === day)
              .map((item) => (
                <AttentionCard key={item.id} item={item} onStart={startNow} />
              ))}
            {attentionPlan.sequence.filter((i) => i.day === day).length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-800 p-2 text-center text-[10px] text-slate-600">Clear</div>
            )}
          </div>
        ))}
      </div>

      <div>
        <button
          onClick={() => setDeferredOpen((o) => !o)}
          className="text-sm font-semibold text-slate-400 hover:text-slate-200"
        >
          {deferredOpen ? "▾" : "▸"} Deferred ({attentionPlan.deferred.length})
        </button>
        {deferredOpen && (
          <div className="mt-2 space-y-2">
            {attentionPlan.deferred.map((d, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2 text-xs">
                <div className="text-slate-300">
                  <span className="mr-2 rounded border border-slate-700 px-1 py-0.5 font-mono text-[10px] text-slate-500">{d.rule}</span>
                  {d.title}
                </div>
                <div className="mt-1 text-slate-500">{d.reason}</div>
              </div>
            ))}
            {attentionPlan.deferred.length > 0 && (
              <p className="text-[10px] text-slate-600">These findings exceed this week&apos;s budget. They will carry to next week.</p>
            )}
            {attentionPlan.deferred.length === 0 && <div className="text-xs text-slate-600">Nothing deferred this week.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
