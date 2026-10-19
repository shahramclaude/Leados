"use client";

import { useAppContext } from "@/lib/AppContext";
import { Card, ErrorPanel, LoadingPanel, StatusPill, ViewHeader } from "@/components/ui";

function riskStatus(risk: number): "healthy" | "at_risk" | "critical" {
  if (risk >= 0.7) return "critical";
  if (risk >= 0.4) return "at_risk";
  return "healthy";
}

export default function PeopleView() {
  const { result, error } = useAppContext();

  if (error && !result) return <ErrorPanel message={error} />;
  if (!result) return <LoadingPanel />;

  const people = result.people.slice().sort((a, b) => b.flightRisk - a.flightRisk);

  return (
    <div>
      <ViewHeader title="People" subtitle="Flight risk and 1:1 health across the team." />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Role / Team</th>
              <th className="py-2">Flight risk</th>
              <th className="py-2">1:1 quality</th>
              <th className="py-2">Last 1:1</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {people.map((p) => (
              <tr key={p.id}>
                <td className="py-2 text-slate-200">{p.name}</td>
                <td className="py-2 text-slate-400">
                  {p.role} \u00b7 {p.team}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-300">{(p.flightRisk * 100).toFixed(0)}%</span>
                    <StatusPill status={riskStatus(p.flightRisk)} />
                  </div>
                </td>
                <td className="py-2 font-mono text-slate-300">{p.oneOnOneQuality.toFixed(0)}</td>
                <td className="py-2 text-slate-400">
                  {p.daysSinceLastOneOnOne === null ? "Never" : `${p.daysSinceLastOneOnOne}d ago`}
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">
                  No people recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
