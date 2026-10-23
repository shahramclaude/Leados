import { SectionIntro, DemoNotice, Card, CardHeader, Badge, ProgressBar } from '../components/ui';
import { actionPolicies } from '../data/sampleData';
import type { Tier } from '../types';

const tierCopy: Record<Tier, { label: string; description: string }> = {
  T0: { label: 'Observe', description: 'Read / analyze only. No side effects.' },
  T1: { label: 'Draft-only', description: 'Produces a draft a human must send.' },
  T2: { label: 'Act + instant undo', description: 'Executes immediately; reversible within a window.' },
  T3: { label: 'Act + approval', description: 'Requires single or dual-control sign-off before executing.' },
  T4: { label: 'Autonomous (budgeted)', description: 'Executes without approval, inside a hard budget envelope.' },
  T5: { label: 'Autonomous (delegated)', description: 'Full delegated authority; requires board-level promotion evidence.' },
};

function tierTone(tier: Tier): 'neutral' | 'info' | 'warn' | 'fail' {
  if (tier === 'T0' || tier === 'T1') return 'neutral';
  if (tier === 'T2') return 'info';
  if (tier === 'T3') return 'warn';
  return 'fail';
}

export default function Governance() {
  return (
    <div>
      <SectionIntro
        title="Automation ladder & governed autonomy"
        description="Every side-effecting action is declared with a tier, a budget, and an approval mode. The Action Gate is the single chokepoint — nothing executes outside this table."
      />
      <div className="mb-6"><DemoNotice /></div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(tierCopy) as Tier[]).map((tier) => (
          <Card key={tier} className="px-3 py-3">
            <Badge tone={tierTone(tier)}>{tier}</Badge>
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{tierCopy[tier].label}</p>
            <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{tierCopy[tier].description}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader
          eyebrow="Action Gate"
          title="Declared actions & budget burn"
          description="Rolling 24h budgets (never midnight resets). Burn shown against daily count/USD caps."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-5 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Approval</th>
                <th className="px-3 py-2 font-medium">Undo window</th>
                <th className="px-3 py-2 font-medium">Daily budget</th>
                <th className="px-3 py-2 font-medium">Burn (24h, rolling)</th>
              </tr>
            </thead>
            <tbody>
              {actionPolicies.map((a) => (
                <tr key={a.actionId} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{a.label}</p>
                    <p className="font-mono text-[11px] text-slate-400">{a.actionId}</p>
                  </td>
                  <td className="px-3 py-3"><Badge tone={tierTone(a.tier)}>{a.tier}</Badge></td>
                  <td className="px-3 py-3 capitalize text-slate-600 dark:text-slate-300">{a.approvalMode}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{a.undoWindowMin ? `${a.undoWindowMin} min` : '—'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                    {a.budgetUsdPerDay > 0 ? `$${a.budgetUsdPerDay.toLocaleString()}/day` : `${a.budgetCountPerDay}/day`}
                  </td>
                  <td className="w-40 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={a.burnPct} tone={a.burnPct > 80 ? 'fail' : a.burnPct > 55 ? 'warn' : 'pass'} />
                      <span className="w-9 shrink-0 text-xs text-slate-500">{a.burnPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Kill switch" title="Global / per-action / per-tier" description="Target: stop within 30s. Drilled monthly — results ledgered." />
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Last drill: <span className="font-medium text-slate-800 dark:text-slate-100">never-run in this environment</span></p>
              <p className="mt-1 text-xs text-slate-400">Schedule a monthly automated drill once wired to a real runtime.</p>
            </div>
            <button
              type="button"
              className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] motion-reduce:transition-none"
            >
              Trigger demo kill switch
            </button>
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Promotion evidence" title="T4 → T5 requires board signoff" description="State machine: N consecutive correct outcomes, measuredRisk ≤ riskCeiling, dual control enforced." />
          <div className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
            <p>act.org.restructure — candidate for T5</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              <li>• Samples collected: 0 / 25 required</li>
              <li>• Measured risk: n/a</li>
              <li>• Board signoff: <Badge tone="fail">missing</Badge></li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
