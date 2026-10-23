import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardHeader, StatPill, SectionIntro, DemoNotice, Badge } from '../components/ui';
import { gateSummary, evalScoreTrend, selfAuditFindings, actionPolicies } from '../data/sampleData';

export default function Overview() {
  const openHighOrCritical = selfAuditFindings.filter(
    (f) => (f.severity === 'high' || f.severity === 'critical') && f.status !== 'resolved',
  ).length;
  const t4plus = actionPolicies.filter((a) => a.tier === 'T4' || a.tier === 'T5').length;

  return (
    <div>
      <SectionIntro
        title="Program pulse"
        description="One screen, four loops: gate status, eval health, governed automation, and self-audit findings — the honest state of the fabric, not a highlight reel."
      />
      <div className="mb-6">
        <DemoNotice />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="Grand gates — pass" value={`${gateSummary.pass}/${gateSummary.totalGates}`} tone={gateSummary.pass === gateSummary.totalGates ? 'pass' : 'warn'} sub="re-measured, not assumed" />
        <StatPill label="Gates never run" value={String(gateSummary.neverRun)} tone={gateSummary.neverRun > 0 ? 'fail' : 'pass'} sub="instrumentation gap" />
        <StatPill label="High/critical findings open" value={String(openHighOrCritical)} tone={openHighOrCritical > 0 ? 'warn' : 'pass'} sub="self-audit queue" />
        <StatPill label="Actions at T4/T5" value={String(t4plus)} tone="info" sub="autonomous within budget" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            eyebrow="Quality fabric"
            title="Eval mean score vs mutation score (7d)"
            description="Mutation score is the harder number: it measures whether evals actually catch seeded prompt mutations, not just whether outputs look fine."
          />
          <div className="h-64 px-2 pb-4 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evalScoreTrend} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="meanFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B5BD6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5B5BD6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mutFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C2410C" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#C2410C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                <YAxis domain={[0.4, 1]} tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" width={36} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) => [Number(value).toFixed(2), name === 'mean' ? 'Mean score' : 'Mutation score']}
                />
                <Area type="monotone" dataKey="mean" stroke="#5B5BD6" strokeWidth={2} fill="url(#meanFill)" />
                <Area type="monotone" dataKey="mutation" stroke="#C2410C" strokeWidth={2} fill="url(#mutFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Mean score</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-600" /> Mutation score (floor 0.70)</span>
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Honest state" title="What's NOT proven yet" />
          <ul className="space-y-3 px-5 py-4 text-sm">
            <li className="flex gap-2">
              <Badge tone="fail">never-run</Badge>
              <span className="text-slate-600 dark:text-slate-300">Action Gate bypass fuzz test (50 attempts) — not instrumented in this demo.</span>
            </li>
            <li className="flex gap-2">
              <Badge tone="fail">never-run</Badge>
              <span className="text-slate-600 dark:text-slate-300">Kill-switch latency drill — no runtime to measure against.</span>
            </li>
            <li className="flex gap-2">
              <Badge tone="warn">fail</Badge>
              <span className="text-slate-600 dark:text-slate-300">2 of 6 eval suites sit below the 0.70 mutation-score floor.</span>
            </li>
            <li className="flex gap-2">
              <Badge tone="info">unknown</Badge>
              <span className="text-slate-600 dark:text-slate-300">30-day drift false-alarm rate — no stable replay window available.</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
