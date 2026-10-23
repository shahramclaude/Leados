import { SectionIntro, DemoNotice, Card, CardHeader, Badge } from '../components/ui';
import { pipelineHealth } from '../data/sampleData';

function statusTone(status: string) {
  if (status === 'on-time') return 'pass' as const;
  if (status === 'degraded') return 'warn' as const;
  return 'fail' as const;
}

export default function DataOps() {
  return (
    <div className="space-y-6">
      <SectionIntro
        title="Autonomous data operations"
        description="Datasets without a contract cannot appear in product surfaces. Breaches flip surfaces to a 'stale/degraded' state with a last-good timestamp — never null-as-zero."
      />
      <DemoNotice />

      <Card>
        <CardHeader eyebrow="Contract registry" title="Dataset freshness & heal status" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-5 py-2 font-medium">Dataset</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Freshness SLA</th>
                <th className="px-3 py-2 font-medium">Observed lag</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last heal action</th>
              </tr>
            </thead>
            <tbody>
              {pipelineHealth.map((p) => (
                <tr key={p.dataset} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">{p.dataset}</td>
                  <td className="px-3 py-3 text-slate-500">{p.owner}</td>
                  <td className="px-3 py-3 text-slate-500">{p.freshnessSlaMin} min</td>
                  <td className={`px-3 py-3 font-medium ${p.observedLagMin > p.freshnessSlaMin ? 'text-rose-600' : 'text-slate-600 dark:text-slate-300'}`}>
                    {p.observedLagMin} min
                  </td>
                  <td className="px-3 py-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                  <td className="px-3 py-3 text-xs text-slate-500">{p.lastHeal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Heal engine</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Strategy ladder: retry (exp. backoff + jitter) → replay from event log → fallback source → rebuild
            partition → quarantine → page human. Max 5 attempts before escalation.
          </p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Reconciliation identity</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Source-side counts/sums must equal warehouse-side counts/sums ± declared transform deltas, checked per
            batch. A violation blocks the batch rather than serving silently wrong numbers.
          </p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Lineage &amp; impact</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            On SLA breach, declared lineage identifies every downstream dashboard/report/automation and proactively
            broadcasts a staleness banner with the last-good timestamp.
          </p>
        </Card>
      </div>
    </div>
  );
}
