"use client";
import React, { useEffect, useState } from "react";
import type { LeadosEvent } from "@/lib/types";
import { MetricsView } from "@/views/MetricsView";

export function DataView() {
  const [tab, setTab] = useState<"log" | "metrics">("log");
  const [events, setEvents] = useState<LeadosEvent[]>([]);
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<{ detectedSource: string; rowCount: number; summary: string[] } | null>(null);
  const [filter, setFilter] = useState("");

  function load() {
    fetch("/api/events").then((r) => r.json()).then((d) => setEvents((d.events ?? []).slice().reverse()));
  }
  useEffect(load, []);

  async function previewImport() {
    const r = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
    setPreview(await r.json());
  }

  async function confirmImport() {
    await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw, confirm: true }) });
    setPreview(null);
    setRaw("");
    load();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leados-events.json";
    a.click();
  }

  const filtered = events.filter((e) => !filter || e.type.includes(filter) || e.domain.includes(filter));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Event Log, Import &amp; Metrics</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab("log")} className={`rounded-full px-3 py-1 text-xs ${tab === "log" ? "bg-sky-500/20 text-sky-300" : "text-slate-400"}`}>
            Event Log
          </button>
          <button onClick={() => setTab("metrics")} className={`rounded-full px-3 py-1 text-xs ${tab === "metrics" ? "bg-sky-500/20 text-sky-300" : "text-slate-400"}`}>
            Metrics
          </button>
        </div>
      </div>

      {tab === "metrics" && <MetricsView />}

      {tab === "log" && (
      <>
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Smart Import</div>
        <p className="mb-2 text-xs text-slate-500">Paste CSV (Google Sheets, Excel, Jira export) or a Notion markdown table. We&apos;ll detect the source and map columns to events.</p>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} className="w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200 outline-none focus:border-sky-500" placeholder="Name,Status,Assignee,Due Date&#10;Launch v2,In Progress,Amy Chen,2026-03-01" />
        <div className="mt-2 flex gap-2">
          <button onClick={previewImport} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">
            Preview
          </button>
          {preview && (
            <button onClick={confirmImport} className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400">
              Confirm Import
            </button>
          )}
          <button onClick={exportJson} className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600">
            Export JSON
          </button>
        </div>
        {preview && (
          <div className="mt-2 rounded bg-slate-950 p-2 text-xs text-slate-400">
            {preview.summary.map((s, i) => (
              <div key={i}>{s}</div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-200">Event Log</div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter by type/domain…" className="ml-auto rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-500" />
        </div>
        <div className="max-h-[480px] overflow-y-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900">
              <tr className="text-left text-slate-500">
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Domain</th>
                <th className="px-2 py-1">Timestamp</th>
                <th className="px-2 py-1">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((e) => (
                <tr key={e.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <td className="px-2 py-1 text-slate-500">{e.id}</td>
                  <td className="px-2 py-1 text-slate-200">{e.type}</td>
                  <td className="px-2 py-1 capitalize text-slate-400">{e.domain}</td>
                  <td className="px-2 py-1 text-slate-500">{new Date(e.ts).toLocaleString()}</td>
                  <td className="px-2 py-1 text-slate-500">{e.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">{events.length} total events (append-only log).</div>
      </section>
      </>
      )}
    </div>
  );
}
