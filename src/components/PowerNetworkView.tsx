import type { Projection } from '../lib/types';
import { detectPowerNetwork } from '../lib/extras';
import { Card, SectionTitle, Tag, Callout } from './ui';

export function PowerNetworkView({ P }: { P: Projection }) {
  const net = detectPowerNetwork(P);
  return (
    <div className="space-y-6">
      <SectionTitle title="Informal Power Network (\u201cDark Matter\u201d)" subtitle={net.label} />
      <div className="space-y-3">
        {net.nodes.map((n) => (
          <Card key={n.person.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{n.person.name}</span>
                  {n.darkMatter && <Tag kind="CONFIRMED" />}
                </div>
                <div className="text-xs text-slate-400">{n.person.title} \u00b7 {n.person.team}</div>
              </div>
              <div className="w-40">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${n.centrality * 100}%` }} />
                </div>
                <div className="mt-1 text-right text-xs text-slate-500">{Math.round(n.centrality * 100)}% centrality</div>
              </div>
            </div>
            {n.darkMatter && (
              <Callout tone="amber">High informal centrality without a formal leadership title \u2014 influence here may not be visible on the org chart.</Callout>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
