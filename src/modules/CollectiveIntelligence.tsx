import { Card, SectionHeader, Badge } from "../components/ui";
import { viewpoints } from "../data/mockData";

export function CollectiveIntelligence() {
  const majority = viewpoints.filter((v) => v.stance === "majority");
  const minority = viewpoints.filter((v) => v.stance === "minority");

  return (
    <div className="space-y-4">
      <SectionHeader title="Collective Intelligence" subtitle="Topic: Should we launch EMEA in Q3? Dissent is preserved, never averaged away." />

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="indigo">Majority view ({majority.reduce((a, v) => a + v.votes, 0)} votes)</Badge>
        </div>
        <div className="space-y-2">
          {majority.map((v) => (
            <div key={v.id} className="rounded-lg border border-slate-100 p-3 text-sm">
              <p className="font-medium text-slate-800">{v.author}</p>
              <p className="text-slate-600">{v.text}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-rose-200">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="rose">Minority view preserved ({minority.reduce((a, v) => a + v.votes, 0)} votes)</Badge>
          <span className="text-xs text-slate-500">Surfaced with equal visual weight — not hidden by aggregation.</span>
        </div>
        <div className="space-y-2">
          {minority.map((v) => (
            <div key={v.id} className="rounded-lg border border-rose-100 bg-rose-50/40 p-3 text-sm">
              <p className="font-medium text-slate-800">{v.author}</p>
              <p className="text-slate-600">{v.text}</p>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-xs text-slate-500">
        Design rule enforced here: the summary never collapses to a single number. Both clusters render every time this view loads.
      </p>
    </div>
  );
}
