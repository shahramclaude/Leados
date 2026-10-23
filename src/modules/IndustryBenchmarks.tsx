import { Card, SectionHeader, Badge } from "../components/ui";
import { benchmarks } from "../data/mockData";

const classInfo: Record<string, { label: string; tone: "emerald" | "amber" | "rose" }> = {
  A: { label: "Class A — audited source", tone: "emerald" },
  B: { label: "Class B — vendor / self-reported", tone: "amber" },
  C: { label: "Class C — modeled / synthetic", tone: "rose" },
};

export function IndustryBenchmarks() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Industry Benchmarks" subtitle="Every figure carries an evidence class. Nothing is presented as more certain than its source." />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
              <th className="py-2 pr-4">Metric</th>
              <th className="py-2 pr-4">Your org</th>
              <th className="py-2 pr-4">Industry</th>
              <th className="py-2 pr-4">Evidence class</th>
              <th className="py-2">Source note</th>
            </tr>
          </thead>
          <tbody>
            {benchmarks.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4 font-medium text-slate-800">{b.metric}</td>
                <td className="py-3 pr-4">{b.yourOrg}</td>
                <td className="py-3 pr-4">{b.industry}</td>
                <td className="py-3 pr-4">
                  <Badge tone={classInfo[b.evidenceClass].tone}>{classInfo[b.evidenceClass].label}</Badge>
                </td>
                <td className="py-3 text-xs text-slate-500">{b.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">Class C figures are explicitly marked "not for board use" wherever they are surfaced.</p>
    </div>
  );
}
