import { Card, SectionHeader, EvidenceTag } from "../components/ui";
import { algorithmRegistry } from "../data/mockData";

export function AlgorithmRegistry() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Algorithm Registry" subtitle="Every model or scoring system in this product, in one place. If it's not here, it shouldn't be running." />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Purpose</th>
              <th className="py-2 pr-4">Inputs</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Owner</th>
              <th className="py-2">Last reviewed</th>
            </tr>
          </thead>
          <tbody>
            {algorithmRegistry.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="py-3 pr-4 font-medium text-slate-800">{a.name}</td>
                <td className="py-3 pr-4 text-slate-600">{a.purpose}</td>
                <td className="py-3 pr-4 text-xs text-slate-500">{a.inputs}</td>
                <td className="py-3 pr-4"><EvidenceTag level={a.evidenceClass} /></td>
                <td className="py-3 pr-4 text-xs text-slate-500">{a.owner}</td>
                <td className="py-3 text-xs text-slate-500">{a.lastReviewed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
