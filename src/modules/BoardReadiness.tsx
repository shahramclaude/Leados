import { useState } from "react";
import { Card, SectionHeader, ProgressBar, Badge } from "../components/ui";
import { boardChecks as initial } from "../data/mockData";
import type { BoardCheck } from "../types";

export function BoardReadiness() {
  const [checks, setChecks] = useState<BoardCheck[]>(initial);
  const done = checks.filter((c) => c.done).length;

  const toggle = (id: string) => setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));

  return (
    <div className="space-y-4">
      <SectionHeader title="Board Readiness" subtitle="Completeness checks must pass before a packet is marked ready — no partial packet is labeled complete." />
      <Card>
        <div className="mb-2 flex justify-between text-sm"><span>Packet completeness</span><span>{done}/{checks.length}</span></div>
        <ProgressBar value={done} max={checks.length} tone={done === checks.length ? "emerald" : "amber"} />
        {done < checks.length && <p className="mt-2 text-xs text-amber-700">Packet cannot be marked "Board ready" until all checks pass.</p>}
      </Card>
      <Card>
        <ul className="divide-y divide-slate-100">
          {checks.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={c.done} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300" />
                {c.label}
              </label>
              <Badge tone={c.done ? "emerald" : "slate"}>{c.done ? "Done" : "Pending"}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
