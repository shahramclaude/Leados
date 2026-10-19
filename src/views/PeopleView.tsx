"use client";
import React, { useEffect, useState } from "react";
import type { Person } from "@/lib/types";
import type { NineBoxPlacement } from "@/lib/orgIntelligence";

const BOX_LABELS: Record<string, string> = {
  risk: "Risk",
  inconsistent_player: "Inconsistent Player",
  enigma: "Enigma",
  core_player: "Core Player",
  key_player: "Key Player",
  high_potential: "High Potential",
  trusted_professional: "Trusted Professional",
  high_performer: "High Performer",
  star: "Star",
};
const GRID_ORDER = ["enigma", "high_potential", "star", "inconsistent_player", "key_player", "high_performer", "risk", "core_player", "trusted_professional"];

function riskLabel(v: number) {
  return v > 0.6 ? "high" : v > 0.35 ? "medium" : "low";
}
function riskColor(v: number) {
  return v > 0.6 ? "text-rose-400 border-rose-500/40 bg-rose-500/10" : v > 0.35 ? "text-amber-400 border-amber-500/40 bg-amber-500/10" : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
}

export function PeopleView() {
  const [people, setPeople] = useState<Person[]>([]);
  const [placements, setPlacements] = useState<NineBoxPlacement[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);

  useEffect(() => {
    fetch("/api/people").then((r) => r.json()).then((d) => {
      setPeople(d.people ?? []);
      setPlacements(d.placements ?? []);
    });
  }, []);

  const byBox = new Map<string, NineBoxPlacement[]>();
  for (const p of placements) byBox.set(p.box, [...(byBox.get(p.box) ?? []), p]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">People Intelligence</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="mb-2 text-sm font-semibold text-slate-200">9-Box Grid</div>
          <div className="grid grid-cols-3 gap-2">
            {GRID_ORDER.map((box) => (
              <div key={box} className="min-h-[110px] rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{BOX_LABELS[box]}</div>
                <div className="space-y-1">
                  {(byBox.get(box) ?? []).map((p) => (
                    <button key={p.person.id} onClick={() => setSelected(p.person)} className="block w-full truncate rounded bg-slate-800 px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-slate-700">
                      {p.person.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-2 text-sm font-semibold text-slate-200">Roster &amp; Flight Risk</div>
          <div className="space-y-2">
            {people.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)} className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-left hover:border-slate-700">
                <div>
                  <div className="text-sm text-slate-100">{p.name}</div>
                  <div className="text-[11px] text-slate-500">{p.role}</div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${riskColor(p.flightRisk)}`}>{riskLabel(p.flightRisk)}</span>
              </button>
            ))}
            {people.length === 0 && <div className="text-xs text-slate-500">No people recorded yet.</div>}
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setSelected(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="mb-4 text-xs text-slate-500 hover:text-slate-300">
              ← Close
            </button>
            <div className="text-lg font-bold text-slate-100">{selected.name}</div>
            <div className="text-sm text-slate-500">{selected.role}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Performance" value={selected.performance} />
              <Stat label="Potential" value={selected.potential} />
              <Stat label="Flight Risk" value={Math.round(selected.flightRisk * 100)} suffix="%" />
            </div>
            <div className="mt-4">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Exit Signals</div>
              {selected.exitSignals.length === 0 && <div className="text-xs text-slate-600">None logged.</div>}
              <ul className="space-y-1">
                {selected.exitSignals.map((s, i) => (
                  <li key={i} className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-100">
        {value}
        {suffix}
      </div>
    </div>
  );
}
