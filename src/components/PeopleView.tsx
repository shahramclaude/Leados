import type { Projection } from "../lib/types";
import { Card, Label } from "./ui";

export function PeopleView({ P }: { P: Projection }) {
  const rows = [P.self, ...P.directs, ...P.skips];
  const countFor = (id: string) => P.state.events.filter((e) => e.data?.personId === id || e.data?.fromId === id || e.data?.toId === id).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">People</h1>
        <p className="mt-1 text-sm text-slate-400">Synthetic roster for this demo (11 people). Fabricated names, disclosed in About.</p>
      </div>
      <Card title="Roster">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-slate-500">
              <th className="pb-2">Name</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Team</th>
              <th className="pb-2">Level</th>
              <th className="pb-2 text-right">Events referencing them</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="py-2 font-medium text-slate-200">{p.name}</td>
                <td className="py-2 text-slate-400">{p.role}</td>
                <td className="py-2 text-slate-400">{p.team}</td>
                <td className="py-2 text-slate-500">{p.level}</td>
                <td className="py-2 text-right font-mono text-slate-300">{countFor(p.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Label>Used by Intelligence → Thermodynamics for mutual information and bottleneck analysis.</Label>
      </Card>
    </div>
  );
}
