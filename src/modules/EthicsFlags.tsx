import { Card, SectionHeader, Badge } from "../components/ui";
import { ethicsCases } from "../data/mockData";
import type { EthicsCase } from "../types";

const stages: EthicsCase["stage"][] = ["proposed", "review", "approved", "blocked"];
const stageLabel: Record<EthicsCase["stage"], string> = {
  proposed: "Proposed",
  review: "Ethics review",
  approved: "Approved",
  blocked: "Blocked",
};

export function EthicsFlags() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Ethics Flags" subtitle="Every automated decision with human consequence routes through this board before it can act." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {stages.map((stage) => (
          <Card key={stage} className="min-h-[200px]">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{stageLabel[stage]}</p>
            <div className="space-y-2">
              {ethicsCases
                .filter((c) => c.stage === stage)
                .map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                    <p className="font-medium text-slate-800">{c.title}</p>
                    {c.flags.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {c.flags.map((f) => (
                          <li key={f} className="text-xs text-rose-600">⚑ {f}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2">
                      <Badge tone={c.riskLevel === "high" ? "rose" : c.riskLevel === "medium" ? "amber" : "emerald"}>{c.riskLevel} risk</Badge>
                    </div>
                  </div>
                ))}
              {ethicsCases.filter((c) => c.stage === stage).length === 0 && (
                <p className="text-xs text-slate-400">Nothing here.</p>
              )}
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Design rule: a case can only reach "Approved" after passing "Ethics review" — there is no direct Proposed → Approved transition in this flow.
      </p>
    </div>
  );
}
