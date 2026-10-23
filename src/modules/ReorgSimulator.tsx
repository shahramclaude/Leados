import { useState } from "react";
import { Card, SectionHeader, Badge } from "../components/ui";

export function ReorgSimulator() {
  const [cut, setCut] = useState(10);

  const affectedRoles = Math.round((cut / 100) * 34);
  const savings = (cut * 42000).toLocaleString();
  const sentimentRisk = cut > 20 ? "high" : cut > 10 ? "medium" : "low";

  return (
    <div className="space-y-4">
      <SectionHeader title="Reorg Simulator" subtitle="Every simulation produces a Human Impact Ledger alongside the cost numbers — never cost alone." />

      <Card>
        <label htmlFor="headcount-reduction" className="mb-2 block text-sm font-medium text-slate-700">Headcount reduction: {cut}%</label>
        <input
          id="headcount-reduction"
          type="range"
          min={0}
          max={30}
          value={cut}
          onChange={(e) => setCut(Number(e.target.value))}
          aria-label="Headcount reduction percentage"
          aria-valuetext={`${cut} percent`}
          className="w-full"
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <SectionHeader title="Financial projection" />
          <p className="text-2xl font-semibold text-slate-900">${savings}/yr</p>
          <p className="text-sm text-slate-500">Estimated run-rate savings (modeled, Class C evidence)</p>
        </Card>
        <Card className={sentimentRisk === "high" ? "border-rose-300" : undefined}>
          <SectionHeader title="Human Impact Ledger" action={<Badge tone={sentimentRisk === "high" ? "rose" : sentimentRisk === "medium" ? "amber" : "emerald"}>{sentimentRisk} risk</Badge>} />
          <ul className="space-y-1 text-sm text-slate-600">
            <li>• {affectedRoles} roles directly affected (modeled from current org chart)</li>
            <li>• Estimated eNPS impact: {cut > 15 ? "-8 to -14 pts" : "-2 to -5 pts"}</li>
            <li>• Severance & transition cost not yet netted against savings above</li>
            <li>• Manager span-of-control strain flagged in Engineering if cut exceeds 15%</li>
          </ul>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">
        This simulator cannot execute a reorg. It can only produce numbers for a human-led conversation, and it
        refuses to show savings without the adjacent human-impact estimate on the same screen.
      </Card>
    </div>
  );
}
