"use client";

import { useEffect, useState } from "react";
import type { NineBoxPlacement, SuccessionRisk, TeamChemistryReport } from "@/lib/peopleIntel";
import type { PersonRow } from "@/lib/clientTypes";

type PeopleApiResponse = {
  people: PersonRow[];
  nineBox: NineBoxPlacement[];
  succession: SuccessionRisk[];
  chemistry: TeamChemistryReport;
  computedFlightRisk: { id: number; flightRisk: number }[];
};

export default function PeopleIntelligenceView() {
  const [data, setData] = useState<PeopleApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="text-sm text-red-400">Failed to load: {error}</div>;
  if (!data) return <div className="animate-pulse text-sm text-slate-500">Loading people intelligence…</div>;

  const boxGrid: Record<string, PersonRow[]> = {};
  for (const placement of data.nineBox) {
    const key = `${placement.row}-${placement.col}`;
    const person = data.people.find((p) => p.id === placement.personId);
    if (!person) continue;
    boxGrid[key] = boxGrid[key] ?? [];
    boxGrid[key].push(person);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">People Intelligence</h1>

      {data.chemistry.redFlags.length > 0 && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {data.chemistry.redFlags.map((f, i) => (
            <p key={i}>
              🚩 <strong>{f.type}</strong>: {f.description}
            </p>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Nine-Box Grid (Performance × Potential)</h2>
        <div className="grid grid-cols-3 gap-2">
          {[2, 1, 0].map((row) =>
            [0, 1, 2].map((col) => {
              const key = `${row}-${col}`;
              const people = boxGrid[key] ?? [];
              return (
                <div key={key} className="min-h-24 rounded-lg border border-slate-800 bg-slate-900 p-2">
                  <p className="text-[10px] text-slate-500">
                    perf={col} pot={row}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {people.slice(0, 5).map((p) => (
                      <li key={p.id} className="truncate text-xs text-slate-300">
                        {p.name}
                      </li>
                    ))}
                    {people.length > 5 && <li className="text-[10px] text-slate-500">+{people.length - 5} more</li>}
                  </ul>
                </div>
              );
            }),
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">People ({data.people.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Dept</th>
                <th className="px-3 py-2">Flight Risk</th>
                <th className="px-3 py-2">Burnout Risk</th>
                <th className="px-3 py-2">Succession Candidates</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => {
                const succession = data.succession.find((s) => s.personId === p.id);
                return (
                  <tr key={p.id} className="border-t border-slate-800">
                    <td className="px-3 py-1.5 text-slate-200">{p.name}</td>
                    <td className="px-3 py-1.5 text-slate-400">{p.role}</td>
                    <td className="px-3 py-1.5 text-slate-400">{p.department}</td>
                    <td className={`px-3 py-1.5 ${p.flightRiskScore > 0.5 ? "text-red-400" : "text-slate-400"}`}>
                      {(p.flightRiskScore * 100).toFixed(0)}%
                    </td>
                    <td className={`px-3 py-1.5 ${p.burnoutRiskScore > 0.5 ? "text-amber-400" : "text-slate-400"}`}>
                      {(p.burnoutRiskScore * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">{succession?.candidateIds.length ?? 0} candidates</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
