"use client";
import React from "react";
import { CommandPalette } from "@/components/CommandPalette";

export const ROUTES: { id: string; label: string; icon: string }[] = [
  { id: "today", label: "Cockpit", icon: "◆" },
  { id: "intelligence", label: "Intelligence", icon: "⌁" },
  { id: "people", label: "People", icon: "☰" },
  { id: "strategy", label: "Strategy", icon: "◫" },
  { id: "finance", label: "Finance", icon: "$" },
  { id: "execution", label: "Execution", icon: "▣" },
  { id: "signals", label: "Signals", icon: "◉" },
  { id: "knowledge", label: "Knowledge", icon: "✦" },
  { id: "data", label: "Data", icon: "▤" },
  { id: "health", label: "Health", icon: "✚" },
  { id: "about", label: "About", icon: "ℹ" },
];

export function Shell({ active, onNavigate, children }: { active: string; onNavigate: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80 p-4 md:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold tracking-tight text-white">Leados</div>
          <div className="text-[11px] text-slate-500">Organizational Intelligence</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {ROUTES.map((r) => (
            <button
              key={r.id}
              onClick={() => onNavigate(r.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                active === r.id ? "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <span className="w-4 text-center text-xs">{r.icon}</span>
              {r.label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("leados:open-palette"))}
          className="mt-2 rounded-lg border border-slate-800 px-3 py-2 text-left text-xs text-slate-500 hover:border-slate-700 hover:text-slate-300"
        >
          ⌘K to search
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5 md:hidden">
          <div className="text-sm font-bold text-white">Leados</div>
          <select value={active} onChange={(e) => onNavigate(e.target.value)} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200">
            {ROUTES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette onNavigate={onNavigate} />
    </div>
  );
}
