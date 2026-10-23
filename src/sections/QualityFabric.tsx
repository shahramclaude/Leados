import { SectionIntro, DemoNotice, Card, CardHeader, Badge, ProgressBar } from '../components/ui';
import { evalSuites, mutationOperators, driftAlerts, selfAuditFindings } from '../data/sampleData';

function severityTone(sev: string) {
  if (sev === 'critical') return 'critical' as const;
  if (sev === 'high') return 'fail' as const;
  if (sev === 'medium') return 'warn' as const;
  return 'neutral' as const;
}

function driftTone(status: string) {
  if (status === 'breach') return 'fail' as const;
  if (status === 'watch') return 'warn' as const;
  return 'pass' as const;
}

function difficultyTone(diff: string) {
  if (diff === 'high') return 'fail' as const;
  if (diff === 'medium') return 'warn' as const;
  return 'pass' as const;
}

export default function QualityFabric() {
  return (
    <div className="space-y-6">
      <SectionIntro
        title="Eval fabric: golden sets, mutation testing, drift, self-audit"
        description="Four loops. Regression gate, mutation testing of prompts, nightly drift watch, and a self-audit job whose own findings are scored for whether they're real."
      />
      <DemoNotice />

      <Card>
        <CardHeader
          eyebrow="Regression gate"
          title="Eval suites per surface"
          description="No averaging across surfaces — each surface reports its own golden + adversarial count and mutation score against the 70% floor."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-5 py-2 font-medium">Surface</th>
                <th className="px-3 py-2 font-medium">Golden</th>
                <th className="px-3 py-2 font-medium">Adversarial</th>
                <th className="px-3 py-2 font-medium">Mean score</th>
                <th className="px-3 py-2 font-medium">p10</th>
                <th className="px-3 py-2 font-medium">Mutation score</th>
                <th className="px-3 py-2 font-medium">Gate</th>
              </tr>
            </thead>
            <tbody>
              {evalSuites.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                  <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{s.surface}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.golden} {s.golden >= 30 ? '' : '⚠️'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.adversarial} {s.adversarial >= 20 ? '' : '⚠️'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.meanScore.toFixed(2)}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{s.p10.toFixed(2)}</td>
                  <td className="w-36 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={s.mutationScore * 100} tone={s.mutationScore >= 0.7 ? 'pass' : 'fail'} />
                      <span className="w-9 shrink-0 text-xs text-slate-500">{(s.mutationScore * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><Badge tone={s.pass ? 'pass' : 'fail'}>{s.pass ? 'pass' : 'fail'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            eyebrow="Mutation harness"
            title="Operator library (12)"
            description="Each operator mutates a prompt; a strong eval catches the mutation. Catch rate weighted by difficulty — trivial-only catches are a red flag."
          />
          <div className="max-h-96 overflow-y-auto px-5 py-3">
            <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {mutationOperators.map((op) => (
                <li key={op.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">{op.name}</p>
                    <p className="text-xs text-slate-500">{op.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={difficultyTone(op.difficulty)}>{op.difficulty}</Badge>
                    <span className="w-10 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">{op.catchRatePct}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader eyebrow="Drift watch" title="PSI / KS / embedding monitors" description="Thresholds derived from golden-set variance, not vibes." />
          <ul className="divide-y divide-slate-50 px-5 py-3 dark:divide-slate-800/60">
            {driftAlerts.map((d) => (
              <li key={d.target} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{d.target}</p>
                  <p className="text-xs text-slate-500">
                    {d.method.toUpperCase()} = {d.statistic.toFixed(3)} (threshold {d.threshold.toFixed(2)}) · since {d.since}
                  </p>
                </div>
                <Badge tone={driftTone(d.status)}>{d.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          eyebrow="Nightly self-audit"
          title="Findings queue"
          description="Goodhart guard: findings rated by a rubric for whether they're real. A self-audit that only reports trivialities is itself a finding — flagged below."
        />
        <ul className="divide-y divide-slate-50 px-5 py-2 dark:divide-slate-800/60">
          {selfAuditFindings.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">{f.id}</span>
                  <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                  {f.goodhartFlag && <Badge tone="warn">goodhart-flagged</Badge>}
                  <span className="text-xs text-slate-400">{f.area}</span>
                </div>
                <p className="mt-1 truncate text-slate-700 dark:text-slate-200">{f.evidence}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">
                <p>owner: {f.owner}</p>
                <p>due {f.dueDate} · {f.status}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
